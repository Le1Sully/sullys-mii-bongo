using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace SullysMiiBongo;

sealed class MicCapture : IDisposable
{
    public event Action<double>? Level;

    public double FloorDb { get; set; } = -48;

    WasapiCapture? _capture;
    double _peak;
    long _lastTick;
    double _lastSent;

    public string? Error { get; private set; }

    public static List<(string Id, string Name)> Devices()
    {
        try
        {
            using var en = new MMDeviceEnumerator();
            return en.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active)
                .Select(d => (d.ID, d.FriendlyName)).ToList();
        }
        catch { return new(); }
    }

    public static string Diagnose()
    {
        var sb = new System.Text.StringBuilder();
        try
        {
            using var en = new MMDeviceEnumerator();
            string Def(Role r) { try { return en.GetDefaultAudioEndpoint(DataFlow.Capture, r).FriendlyName; } catch { return "?"; } }
            sb.AppendLine($"Défaut (console) : {Def(Role.Console)}");
            sb.AppendLine($"Défaut (communications) : {Def(Role.Communications)}");
            var devices = en.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active).ToList();
            var tests = devices.Select(d =>
            {
                var m = new MicCapture { FloorDb = -200 };
                double max = double.NegativeInfinity;
                m.RawDb += db => max = Math.Max(max, db);
                m.Start(d.ID);
                return (d.FriendlyName, m, get: (Func<double>)(() => max));
            }).ToList();
            Thread.Sleep(2000);
            foreach (var (name, m, get) in tests)
            {
                sb.AppendLine($"{name} : {(m.Error != null ? "ERREUR " + m.Error : $"{get():0.0} dB")}");
                m.Dispose();
            }
        }
        catch (Exception ex) { sb.AppendLine("ERREUR " + ex); }
        return sb.ToString();
    }

    public event Action<double>? RawDb;

    public void Start(string? deviceId)
    {
        Stop();
        try
        {
            using var en = new MMDeviceEnumerator();
            MMDevice? dev = null;
            if (!string.IsNullOrEmpty(deviceId))
                try { dev = en.GetDevice(deviceId); } catch { dev = null; }
            dev ??= en.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Console);
            _capture = new WasapiCapture(dev);
            _capture.DataAvailable += OnData;
            _capture.RecordingStopped += (_, _) => Publish(0);
            _capture.StartRecording();
            Error = null;
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            _capture?.Dispose();
            _capture = null;
        }
    }

    public void Stop()
    {
        if (_capture == null) return;
        try { _capture.DataAvailable -= OnData; _capture.StopRecording(); } catch { }
        _capture.Dispose();
        _capture = null;
        Publish(0);
    }

    void OnData(object? sender, WaveInEventArgs e)
    {
        var fmt = _capture?.WaveFormat;
        if (fmt == null || e.BytesRecorded == 0) return;

        double sum = 0;
        int count = 0;
        if (fmt.Encoding == WaveFormatEncoding.IeeeFloat || (fmt.Encoding == WaveFormatEncoding.Extensible && fmt.BitsPerSample == 32))
        {
            for (int i = 0; i + 4 <= e.BytesRecorded; i += 4) { double s = BitConverter.ToSingle(e.Buffer, i); sum += s * s; count++; }
        }
        else if (fmt.BitsPerSample == 16)
        {
            for (int i = 0; i + 2 <= e.BytesRecorded; i += 2) { double s = BitConverter.ToInt16(e.Buffer, i) / 32768.0; sum += s * s; count++; }
        }
        else if (fmt.BitsPerSample == 24)
        {
            for (int i = 0; i + 3 <= e.BytesRecorded; i += 3)
            {
                int v = (e.Buffer[i] | (e.Buffer[i + 1] << 8) | (e.Buffer[i + 2] << 16)) << 8 >> 8;
                double s = v / 8388608.0; sum += s * s; count++;
            }
        }
        if (count == 0) return;

        double rms = Math.Sqrt(sum / count);
        _peak = Math.Max(_peak, rms);

        long now = Environment.TickCount64;
        if (now - _lastTick < 33) return;
        _lastTick = now;
        double db = 20 * Math.Log10(_peak + 1e-9);
        _peak = 0;
        RawDb?.Invoke(db);
        Publish(Math.Clamp((db - FloorDb) / 28.0, 0, 1));
    }

    void Publish(double level)
    {
        if (level == 0 && _lastSent == 0) return;
        _lastSent = level;
        try { Level?.Invoke(level); } catch { }
    }

    public void Dispose() => Stop();
}

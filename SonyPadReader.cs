using HidSharp;

namespace SullysMiiBongo;

sealed class SonyPadReader : IDisposable
{
    const int Sony = 0x054C;
    static readonly int[] Ds4 = [0x05C4, 0x09CC, 0x0BA0], DualSense = [0x0CE6, 0x0DF2];

    public string Name { get; private set; } = "";
    public bool Connected => _stream != null;

    public record struct State(ushort Buttons, double Lx, double Ly, double Rx, double Ry, double Lt, double Rt);
    public event Action<State>? Changed;
    public event Action? Lost;

    HidStream? _stream;
    Thread? _thread;
    volatile bool _running;

    public bool TryOpen()
    {
        if (_stream != null) return true;
        try
        {
            foreach (var d in DeviceList.Local.GetHidDevices(Sony))
            {
                bool ds4 = Ds4.Contains(d.ProductID), ds5 = DualSense.Contains(d.ProductID);
                if (!ds4 && !ds5) continue;
                if (d.GetMaxInputReportLength() < 10) continue;
                if (!d.TryOpen(out var stream)) continue;
                stream.ReadTimeout = Timeout.Infinite;
                _stream = stream;
                Name = ds5 ? "DualSense (PS5)" : "DualShock 4 (PS4)";
                bool isDs5 = ds5;
                int len = d.GetMaxInputReportLength();
                _running = true;
                _thread = new Thread(() => ReadLoop(stream, len, isDs5)) { IsBackground = true, Name = "SonyPadReader" };
                _thread.Start();
                return true;
            }
        }
        catch { }
        return false;
    }

    void ReadLoop(HidStream stream, int len, bool ds5)
    {
        var buf = new byte[len];
        try
        {
            while (_running)
            {
                int n = stream.Read(buf, 0, buf.Length);
                if (n < 10) continue;
                if (Parse(buf, n, ds5) is { } st) Changed?.Invoke(st);
            }
        }
        catch { }
        finally
        {
            Close();
            if (_running) Lost?.Invoke();
        }
    }

    static State? Parse(byte[] b, int n, bool ds5)
    {
        int o = b[0] switch { 0x01 => 1, 0x11 => 3, 0x31 => 2, _ => -1 };
        if (o < 0 || o + 10 > n) return null;
        byte lx = b[o], ly = b[o + 1], rx = b[o + 2], ry = b[o + 3];
        byte face, shoulders, sys, l2, r2;
        if (ds5 && b[0] != 0x01 || ds5 && n > 40)
        {
            l2 = b[o + 4]; r2 = b[o + 5]; face = b[o + 7]; shoulders = b[o + 8]; sys = b[o + 9];
        }
        else
        {
            face = b[o + 4]; shoulders = b[o + 5]; sys = b[o + 6]; l2 = b[o + 7]; r2 = b[o + 8];
        }
        ushort btn = 0;
        switch (face & 0x0F)
        {
            case 0: btn |= 1; break; case 1: btn |= 1 | 8; break; case 2: btn |= 8; break; case 3: btn |= 2 | 8; break;
            case 4: btn |= 2; break; case 5: btn |= 2 | 4; break; case 6: btn |= 4; break; case 7: btn |= 1 | 4; break;
        }
        if ((face & 0x10) != 0) btn |= 16384;
        if ((face & 0x20) != 0) btn |= 4096;
        if ((face & 0x40) != 0) btn |= 8192;
        if ((face & 0x80) != 0) btn |= 32768;
        if ((shoulders & 0x01) != 0) btn |= 256;
        if ((shoulders & 0x02) != 0) btn |= 512;
        if ((shoulders & 0x10) != 0) btn |= 32;
        if ((shoulders & 0x20) != 0) btn |= 16;
        if ((shoulders & 0x40) != 0) btn |= 64;
        if ((shoulders & 0x80) != 0) btn |= 128;
        if ((sys & 0x01) != 0) btn |= 1024;
        static double Axis(byte v) => Math.Clamp((v - 128) / 127.0, -1, 1);
        return new State(btn, Axis(lx), -Axis(ly), Axis(rx), -Axis(ry), l2 / 255.0, r2 / 255.0);
    }

    public void Close()
    {
        var s = _stream; _stream = null;
        try { s?.Dispose(); } catch { }
    }

    public void Stop()
    {
        _running = false;
        Close();
        _thread?.Join(500);
        _thread = null;
    }

    public void Dispose() => Stop();
}

using System.Globalization;
using System.Runtime.InteropServices;

namespace SullysMiiBongo;

sealed class GamepadReader : IDisposable
{
    public event Action<string>? Message;
    public string Status { get; private set; } = "arrêté";

    int _index = -1;
    readonly SonyPadReader _sony = new();
    bool SonyActive => _index < 0 && _sony.Connected;

    public GamepadReader()
    {
        _sony.Changed += st =>
        {
            if (_index >= 0 || !_running) return;
            var (lx, ly) = Dead(st.Lx, st.Ly);
            var (rx, ry) = Dead(st.Rx, st.Ry);
            var json = string.Create(CultureInfo.InvariantCulture,
                $"{{\"t\":\"pad\",\"b\":{st.Buttons},\"lx\":{lx:0.00},\"ly\":{ly:0.00},\"rx\":{rx:0.00},\"ry\":{ry:0.00},\"lt\":{st.Lt:0.00},\"rt\":{st.Rt:0.00}}}");
            if (json != _last) { _last = json; Message?.Invoke(json); }
        };
        _sony.Lost += () =>
        {
            Status = "manette déconnectée";
            _nextScan = Environment.TickCount64 + 1000;
            Message?.Invoke("{\"t\":\"pad\",\"b\":0,\"lx\":0,\"ly\":0,\"rx\":0,\"ry\":0,\"lt\":0,\"rt\":0}");
        };
    }
    long _nextScan, _nextStatus;
    string _last = "";

    public void RequestScan() => _nextScan = Environment.TickCount64 + 500;
    bool _useEx = true;

    Thread? _thread;
    volatile bool _running;

    public void Start()
    {
        if (_running) return;
        Status = "recherche de la manette…";
        _running = true;
        _thread = new Thread(() => { while (_running) { Tick(); Thread.Sleep(16); } })
        { IsBackground = true, Name = "GamepadReader" };
        _thread.Start();
    }

    public void Stop()
    {
        if (!_running) return;
        _running = false;
        _thread?.Join(1000);
        _thread = null;
        _index = -1;
        _last = "";
        _sony.Stop();
        Status = "arrêté";
    }

    void Tick()
    {
        long now = Environment.TickCount64;
        if (_index < 0)
        {
            if (now >= _nextScan)
            {
                _nextScan = now + 5000;
                for (int i = 0; i < 4; i++)
                    if (GetState(i, out _)) { _index = i; Status = $"manette n°{i + 1} connectée"; break; }
                if (_index < 0 && (_sony.Connected || _sony.TryOpen())) Status = $"manette {_sony.Name} connectée";
                else if (_index < 0) Status = "aucune manette détectée (XInput, PS4 ou PS5)";
            }
        }
        else if (!GetState(_index, out var s))
        {
            _index = -1;
            Status = "manette déconnectée";
            Message?.Invoke("{\"t\":\"pad\",\"b\":0,\"lx\":0,\"ly\":0,\"rx\":0,\"ry\":0,\"lt\":0,\"rt\":0}");
        }
        else
        {
            var g = s.Gamepad;
            var (lx, ly) = Stick(g.sThumbLX, g.sThumbLY);
            var (rx, ry) = Stick(g.sThumbRX, g.sThumbRY);
            var json = string.Create(CultureInfo.InvariantCulture,
                $"{{\"t\":\"pad\",\"b\":{g.wButtons},\"lx\":{lx:0.00},\"ly\":{ly:0.00},\"rx\":{rx:0.00},\"ry\":{ry:0.00},\"lt\":{g.bLeftTrigger / 255.0:0.00},\"rt\":{g.bRightTrigger / 255.0:0.00}}}");
            if (json != _last) { _last = json; Message?.Invoke(json); }
        }

        if (now >= _nextStatus)
        {
            _nextStatus = now + 1000;
            Message?.Invoke($"{{\"t\":\"pads\",\"s\":\"{Status}\",\"ok\":{(_index >= 0 || SonyActive ? "true" : "false")}}}");
        }
    }

    static (double, double) Dead(double fx, double fy)
    {
        double m = Math.Sqrt(fx * fx + fy * fy);
        const double dz = 0.12;
        if (m < dz) return (0, 0);
        double k = Math.Min(1, (m - dz) / (1 - dz)) / m;
        return (fx * k, fy * k);
    }

    static (double, double) Stick(short x, short y)
    {
        double fx = Math.Max(-1, x / 32767.0), fy = Math.Max(-1, y / 32767.0);
        double m = Math.Sqrt(fx * fx + fy * fy);
        const double dz = 0.12;
        if (m < dz) return (0, 0);
        double k = Math.Min(1, (m - dz) / (1 - dz)) / m;
        return (fx * k, fy * k);
    }

    bool GetState(int i, out XINPUT_STATE s)
    {
        if (_useEx)
        {
            try { return XInputGetStateEx(i, out s) == 0; }
            catch (EntryPointNotFoundException) { _useEx = false; }
        }
        try { return XInputGetState(i, out s) == 0; }
        catch (DllNotFoundException) { s = default; Status = "XInput indisponible"; return false; }
    }

    [StructLayout(LayoutKind.Sequential)]
    struct XINPUT_GAMEPAD { public ushort wButtons; public byte bLeftTrigger, bRightTrigger; public short sThumbLX, sThumbLY, sThumbRX, sThumbRY; }

    [StructLayout(LayoutKind.Sequential)]
    struct XINPUT_STATE { public uint dwPacketNumber; public XINPUT_GAMEPAD Gamepad; }

    [DllImport("xinput1_4.dll")] static extern int XInputGetState(int dwUserIndex, out XINPUT_STATE pState);
    [DllImport("xinput1_4.dll", EntryPoint = "#100")] static extern int XInputGetStateEx(int dwUserIndex, out XINPUT_STATE pState);

    public void Dispose()
    {
        Stop();
    }
}

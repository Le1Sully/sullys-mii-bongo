using System.Globalization;
using System.Text;
using Vortice.DirectInput;

namespace SullysMiiBongo;

sealed class WheelReader : IDisposable
{
    public event Action<string>? Message;
    public string Status { get; private set; } = "arrêté";
    public string? DeviceName { get; private set; }
    public string? RawAxes { get; private set; }

    bool _gotReport;
    int _clutchSlot = -1;

    public int RangeDegrees { get; set; } = 900;

    static readonly int[] GearButtons = { 8, 9, 10, 11, 12, 13 };
    const int ReverseButton = 22, PaddleRight = 4, PaddleLeft = 5;

    readonly IntPtr _hwnd;
    IDirectInput8? _di;
    IDirectInputDevice8? _dev;
    long _scanAt;

    public void RequestScan() => _scanAt = Environment.TickCount64 + 1000;
    string _last = "";
    long _nextStatus;

    Thread? _thread;
    volatile bool _running;

    public WheelReader(IntPtr hwnd) => _hwnd = hwnd;

    public void Start()
    {
        if (_running) return;
        Status = "recherche du volant…";
        _scanAt = Environment.TickCount64;
        _running = true;
        _thread = new Thread(() => { while (_running) { Tick(); Thread.Sleep(16); } Release(); })
        { IsBackground = true, Name = "WheelReader" };
        _thread.Start();
    }

    public void Stop()
    {
        if (!_running) return;
        _running = false;
        _thread?.Join(1000);
        _thread = null;
        Status = "arrêté";
    }

    public void Recalibrate() { _gotReport = false; _clutchSlot = -1; }

    void Tick()
    {
        long now = Environment.TickCount64;
        if (_dev == null)
        {
            if (_scanAt != 0 && now >= _scanAt) { _scanAt = 0; TryOpen(); }
            if (now >= _nextStatus) { _nextStatus = now + 1000; SendStatus(); }
            return;
        }

        JoystickState st;
        try
        {
            _dev.Poll();
            st = _dev.GetCurrentJoystickState();
        }
        catch
        {
            Release();
            Status = "volant débranché";
            return;
        }

        int s0 = st.Sliders.Length > 0 ? st.Sliders[0] : 0, s1 = st.Sliders.Length > 1 ? st.Sliders[1] : 0;
        int[] clutchCandidates = { s0, s1, st.Z, st.RotationX, st.RotationY };

        if (!_gotReport && (st.X != 32767 || st.Y != 32767 || st.RotationZ != 32767 || s1 != 32767)) _gotReport = true;
        if (_gotReport && _clutchSlot < 0) _clutchSlot = Array.FindIndex(clutchCandidates, v => v > 60000);

        RawAxes = $"X={st.X} Y={st.Y} Z={st.Z} RX={st.RotationX} RY={st.RotationY} RZ={st.RotationZ} S0={s0} S1={s1}"
                  + $" | données reçues={_gotReport} axe embrayage={(_clutchSlot < 0 ? "?" : new[] { "S0", "S1", "Z", "RX", "RY" }[_clutchSlot])}";

        double Pedal(int v) => _gotReport ? Math.Clamp((65535.0 - v) / 65535.0, 0, 1) : 0;
        double gas = Pedal(st.Y), brake = Pedal(st.RotationZ);
        double clutch = _clutchSlot >= 0 ? Pedal(clutchCandidates[_clutchSlot]) : 0;

        int gear = 0;
        for (int i = 0; i < GearButtons.Length; i++) if (Pressed(st, GearButtons[i])) gear = i + 1;
        if (Pressed(st, ReverseButton)) gear = -1;

        double angle = (st.X - 32767.5) / 32767.5 * RangeDegrees / 2.0;
        var json = string.Create(CultureInfo.InvariantCulture,
            $"{{\"t\":\"drv\",\"a\":{angle:0.0},\"g\":{gas:0.00},\"b\":{brake:0.00},\"c\":{clutch:0.00},\"gear\":{gear},\"pl\":{(Pressed(st, PaddleLeft) ? 1 : 0)},\"pr\":{(Pressed(st, PaddleRight) ? 1 : 0)}}}");
        if (json != _last) { _last = json; Message?.Invoke(json); }
        if (now >= _nextStatus) { _nextStatus = now + 1000; SendStatus(); }
    }

    static bool Pressed(JoystickState st, int i) => i < st.Buttons.Length && st.Buttons[i];

    void TryOpen()
    {
        try
        {
            _di ??= DInput.DirectInput8Create();
            var devices = _di.GetDevices(DeviceClass.GameControl, DeviceEnumerationFlags.AttachedOnly);
            var pick = devices.FirstOrDefault(d => d.ProductName.Contains("G27", StringComparison.OrdinalIgnoreCase))
                ?? devices.FirstOrDefault(d => d.Type == DeviceType.Driving)
                ?? devices.FirstOrDefault(d => d.ProductName.Contains("wheel", StringComparison.OrdinalIgnoreCase)
                                            || d.ProductName.Contains("racing", StringComparison.OrdinalIgnoreCase));
            if (pick == null) { Status = "aucun volant détecté (il sera trouvé dès que vous le brancherez)"; return; }

            var dev = _di.CreateDevice(pick.InstanceGuid);
            dev.SetCooperativeLevel(_hwnd, CooperativeLevel.NonExclusive | CooperativeLevel.Background);
            dev.SetDataFormat<RawJoystickState>();
            dev.Acquire();
            _dev = dev;
            _gotReport = false; _clutchSlot = -1;
            DeviceName = pick.ProductName.Trim();
            Status = DeviceName + " connecté";
        }
        catch (Exception ex) { Status = "erreur : " + ex.Message; }
    }

    void Release()
    {
        try { _dev?.Unacquire(); } catch { }
        _dev?.Dispose();
        _dev = null;
        _last = "";
    }

    void SendStatus()
    {
        var s = Status.Replace("\\", "\\\\").Replace("\"", "'");
        Message?.Invoke($"{{\"t\":\"drvs\",\"s\":\"{s}\",\"ok\":{(_dev != null ? "true" : "false")}}}");
    }

    public static string Diagnose(IntPtr hwnd)
    {
        var sb = new StringBuilder();
        try
        {
            using var di = DInput.DirectInput8Create();
            var devices = di.GetDevices(DeviceClass.GameControl, DeviceEnumerationFlags.AttachedOnly);
            if (devices.Count == 0) sb.AppendLine("Aucun contrôleur de jeu détecté.");
            foreach (var d in devices)
            {
                sb.AppendLine($"== {d.ProductName.Trim()} (type {d.Type})");
                using var dev = di.CreateDevice(d.InstanceGuid);
                dev.SetCooperativeLevel(hwnd, CooperativeLevel.NonExclusive | CooperativeLevel.Background);
                dev.SetDataFormat<RawJoystickState>();
                dev.Acquire();
                var min = new Dictionary<string, int>(); var max = new Dictionary<string, int>();
                var buttons = new SortedSet<int>();
                var end = Environment.TickCount64 + 8000;
                while (Environment.TickCount64 < end)
                {
                    dev.Poll();
                    var st = dev.GetCurrentJoystickState();
                    var axes = new Dictionary<string, int>
                    {
                        ["X"] = st.X, ["Y"] = st.Y, ["Z"] = st.Z, ["RX"] = st.RotationX, ["RY"] = st.RotationY, ["RZ"] = st.RotationZ,
                        ["S0"] = st.Sliders.Length > 0 ? st.Sliders[0] : 0, ["S1"] = st.Sliders.Length > 1 ? st.Sliders[1] : 0,
                    };
                    foreach (var (k, v) in axes)
                    {
                        min[k] = min.TryGetValue(k, out var a) ? Math.Min(a, v) : v;
                        max[k] = max.TryGetValue(k, out var b) ? Math.Max(b, v) : v;
                    }
                    for (int i = 0; i < st.Buttons.Length; i++) if (st.Buttons[i]) buttons.Add(i);
                    Thread.Sleep(10);
                }
                foreach (var k in min.Keys) sb.AppendLine($"  axe {k} : {min[k]} → {max[k]}");
                sb.AppendLine("  boutons appuyés : " + (buttons.Count == 0 ? "aucun" : string.Join(", ", buttons)));
                dev.Unacquire();
            }
        }
        catch (Exception ex) { sb.AppendLine("ERREUR " + ex.Message); }
        return sb.ToString();
    }

    public void Dispose()
    {
        Stop();
        _di?.Dispose();
    }
}

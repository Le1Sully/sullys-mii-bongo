using System.Diagnostics;
using System.Runtime.InteropServices;

namespace SullysMiiBongo;

readonly record struct KeyInfo(char Side, double X, int Row);

sealed class InputHooks : IDisposable
{
    public event Action<KeyInfo>? KeyDown;
    public event Action<KeyInfo>? KeyUp;
    public event Action<char>? MouseDown;
    public event Action<char>? MouseUp;
    public event Action<int>? Wheel;
    public event Action<uint, bool>? RawKey;

    delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    readonly HookProc _kbProc;
    readonly HookProc _msProc;
    IntPtr _kbHook, _msHook;
    readonly Dictionary<uint, KeyInfo> _down = new();
    bool _alternate;
    readonly Thread _thread;
    uint _threadId;

    public InputHooks()
    {
        _kbProc = KeyboardProc;
        _msProc = MouseProc;

        using var ready = new ManualResetEventSlim();
        _thread = new Thread(() =>
        {
            _threadId = GetCurrentThreadId();
            using (var mod = Process.GetCurrentProcess().MainModule!)
            {
                var hMod = GetModuleHandle(mod.ModuleName);
                _kbHook = SetWindowsHookEx(WH_KEYBOARD_LL, _kbProc, hMod, 0);
                _msHook = SetWindowsHookEx(WH_MOUSE_LL, _msProc, hMod, 0);
            }
            ready.Set();
            while (GetMessage(out var msg, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }
            if (_kbHook != IntPtr.Zero) UnhookWindowsHookEx(_kbHook);
            if (_msHook != IntPtr.Zero) UnhookWindowsHookEx(_msHook);
            _kbHook = _msHook = IntPtr.Zero;
        })
        { IsBackground = true, Name = "InputHooks", Priority = ThreadPriority.Highest };
        _thread.Start();
        ready.Wait();
    }

    static readonly Dictionary<uint, (double x, int row)> Layout = BuildLayout();

    static Dictionary<uint, (double, int)> BuildLayout()
    {
        var m = new Dictionary<uint, (double, int)>();
        const uint E = 0x1000;
        m[0x01] = (0.5, 0);
        for (uint i = 0; i < 10; i++) m[0x3B + i] = (1.5 + i, 0);
        m[0x57] = (11.5, 0); m[0x58] = (12.5, 0);
        m[0x29] = (0.5, 1);
        for (uint i = 0; i < 12; i++) m[0x02 + i] = (1.5 + i, 1);
        m[0x0E] = (14.0, 1);
        m[0x0F] = (0.75, 2);
        for (uint i = 0; i < 12; i++) m[0x10 + i] = (2.0 + i, 2);
        m[0x1C] = (14.1, 3);
        m[0x3A] = (0.9, 3);
        for (uint i = 0; i < 11; i++) m[0x1E + i] = (2.25 + i, 3);
        m[0x2B] = (13.25, 3);
        m[0x2A] = (1.1, 4); m[0x56] = (1.9, 4);
        for (uint i = 0; i < 10; i++) m[0x2C + i] = (2.75 + i, 4);
        m[0x36] = (13.6, 4);
        m[0x1D] = (0.75, 5); m[E | 0x5B] = (2.0, 5); m[0x38] = (3.25, 5);
        m[0x39] = (7.5, 5);
        m[E | 0x38] = (11.75, 5); m[E | 0x5C] = (12.75, 5); m[E | 0x5D] = (12.75, 5); m[E | 0x1D] = (14.25, 5);
        return m;
    }

    KeyInfo InfoFor(uint scan, bool extended)
    {
        var id = scan | (extended ? 0x1000u : 0u);
        if (!Layout.TryGetValue(id, out var p))
            p = (14.5, extended ? 5 : 1);
        char side;
        if (scan == 0x39 && !extended) { _alternate = !_alternate; side = _alternate ? 'L' : 'R'; }
        else side = p.x < 7.5 ? 'L' : 'R';
        return new KeyInfo(side, p.x, p.row);
    }

    IntPtr KeyboardProc(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            var data = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            int msg = (int)wParam;
            bool extended = (data.flags & 0x01) != 0;
            uint id = data.scanCode | (extended ? 0x1000u : 0u);
            if (msg is WM_KEYDOWN or WM_SYSKEYDOWN)
            {
                if (!_down.ContainsKey(id))
                {
                    var info = InfoFor(data.scanCode, extended);
                    _down[id] = info;
                    SafeInvoke(KeyDown, info);
                    try { RawKey?.Invoke(data.vkCode, true); } catch { }
                }
            }
            else if (msg is WM_KEYUP or WM_SYSKEYUP)
            {
                if (_down.Remove(id, out var info))
                {
                    SafeInvoke(KeyUp, info);
                    try { RawKey?.Invoke(data.vkCode, false); } catch { }
                }
            }
        }
        return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
    }

    IntPtr MouseProc(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0)
        {
            switch ((int)wParam)
            {
                case WM_LBUTTONDOWN: SafeInvoke(MouseDown, 'L'); break;
                case WM_LBUTTONUP: SafeInvoke(MouseUp, 'L'); break;
                case WM_RBUTTONDOWN: SafeInvoke(MouseDown, 'R'); break;
                case WM_RBUTTONUP: SafeInvoke(MouseUp, 'R'); break;
                case WM_MBUTTONDOWN: SafeInvoke(MouseDown, 'M'); RawMouse(0x04, true); break;
                case WM_MBUTTONUP: SafeInvoke(MouseUp, 'M'); RawMouse(0x04, false); break;
                case WM_XBUTTONDOWN or WM_XBUTTONUP:
                {
                    var xd = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                    uint which = (xd.mouseData >> 16) & 0xFFFF;
                    if (which is 1 or 2) RawMouse(which == 1 ? 0x05u : 0x06u, (int)wParam == WM_XBUTTONDOWN);
                    break;
                }
                case WM_MOUSEWHEEL:
                    var data = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                    short delta = (short)((data.mouseData >> 16) & 0xFFFF);
                    try { Wheel?.Invoke(delta > 0 ? 1 : -1); } catch { }
                    break;
            }
        }
        return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
    }

    void RawMouse(uint vk, bool down) { try { RawKey?.Invoke(vk, down); } catch { } }

    static void SafeInvoke<T>(Action<T>? a, T v)
    {
        try { a?.Invoke(v); } catch { }
    }

    public void Dispose()
    {
        if (_threadId != 0) PostThreadMessage(_threadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
        _thread.Join(1000);
    }

    const uint WM_QUIT = 0x0012;

    [StructLayout(LayoutKind.Sequential)]
    struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int ptX, ptY; }

    [DllImport("user32.dll")] static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint idThread, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    const int WH_KEYBOARD_LL = 13, WH_MOUSE_LL = 14;
    const int WM_KEYDOWN = 0x100, WM_KEYUP = 0x101, WM_SYSKEYDOWN = 0x104, WM_SYSKEYUP = 0x105;
    const int WM_LBUTTONDOWN = 0x201, WM_LBUTTONUP = 0x202, WM_RBUTTONDOWN = 0x204, WM_RBUTTONUP = 0x205,
              WM_MBUTTONDOWN = 0x207, WM_MBUTTONUP = 0x208, WM_MOUSEWHEEL = 0x20A, WM_XBUTTONDOWN = 0x20B, WM_XBUTTONUP = 0x20C;

    [StructLayout(LayoutKind.Sequential)]
    struct KBDLLHOOKSTRUCT { public uint vkCode, scanCode, flags, time; public IntPtr dwExtraInfo; }

    [StructLayout(LayoutKind.Sequential)]
    struct MSLLHOOKSTRUCT { public int x, y; public uint mouseData, flags, time; public IntPtr dwExtraInfo; }

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);
    [DllImport("user32.dll", SetLastError = true)]
    static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")]
    static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr GetModuleHandle(string? lpModuleName);
}

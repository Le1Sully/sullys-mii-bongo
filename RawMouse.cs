using System.Runtime.InteropServices;

namespace SullysMiiBongo;

sealed class RawMouse : IDisposable
{
    long _dx, _dy;
    readonly Thread _thread;
    uint _threadId;
    Sink? _sink;

    public RawMouse()
    {
        using var ready = new ManualResetEventSlim();
        _thread = new Thread(() =>
        {
            _threadId = GetCurrentThreadId();
            try
            {
                _sink = new Sink(this);
                var dev = new RAWINPUTDEVICE { usUsagePage = 0x01, usUsage = 0x02, dwFlags = RIDEV_INPUTSINK, hwndTarget = _sink.Handle };
                RegisterRawInputDevices(new[] { dev }, 1, (uint)Marshal.SizeOf<RAWINPUTDEVICE>());
            }
            catch { }
            ready.Set();
            while (GetMessage(out var msg, IntPtr.Zero, 0, 0) > 0)
            {
                TranslateMessage(ref msg);
                DispatchMessage(ref msg);
            }
            try { _sink?.DestroyHandle(); } catch { }
        })
        { IsBackground = true, Name = "RawMouse", Priority = ThreadPriority.AboveNormal };
        _thread.Start();
        ready.Wait();
    }

    public (int dx, int dy) Take()
    {
        long x = Interlocked.Exchange(ref _dx, 0), y = Interlocked.Exchange(ref _dy, 0);
        return ((int)Math.Clamp(x, int.MinValue, int.MaxValue), (int)Math.Clamp(y, int.MinValue, int.MaxValue));
    }

    sealed class Sink : NativeWindow
    {
        readonly RawMouse _owner;
        readonly IntPtr _buf = Marshal.AllocHGlobal(BufSize);
        static readonly int HeaderSize = Marshal.SizeOf<RAWINPUTHEADER>();
        const int BufSize = 128;

        public Sink(RawMouse owner)
        {
            _owner = owner;
            CreateHandle(new CreateParams { Caption = "SullysMiiBongoRawMouse", Parent = new IntPtr(-3) });
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_INPUT)
            {
                uint size = BufSize;
                if (GetRawInputData(m.LParam, RID_INPUT, _buf, ref size, (uint)HeaderSize) is > 0 and not uint.MaxValue
                    && Marshal.ReadInt32(_buf) == RIM_TYPEMOUSE)
                {
                    ushort flags = (ushort)Marshal.ReadInt16(_buf, HeaderSize);
                    if ((flags & MOUSE_MOVE_ABSOLUTE) == 0)
                    {
                        int x = Marshal.ReadInt32(_buf, HeaderSize + 12), y = Marshal.ReadInt32(_buf, HeaderSize + 16);
                        if (x != 0) Interlocked.Add(ref _owner._dx, x);
                        if (y != 0) Interlocked.Add(ref _owner._dy, y);
                    }
                }
            }
            base.WndProc(ref m);
        }

        public override void DestroyHandle()
        {
            base.DestroyHandle();
            Marshal.FreeHGlobal(_buf);
        }
    }

    public void Dispose()
    {
        if (_threadId != 0) PostThreadMessage(_threadId, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
        _thread.Join(1000);
    }

    const int WM_INPUT = 0x00FF;
    const uint WM_QUIT = 0x0012, RID_INPUT = 0x10000003, RIDEV_INPUTSINK = 0x100;
    const int RIM_TYPEMOUSE = 0;
    const ushort MOUSE_MOVE_ABSOLUTE = 0x01;

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICE { public ushort usUsagePage, usUsage; public uint dwFlags; public IntPtr hwndTarget; }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTHEADER { public uint dwType, dwSize; public IntPtr hDevice, wParam; }

    [StructLayout(LayoutKind.Sequential)]
    struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam, lParam; public uint time; public int ptX, ptY; }

    [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] devices, uint count, uint size);
    [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr hRawInput, uint command, IntPtr data, ref uint size, uint headerSize);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
    [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG lpMsg);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint idThread, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
}

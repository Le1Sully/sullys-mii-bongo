using System.Runtime.InteropServices;

namespace SullysMiiBongo;

sealed class CaptureDetector
{
    readonly (long t, int dx, int dy, Point p)[] _ring = new (long, int, int, Point)[64];
    int _head, _count;
    int _enter, _leave;
    long _lockedAt;

    public bool Captured { get; private set; }

    const int WindowMs = 200, MinRaw = 12;

    public bool Update(int dx, int dy, Point p)
    {
        long now = Environment.TickCount64;
        _ring[_head] = (now, dx, dy, p);
        _head = (_head + 1) % _ring.Length;
        _count = Math.Min(_count + 1, _ring.Length);

        long sx = 0, sy = 0;
        Point first = p;
        for (int i = 0; i < _count; i++)
        {
            var s = _ring[(_head - 1 - i + _ring.Length) % _ring.Length];
            if (now - s.t > WindowMs) break;
            sx += s.dx; sy += s.dy; first = s.p;
        }
        double raw = Math.Sqrt((double)sx * sx + (double)sy * sy);
        double cur = Math.Sqrt(Math.Pow(p.X - first.X, 2) + Math.Pow(p.Y - first.Y, 2));
        bool own = OwnForeground(), hidden = !own && CursorHidden();
        bool locked = hidden || (!own && ClipLocks(p));
        if (locked) _lockedAt = now;
        bool was = Captured;

        if (!Captured)
        {
            _enter = locked && raw >= MinRaw && cur <= raw * 0.35 ? _enter + 1 : 0;
            if (_enter >= 2) { Captured = true; _leave = 0; }
        }
        else
        {
            _leave = !hidden && raw >= MinRaw && cur > raw * 0.6 ? _leave + 1 : 0;
            if (_leave >= 4 || now - _lockedAt > 400) { Captured = false; _enter = 0; }
        }
        return Captured != was;
    }

    public void Reset() { Captured = false; _enter = _leave = 0; _count = 0; }

    static bool CursorHidden()
    {
        var ci = new CURSORINFO { cbSize = Marshal.SizeOf<CURSORINFO>() };
        if (!GetCursorInfo(ref ci)) return false;
        return (ci.flags & CURSOR_SHOWING) == 0 || ci.hCursor == IntPtr.Zero;
    }

    static bool ClipLocks(Point p)
    {
        if (!GetClipCursor(out var c)) return false;
        int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77), vw = GetSystemMetrics(78), vh = GetSystemMetrics(79);
        if (c.L <= vx && c.T <= vy && c.R >= vx + vw && c.B >= vy + vh) return false;
        if (c.R - c.L <= 8 || c.B - c.T <= 8) return true;
        return p.X > c.L + 2 && p.X < c.R - 3 && p.Y > c.T + 2 && p.Y < c.B - 3;
    }

    static bool OwnForeground()
    {
        var h = GetForegroundWindow();
        if (h == IntPtr.Zero) return false;
        GetWindowThreadProcessId(h, out var pid);
        return pid == Environment.ProcessId;
    }

    const int CURSOR_SHOWING = 0x1;

    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct CURSORINFO { public int cbSize, flags; public IntPtr hCursor; public POINT pt; }

    [DllImport("user32.dll")] static extern bool GetCursorInfo(ref CURSORINFO ci);
    [DllImport("user32.dll")] static extern bool GetClipCursor(out RECT r);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}

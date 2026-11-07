using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace SullysMiiBongo;

static class GameDetector
{
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor, rcWork; public uint dwFlags; }

    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFO mi);
    [DllImport("user32.dll")] static extern bool GetClipCursor(out RECT r);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);

    static readonly HashSet<string> ShellClasses = new(StringComparer.OrdinalIgnoreCase)
    {
        "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow",
    };
    static readonly HashSet<string> NeverGames = new(StringComparer.OrdinalIgnoreCase)
    {
        "explorer", "ShellExperienceHost", "StartMenuExperienceHost", "SearchHost", "LockApp", "obs64", "obs32",
    };

    static uint _pid;
    static string _name = "";

    public static string? Detect(IReadOnlyCollection<string> games)
    {
        var h = GetForegroundWindow();
        if (h == IntPtr.Zero || IsIconic(h)) return null;
        GetWindowThreadProcessId(h, out var pid);
        if (pid == 0 || pid == Environment.ProcessId) return null;
        var cls = new StringBuilder(128);
        GetClassName(h, cls, cls.Capacity);
        if (ShellClasses.Contains(cls.ToString())) return null;
        var name = ProcessName(pid);
        if (name.Length == 0) return null;
        if (games.Any(g => string.Equals(g, name, StringComparison.OrdinalIgnoreCase))) return name;
        if (NeverGames.Contains(name)) return null;
        return Fullscreen(h) || CursorClipped() ? name : null;
    }

    public static string[] OpenApps() =>
        Process.GetProcesses()
            .Where(p => { try { return p.Id != Environment.ProcessId && p.MainWindowHandle != IntPtr.Zero && p.MainWindowTitle.Length > 0; } catch { return false; } })
            .Select(p => p.ProcessName)
            .Where(n => !NeverGames.Contains(n))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
            .ToArray();

    static string ProcessName(uint pid)
    {
        if (pid == _pid) return _name;
        string name;
        try { using var p = Process.GetProcessById((int)pid); name = p.ProcessName; }
        catch { name = ""; }
        _pid = pid; _name = name;
        return name;
    }

    static bool Fullscreen(IntPtr h)
    {
        if (!GetWindowRect(h, out var r)) return false;
        var mi = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        if (!GetMonitorInfo(MonitorFromWindow(h, 2), ref mi)) return false;
        var m = mi.rcMonitor;
        return r.L <= m.L && r.T <= m.T && r.R >= m.R && r.B >= m.B;
    }

    static bool CursorClipped()
    {
        if (!GetClipCursor(out var c)) return false;
        int w = GetSystemMetrics(78), h = GetSystemMetrics(79);
        return c.R - c.L < w || c.B - c.T < h;
    }
}

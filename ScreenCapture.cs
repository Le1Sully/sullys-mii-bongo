using System.Diagnostics;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace SullysMiiBongo;

sealed class ScreenCapture : IDisposable
{
    public event Action<byte[]>? Frame;

    public int Fps { get; set; } = 5;
    public int Count { get; set; } = 2;
    public int Width { get; set; } = 640;
    public int Height { get; set; } = 360;
    public string Status { get; private set; } = "arrêté";
    public double AvgMs { get; private set; }

    Thread? _thread;
    volatile bool _running;
    readonly ImageCodecInfo _jpeg = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);

    public static Screen[] Ordered() => Screen.AllScreens
        .OrderByDescending(s => s.Primary).ThenBy(s => s.Bounds.X).ThenBy(s => s.Bounds.Y).ToArray();

    public static string LayoutJson() => System.Text.Json.JsonSerializer.Serialize(
        Ordered().Take(2).Select(s => new { primary = s.Primary, x = s.Bounds.X, y = s.Bounds.Y, w = s.Bounds.Width, h = s.Bounds.Height }));

    public void Start()
    {
        if (_running) return;
        _running = true;
        _thread = new Thread(Loop) { IsBackground = true, Name = "ScreenCapture", Priority = ThreadPriority.BelowNormal };
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

    void Loop()
    {
        using var enc = new EncoderParameters(1);
        enc.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 62L);
        var sw = new Stopwatch();
        while (_running)
        {
            long start = Environment.TickCount64;
            var screens = Ordered().Take(Math.Clamp(Count, 1, 2)).ToArray();
            for (int i = 0; i < screens.Length && _running; i++)
            {
                try
                {
                    sw.Restart();
                    var jpg = Grab(screens[i].Bounds, enc);
                    AvgMs = AvgMs * 0.9 + sw.Elapsed.TotalMilliseconds * 0.1;
                    var msg = new byte[jpg.Length + 1];
                    msg[0] = (byte)i;
                    Buffer.BlockCopy(jpg, 0, msg, 1, jpg.Length);
                    Frame?.Invoke(msg);
                    Status = $"{screens.Length} écran(s), {Fps} img/s, {AvgMs:0} ms par capture";
                }
                catch (Exception ex) { Status = "erreur : " + ex.Message; }
            }
            int wait = 1000 / Math.Clamp(Fps, 1, 15) - (int)(Environment.TickCount64 - start);
            if (wait > 0) Thread.Sleep(wait);
        }
    }

    byte[] Grab(Rectangle src, EncoderParameters enc)
    {
        IntPtr screenDc = GetDC(IntPtr.Zero);
        IntPtr memDc = CreateCompatibleDC(screenDc);
        IntPtr hbm = CreateCompatibleBitmap(screenDc, Width, Height);
        IntPtr old = SelectObject(memDc, hbm);
        try
        {
            SetStretchBltMode(memDc, HALFTONE);
            SetBrushOrgEx(memDc, 0, 0, IntPtr.Zero);
            StretchBlt(memDc, 0, 0, Width, Height, screenDc, src.X, src.Y, src.Width, src.Height, SRCCOPY);
            SelectObject(memDc, old);
            using var bmp = Image.FromHbitmap(hbm);
            using var ms = new MemoryStream();
            bmp.Save(ms, _jpeg, enc);
            return ms.ToArray();
        }
        finally
        {
            DeleteObject(hbm);
            DeleteDC(memDc);
            ReleaseDC(IntPtr.Zero, screenDc);
        }
    }

    public void Dispose() => Stop();

    const int HALFTONE = 4;
    const uint SRCCOPY = 0x00CC0020;
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int w, int h);
    [DllImport("gdi32.dll")] static extern IntPtr SelectObject(IntPtr hdc, IntPtr h);
    [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);
    [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] static extern int SetStretchBltMode(IntPtr hdc, int mode);
    [DllImport("gdi32.dll")] static extern bool SetBrushOrgEx(IntPtr hdc, int x, int y, IntPtr pt);
    [DllImport("gdi32.dll")] static extern bool StretchBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, int sw, int sh, uint rop);
}

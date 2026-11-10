using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SullysMiiBongo;

sealed class OverlayForm : Form
{
    static readonly Color KeyColor = Color.FromArgb(3, 2, 4);

    readonly Settings _settings;
    readonly string _baseUrl;
    readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    readonly System.Windows.Forms.Timer _dragTimer = new() { Interval = 10 };
    Point _dragStartCursor, _dragStartPos;
    public event Action<JsonElement>? OrbitChanged;

    public OverlayForm(Settings settings, string baseUrl)
    {
        _settings = settings;
        _baseUrl = baseUrl;
        Text = AppPaths.Name;
        Icon = SullysMiiBongoContext.AppIcon();
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = true;
        BackColor = KeyColor;
        Controls.Add(_web);

        var wa = Screen.PrimaryScreen!.WorkingArea;
        int size = Math.Clamp(settings.Size, 150, 2000);
        Size = new Size(size, size);
        Location = settings.X >= 0 && settings.Y >= 0 && IsOnScreen(new Point(settings.X, settings.Y))
            ? new Point(settings.X, settings.Y)
            : new Point(wa.Right - size - 20, wa.Bottom - size - 20);

        _dragTimer.Tick += (_, _) =>
        {
            if ((MouseButtons & MouseButtons.Left) == 0) { _dragTimer.Stop(); SavePlacement(); return; }
            var c = Cursor.Position;
            Location = new Point(_dragStartPos.X + c.X - _dragStartCursor.X, _dragStartPos.Y + c.Y - _dragStartCursor.Y);
        };

        ApplyWindowStyle();
        Load += async (_, _) => await InitWebView();
    }

    static bool IsOnScreen(Point p) => Screen.AllScreens.Any(s => s.WorkingArea.Contains(p));

    async Task InitWebView()
    {
        var env = await CoreWebView2Environment.CreateAsync(null,
            Path.Combine(AppPaths.LocalDir, "WebView2"));
        await _web.EnsureCoreWebView2Async(env);
        _web.DefaultBackgroundColor = Color.Transparent;
        var s = _web.CoreWebView2.Settings;
        s.AreDefaultContextMenusEnabled = false;
        s.IsZoomControlEnabled = false;
        s.AreDevToolsEnabled = true;
        s.IsStatusBarEnabled = false;
        _web.CoreWebView2.WebMessageReceived += OnWebMessage;
        _web.CoreWebView2.PermissionRequested += (_, e) => { if (e.PermissionKind == CoreWebView2PermissionKind.Camera) e.State = CoreWebView2PermissionState.Deny; };
        Navigate();
    }

    bool _unloaded;

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if (_web.CoreWebView2 == null) return;
        if (!Visible && !_unloaded) { _unloaded = true; _web.CoreWebView2.Navigate("about:blank"); }
        else if (Visible && _unloaded) Navigate();
    }

    public void Navigate()
    {
        if (_web.CoreWebView2 == null) return;
        if (!Visible) { if (!_unloaded) { _unloaded = true; _web.CoreWebView2.Navigate("about:blank"); } return; }
        _unloaded = false;
        var bg = _settings.Background == "transparent" ? "transparent" : _settings.Background;
        var url = $"{_baseUrl}?app=1&{_settings.Query(bg)}";
        _web.CoreWebView2.Navigate(url);
    }

    void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var type = doc.RootElement.GetProperty("type").GetString();
            switch (type)
            {
                case "drag":
                    if (_settings.ClickThrough) return;
                    _dragStartCursor = Cursor.Position;
                    _dragStartPos = Location;
                    _dragTimer.Start();
                    break;
                case "orbit":
                    OrbitChanged?.Invoke(doc.RootElement.Clone());
                    break;
                case "zoom":
                    var d = doc.RootElement.GetProperty("d").GetInt32();
                    SetSize(Width + d * 30);
                    break;
            }
        }
        catch { }
    }

    public void SetSize(int size)
    {
        size = Math.Clamp(size, 150, 2000);
        var center = new Point(Left + Width / 2, Top + Height / 2);
        Bounds = new Rectangle(center.X - size / 2, center.Y - size / 2, size, size);
        _settings.Size = size;
        SavePlacement();
    }

    void SavePlacement()
    {
        _settings.X = Left;
        _settings.Y = Top;
        _settings.Save();
    }

    public void ApplyWindowStyle()
    {
        TopMost = _settings.TopMost;
        TransparencyKey = _settings.Background == "transparent" ? KeyColor : Color.Empty;
        if (IsHandleCreated) UpdateExStyle();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        UpdateExStyle();
    }

    void UpdateExStyle()
    {
        var ex = GetWindowLong(Handle, GWL_EXSTYLE);
        ex |= WS_EX_LAYERED;
        ex = _settings.ClickThrough ? ex | WS_EX_TRANSPARENT : ex & ~WS_EX_TRANSPARENT;
        SetWindowLong(Handle, GWL_EXSTYLE, ex);
        _web.Enabled = !_settings.ClickThrough;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason is not (CloseReason.WindowsShutDown or CloseReason.ApplicationExitCall))
        {
            e.Cancel = true;
            Hide();
            _settings.ShowWindow = false;
            _settings.Save();
            return;
        }
        base.OnFormClosing(e);
    }

    const int GWL_EXSTYLE = -20;
    const int WS_EX_LAYERED = 0x80000, WS_EX_TRANSPARENT = 0x20;
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int nIndex);
    [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);
}

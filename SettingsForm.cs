using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SullysMiiBongo;

sealed class SettingsForm : Form
{
    public event Action<JsonElement>? MessageReceived;

    readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    string _url;
    readonly string _origin;
    readonly bool _hideOnClose;
    string? _pending;
    bool _ready;

    public SettingsForm(string url, Icon icon, string? title = null, Size? size = null, bool hideOnClose = true)
    {
        _url = url;
        _origin = new Uri(url).GetLeftPart(UriPartial.Authority);
        _hideOnClose = hideOnClose;
        Text = title ?? AppPaths.Name + " — Réglages";
        Icon = icon;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = size ?? new Size(980, 760);
        MinimumSize = new Size(640, 480);
        BackColor = Color.FromArgb(24, 24, 30);
        Controls.Add(_web);
        Load += async (_, _) => await InitAsync();
    }

    async Task InitAsync()
    {
        var env = await CoreWebView2Environment.CreateAsync(null,
            Path.Combine(AppPaths.LocalDir, "WebView2"));
        await _web.EnsureCoreWebView2Async(env);
        var s = _web.CoreWebView2.Settings;
        s.AreDefaultContextMenusEnabled = false;
        s.IsStatusBarEnabled = false;
        s.AreDevToolsEnabled = true;
        _web.CoreWebView2.WebMessageReceived += (_, e) =>
        {
            if (!e.Source.StartsWith(_origin + "/", StringComparison.OrdinalIgnoreCase)) return;
            LastSource = e.Source;
            try
            {
                using var doc = JsonDocument.Parse(e.WebMessageAsJson);
                var msg = doc.RootElement.Clone();
                if (msg.TryGetProperty("type", out var t) && t.GetString() == "ready") { _ready = true; if (_pending != null) Post(_pending); }
                MessageReceived?.Invoke(msg);
            }
            catch { }
        };
        _web.CoreWebView2.Navigate(_url);
    }

    public string LastSource { get; private set; } = "";
    public bool IsReady => _ready && _web.CoreWebView2 != null;

    public void NavigateTo(string url, string title)
    {
        _url = url;
        Text = title;
        _ready = false;
        _pending = null;
        if (_web.CoreWebView2 != null) _web.CoreWebView2.Navigate(url);
    }

    public void Post(string json)
    {
        if (!_ready || _web.CoreWebView2 == null) { _pending = json; return; }
        try { _web.CoreWebView2.PostWebMessageAsJson(json); } catch { }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing && _hideOnClose)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        base.OnFormClosing(e);
    }
}

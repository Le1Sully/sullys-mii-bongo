using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SullysMiiBongo;

sealed class CamTracker : IDisposable
{
    const string Page = "cam-tracker.html";

    readonly string _baseUrl;
    Form? _host;
    WebView2? _web;
    string _query = "";

    public event Action<string>? Message;
    public string Status { get; private set; } = "arrêté";
    public string[] Cameras { get; private set; } = [];
    public bool Running => _host != null;

    public CamTracker(string baseUrl) => _baseUrl = baseUrl;

    public void Start(string camera, bool head, bool hands)
    {
        var q = "?cam=" + Uri.EscapeDataString(camera ?? "") + "&h=" + (head ? 1 : 0) + "&m=" + (hands ? 1 : 0);
        if (_host != null)
        {
            if (q != _query) { _query = q; _web?.CoreWebView2?.Navigate(_baseUrl + Page + q); }
            return;
        }
        _query = q;
        Status = "démarrage de la caméra";
        _host = new Form
        {
            FormBorderStyle = FormBorderStyle.None, ShowInTaskbar = false, StartPosition = FormStartPosition.Manual,
            Location = new Point(-32000, -32000), Size = new Size(16, 16), Opacity = 0, BackColor = Color.Black,
        };
        _web = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };
        _host.Controls.Add(_web);
        _ = _host.Handle;
        _web.CreateControl();
        _ = Init(_host, _web);
    }

    async Task Init(Form host, WebView2 web)
    {
        try
        {
            var options = new CoreWebView2EnvironmentOptions(
                "--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion");
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(AppPaths.LocalDir, "WebView2Cam"), options);
            await web.EnsureCoreWebView2Async(env);
            if (_host != host) return;
            var core = web.CoreWebView2;
            var s = core.Settings;
            s.AreDefaultContextMenusEnabled = false;
            s.AreDevToolsEnabled = false;
            s.IsStatusBarEnabled = false;
            s.AreBrowserAcceleratorKeysEnabled = false;
            core.PermissionRequested += (_, e) =>
            {
                bool ours = e.Uri.StartsWith(_baseUrl.TrimEnd('/'), StringComparison.OrdinalIgnoreCase)
                    && core.Source.StartsWith(_baseUrl + Page, StringComparison.OrdinalIgnoreCase);
                e.SavesInProfile = false;
                e.State = ours && e.PermissionKind == CoreWebView2PermissionKind.Camera ? CoreWebView2PermissionState.Allow : CoreWebView2PermissionState.Deny;
            };
            try { await core.Profile.SetPermissionStateAsync(CoreWebView2PermissionKind.Camera, _baseUrl.TrimEnd('/'), CoreWebView2PermissionState.Allow); } catch { }
            if (_host != host) return;
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.NavigationStarting += (_, e) =>
            {
                if (!e.Uri.StartsWith(_baseUrl + Page, StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
            };
            core.WebMessageReceived += OnMessage;
            core.Navigate(_baseUrl + Page + _query);
        }
        catch (Exception ex)
        {
            Status = "WebView2 indisponible : " + ex.Message;
        }
    }

    void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(_baseUrl + Page, StringComparison.OrdinalIgnoreCase)) return;
        try
        {
            var json = e.WebMessageAsJson;
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            switch (root.GetProperty("t").GetString())
            {
                case "vr":
                    Message?.Invoke(json);
                    break;
                case "cams":
                    Status = root.GetProperty("s").GetString() ?? "";
                    break;
                case "camdev":
                    Cameras = root.GetProperty("list").EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToArray();
                    break;
            }
        }
        catch { }
    }

    public void Recenter()
    {
        try { _web?.CoreWebView2?.PostWebMessageAsJson("{\"cmd\":\"recenter\"}"); } catch { }
    }

    public void Stop()
    {
        var host = _host;
        _host = null;
        _web = null;
        _query = "";
        Status = "arrêté";
        if (host == null) return;
        try { host.Dispose(); } catch { }
    }

    public void Dispose() => Stop();
}

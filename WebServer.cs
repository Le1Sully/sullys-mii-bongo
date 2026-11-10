using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace SullysMiiBongo;

sealed class WebServer : IDisposable
{
    readonly HttpListener _listener = new();
    readonly string? _root;
    readonly ConcurrentDictionary<WebSocket, byte> _clients = new();
    public readonly ConcurrentDictionary<WebSocket, string> Perf = new();
    readonly Channel<(byte[] Data, bool Text)> _outbox = Channel.CreateUnbounded<(byte[] Data, bool Text)>(new UnboundedChannelOptions { SingleReader = true });
    readonly CancellationTokenSource _cts = new();

    public int Port { get; }
    public string Url => $"http://localhost:{Port}/";
    public int ClientCount => _clients.Count;

    public Func<string>? ConfigProvider { get; set; }


    public Func<string>? StatusProvider { get; set; }

    public Func<string>? PadsProvider { get; set; }

    public Func<string>? PersoProvider { get; set; }
    public Func<string>? CurrentPresetProvider { get; set; }

    public string ConfigMessage() => $"{{\"t\":\"cfg\",\"c\":{ConfigProvider?.Invoke() ?? "null"}}}";

    public WebServer(string? root, int port)
    {
        _root = root == null ? null : Path.GetFullPath(root);
        Port = port;
        _listener.Prefixes.Add(Url);
    }

    public void Start()
    {
        _listener.Start();
        _ = Task.Run(AcceptLoop);
        _ = Task.Run(SendLoop);
    }

    public void Publish(string json) => _outbox.Writer.TryWrite((Encoding.UTF8.GetBytes(json), true));

    int _pendingBinary;

    public void PublishBinary(byte[] data)
    {
        if (Volatile.Read(ref _pendingBinary) > 4) return;
        Interlocked.Increment(ref _pendingBinary);
        _outbox.Writer.TryWrite((data, false));
    }

    async Task AcceptLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener.GetContextAsync(); }
            catch { break; }
            _ = Task.Run(() => Handle(ctx));
        }
    }

    async Task Handle(HttpListenerContext ctx)
    {
        try
        {
            var path = ctx.Request.Url!.AbsolutePath;
            if (path == "/ws" && ctx.Request.IsWebSocketRequest)
            {
                var origin = ctx.Request.Headers["Origin"];
                if (!string.IsNullOrEmpty(origin) && origin != "null" &&
                    !origin.Equals(Url.TrimEnd('/'), StringComparison.OrdinalIgnoreCase) &&
                    !origin.Equals($"http://127.0.0.1:{Port}", StringComparison.OrdinalIgnoreCase))
                {
                    ctx.Response.StatusCode = 403;
                    ctx.Response.Close();
                    return;
                }
                await HandleSocket(ctx);
                return;
            }
            if (path == "/api/screens")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(ScreenCapture.LayoutJson()), "application/json");
                return;
            }
            if (path == "/api/status")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(StatusProvider?.Invoke() ?? "{}"), "application/json");
                return;
            }
            if (path == "/api/config")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(ConfigProvider?.Invoke() ?? "{}"), "application/json");
                return;
            }
            if (path == "/api/models")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(AppPaths.MiiModels())), "application/json");
                return;
            }
            if (path == "/api/scene-presets")
            {
                var list = AppPaths.ScenePresets().Select(p => new { file = p.File, nom = p.Nom, objets = p.Objets, description = p.Description });
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { current = CurrentPresetProvider?.Invoke() ?? "", list })), "application/json");
                return;
            }
            if (path == "/api/scene")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(AppPaths.LoadSceneJson()), "application/json");
                return;
            }
            if (path == "/api/manettes")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(PadsProvider?.Invoke() ?? "{}"), "application/json");
                return;
            }
            if (path == "/api/personnage")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(PersoProvider?.Invoke() ?? "{}"), "application/json");
                return;
            }
            if (path == "/guide-ia.md")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(AppPaths.AiGuide()), "text/markdown; charset=utf-8");
                return;
            }
            if (path == "/api/textures")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(AppPaths.UserImages())), "application/json");
                return;
            }
            if (path == "/api/objets")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(JsonSerializer.Serialize(AppPaths.UserObjects())), "application/json");
                return;
            }
            if (path == "/api/faces")
            {
                await WriteBytes(ctx, Encoding.UTF8.GetBytes(AppPaths.FaceSetsJson()), "application/json");
                return;
            }
            ServeStatic(ctx, path);
        }
        catch
        {
            try { ctx.Response.Abort(); } catch { }
        }
    }

    void ServeStatic(HttpListenerContext ctx, string path)
    {
        var rel = Uri.UnescapeDataString(path).TrimStart('/');
        if (rel.Length == 0) rel = "index.html";

        foreach (var (prefix, dir) in new[] { ("mii/", AppPaths.MiiDir), ("visages/", AppPaths.FacesDir), ("textures/", AppPaths.ImagesDir), ("objets/", AppPaths.ObjectsDir), ("manettes/", AppPaths.ManettesDir), ("personnage/", AppPaths.PersoDir) })
            if (rel.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                ServeFile(ctx, dir, rel[prefix.Length..]);
                return;
            }

        if (_root != null) { ServeFile(ctx, _root, rel); return; }
        var res = AppPaths.WebResource(rel);
        if (res == null) { NotFound(ctx); return; }
        _ = SendStream(ctx, res, MimeFor(rel), BuildTag);
    }

    static readonly string BuildTag = "\"" + typeof(WebServer).Assembly.ManifestModule.ModuleVersionId.ToString("N") + "\"";

    void ServeFile(HttpListenerContext ctx, string root, string rel)
    {
        root = Path.GetFullPath(root);
        var full = Path.GetFullPath(Path.Combine(root, rel));
        if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(full)) { NotFound(ctx); return; }
        var info = new FileInfo(full);
        var tag = $"\"{info.LastWriteTimeUtc.Ticks:x}-{info.Length:x}\"";
        Stream fs;
        try { fs = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 1 << 16, true); }
        catch { NotFound(ctx); return; }
        _ = SendStream(ctx, fs, MimeFor(full), tag);
    }

    static async Task SendStream(HttpListenerContext ctx, Stream src, string mime, string etag)
    {
        await using var _ = src;
        try
        {
            ctx.Response.Headers["Cache-Control"] = "no-cache";
            ctx.Response.Headers["ETag"] = etag;
            if (ctx.Request.Headers["If-None-Match"] == etag)
            {
                ctx.Response.StatusCode = 304;
                ctx.Response.Close();
                return;
            }
            ctx.Response.ContentType = mime;
            ctx.Response.ContentLength64 = src.Length;
            await src.CopyToAsync(ctx.Response.OutputStream, 1 << 16);
            ctx.Response.Close();
        }
        catch { try { ctx.Response.Abort(); } catch { } }
    }

    static void NotFound(HttpListenerContext ctx)
    {
        ctx.Response.StatusCode = 404;
        ctx.Response.Close();
    }

    static async Task WriteBytes(HttpListenerContext ctx, byte[] bytes, string mime)
    {
        ctx.Response.ContentType = mime;
        ctx.Response.Headers["Cache-Control"] = "no-cache";
        ctx.Response.ContentLength64 = bytes.Length;
        await ctx.Response.OutputStream.WriteAsync(bytes);
        ctx.Response.Close();
    }

    static string MimeFor(string file) => Path.GetExtension(file).ToLowerInvariant() switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" or ".mjs" => "text/javascript; charset=utf-8",
        ".wasm" => "application/wasm",
        ".css" => "text/css; charset=utf-8",
        ".json" => "application/json",
        ".glb" => "model/gltf-binary",
        ".gltf" => "model/gltf+json",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".ico" => "image/x-icon",
        ".svg" => "image/svg+xml",
        _ => "application/octet-stream",
    };

    async Task HandleSocket(HttpListenerContext ctx)
    {
        var wsCtx = await ctx.AcceptWebSocketAsync(null);
        var ws = wsCtx.WebSocket;
        _clients[ws] = 0;
        Publish(ConfigMessage());
        var buffer = new byte[1024];
        try
        {
            while (ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
            {
                var r = await ws.ReceiveAsync(buffer, _cts.Token);
                if (r.MessageType == WebSocketMessageType.Close) break;
                if (r.MessageType == WebSocketMessageType.Text && r.EndOfMessage && r.Count < buffer.Length)
                {
                    var text = Encoding.UTF8.GetString(buffer, 0, r.Count);
                    if (text.StartsWith("{\"t\":\"perf\"")) Perf[ws] = text;
                }
            }
        }
        catch { }
        finally
        {
            _clients.TryRemove(ws, out _);
            Perf.TryRemove(ws, out _);
            try { ws.Dispose(); } catch { }
        }
    }

    async Task SendLoop()
    {
        await foreach (var (bytes, text) in _outbox.Reader.ReadAllAsync(_cts.Token).ConfigureAwait(false))
        {
            if (!text) Interlocked.Decrement(ref _pendingBinary);
            foreach (var ws in _clients.Keys)
            {
                if (ws.State != WebSocketState.Open) { _clients.TryRemove(ws, out _); continue; }
                try { await ws.SendAsync(bytes, text ? WebSocketMessageType.Text : WebSocketMessageType.Binary, true, _cts.Token); }
                catch { _clients.TryRemove(ws, out _); }
            }
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _listener.Stop(); _listener.Close(); } catch { }
    }
}

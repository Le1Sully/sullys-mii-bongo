using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Text.Json;

namespace SullysMiiBongo;

sealed class Updater
{
    public const string Repo = "Le1Sully/sullys-mii-bongo-releases";
    const string ExeName = "Sully's Mii-Bongo.exe";

    public static Version Current { get; } = ReadCurrent();
    public static string CurrentText => $"{Current.Major}.{Current.Minor}.{Current.Build}";

    static readonly HttpClient Http = MakeClient();

    public static bool CanInstall =>
        Environment.ProcessPath is { } p
        && Path.GetFileName(p).Equals(ExeName, StringComparison.OrdinalIgnoreCase)
        && !File.Exists(Path.ChangeExtension(p, ".dll"));

    public string Status { get; private set; } = "";
    public string? Latest { get; private set; }
    public string? Notes { get; private set; }
    public string? PageUrl { get; private set; }
    public bool Available { get; private set; }
    public bool Busy { get; private set; }
    public event Action? Changed;

    string? _assetUrl;
    long _assetSize;

    static HttpClient MakeClient()
    {
        var c = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        c.DefaultRequestHeaders.UserAgent.ParseAdd($"SullysMiiBongo/{CurrentText}");
        return c;
    }

    static Version ReadCurrent()
    {
        var v = Assembly.GetEntryAssembly()?.GetName().Version ?? new Version(0, 0, 0);
        return new Version(v.Major, v.Minor, Math.Max(0, v.Build));
    }

    void Set(string status)
    {
        Status = status;
        Changed?.Invoke();
    }

    public async Task CheckAsync()
    {
        if (Busy) return;
        Busy = true;
        Available = false;
        Set("recherche d'une mise à jour…");
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            using var req = new HttpRequestMessage(HttpMethod.Get, $"https://api.github.com/repos/{Repo}/releases/latest");
            req.Headers.Accept.ParseAdd("application/vnd.github+json");
            using var resp = await Http.SendAsync(req, cts.Token);
            if (resp.StatusCode == HttpStatusCode.NotFound) { Status = "aucune version publiée pour l'instant"; return; }
            if (resp.StatusCode == HttpStatusCode.Forbidden || (int)resp.StatusCode == 429) { Status = "GitHub limite les recherches pour le moment : réessayez dans une heure"; return; }
            resp.EnsureSuccessStatusCode();
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync(cts.Token));
            var r = doc.RootElement;
            var tag = r.GetProperty("tag_name").GetString() ?? "";
            if (!Version.TryParse(tag.TrimStart('v', 'V'), out var online)) { Status = "version en ligne illisible : " + tag; return; }
            online = new Version(online.Major, online.Minor, Math.Max(0, online.Build));
            Latest = $"{online.Major}.{online.Minor}.{online.Build}";
            Notes = r.TryGetProperty("body", out var b) ? b.GetString() : null;
            PageUrl = r.TryGetProperty("html_url", out var h) ? h.GetString() : null;
            _assetUrl = null;
            if (r.TryGetProperty("assets", out var assets))
                foreach (var a in assets.EnumerateArray())
                    if (a.GetProperty("name").GetString() is { } n && n.EndsWith("-win-x64.zip", StringComparison.OrdinalIgnoreCase))
                    {
                        _assetUrl = a.GetProperty("browser_download_url").GetString();
                        _assetSize = a.TryGetProperty("size", out var s) ? s.GetInt64() : 0;
                        break;
                    }
            if (online <= Current) { Status = $"à jour : vous avez la dernière version ({CurrentText})"; return; }
            if (_assetUrl == null || !_assetUrl.StartsWith("https://github.com/", StringComparison.OrdinalIgnoreCase))
            {
                Status = $"la version {Latest} est en ligne, mais sans fichier à télécharger";
                return;
            }
            Available = true;
            Status = $"nouvelle version {Latest} disponible (vous avez la {CurrentText})";
        }
        catch (OperationCanceledException) { Status = "GitHub ne répond pas : réessayez plus tard"; }
        catch (HttpRequestException ex) { Status = "pas de connexion à GitHub : " + ex.Message; }
        catch (Exception ex) { Status = "recherche impossible : " + ex.Message; }
        finally
        {
            Busy = false;
            Changed?.Invoke();
        }
    }

    public async Task<bool> InstallAsync()
    {
        if (Busy || !Available || _assetUrl == null) return false;
        if (!CanInstall)
        {
            Set("installation automatique impossible ici (version de développement) : téléchargez le zip depuis GitHub");
            return false;
        }
        Busy = true;
        var exe = Environment.ProcessPath!;
        var dir = Path.GetDirectoryName(exe)!;
        var newExe = exe + ".new";
        var oldExe = exe + ".old";
        var tmpZip = Path.Combine(Path.GetTempPath(), $"SullysMiiBongo-{Latest}-{Environment.ProcessId}.zip");
        Set($"téléchargement de la version {Latest}…");
        try
        {
            using (var resp = await Http.GetAsync(_assetUrl, HttpCompletionOption.ResponseHeadersRead))
            {
                resp.EnsureSuccessStatusCode();
                long total = resp.Content.Headers.ContentLength ?? _assetSize;
                await using var src = await resp.Content.ReadAsStreamAsync();
                await using var dst = File.Create(tmpZip);
                var buf = new byte[1 << 16];
                long done = 0;
                int n, shown = -1;
                while ((n = await src.ReadAsync(buf)) > 0)
                {
                    await dst.WriteAsync(buf.AsMemory(0, n));
                    done += n;
                    if (total <= 0) continue;
                    int pct = (int)(done * 100 / total);
                    if (pct != shown) { shown = pct; Set($"téléchargement de la version {Latest} : {pct} %"); }
                }
            }
            Set("installation…");
            using (var zip = ZipFile.OpenRead(tmpZip))
            {
                var entry = zip.Entries.FirstOrDefault(e => e.Name.Equals(ExeName, StringComparison.OrdinalIgnoreCase))
                    ?? throw new InvalidDataException("le fichier téléchargé ne contient pas l'appli");
                var prefix = entry.FullName[..^entry.Name.Length];
                entry.ExtractToFile(newExe, true);
                using (var f = File.OpenRead(newExe))
                    if (f.Length < 1_000_000 || f.ReadByte() != 'M' || f.ReadByte() != 'Z')
                        throw new InvalidDataException("l'appli téléchargée est invalide");
                var root = Path.GetFullPath(dir) + Path.DirectorySeparatorChar;
                foreach (var e in zip.Entries)
                {
                    if (e.Name.Length == 0 || !e.FullName.StartsWith(prefix, StringComparison.Ordinal)) continue;
                    var rel = e.FullName[prefix.Length..];
                    if (rel != "Lisez-moi.md" && !rel.StartsWith("Licences/", StringComparison.Ordinal)) continue;
                    var target = Path.GetFullPath(Path.Combine(dir, rel));
                    if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) continue;
                    Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                    e.ExtractToFile(target, true);
                }
            }
            if (File.Exists(oldExe)) File.Delete(oldExe);
            File.Move(exe, oldExe);
            try { File.Move(newExe, exe); }
            catch { File.Move(oldExe, exe); throw; }
            Status = $"version {Latest} installée, redémarrage…";
            return true;
        }
        catch (Exception ex)
        {
            Status = "mise à jour impossible : " + ex.Message;
            try { File.Delete(newExe); } catch { }
            return false;
        }
        finally
        {
            try { File.Delete(tmpZip); } catch { }
            Busy = false;
            Changed?.Invoke();
        }
    }

    public static void WaitForExit(int pid)
    {
        try
        {
            using var p = Process.GetProcessById(pid);
            p.WaitForExit(20000);
        }
        catch { }
    }

    public static void CleanupOld()
    {
        try
        {
            if (Environment.ProcessPath is { } p && File.Exists(p + ".old")) File.Delete(p + ".old");
        }
        catch { }
    }
}

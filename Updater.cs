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
        var newExe = Path.Combine(dir, StagedName);
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
            Available = false;
            Status = $"version {Latest} téléchargée, redémarrage…";
            Log($"version {Latest} prête : {newExe}");
            StagedExe = newExe;
            return true;
        }
        catch (Exception ex)
        {
            Status = "mise à jour impossible : " + ex.Message;
            Log("échec du téléchargement : " + ex.Message);
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

    public const string StagedName = "Sully's Mii-Bongo.update.exe";
    public string? StagedExe { get; private set; }

    static string LogPath => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Sully's Mii-Bongo", "mise-a-jour.log");

    public static void Log(string line)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            File.AppendAllText(LogPath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{Environment.ProcessId}] {line}{Environment.NewLine}");
        }
        catch { }
    }

    public static void StopOld(int pid, string appExe, TimeSpan wait)
    {
        try
        {
            using var p = Process.GetProcessById(pid);
            string? path = null;
            try { path = p.MainModule?.FileName; } catch { }
            if (path != null && !path.StartsWith(appExe, StringComparison.OrdinalIgnoreCase)) { Log($"processus {pid} ignoré : {path}"); return; }
            if (p.WaitForExit((int)wait.TotalMilliseconds)) return;
            Log($"l'ancienne appli ({pid}) ne se ferme pas : arrêt forcé");
            p.Kill();
            p.WaitForExit(5000);
        }
        catch { }
    }

    public static void FinishUpdate(int oldPid)
    {
        var self = Environment.ProcessPath!;
        var dir = Path.GetDirectoryName(self)!;
        var target = Path.Combine(dir, ExeName);
        Log($"fin de mise à jour vers {CurrentText}, attente de l'ancienne appli ({oldPid})");
        StopOld(oldPid, target, TimeSpan.FromSeconds(20));
        bool copied = false;
        for (int i = 0; i < 50 && !copied; i++)
        {
            try { File.Copy(self, target, true); copied = true; }
            catch (Exception ex) { if (i == 49) Log("copie impossible : " + ex.Message); else Thread.Sleep(200); }
        }
        Log(copied ? $"version {CurrentText} installée" : "l'ancienne version est gardée");
        try { Process.Start(new ProcessStartInfo(target, copied ? "--after-update" : "") { UseShellExecute = false, WorkingDirectory = dir }); }
        catch (Exception ex) { Log("redémarrage impossible : " + ex.Message); }
    }

    public static void CleanupOld()
    {
        if (Environment.ProcessPath is not { } p) return;
        var dir = Path.GetDirectoryName(p)!;
        new Thread(() =>
        {
            for (int i = 0; i < 40; i++)
            {
                bool left = false;
                foreach (var f in Directory.GetFiles(dir, ExeName + ".old*").Append(Path.Combine(dir, StagedName)))
                {
                    if (!File.Exists(f)) continue;
                    try { File.Delete(f); } catch { left = true; }
                }
                if (!left) return;
                Thread.Sleep(250);
            }
        }) { IsBackground = true, Name = "UpdateCleanup" }.Start();
    }
}

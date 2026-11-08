using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace SullysMiiBongo;

static class AppPaths
{
    public const string Name = "Sully's Mii-Bongo";

    public static string DataRoot { get; set; } = AppContext.BaseDirectory;

    public static string MiiDir => Path.Combine(DataRoot, "Mii");
    public static string FacesDir => Path.Combine(DataRoot, "Visages");
    public static string ImagesDir => Path.Combine(DataRoot, "Images");
    public static string ObjectsDir => Path.Combine(DataRoot, "Objets");
    public static string ManettesDir => Path.Combine(DataRoot, "Manettes");

    public sealed record PadProfile(string File, string Nom, string Modele);

    public static PadProfile[] PadProfiles()
    {
        if (!Directory.Exists(ManettesDir)) return [];
        var list = new List<PadProfile>();
        foreach (var f in Directory.GetFiles(ManettesDir, "*.json").OrderBy(f => f))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(f));
                var r = doc.RootElement;
                if (!r.TryGetProperty("pieces", out _)) continue;
                list.Add(new PadProfile(Path.GetFileName(f), r.TryGetProperty("nom", out var n) ? n.GetString() ?? "" : "", r.TryGetProperty("modele", out var m) ? m.GetString() ?? "" : ""));
            }
            catch { }
        }
        return list.ToArray();
    }
    public static readonly string[] ModelPatterns = ["*.glb", "*.gltf", "*.fbx", "*.obj", "*.dae", "*.3mf", "*.stl", "*.ply", "*.zip"];
    public static string[] PadModels() => FilesIn(ManettesDir, ModelPatterns);
    public static string[] PadTextures() => FilesIn(ManettesDir, "*.png", "*.jpg", "*.jpeg", "*.webp");

    public static string NewPadFile(string nom, string ext = ".json")
    {
        var name = string.Concat((string.IsNullOrWhiteSpace(nom) ? "Ma manette" : nom).Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '-' : c)).Trim();
        if (name.Length > 60) name = name[..60];
        var file = name + ext; int k = 2;
        while (File.Exists(Path.Combine(ManettesDir, file))) file = $"{name} ({k++}){ext}";
        return file;
    }

    public static bool SavePad(string file, JsonElement data)
    {
        file = Path.GetFileName(file ?? "");
        if (!file.EndsWith(".json", StringComparison.OrdinalIgnoreCase) || data.ValueKind != JsonValueKind.Object
            || !data.TryGetProperty("pieces", out var p) || p.ValueKind != JsonValueKind.Array) return false;
        var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        if (json.Length > 4_000_000) return false;
        try
        {
            Directory.CreateDirectory(ManettesDir);
            var path = Path.Combine(ManettesDir, file);
            File.WriteAllText(path + ".tmp", json);
            File.Move(path + ".tmp", path, true);
            return true;
        }
        catch { return false; }
    }

    public static string ScenesDir => Path.Combine(DataRoot, "Scènes");
    public static string AiGuideFile => Path.Combine(ScenesDir, "Guide pour les IA.md");

    public static string AiGuide()
    {
        try { if (File.Exists(AiGuideFile)) return File.ReadAllText(AiGuideFile); } catch { }
        using var s = WebResource("guide-ia.md");
        return s == null ? "" : new StreamReader(s).ReadToEnd();
    }

    static string[] FilesIn(string dir, params string[] patterns) =>
        Directory.Exists(dir)
            ? patterns.SelectMany(p => Directory.GetFiles(dir, p)).Select(f => Path.GetFileName(f)!).Distinct().OrderBy(n => n).ToArray()
            : [];
    public static string[] UserImages() => FilesIn(ImagesDir, "*.png", "*.jpg", "*.jpeg", "*.webp");

    public static string PersoDir => Path.Combine(DataRoot, "Personnage");
    public static string ExpressionsDir => Path.Combine(PersoDir, "Expressions");
    public static string AccessoiresDir => Path.Combine(PersoDir, "Accessoires");
    static string PersoFile => Path.Combine(PersoDir, "Personnage.json");

    public static string[] PersoExpressions() => FilesIn(ExpressionsDir, "*.png", "*.webp");
    public static string[] PersoModels() => FilesIn(AccessoiresDir, ModelPatterns);

    const string PersoExample = """
    {
      "format": "sullys-mii-bongo-personnage",
      "version": 1,
      "items": [
        { "id": "exemple-dodo", "type": "expression", "nom": "Yeux fermés", "image": "Yeux fermés.png", "zone": "yeux", "touche": "Ctrl+Maj+F1", "maintien": false },
        { "id": "exemple-cri", "type": "expression", "nom": "Grande bouche", "image": "Grande bouche.png", "zone": "bouche", "parler": false, "touche": "Ctrl+Maj+F2", "maintien": true },
        { "id": "exemple-chapeau", "type": "objet", "nom": "Chapeau pointu", "modele": "forme:pyramid", "couleur": "#e8574a", "texture": "uni", "point": "tete", "pos": [0, 0.44, 0], "rot": [0, 45, 0], "taille": 0.16, "touche": "Ctrl+Maj+F3", "maintien": false }
      ]
    }
    """;

    public static string LoadPersoJson()
    {
        try
        {
            if (File.Exists(PersoFile)) return File.ReadAllText(PersoFile);
            Directory.CreateDirectory(PersoDir);
            File.WriteAllText(PersoFile, PersoExample);
        }
        catch { }
        return PersoExample;
    }

    public static bool SavePerso(JsonElement data)
    {
        if (data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("items", out var it) || it.ValueKind != JsonValueKind.Array || it.GetArrayLength() > 500) return false;
        var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        if (json.Length > 2_000_000) return false;
        try
        {
            Directory.CreateDirectory(PersoDir);
            File.WriteAllText(PersoFile + ".tmp", json);
            File.Move(PersoFile + ".tmp", PersoFile, true);
            return true;
        }
        catch { return false; }
    }

    public static bool SetPersoKey(string id, string? touche, bool? maintien)
    {
        try
        {
            var root = System.Text.Json.Nodes.JsonNode.Parse(LoadPersoJson())?.AsObject();
            if (root?["items"] is not System.Text.Json.Nodes.JsonArray items) return false;
            var it = items.OfType<System.Text.Json.Nodes.JsonObject>().FirstOrDefault(o => (string?)o["id"] == id);
            if (it == null) return false;
            if (touche != null) it["touche"] = touche;
            if (maintien != null) it["maintien"] = maintien.Value;
            return SavePerso(JsonSerializer.SerializeToElement(root));
        }
        catch { return false; }
    }

    public sealed record PersoItem(string Id, string Nom, string Type, string Touche, bool Maintien, string Mii, bool Boucle = false)
    {
        public bool JoueUneFois => Type == "animation" && !Boucle && !Maintien;
    }

    public static PersoItem[] PersoItems()
    {
        try
        {
            using var doc = JsonDocument.Parse(LoadPersoJson());
            if (!doc.RootElement.TryGetProperty("items", out var items) || items.ValueKind != JsonValueKind.Array) return [];
            string Str(JsonElement e, string k) => e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
            return items.EnumerateArray().Where(e => e.ValueKind == JsonValueKind.Object && Str(e, "id").Length > 0)
                .Select(e => new PersoItem(Str(e, "id"), Str(e, "nom"), Str(e, "type") is "objet" or "animation" ? Str(e, "type") : "expression", Str(e, "touche"),
                    e.TryGetProperty("maintien", out var m) && m.ValueKind == JsonValueKind.True, Str(e, "mii"),
                    e.TryGetProperty("boucle", out var b) && b.ValueKind == JsonValueKind.True))
                .ToArray();
        }
        catch { return []; }
    }

    public static string FreeFileName(string dir, string nom, string ext)
    {
        var name = string.Concat((string.IsNullOrWhiteSpace(nom) ? "Sans nom" : nom).Select(c => Path.GetInvalidFileNameChars().Contains(c) ? '-' : c)).Trim();
        if (name.Length > 60) name = name[..60];
        var file = name + ext; int k = 2;
        while (File.Exists(Path.Combine(dir, file))) file = $"{name} ({k++}){ext}";
        return file;
    }
    public static string[] UserObjects() => FilesIn(ObjectsDir, ModelPatterns);

    public static string SceneFile => Path.Combine(SettingsDir, "scene.json");

    public static string LoadSceneJson()
    {
        try { if (File.Exists(SceneFile)) return File.ReadAllText(SceneFile); } catch { }
        return "{\"version\":1,\"objects\":[]}";
    }

    public static (HashSet<int> Objects, int[] Base) SceneScreenSources()
    {
        var objs = new HashSet<int>(); var bases = new[] { 1, 2 };
        try
        {
            using var doc = JsonDocument.Parse(LoadSceneJson());
            var root = doc.RootElement;
            if (root.TryGetProperty("objects", out var list) && list.ValueKind == JsonValueKind.Array)
                foreach (var o in list.EnumerateArray())
                    if (o.TryGetProperty("type", out var t) && t.GetString() == "screen")
                        objs.Add(o.TryGetProperty("source", out var src) && src.ValueKind == JsonValueKind.Number ? src.GetInt32() : 1);
            if (root.TryGetProperty("base", out var b) && b.TryGetProperty("screens", out var sc) && sc.ValueKind == JsonValueKind.Array)
            {
                int i = 0;
                foreach (var e in sc.EnumerateArray())
                {
                    if (i >= 2) break;
                    bases[i] = e.TryGetProperty("hidden", out var h) && h.ValueKind == JsonValueKind.True ? 0
                        : e.TryGetProperty("source", out var src) ? (src.ValueKind == JsonValueKind.Number ? src.GetInt32() : 0) : i + 1;
                    i++;
                }
            }
        }
        catch { }
        objs.RemoveWhere(n => n < 1 || n > 16);
        return (objs, bases.Select(n => n is < 1 or > 16 ? 0 : n).ToArray());
    }

    public static bool SaveScene(JsonElement data, out int count)
    {
        count = 0;
        if (data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("objects", out var objs) || objs.ValueKind != JsonValueKind.Array) return false;
        count = objs.GetArrayLength();
        var json = data.GetRawText();
        if (json.Length > 4_000_000 || count > 2000) return false;
        try
        {
            Directory.CreateDirectory(SettingsDir);
            var tmp = SceneFile + ".tmp";
            File.WriteAllText(tmp, json);
            File.Move(tmp, SceneFile, true);
            return true;
        }
        catch { return false; }
    }

    public sealed record ScenePreset(string File, string Nom, int Objets, string Description);

    static readonly JsonDocumentOptions LooseJson = new() { AllowTrailingCommas = true, CommentHandling = JsonCommentHandling.Skip };

    public static ScenePreset[] ScenePresets()
    {
        if (!Directory.Exists(ScenesDir)) return [];
        var list = new List<ScenePreset>();
        foreach (var f in Directory.GetFiles(ScenesDir, "*.json").OrderBy(f => f, StringComparer.CurrentCultureIgnoreCase))
        {
            int n = -1; var desc = "";
            try
            {
                if (new FileInfo(f).Length > 4_000_000) continue;
                using var doc = JsonDocument.Parse(File.ReadAllText(f), LooseJson);
                var r = doc.RootElement;
                if (r.ValueKind == JsonValueKind.Array) n = r.GetArrayLength();
                else if (r.ValueKind == JsonValueKind.Object)
                {
                    foreach (var k in new[] { "objects", "objets", "elements" })
                        if (r.TryGetProperty(k, out var o) && o.ValueKind == JsonValueKind.Array) { n = o.GetArrayLength(); break; }
                    if (r.TryGetProperty("description", out var d) && d.ValueKind == JsonValueKind.String) desc = d.GetString() ?? "";
                }
            }
            catch { }
            list.Add(new(Path.GetFileName(f), Path.GetFileNameWithoutExtension(f), n, desc.Length > 140 ? desc[..140] + "…" : desc));
        }
        return list.ToArray();
    }

    public static string? ScenePresetPath(string? file)
    {
        if (string.IsNullOrWhiteSpace(file)) return null;
        var name = Path.GetFileName(file);
        if (!name.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) return null;
        var p = Path.Combine(ScenesDir, name);
        return File.Exists(p) ? p : null;
    }

    public static string? PresetFileName(string? nom)
    {
        nom = (nom ?? "").Trim();
        foreach (var c in Path.GetInvalidFileNameChars()) nom = nom.Replace(c, '-');
        nom = nom.Trim(' ', '.');
        if (nom.Length == 0) return null;
        if (nom.Length > 80) nom = nom[..80].Trim();
        return nom + ".json";
    }

    public static string? SaveScenePreset(string nom, JsonElement data)
    {
        var file = PresetFileName(nom);
        if (file == null || data.ValueKind != JsonValueKind.Object || !data.TryGetProperty("objects", out var o) || o.ValueKind != JsonValueKind.Array) return null;
        var node = System.Text.Json.Nodes.JsonNode.Parse(data.GetRawText())!.AsObject();
        node["nom"] = Path.GetFileNameWithoutExtension(file);
        var json = node.ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        if (json.Length > 4_000_000) return null;
        try
        {
            Directory.CreateDirectory(ScenesDir);
            var path = Path.Combine(ScenesDir, file);
            File.WriteAllText(path + ".tmp", json);
            File.Move(path + ".tmp", path, true);
            return file;
        }
        catch { return null; }
    }

    public static bool ApplyScenePreset(string file, out int count, out string error)
    {
        count = 0; error = "";
        var path = ScenePresetPath(file);
        if (path == null) { error = "préréglage introuvable"; return false; }
        try
        {
            var node = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(path), documentOptions: LooseJson);
            if (node is System.Text.Json.Nodes.JsonArray arr) node = new System.Text.Json.Nodes.JsonObject { ["objects"] = arr.DeepClone() };
            if (node is System.Text.Json.Nodes.JsonObject obj && obj["objects"] == null)
                foreach (var k in new[] { "objets", "elements" })
                    if (obj[k] is System.Text.Json.Nodes.JsonArray a) { obj["objects"] = a.DeepClone(); obj.Remove(k); break; }
            using var doc = JsonDocument.Parse(node?.ToJsonString() ?? "null");
            if (SaveScene(doc.RootElement, out count)) return true;
            error = "ce fichier n'est pas au format de l'appli : ouvrez-le dans l'éditeur de scène pour le corriger";
        }
        catch (Exception ex) { error = "fichier illisible : " + ex.Message; }
        return false;
    }

    public static string? RenameScenePreset(string file, string nom)
    {
        var path = ScenePresetPath(file); var to = PresetFileName(nom);
        if (path == null || to == null) return null;
        var dest = Path.Combine(ScenesDir, to);
        if (string.Equals(dest, path, StringComparison.OrdinalIgnoreCase)) { if (dest != path) File.Move(path, dest); return to; }
        if (File.Exists(dest)) return null;
        try { File.Move(path, dest); return to; } catch { return null; }
    }

    public static bool DeleteScenePreset(string file)
    {
        var path = ScenePresetPath(file);
        if (path == null) return false;
        try
        {
            Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(path, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
            return true;
        }
        catch { return false; }
    }

    public static string SettingsDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), Name);
    public static string LocalDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Name);
    public static string OldSettingsDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MiiBongo");

    public static string[] MiiModels() =>
        Directory.Exists(MiiDir)
            ? ModelPatterns.SelectMany(p => Directory.GetFiles(MiiDir, p)).Select(f => Path.GetFileName(f)!).Distinct().OrderBy(n => n).ToArray()
            : [];

    public sealed record FaceSet(string Name, string? Blink, string[] Mouths, double Split, string Material);

    public static FaceSet[] FaceSets()
    {
        if (!Directory.Exists(FacesDir)) return [];
        var list = new List<FaceSet>();
        foreach (var dir in Directory.GetDirectories(FacesDir).OrderBy(d => d))
        {
            var name = Path.GetFileName(dir);
            var files = Directory.GetFiles(dir, "*.png").Select(f => Path.GetFileName(f)!).ToArray();
            string Url(string f) => "./visages/" + Uri.EscapeDataString(name) + "/" + Uri.EscapeDataString(f);
            static string Plain(string s) => new string(s.Normalize(System.Text.NormalizationForm.FormD)
                .Where(c => System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.NonSpacingMark).ToArray()).ToLowerInvariant();
            var blink = files.FirstOrDefault(f => Plain(f).StartsWith("yeux"));
            var mouths = files
                .Select(f => (f, m: System.Text.RegularExpressions.Regex.Match(Plain(f), @"^bouche\s*(\d+)")))
                .Where(x => x.m.Success).OrderBy(x => int.Parse(x.m.Groups[1].Value)).Select(x => Url(x.f)).ToArray();
            if (blink == null && mouths.Length == 0) continue;
            double split = 0.586; string material = "Mask";
            var cfg = Path.Combine(dir, "visage.json");
            if (File.Exists(cfg))
            {
                try
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(cfg));
                    if (doc.RootElement.TryGetProperty("separation", out var s) && s.TryGetDouble(out var sv)) split = Math.Clamp(sv, 0.05, 0.95);
                    if (doc.RootElement.TryGetProperty("materiau", out var m) && m.GetString() is { Length: > 0 } mv) material = mv;
                }
                catch { }
            }
            list.Add(new FaceSet(name, blink == null ? null : Url(blink), mouths, split, material));
        }
        return list.ToArray();
    }

    public static string FaceSetsJson() => JsonSerializer.Serialize(FaceSets().Select(f => new
    {
        name = f.Name, blink = f.Blink, mouths = f.Mouths, split = f.Split, material = f.Material,
    }));

    static readonly Assembly Asm = typeof(AppPaths).Assembly;

    public static Stream? WebResource(string relPath) =>
        relPath.Contains("..") ? null : Asm.GetManifestResourceStream("web/" + relPath.Replace('/', '\\'));

    public static Stream? Resource(string name) => Asm.GetManifestResourceStream(name);

    public static void RegisterNativeResolver()
    {
        NativeLibrary.SetDllImportResolver(Asm, (lib, asm, path) =>
        {
            if (!lib.StartsWith("openvr_api", StringComparison.OrdinalIgnoreCase)) return IntPtr.Zero;
            try
            {
                using var src = Resource("native/openvr_api.dll");
                if (src == null) return IntPtr.Zero;
                var dir = Path.Combine(LocalDir, "native");
                Directory.CreateDirectory(dir);
                var file = Path.Combine(dir, "openvr_api.dll");
                if (!File.Exists(file) || new FileInfo(file).Length != src.Length)
                {
                    using var dst = File.Create(file);
                    src.CopyTo(dst);
                }
                return NativeLibrary.Load(file);
            }
            catch { return IntPtr.Zero; }
        });
    }

    public static void MigrateOldSettings()
    {
        try
        {
            var dst = Path.Combine(SettingsDir, "settings.json");
            var src = Path.Combine(OldSettingsDir, "settings.json");
            if (!File.Exists(dst) && File.Exists(src))
            {
                Directory.CreateDirectory(SettingsDir);
                File.Copy(src, dst);
            }
        }
        catch { }
    }
}

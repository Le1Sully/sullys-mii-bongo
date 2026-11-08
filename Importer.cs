using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;

namespace SullysMiiBongo;

static class Importer
{
    public sealed record Kind(string Dir, string Title, string Filter, bool Model, bool Folder = false);

    const string ModelFilter = "Modèles 3D (glb, gltf, fbx, obj, dae, stl, ply, 3mf, zip)|*.glb;*.gltf;*.fbx;*.obj;*.dae;*.stl;*.ply;*.3mf;*.zip|Tous les fichiers|*.*";
    const string ImageFilter = "Images (png, jpg, webp)|*.png;*.jpg;*.jpeg;*.webp|Tous les fichiers|*.*";

    public static Kind? Get(string kind) => kind switch
    {
        "mii" => new(AppPaths.MiiDir, "Importer un Mii (modèle 3D avec squelette de Mii)", ModelFilter, true),
        "objets" => new(AppPaths.ObjectsDir, "Importer des modèles 3D pour la scène", ModelFilter, true),
        "accessoires" => new(AppPaths.AccessoiresDir, "Importer des modèles 3D à accrocher au Mii", ModelFilter, true),
        "manettes" => new(AppPaths.ManettesDir, "Importer un modèle 3D de manette", ModelFilter, true),
        "images" => new(AppPaths.ImagesDir, "Importer des images (textures, posters)", ImageFilter, false),
        "expressions" => new(AppPaths.ExpressionsDir, "Importer des images d'expression (PNG, disposition du visage)", "Images PNG|*.png|Tous les fichiers|*.*", false),
        "visage" => new(AppPaths.FacesDir, "Choisissez le dossier d'un visage (yeux fermés.png, bouche 1.png…)", "", false, true),
        _ => null,
    };

    public static string[] Run(string kind, IWin32Window? owner)
    {
        var k = Get(kind) ?? throw new ArgumentException("type d'import inconnu");
        Directory.CreateDirectory(k.Dir);
        if (k.Folder)
        {
            using var fd = new FolderBrowserDialog { Description = k.Title, UseDescriptionForTitle = true };
            if (fd.ShowDialog(owner) != DialogResult.OK) return [];
            return [ImportFace(fd.SelectedPath)];
        }
        using var dlg = new OpenFileDialog { Title = k.Title, Filter = k.Filter, Multiselect = true };
        if (dlg.ShowDialog(owner) != DialogResult.OK) return [];
        return dlg.FileNames.Select(f => k.Model ? ImportModel(f, k.Dir) : CopyFree(f, k.Dir)).ToArray();
    }

    static string CopyFree(string src, string dir)
    {
        var name = AppPaths.FreeFileName(dir, Path.GetFileNameWithoutExtension(src), Path.GetExtension(src).ToLowerInvariant());
        File.Copy(src, Path.Combine(dir, name));
        return name;
    }

    static readonly string[] NeedsCompanions = [".obj", ".gltf", ".fbx", ".dae"];
    static readonly Regex FileRef = new(@"[^\x00-\x1f""'<>|*?=]{1,240}?\.(png|jpe?g|tga|bmp|webp|gif|dds|tiff?|mtl|bin|ktx2)\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static string ImportModel(string src, string dir)
    {
        var ext = Path.GetExtension(src).ToLowerInvariant();
        var companions = NeedsCompanions.Contains(ext) ? Companions(src) : [];
        if (companions.Count == 0) return CopyFree(src, dir);
        var zipName = AppPaths.FreeFileName(dir, Path.GetFileNameWithoutExtension(src), ".zip");
        var modelDir = Path.GetDirectoryName(Path.GetFullPath(src))!;
        using (var zip = ZipFile.Open(Path.Combine(dir, zipName), ZipArchiveMode.Create))
        {
            zip.CreateEntryFromFile(src, Path.GetFileName(src), CompressionLevel.Optimal);
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Path.GetFileName(src) };
            foreach (var f in companions)
            {
                var full = Path.GetFullPath(f);
                var entry = full.StartsWith(modelDir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                    ? Path.GetRelativePath(modelDir, full).Replace('\\', '/')
                    : Path.GetFileName(full);
                if (used.Add(entry)) zip.CreateEntryFromFile(full, entry, CompressionLevel.Optimal);
            }
        }
        return zipName;
    }

    static List<string> Companions(string model)
    {
        var dir = Path.GetDirectoryName(Path.GetFullPath(model))!;
        var index = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        void Index(string root, int depth)
        {
            if (depth < 0 || index.Count > 20000) return;
            try
            {
                foreach (var f in Directory.EnumerateFiles(root)) index.TryAdd(Path.GetFileName(f), f);
                foreach (var d in Directory.EnumerateDirectories(root)) Index(d, depth - 1);
            }
            catch { }
        }
        Index(dir, 3);
        var parent = Path.GetDirectoryName(dir);
        if (parent != null && Path.GetPathRoot(parent) != parent)
            foreach (var d in SafeDirs(parent).Where(d => !string.Equals(d, dir, StringComparison.OrdinalIgnoreCase))) Index(d, 2);

        var found = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<string>([model]);
        while (queue.Count > 0 && found.Count < 2000)
        {
            foreach (var name in References(queue.Dequeue()))
            {
                if (!index.TryGetValue(name, out var path) || !seen.Add(path) || string.Equals(path, Path.GetFullPath(model), StringComparison.OrdinalIgnoreCase)) continue;
                found.Add(path);
                if (path.EndsWith(".mtl", StringComparison.OrdinalIgnoreCase) || path.EndsWith(".gltf", StringComparison.OrdinalIgnoreCase)) queue.Enqueue(path);
            }
        }
        return found;
    }

    static IEnumerable<string> SafeDirs(string d) { try { return Directory.GetDirectories(d); } catch { return []; } }

    static IEnumerable<string> References(string file)
    {
        string text;
        try
        {
            var info = new FileInfo(file);
            if (info.Length > 300_000_000) return [];
            text = Encoding.Latin1.GetString(File.ReadAllBytes(file));
        }
        catch { return []; }
        return FileRef.Matches(text).Select(m => Uri.UnescapeDataString(m.Value.Trim()).Split('/', '\\').Last().Trim()).Where(n => n.Length > 4).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    static string ImportFace(string folder)
    {
        var pngs = Directory.GetFiles(folder, "*.png");
        if (pngs.Length == 0) throw new InvalidDataException("ce dossier ne contient pas d'images PNG");
        var name = Path.GetFileName(folder.TrimEnd('\\', '/'));
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '-');
        var dest = Path.Combine(AppPaths.FacesDir, name);
        for (int i = 2; Directory.Exists(dest); i++) dest = Path.Combine(AppPaths.FacesDir, $"{name} ({i})");
        Directory.CreateDirectory(dest);
        foreach (var f in pngs.Concat(Directory.GetFiles(folder, "visage.json"))) File.Copy(f, Path.Combine(dest, Path.GetFileName(f)));
        return Path.GetFileName(dest);
    }
}

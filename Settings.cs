using System.Text.Json;

namespace SullysMiiBongo;

sealed class Settings
{
    public int Port { get; set; } = 7878;
    public int X { get; set; } = -1;
    public int Y { get; set; } = -1;
    public int Size { get; set; } = 420;
    public bool TopMost { get; set; } = true;
    public bool ClickThrough { get; set; } = false;
    public bool ShowWindow { get; set; } = true;
    public string Background { get; set; } = "transparent";
    public string Model { get; set; } = "Défaut.glb";
    public string Face { get; set; } = "Défaut";
    public bool ShowObjects { get; set; } = true;
    public bool HideOccluders { get; set; } = true;
    public string View { get; set; } = "bust";
    public string Mode { get; set; } = "keyboard";
    public bool VrMirror { get; set; } = false;
    public int WheelRange { get; set; } = 900;
    public bool MicEnabled { get; set; } = true;
    public string? MicDeviceId { get; set; }
    public double MicFloorDb { get; set; } = -48;

    public bool Decor { get; set; } = false;
    public string DecorView { get; set; } = "back";
    public List<string> Decorations { get; set; } = new() { "screens" };
    public string Floor { get; set; } = "classic";
    public string MenuStyle { get; set; } = "window";
    public int ScreenFps { get; set; } = 5;
    public string PadModel { get; set; } = "8bitdo";
    public List<string> HiddenPads { get; set; } = new();
    public bool PadMinis { get; set; } = false;
    public bool TeteCalmeJeux { get; set; } = true;
    public List<string> Jeux { get; set; } = new();
    public string Theme { get; set; } = "classique";
    public string ScenePreset { get; set; } = "";
    public List<string> PersoOn { get; set; } = new();
    public string Fluidite { get; set; } = "auto";
    public List<Raccourci> Raccourcis { get; set; } = new();
    public bool RaccourcisActifs { get; set; } = true;

    public bool Orbit { get; set; } = false;
    public double OrbitAz { get; set; } = 30;
    public double OrbitEl { get; set; } = 18;
    public double OrbitZoom { get; set; } = 1;

    string DecoList => string.Join(",", Decorations);

    public string PageConfigJson() => JsonSerializer.Serialize(new
    {
        mode = Mode, view = View, model = Model, mirror = VrMirror,
        decor = Decor, decorView = DecorView, deco = DecoList, screenLive = ScreenFps > 0, floor = Floor,
        padModel = PadModel, face = Face, objects = ShowObjects, occlude = HideOccluders,
        fps = Fluidite,
        minis = PadMinis,
        theme = Theme,
        orbit = new { on = Orbit, az = Math.Round(OrbitAz), el = Math.Round(OrbitEl), zoom = Math.Round(OrbitZoom, 2) },
    });

    public string Query(string bg) =>
        $"bg={Uri.EscapeDataString(bg)}&model={Uri.EscapeDataString(Model)}&view={View}&mode={Mode}" + (VrMirror ? "&mirror=1" : "")
        + $"&pad={Uri.EscapeDataString(PadModel)}&face={Uri.EscapeDataString(Face)}" + (ShowObjects ? "" : "&objs=0") + (HideOccluders ? "" : "&occ=0")
        + $"&fps={Fluidite}" + (PadMinis ? "&minis=1" : "")
        + (Orbit ? FormattableString.Invariant($"&orbit=1&oaz={Math.Round(OrbitAz)}&oel={Math.Round(OrbitEl)}&oz={Math.Round(OrbitZoom, 2)}") : "")
        + (ScreenFps > 0 ? "" : "&slive=0")
        + (Decor ? $"&decor=1&dview={DecorView}&deco={Uri.EscapeDataString(DecoList)}" + $"&floor={Floor}" : "");

    public sealed class Raccourci
    {
        public string Id { get; set; } = "";
        public string Touche { get; set; } = "";
        public string Action { get; set; } = "";
    }

    static string FilePath => Path.Combine(AppPaths.SettingsDir, "settings.json");

    public static Settings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                var s = JsonSerializer.Deserialize<Settings>(File.ReadAllText(FilePath)) ?? new Settings();
                if (s.PadModel == "xboxperso") s.PadModel = "xbox";
                return s;
            }
        }
        catch { }
        return new Settings();
    }

    public void Save()
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.WriteAllText(FilePath, JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch { }
    }
}

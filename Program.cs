using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Globalization;

namespace SullysMiiBongo;

static class Program
{
    public const string OpenSettingsSignal = "SullysMiiBongo_OpenSettings";
    public const string OpenEditorSignal = "SullysMiiBongo_OpenEditor";
    public static bool StartWithEditor, StartWithPadEditor, JustUpdated;

    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length >= 2 && args[0] == "--finish-update" && int.TryParse(args[1], out var stagedFor))
        {
            Updater.FinishUpdate(stagedFor);
            return;
        }
        int after = Array.IndexOf(args, "--after-update");
        if (after >= 0)
        {
            JustUpdated = true;
            if (after + 1 < args.Length && int.TryParse(args[after + 1], out var oldPid))
                Updater.StopOld(oldPid, Environment.ProcessPath!, TimeSpan.FromSeconds(20));
        }
        using var mutex = new Mutex(true, "SullysMiiBongo_SingleInstance", out bool first);
        if (!first && JustUpdated)
        {
            try { first = mutex.WaitOne(TimeSpan.FromSeconds(15)); }
            catch (AbandonedMutexException) { first = true; }
        }
        if (!first)
        {
            var wanted = args.Contains("--editor") ? OpenEditorSignal : OpenSettingsSignal;
            if (EventWaitHandle.TryOpenExisting(wanted, out var signal)) { signal.Set(); signal.Dispose(); }
            else MessageBox.Show($"{AppPaths.Name} est déjà lancé (voir la zone de notification).", AppPaths.Name);
            return;
        }

        if (args.Length >= 2 && args[0] == "--mic-test")
        {
            File.WriteAllText(args[1], MicCapture.Diagnose());
            return;
        }

        if (args.Length >= 2 && args[0] == "--wheel-test")
        {
            using var f = new Form();
            File.WriteAllText(args[1], WheelReader.Diagnose(f.Handle));
            return;
        }

        string? root = null;
        for (int i = 0; i < args.Length - 1; i++)
            if (args[i] == "--root") root = Path.GetFullPath(args[i + 1]);
        if (root != null && Directory.Exists(Path.Combine(root, "..", "Mii")))
            AppPaths.DataRoot = Path.GetFullPath(Path.Combine(root, ".."));

        StartWithEditor = args.Contains("--editor");
        StartWithPadEditor = args.Contains("--manettes");
        Updater.CleanupOld();
        AppPaths.MigrateOldSettings();
        AppPaths.RegisterNativeResolver();

        ApplicationConfiguration.Initialize();
        Application.Run(new SullysMiiBongoContext(root));
    }
}

sealed class SullysMiiBongoContext : ApplicationContext
{
    readonly Settings _settings = Settings.Load();
    readonly WebServer _server;
    readonly InputHooks _hooks;
    readonly MicCapture _mic = new();
    readonly VrTracker _vr = new();
    CamTracker? _cam;
    readonly Updater _updater = new();

    WheelReader? _wheel;
    readonly GamepadReader _pad = new();
    readonly ScreenCapture _screens = new();

    readonly System.Windows.Forms.Timer _readersTimer = new() { Interval = 1000 };
    DeviceWatcher? _deviceWatcher;

    bool MiiDisplayed => _server.ClientCount > 0;

    void UpdateVrTracker()
    {
        bool shown = MiiDisplayed;
        if (shown && (_settings.Mode == "vr" || SteamWanted)) _vr.Start(); else _vr.Stop();
        if (CamWanted && shown) _cam?.Start(_settings.Camera, _settings.SuiviTete, _settings.SuiviMains); else _cam?.Stop();
        if (_wheel != null)
        {
            _wheel.RangeDegrees = _settings.WheelRange;
            if (_settings.Mode == "wheel" && shown) _wheel.Start(); else _wheel.Stop();
        }
        if ((_settings.Mode == "pad" && shown) || _padEditorForm is { IsDisposed: false, Visible: true }) _pad.Start(); else _pad.Stop();
        _screens.Fps = _settings.ScreenFps;
        bool cinema = _settings.Decor && _settings.Decorations.Contains("cinema");
        bool decorScreens = _settings.Decor && !cinema && _settings.Decorations.Contains("screens");
        var (objSources, baseSources) = _sceneScreens ??= AppPaths.SceneScreenSources();
        int needed = cinema ? 1 : 0;
        if (decorScreens) needed = Math.Max(needed, baseSources.DefaultIfEmpty(0).Max());
        if (_settings.ShowObjects && objSources.Count > 0) needed = Math.Max(needed, objSources.Max());
        needed = Math.Min(needed, ScreenCapture.Ordered().Length);
        _screens.Count = Math.Max(1, needed);
        (_screens.Width, _screens.Height) = cinema ? (854, 480) : (640, 360);
        if (_settings.ScreenFps > 0 && needed > 0 && shown) _screens.Start(); else _screens.Stop();
    }

    bool TrackWanted => (_settings.SuiviTete || _settings.SuiviMains) && _settings.Mode != "vr";
    bool UseSteam => _settings.SuiviSource == "steamvr";
    bool CamWanted => TrackWanted && !UseSteam;
    bool SteamWanted => TrackWanted && UseSteam;

    string TrackState => !(_settings.SuiviTete || _settings.SuiviMains) ? (UseSteam ? "suivi désactivé" : "suivi désactivé (caméra éteinte)")
        : _settings.Mode == "vr" ? "inactif en mode Debout : c'est le casque VR qui pilote le Mii"
        : !MiiDisplayed ? (UseSteam ? "en pause (le Mii n'est affiché nulle part)" : "en pause (le Mii n'est affiché nulle part), caméra éteinte")
        : UseSteam ? (_vr.Status == "casque suivi" ? "suivi actif : SteamVR (casque et manettes)" : _vr.Status.Contains("SteamVR") ? _vr.Status : "SteamVR : " + _vr.Status)
        : _cam?.Status ?? "arrêté";

    string ReaderState(string mode, string status, string hint) =>
        _settings.Mode != mode ? hint : MiiDisplayed ? status : "en pause (le Mii n'est affiché nulle part)";

    readonly OverlayForm _overlay;
    readonly NotifyIcon _tray;

    readonly string? _root;
    Point _lastCursor = new(int.MinValue, int.MinValue);
    RawMouse? _rawMouse;
    Point _edgeCursor = new(int.MinValue, int.MinValue);

    static bool OnDesktop(int x, int y)
    {
        foreach (var s in Screen.AllScreens) if (s.Bounds.Contains(x, y)) return true;
        return false;
    }
    readonly CaptureDetector _capture = new();
    volatile string? _game;
    string? _lastGame;

    public SullysMiiBongoContext(string? root)
    {
        _root = root;
        if (_settings.Face.Length > 0 && !Directory.Exists(Path.Combine(AppPaths.FacesDir, _settings.Face))
            && Directory.Exists(Path.Combine(AppPaths.FacesDir, "Défaut")))
        { _settings.Face = "Défaut"; _settings.Save(); }
        _server = new WebServer(root, _settings.Port) { ConfigProvider = _settings.PageConfigJson };
        _server.PadsProvider = PadsJson;
        _server.PersoProvider = PersoJson;
        _server.CurrentPresetProvider = () => _settings.ScenePreset;
        try { _server.Start(); }
        catch (Exception ex)
        {
            MessageBox.Show($"Impossible d'ouvrir le port {_settings.Port} :\n{ex.Message}\n\n" +
                            $"Changez \"Port\" dans {Path.Combine(AppPaths.SettingsDir, "settings.json")}.", AppPaths.Name,
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            Environment.Exit(1);
        }

        RefreshStartupEntry();
        _hooks = new InputHooks();
        static string KeyJson(string t, KeyInfo k) =>
            string.Create(CultureInfo.InvariantCulture, $"{{\"t\":\"{t}\",\"s\":\"{k.Side}\",\"x\":{k.X:0.##},\"r\":{k.Row}}}");
        _hooks.KeyDown += k => _server.Publish(KeyJson("kd", k));
        _hooks.KeyUp += k => _server.Publish(KeyJson("ku", k));
        _hooks.MouseDown += b => _server.Publish($"{{\"t\":\"md\",\"b\":\"{b}\"}}");
        _hooks.MouseUp += b => _server.Publish($"{{\"t\":\"mu\",\"b\":\"{b}\"}}");
        _hooks.Wheel += d => _server.Publish($"{{\"t\":\"wh\",\"d\":{d}}}");
        _hooks.RawKey += _hotkeys.OnKey;
        try { _rawMouse = new RawMouse(); } catch { }
        _hotkeys.Pressed += (combo, vk) => { try { _overlay?.BeginInvoke(() => OnHotkey(combo, vk)); } catch { } };
        _hotkeys.Released += vk => { try { _overlay?.BeginInvoke(() => OnHotkeyUp(vk)); } catch { } };
        ReloadPersoItems();

        new Thread(() =>
        {
            int tick = 0;
            while (!_closing)
            {
                if (tick++ % 15 == 0) try { CheckGame(tick); } catch { }
                long now = Environment.TickCount64;
                if (_lastMouseTick != 0) _maxMouseGap = Math.Max(_maxMouseGap, now - _lastMouseTick);
                _lastMouseTick = now;
                try { PublishCursor(); } catch { }
                Thread.Sleep(16);
            }
        }) { IsBackground = true, Name = "CursorPublisher", Priority = ThreadPriority.AboveNormal }.Start();

        _mic.FloorDb = _settings.MicFloorDb;
        _mic.Level += v => _server.Publish(string.Create(CultureInfo.InvariantCulture, $"{{\"t\":\"mic\",\"v\":{v:0.###}}}"));
        if (_settings.MicEnabled) _mic.Start(_settings.MicDeviceId);

        _overlay = new OverlayForm(_settings, _server.Url);
        _overlay.OrbitChanged += json => ApplySetting("orbit", json);
        if (_settings.ShowWindow) _overlay.Show();

        _vr.Message += _server.Publish;
        _cam = new CamTracker(_server.Url);
        _cam.Message += _server.Publish;
        _wheel = new WheelReader(_overlay.Handle);
        _wheel.Message += _server.Publish;
        _pad.Message += _server.Publish;
        _screens.Frame += _server.PublishBinary;
        UpdateVrTracker();
        _server.StatusProvider = () => System.Text.Json.JsonSerializer.Serialize(new
        {
            mode = _settings.Mode, pages = _server.ClientCount,
            volant = _wheel?.Status, volantAxes = _wheel?.RawAxes, manette = _pad.Status, casque = _vr.Status, suivi = TrackState, cameras = _cam?.Cameras, ecrans = _screens.Status,
            fluidite = _server.Perf.Values.Select(v => System.Text.Json.JsonDocument.Parse(v).RootElement.Clone()).ToArray(),
            ecartSourisMaxMs = Interlocked.Exchange(ref _maxMouseGap, 0), sourisCapturee = _capture.Captured, dureeEtatReglagesMs = _lastPushMs,
        });
        _readersTimer.Tick += (_, _) => { UpdateVrTracker(); PushState(); };
        _readersTimer.Start();
        _deviceWatcher = new DeviceWatcher();
        _deviceWatcher.Changed += () => { _wheel?.RequestScan(); _pad.RequestScan(); if (_settingsForm?.Visible == true) RefreshSlowInfo(); };

        _tray = new NotifyIcon
        {
            Icon = AppIcon(SystemInformation.SmallIconSize.Width),
            Text = $"{AppPaths.Name} — {_server.Url}",
            Visible = true,
            ContextMenuStrip = BuildTrayMenu(),
        };
        _tray.DoubleClick += (_, _) => { if (_settings.MenuStyle == "full") ToggleWindow(true); else OpenSettings(); };

        _openSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Program.OpenSettingsSignal);
        var ui = SynchronizationContext.Current;
        new Thread(() =>
        {
            while (_openSignal.WaitOne() && !_closing) ui?.Post(_ => OpenSettings(), null);
        }) { IsBackground = true, Name = "OpenSettingsSignal" }.Start();
        _editorSignal = new EventWaitHandle(false, EventResetMode.AutoReset, Program.OpenEditorSignal);
        new Thread(() =>
        {
            while (_editorSignal.WaitOne() && !_closing) ui?.Post(_ => OpenEditor(), null);
        }) { IsBackground = true, Name = "OpenEditorSignal" }.Start();
        if (Program.StartWithEditor) ui?.Post(_ => OpenEditor(), null);
        if (Program.StartWithPadEditor) ui?.Post(_ => OpenPadEditor(), null);
        _updater.Changed += () => { try { _overlay?.BeginInvoke(PushState); } catch { } };
        if (Program.JustUpdated)
            _tray.ShowBalloonTip(4000, AppPaths.Name, $"Mise à jour installée : version {Updater.CurrentText}.", ToolTipIcon.Info);
    }

    void CheckGame(int tick)
    {
        var g = _settings.TeteCalmeJeux && MiiDisplayed ? GameDetector.Detect(_settings.Jeux, _capture.Captured) : null;
        if (g != _game)
        {
            _game = g;
            if (g != null) _lastGame = g;
            _server.Publish(GameJson());
            try { _overlay?.BeginInvoke(PushState); } catch { }
        }
        else if (g != null && tick % 120 == 1) _server.Publish(GameJson());
    }

    string GameJson() => System.Text.Json.JsonSerializer.Serialize(new { t = "game", on = _game != null });

    void PublishCursor()
    {
        var (dx, dy) = _rawMouse?.Take() ?? (0, 0);
        if (!MiiDisplayed)
        {
            _lastCursor = new(int.MinValue, int.MinValue);
            if (_capture.Captured) { _capture.Reset(); _server.Publish("{\"t\":\"cap\",\"on\":false}"); }
            return;
        }
        var p = Cursor.Position;
        if (_capture.Update(dx, dy, p))
        {
            _server.Publish(_capture.Captured ? "{\"t\":\"cap\",\"on\":true}" : "{\"t\":\"cap\",\"on\":false}");
            if (!_capture.Captured) _lastCursor = new(int.MinValue, int.MinValue);
            try { CheckGame(1); } catch { }
        }
        var screen = Screen.FromPoint(p);
        var b = screen.Bounds;
        if (_capture.Captured)
        {
            if (dx != 0 || dy != 0)
                _server.Publish(string.Create(CultureInfo.InvariantCulture,
                    $"{{\"t\":\"mr\",\"x\":{dx / (double)Math.Max(1, b.Width):0.00000},\"y\":{dy / (double)Math.Max(1, b.Height):0.00000}}}"));
            return;
        }
        int ex = dx != 0 && p.X == _edgeCursor.X && !OnDesktop(p.X + Math.Sign(dx), p.Y) ? dx : 0;
        int ey = dy != 0 && p.Y == _edgeCursor.Y && !OnDesktop(p.X, p.Y + Math.Sign(dy)) ? dy : 0;
        _edgeCursor = p;
        if (ex != 0 || ey != 0)
            _server.Publish(string.Create(CultureInfo.InvariantCulture,
                $"{{\"t\":\"me\",\"x\":{ex / (double)Math.Max(1, b.Width):0.00000},\"y\":{ey / (double)Math.Max(1, b.Height):0.00000}}}"));
        if (p == _lastCursor) return;
        _lastCursor = p;
        double x = (p.X - b.Left) / (double)Math.Max(1, b.Width);
        double y = (p.Y - b.Top) / (double)Math.Max(1, b.Height);
        int s = Array.IndexOf(ScreenCapture.Ordered().Select(o => o.DeviceName).ToArray(), screen.DeviceName);
        _server.Publish(string.Create(CultureInfo.InvariantCulture, $"{{\"t\":\"mm\",\"x\":{x:0.0000},\"y\":{y:0.0000},\"s\":{s}}}"));
    }

    ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        var open = new ToolStripMenuItem($"Ouvrir les réglages de {AppPaths.Name}…") { Font = new Font(menu.Font, FontStyle.Bold) };
        open.Click += (_, _) => OpenSettings();
        menu.Items.Add(open);
        menu.Items.Add(new ToolStripSeparator());

        var show = new ToolStripMenuItem("Afficher la fenêtre") { CheckOnClick = true };
        show.CheckedChanged += (_, _) => { if (show.Checked != _overlay.Visible) ApplySetting("showWindow", show.Checked); };
        menu.Opening += (_, _) => show.Checked = _overlay.Visible;
        menu.Items.Add(show);
        menu.Items.Add("Copier l'URL pour OBS", null, (_, _) => DoAction("copyObs"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("🎭 Éditeur de personnage…", null, (_, _) => OpenCharEditor());
        menu.Items.Add("🧱 Éditeur de scène…", null, (_, _) => OpenEditor());
        menu.Items.Add("🎮 Éditeur de manettes…", null, (_, _) => OpenPadEditor());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Recharger", null, (_, _) => DoAction("reload"));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quitter", null, (_, _) => ExitThread());
        return menu;
    }

    ContextMenuStrip BuildTrayMenu()
    {
        var menu = _settings.MenuStyle == "full" ? BuildFullMenu() : BuildMenu();
        ThemeMenu.Apply(menu, _settings.Theme, _settings.ThemeSombre);
        menu.Opened += (_, _) => ThemeMenu.Apply(menu, _settings.Theme, _settings.ThemeSombre);
        return menu;
    }

    ContextMenuStrip BuildFullMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("…");
        menu.Opening += (_, e) =>
        {
            e.Cancel = false;
            menu.Items.Clear();
            ToolStripMenuItem Check(string text, bool on, Action click) { var it = new ToolStripMenuItem(text) { Checked = on }; it.Click += (_, _) => click(); return it; }
            ToolStripMenuItem Choice(string text, (string label, object value, bool on)[] items, string key)
            {
                var sub = new ToolStripMenuItem(text);
                foreach (var (label, value, on) in items) sub.DropDownItems.Add(Check(label, on, () => ApplySetting(key, value)));
                return sub;
            }
            var st = _settings;

            menu.Items.Add(Check("Afficher la fenêtre", _overlay.Visible, () => ApplySetting("showWindow", !_overlay.Visible)));
            menu.Items.Add(Check("Toujours au premier plan", st.TopMost, () => ApplySetting("topMost", !st.TopMost)));
            menu.Items.Add(Check("Verrouiller (clics traversants)", st.ClickThrough, () => ApplySetting("clickThrough", !st.ClickThrough)));
            menu.Items.Add(Choice("Taille", new (string, object, bool)[] { ("Petite", 260, false), ("Moyenne", 420, false), ("Grande", 640, false), ("Très grande", 900, false) }, "size"));
            menu.Items.Add(Choice("Fond", new (string, object, bool)[] { ("Transparent", "transparent", st.Background == "transparent"), ("Vert (chroma key)", "green", st.Background == "green"), ("Sombre", "dark", st.Background == "dark") }, "background"));
            menu.Items.Add(Choice("Instrument", new (string, object, bool)[]
            {
                ("Clavier + souris", "keyboard", st.Mode == "keyboard"), ("Bongos", "bongo", st.Mode == "bongo"), ("Manette", "pad", st.Mode == "pad"),
                ("Volant (Logitech G27)", "wheel", st.Mode == "wheel"), ("Debout — casque VR", "vr", st.Mode == "vr"),
            }, "mode"));
            menu.Items.Add(Choice("Cadrage", new (string, object, bool)[] { ("Buste", "bust", st.View == "bust"), ("Corps entier", "full", st.View == "full") }, "view"));
            var orbitItem = new ToolStripMenuItem("Vue orbitale (clic droit + glisser dans la fenêtre)") { Checked = st.Orbit };
            orbitItem.Click += (_, _) => ApplySetting("orbit", System.Text.Json.JsonDocument.Parse($"{{\"on\":{(!st.Orbit).ToString().ToLowerInvariant()}}}").RootElement.Clone());
            menu.Items.Add(orbitItem);
            menu.Items.Add(Choice("Modèle de manette", new (string, object, bool)[]
            {
                ("8BitDo Ultimate 2C (Mint)", "8bitdo", st.PadModel == "8bitdo"), ("Xbox Series (noire)", "xbox", st.PadModel == "xbox"),
                ("Xbox — édition 25 ans", "xbox25", st.PadModel == "xbox25"),
            }.Concat(AppPaths.PadProfiles().Select(p => ((string)("🎮 " + (p.Nom.Length > 0 ? p.Nom : p.File)), (object)("perso:" + p.File), st.PadModel == "perso:" + p.File))).ToArray(), "padModel"));
            menu.Items.Add("Éditeur de manettes…", null, (_, _) => OpenPadEditor());

            var decor = new ToolStripMenuItem("Décor");
            decor.DropDownItems.Add(Check("Activer le décor", st.Decor, () => ApplySetting("decor", !st.Decor)));
            decor.DropDownItems.Add(new ToolStripSeparator());
            foreach (var (label, value) in new[] { ("Isométrique arrière-gauche", "back"), ("Isométrique arrière-droite", "back2"), ("Isométrique avant-droite", "front"), ("Trimétrique gauche", "tri"), ("Trimétrique droite", "tri2") })
                decor.DropDownItems.Add(Check(label, st.DecorView == value, () => ApplySetting("decorView", value)));
            decor.DropDownItems.Add(new ToolStripSeparator());
            foreach (var (label, id) in new[] { ("Deux écrans en direct", "screens"), ("Chaise de bureau", "chair"), ("Cinéma", "cinema") })
            {
                bool on = st.Decorations.Contains(id);
                decor.DropDownItems.Add(Check(label, on, () => ApplySetting("decoration", $"{id}:{(on ? "off" : "on")}")));
            }
            decor.DropDownItems.Add(new ToolStripSeparator());
            decor.DropDownItems.Add(Check("Écrans : affichage désactivé", st.ScreenFps == 0, () => ApplySetting("screenFps", st.ScreenFps == 0 ? 5 : 0)));
            var floors = new ToolStripMenuItem("Sols");
            foreach (var (label, value) in new[] { ("Classique (estrade)", "classic"), ("Plancher", "wood"), ("Carrelage", "tiles"), ("Moquette", "carpet"), ("Gazon", "grass") })
                floors.DropDownItems.Add(Check(label, st.Floor == value, () => ApplySetting("floor", value)));
            decor.DropDownItems.Add(floors);
            menu.Items.Add(decor);
            var editor = new ToolStripMenuItem("Éditeur de scène");
            editor.DropDownItems.Add("Ouvrir l'éditeur…", null, (_, _) => OpenEditor());
            editor.DropDownItems.Add(Check("Afficher mes objets", st.ShowObjects, () => ApplySetting("showObjects", !st.ShowObjects)));
            editor.DropDownItems.Add(Check("Rendre invisibles les objets qui cachent le Mii", st.HideOccluders, () => ApplySetting("hideOccluders", !st.HideOccluders)));
            editor.DropDownItems.Add("Dossier des scènes…", null, (_, _) => DoAction("openScenes"));
            editor.DropDownItems.Add("Dossier des images…", null, (_, _) => DoAction("openTextures"));
            editor.DropDownItems.Add("Dossier des objets 3D…", null, (_, _) => DoAction("openObjets"));
            menu.Items.Add(editor);
            var presets = new ToolStripMenuItem("Préréglages de scène");
            _presetsCache = null;
            foreach (var p in Presets())
                presets.DropDownItems.Add(Check(p.Nom, string.Equals(p.File, st.ScenePreset, StringComparison.OrdinalIgnoreCase), () => ApplyPreset(p.File)));
            if (presets.DropDownItems.Count == 0) presets.DropDownItems.Add(new ToolStripMenuItem("(aucun : enregistrez-en un depuis l'éditeur)") { Enabled = false });
            menu.Items.Add(presets);

            var perso = new ToolStripMenuItem("Personnage (extras)");
            perso.DropDownItems.Add("Ouvrir l'éditeur de personnage…", null, (_, _) => OpenCharEditor());
            var persoItems = PersoItemsForModel();
            if (persoItems.Length > 0) perso.DropDownItems.Add(new ToolStripSeparator());
            foreach (var it in persoItems)
            {
                bool on = st.PersoOn.Contains(it.Id);
                var label = (it.Type switch { "objet" => "🎩 ", "animation" => it.JoueUneFois ? "▶ " : "👋 ", _ => "🙂 " }) + (it.Nom.Length > 0 ? it.Nom : it.Id) + (it.Touche.Length > 0 ? $"   ({it.Touche})" : "");
                if (it.JoueUneFois) perso.DropDownItems.Add(label, null, (_, _) => PlayAnim(it.Id));
                else perso.DropDownItems.Add(Check(label, on, () => ApplySetting("persoItem", $"{it.Id}:{(on ? "off" : "on")}")));
            }
            menu.Items.Add(perso);

            var mic = new ToolStripMenuItem("Micro (bouche)");
            mic.DropDownItems.Add(Check("Activé", st.MicEnabled, () => ApplySetting("micEnabled", !st.MicEnabled)));
            foreach (var (label, db) in new[] { ("Sensibilité faible", -40.0), ("Sensibilité normale", -48.0), ("Sensibilité haute", -56.0) })
                mic.DropDownItems.Add(Check(label, Math.Abs(st.MicFloorDb - db) < 0.1, () => ApplySetting("micFloor", db)));
            mic.DropDownItems.Add(new ToolStripSeparator());
            mic.DropDownItems.Add(Check("Micro par défaut de Windows", string.IsNullOrEmpty(st.MicDeviceId), () => ApplySetting("micDevice", "")));
            foreach (var (id, name) in MicCapture.Devices())
                mic.DropDownItems.Add(Check(name, st.MicDeviceId == id, () => ApplySetting("micDevice", id)));
            menu.Items.Add(mic);

            var wheel = new ToolStripMenuItem("Volant");
            wheel.DropDownItems.Add(new ToolStripMenuItem("État : " + ReaderState("wheel", _wheel?.Status ?? "", "choisissez Instrument → Volant")) { Enabled = false });
            foreach (var deg in new[] { 270, 540, 900 })
                wheel.DropDownItems.Add(Check($"Rotation {deg}°", st.WheelRange == deg, () => ApplySetting("wheelRange", deg)));
            wheel.DropDownItems.Add("Recalibrer les pédales", null, (_, _) => DoAction("recalibrate"));
            menu.Items.Add(wheel);

            var vr = new ToolStripMenuItem("Casque VR");
            vr.DropDownItems.Add(new ToolStripMenuItem("État : " + ReaderState("vr", _vr.Status, "choisissez Instrument → Debout")) { Enabled = false });
            vr.DropDownItems.Add("Recentrer (regardez droit devant)", null, (_, _) => DoAction("vrRecenter"));
            vr.DropDownItems.Add(Check("Effet miroir", st.VrMirror, () => ApplySetting("vrMirror", !st.VrMirror)));
            menu.Items.Add(vr);

            var model = new ToolStripMenuItem("Mii");
            foreach (var f in AppPaths.MiiModels())
                model.DropDownItems.Add(Check(f, string.Equals(f, st.Model, StringComparison.OrdinalIgnoreCase), () => ApplySetting("model", f)));
            model.DropDownItems.Add("Ouvrir le dossier des Mii…", null, (_, _) => DoAction("openModels"));
            menu.Items.Add(model);
            var faceMenu = new ToolStripMenuItem("Visage");
            faceMenu.DropDownItems.Add(Check("Visage d'origine du Mii (sans animation)", st.Face == "", () => ApplySetting("face", "")));
            foreach (var fs in AppPaths.FaceSets())
                faceMenu.DropDownItems.Add(Check(fs.Name, st.Face == fs.Name, () => ApplySetting("face", fs.Name)));
            faceMenu.DropDownItems.Add("Ouvrir le dossier des visages…", null, (_, _) => DoAction("openFaces"));
            menu.Items.Add(faceMenu);

            menu.Items.Add(Check("Lancer au démarrage de Windows", IsStartupEnabled(), () => ApplySetting("startup", !IsStartupEnabled())));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Copier l'URL pour OBS", null, (_, _) => DoAction("copyObs"));
            menu.Items.Add("Ouvrir dans le navigateur", null, (_, _) => DoAction("openBrowser"));
            menu.Items.Add("Recharger", null, (_, _) => DoAction("reload"));
            menu.Items.Add(new ToolStripSeparator());
            var back = new ToolStripMenuItem("Utiliser la fenêtre de réglages") { Font = new Font(menu.Font, FontStyle.Bold) };
            back.Click += (_, _) => ApplySetting("menuStyle", "window");
            menu.Items.Add(back);
            menu.Items.Add("Quitter", null, (_, _) => ExitThread());
        };
        return menu;
    }

    SettingsForm? _settingsForm;
    EventWaitHandle? _openSignal, _editorSignal;
    volatile bool _closing;

    SettingsForm? _editorsForm;
    string _editorPage = "scene";
    SettingsForm? LiveEditors => _editorsForm is { IsDisposed: false } ? _editorsForm : null;
    SettingsForm? _editorForm => _editorPage == "scene" ? LiveEditors : null;
    SettingsForm? _charEditorForm => _editorPage == "perso" ? LiveEditors : null;
    SettingsForm? _padEditorForm => _editorPage == "manettes" ? LiveEditors : null;

    static readonly Dictionary<string, (string Path, string Title)> EditorPages = new()
    {
        ["scene"] = ("?follow=1&editor=1&bg=1e1f26", "Scène"),
        ["perso"] = ("?follow=1&perso=1&bg=1e1f26", "Personnage"),
        ["manettes"] = ("manettes.html", "Manettes"),
    };

    static string EditorTitle(string page) => $"{AppPaths.Name} — Éditeur · {EditorPages[page].Title}";

    void OpenEditor() => OpenEditors("scene");
    void OpenCharEditor() => OpenEditors("perso");
    void OpenPadEditor() => OpenEditors("manettes");

    void OpenEditors(string page)
    {
        if (!EditorPages.ContainsKey(page)) page = "scene";
        if (LiveEditors == null)
        {
            var area = Screen.PrimaryScreen!.WorkingArea;
            var size = new Size(Math.Min(1400, area.Width - 80), Math.Min(880, area.Height - 60));
            _editorPage = page;
            _editorsForm = new SettingsForm(_server.Url + EditorPages[page].Path, AppIcon(), EditorTitle(page), size, hideOnClose: false);
            _editorsForm.MessageReceived += OnEditorsMessage;
            _editorsForm.FormClosed += (_, _) => { _captureKey = false; UpdateVrTracker(); };
        }
        else if (_editorPage != page)
        {
            if (LiveEditors!.IsReady) LiveEditors.Post(System.Text.Json.JsonSerializer.Serialize(new { type = "goPage", page }));
            else SwitchEditorPage(page);
        }
        var f = LiveEditors!;
        f.Show();
        if (f.WindowState == FormWindowState.Minimized) f.WindowState = FormWindowState.Normal;
        f.Activate();
        UpdateVrTracker();
    }

    void SwitchEditorPage(string page)
    {
        if (!EditorPages.ContainsKey(page) || LiveEditors is not { } f) return;
        _captureKey = false;
        _editorPage = page;
        f.NavigateTo(_server.Url + EditorPages[page].Path, EditorTitle(page));
        UpdateVrTracker();
    }

    static string PageOfSource(string src) =>
        src.Contains("manettes.html", StringComparison.OrdinalIgnoreCase) ? "manettes" : src.Contains("perso=1") ? "perso" : "scene";

    void OnEditorsMessage(System.Text.Json.JsonElement msg)
    {
        var type = msg.TryGetProperty("type", out var t) ? t.GetString() : null;
        if (type == "editorPage") { SwitchEditorPage(msg.TryGetProperty("page", out var p) ? p.GetString() ?? "" : ""); return; }
        var from = PageOfSource(_editorsForm?.LastSource ?? "");
        if (from != _editorPage && type is not ("savePerso" or "scene" or "savePad")) return;
        var keep = _editorPage;
        _editorPage = from;
        try
        {
            switch (from)
            {
                case "perso": OnCharEditorMessage(msg); break;
                case "manettes": OnPadEditorMessage(msg); break;
                default: OnEditorMessage(msg); break;
            }
        }
        finally { _editorPage = keep; }
    }

    void RunImport(string kind, SettingsForm? form)
    {
        void Reply(object o) => form?.Post(System.Text.Json.JsonSerializer.Serialize(o));
        try
        {
            var files = Importer.Run(kind, form);
            if (files.Length == 0) return;
            if (kind is "mii" or "visage") RefreshSlowInfo();
            if (kind == "manettes") _padsCache = null;
            Reply(new { type = "imported", kind, files });
            PushState();
        }
        catch (Exception ex) { Reply(new { type = "error", message = "Import impossible : " + ex.Message }); }
    }

    void OnEditorMessage(System.Text.Json.JsonElement msg)
    {
        try
        {
            var type = msg.GetProperty("type").GetString();
            if (type == "import") { RunImport(msg.GetProperty("kind").GetString() ?? "", _editorForm); return; }
            if (type == "scene" && msg.TryGetProperty("data", out var data))
            {
                if (AppPaths.SaveScene(data, out _sceneCount))
                {
                    _server.Publish("{\"t\":\"scene\"}");
                    _sceneScreens = null; UpdateVrTracker();
                }
                PushState();
            }
            else if (type == "action") DoAction(msg.GetProperty("name").GetString()!);
            else if (type == "exportScene" && msg.TryGetProperty("data", out var exp)) ExportScene(exp);
            else if (type == "importScene") ImportScene();
            else if (type == "savePreset" && msg.TryGetProperty("data", out var pd))
            {
                var nom = msg.TryGetProperty("name", out var pn) ? pn.GetString() : null;
                var file = AppPaths.SaveScenePreset(nom ?? "", pd);
                if (file == null) { EditorReply(new { type = "error", message = "préréglage non enregistré (nom vide ou scène trop grosse)" }); return; }
                _settings.ScenePreset = file; _settings.Save();
                PresetsChanged();
                EditorReply(new { type = "presetSaved", file, name = Path.GetFileNameWithoutExtension(file) });
            }
            else if (type == "loadPreset")
            {
                var file = msg.GetProperty("file").GetString();
                var path = AppPaths.ScenePresetPath(file);
                if (path == null) { EditorReply(new { type = "error", message = "préréglage introuvable" }); PresetsChanged(); return; }
                _settings.ScenePreset = Path.GetFileName(path); _settings.Save();
                EditorReply(new { type = "presetText", file = Path.GetFileName(path), name = Path.GetFileNameWithoutExtension(path), text = File.ReadAllText(path) });
                PushState();
            }
            else if (type == "renamePreset")
            {
                var to = AppPaths.RenameScenePreset(msg.GetProperty("file").GetString() ?? "", msg.GetProperty("name").GetString() ?? "");
                if (to == null) EditorReply(new { type = "error", message = "renommage impossible (nom vide ou déjà pris)" });
                else if (string.Equals(_settings.ScenePreset, msg.GetProperty("file").GetString(), StringComparison.OrdinalIgnoreCase)) { _settings.ScenePreset = to; _settings.Save(); }
                RenameShortcuts(msg.GetProperty("file").GetString(), to);
                PresetsChanged();
            }
            else if (type == "deletePreset")
            {
                if (!AppPaths.DeleteScenePreset(msg.GetProperty("file").GetString() ?? "")) EditorReply(new { type = "error", message = "suppression impossible" });
                PresetsChanged();
            }
        }
        catch { }
    }
    int _sceneCount = -1;
    (HashSet<int> Objects, int[] Base)? _sceneScreens;

    void EditorReply(object o)
    {
        if (_editorForm is { IsDisposed: false }) _editorForm.Post(System.Text.Json.JsonSerializer.Serialize(o));
    }

    AppPaths.ScenePreset[]? _presetsCache;
    AppPaths.ScenePreset[] Presets() => _presetsCache ??= AppPaths.ScenePresets();

    void PresetsChanged()
    {
        _presetsCache = null;
        EditorReply(new { type = "presetsChanged" });
        PushState();
    }

    void RenameShortcuts(string? from, string? to)
    {
        if (from == null || to == null) return;
        foreach (var r in _settings.Raccourcis)
            if (string.Equals(r.Action, "scene:" + from, StringComparison.OrdinalIgnoreCase)) r.Action = "scene:" + to;
        _settings.Save();
    }

    bool ApplyPreset(string file, bool quiet = false)
    {
        if (!AppPaths.ApplyScenePreset(file, out var count, out var error))
        {
            if (!quiet) _tray.ShowBalloonTip(4000, AppPaths.Name, $"Préréglage « {Path.GetFileNameWithoutExtension(file)} » : {error}.", ToolTipIcon.Warning);
            PresetsChanged();
            return false;
        }
        _sceneCount = count;
        _settings.ScenePreset = Path.GetFileName(file); _settings.Save();
        _server.Publish("{\"t\":\"scene\"}");
        _sceneScreens = null; UpdateVrTracker();
        if (AppPaths.ScenePresetPath(file) is { } path)
            EditorReply(new { type = "presetText", file = Path.GetFileName(path), name = Path.GetFileNameWithoutExtension(path), text = File.ReadAllText(path), external = true });
        PushState();
        return true;
    }

    void ExportScene(System.Text.Json.JsonElement data)
    {
        Directory.CreateDirectory(AppPaths.ScenesDir);
        var name = data.TryGetProperty("nom", out var n) && n.GetString() is { Length: > 0 } nm ? nm : "Ma scène";
        foreach (var c in Path.GetInvalidFileNameChars()) name = name.Replace(c, '-');
        using var dlg = new SaveFileDialog
        {
            Title = "Exporter la scène", InitialDirectory = AppPaths.ScenesDir, FileName = name + ".json",
            Filter = "Scène Sully's Mii-Bongo (*.json)|*.json", AddExtension = true, OverwritePrompt = true,
        };
        if (dlg.ShowDialog(_editorForm) != DialogResult.OK) return;
        try
        {
            var pretty = System.Text.Json.JsonSerializer.Serialize(data, new System.Text.Json.JsonSerializerOptions
            { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
            File.WriteAllText(dlg.FileName, pretty);
            _editorForm?.Post(System.Text.Json.JsonSerializer.Serialize(new { type = "exported", name = Path.GetFileName(dlg.FileName) }));
        }
        catch (Exception ex) { _editorForm?.Post(System.Text.Json.JsonSerializer.Serialize(new { type = "error", message = ex.Message })); }
    }

    void ImportScene()
    {
        Directory.CreateDirectory(AppPaths.ScenesDir);
        using var dlg = new OpenFileDialog
        {
            Title = "Importer une scène", InitialDirectory = AppPaths.ScenesDir,
            Filter = "Scènes (*.json;*.txt)|*.json;*.txt|Tous les fichiers|*.*",
        };
        if (dlg.ShowDialog(_editorForm) != DialogResult.OK) return;
        try
        {
            var text = File.ReadAllText(dlg.FileName);
            if (text.Length > 4_000_000) throw new IOException("fichier trop gros pour une scène");
            _editorForm?.Post(System.Text.Json.JsonSerializer.Serialize(new { type = "importText", name = Path.GetFileName(dlg.FileName), text }));
        }
        catch (Exception ex) { _editorForm?.Post(System.Text.Json.JsonSerializer.Serialize(new { type = "error", message = ex.Message })); }
    }

    readonly PersoHotkeys _hotkeys = new();
    AppPaths.PersoItem[] _persoItems = [];
    readonly Dictionary<string, uint> _persoHeld = new();
    bool _captureKey;

    void ReloadPersoItems() => _persoItems = AppPaths.PersoItems();

    AppPaths.PersoItem[] PersoItemsForModel() =>
        _persoItems.Where(i => i.Mii.Length == 0 || string.Equals(i.Mii, _settings.Model, StringComparison.OrdinalIgnoreCase)).ToArray();

    IEnumerable<string> PersoActive() => _settings.PersoOn.Concat(_persoHeld.Keys).Distinct();

    void PlayAnim(string id) =>
        _server.Publish(System.Text.Json.JsonSerializer.Serialize(new { t = "anim", id }));

    void PublishPersoOn() =>
        _server.Publish(System.Text.Json.JsonSerializer.Serialize(new { t = "persoOn", ids = PersoActive() }));

    string PersoJson()
    {
        System.Text.Json.JsonElement data;
        try { data = System.Text.Json.JsonDocument.Parse(AppPaths.LoadPersoJson()).RootElement.Clone(); }
        catch { data = System.Text.Json.JsonDocument.Parse("{\"items\":[]}").RootElement.Clone(); }
        return System.Text.Json.JsonSerializer.Serialize(new
        {
            data, on = PersoActive(), expressions = AppPaths.PersoExpressions(), models = AppPaths.PersoModels(), mii = _settings.Model,
        });
    }

    void OnHotkey(string combo, uint vk)
    {
        if (_captureKey)
        {
            _captureKey = false;
            var target = _captureFor ?? _charEditorForm;
            _captureFor = null;
            target?.Post(System.Text.Json.JsonSerializer.Serialize(new { type = "keyCaptured", combo = vk == 0x1B ? null : combo }));
            return;
        }
        if (!_settings.RaccourcisActifs) return;
        var key = PersoHotkeys.Normalize(combo);
        foreach (var r in _settings.Raccourcis.ToList())
            if (r.Touche.Length > 0 && PersoHotkeys.Normalize(r.Touche) == key) RunShortcut(r.Action);
        bool changed = false;
        foreach (var it in PersoItemsForModel())
        {
            if (it.Touche.Length == 0 || PersoHotkeys.Normalize(it.Touche) != key) continue;
            if (it.JoueUneFois) PlayAnim(it.Id);
            else if (it.Maintien) { if (!_persoHeld.ContainsKey(it.Id)) { _persoHeld[it.Id] = vk; changed = true; } }
            else
            {
                if (!_settings.PersoOn.Remove(it.Id)) _settings.PersoOn.Add(it.Id);
                changed = true;
                SaveSoon();
            }
        }
        if (changed) { PublishPersoOn(); PushState(); }
    }

    SettingsForm? _captureFor;

    static readonly string[] Instruments = ["keyboard", "bongo", "pad", "wheel", "vr"];
    static readonly string[] Fluidites = ["60", "auto", "30"];

    void RunShortcut(string action)
    {
        var (what, arg) = action.IndexOf(':') is var i and > 0 ? (action[..i], action[(i + 1)..]) : (action, "");
        System.Text.Json.JsonElement Json(string s) => System.Text.Json.JsonDocument.Parse(s).RootElement.Clone();
        string Next(string[] list, string cur) => list[(Array.IndexOf(list, cur) + 1) % list.Length];
        switch (what)
        {
            case "mode":
                var m = arg == "next" ? Next(Instruments, _settings.Mode) : arg;
                if (m != _settings.Mode) ApplySetting("mode", m);
                break;
            case "window": ToggleWindow(!_overlay.Visible); break;
            case "lock": ApplySetting("clickThrough", !_settings.ClickThrough); break;
            case "view": ApplySetting("view", _settings.View == "bust" ? "full" : "bust"); break;
            case "orbit": ApplySetting("orbit", Json($"{{\"on\":{(!_settings.Orbit).ToString().ToLowerInvariant()}}}")); break;
            case "decor": ApplySetting("decor", !_settings.Decor); break;
            case "objects": ApplySetting("showObjects", !_settings.ShowObjects); break;
            case "minis": ApplySetting("padMinis", !_settings.PadMinis); break;
            case "calm": ApplySetting("calmGames", !_settings.TeteCalmeJeux); break;
            case "mic": ApplySetting("micEnabled", !_settings.MicEnabled); break;
            case "extras":
                _settings.PersoOn.Clear(); _persoHeld.Clear(); SaveSoon(); PublishPersoOn();
                break;
            case "pad": if (arg != _settings.PadModel) ApplySetting("padModel", arg); break;
            case "fluidite": ApplySetting("fluidite", arg == "next" ? Next(Fluidites, _settings.Fluidite) : arg); break;
            case "reload": DoAction("reload"); break;
            case "scene":
                var list = Presets().Where(p => p.Objets >= 0).Select(p => p.File).ToArray();
                if (arg is "next" or "prev")
                {
                    if (list.Length == 0) break;
                    int cur = Array.FindIndex(list, f => string.Equals(f, _settings.ScenePreset, StringComparison.OrdinalIgnoreCase));
                    int nx = arg == "next" ? (cur + 1) % list.Length : (cur <= 0 ? list.Length - 1 : cur - 1);
                    ApplyPreset(list[nx]);
                }
                else ApplyPreset(arg);
                return;
            default: return;
        }
        PushState();
    }

    AppPaths.PadProfile[]? _padsCache;

    readonly System.Windows.Forms.Timer _releaseSettings = new() { Interval = 5 * 60 * 1000 };
    void ReleaseSettings(object? s, EventArgs e)
    {
        _releaseSettings.Stop();
        if (_settingsForm is { IsDisposed: false, Visible: false }) { _settingsForm.Dispose(); _settingsForm = null; }
    }

    void OnHotkeyUp(uint vk)
    {
        var ids = _persoHeld.Where(kv => kv.Value == vk).Select(kv => kv.Key).ToList();
        if (ids.Count == 0) return;
        foreach (var id in ids) _persoHeld.Remove(id);
        PublishPersoOn(); PushState();
    }

    void OnCharEditorMessage(System.Text.Json.JsonElement msg)
    {
        void Reply(object o) => _charEditorForm?.Post(System.Text.Json.JsonSerializer.Serialize(o));
        try
        {
            switch (msg.GetProperty("type").GetString())
            {
                case "import": RunImport(msg.GetProperty("kind").GetString() ?? "", _charEditorForm); break;
                case "savePerso":
                    if (!AppPaths.SavePerso(msg.GetProperty("data"))) { Reply(new { type = "error", message = "personnage non enregistré" }); break; }
                    ReloadPersoItems();
                    var ids = _persoItems.Select(i => i.Id).ToHashSet();
                    _settings.PersoOn.RemoveAll(id => !ids.Contains(id));
                    foreach (var id in _persoHeld.Keys.Where(id => !ids.Contains(id)).ToList()) _persoHeld.Remove(id);
                    SaveSoon();
                    _server.Publish("{\"t\":\"perso\"}");
                    break;
                case "reloadPerso": _server.Publish("{\"t\":\"perso\"}"); break;
                case "setOn":
                    ApplySetting("persoItem", $"{msg.GetProperty("id").GetString()}:{(msg.GetProperty("on").ValueKind == System.Text.Json.JsonValueKind.True ? "on" : "off")}");
                    break;
                case "captureKey": _captureKey = true; _captureFor = null; break;
                case "cancelCapture": _captureKey = false; break;
                case "playAnim": PlayAnim(msg.GetProperty("id").GetString() ?? ""); break;
                case "saveExpression":
                {
                    var bytes = Convert.FromBase64String(msg.GetProperty("data").GetString() ?? "");
                    if (bytes.Length < 8 || bytes[0] != 0x89 || bytes[1] != (byte)'P') throw new InvalidDataException("image PNG attendue");
                    Directory.CreateDirectory(AppPaths.ExpressionsDir);
                    var file = AppPaths.FreeFileName(AppPaths.ExpressionsDir, msg.GetProperty("name").GetString() ?? "Expression", ".png");
                    File.WriteAllBytes(Path.Combine(AppPaths.ExpressionsDir, file), bytes);
                    if (msg.TryGetProperty("paint", out var pt) && pt.ValueKind == System.Text.Json.JsonValueKind.True) OpenInPaint(Path.Combine(AppPaths.ExpressionsDir, file));
                    Reply(new { type = "expressionSaved", file });
                    break;
                }
                case "openPaint": OpenInPaint(Path.Combine(AppPaths.ExpressionsDir, Path.GetFileName(msg.GetProperty("file").GetString() ?? ""))); break;
                case "action": DoAction(msg.GetProperty("name").GetString()!); break;
                case "saveBones":
                {
                    var model = Path.GetFileName(msg.GetProperty("model").GetString() ?? "");
                    var hasData = msg.TryGetProperty("data", out var bones) && bones.ValueKind == System.Text.Json.JsonValueKind.Object;
                    if (!AppPaths.SaveBones(model, hasData ? bones : null)) { Reply(new { type = "error", message = "squelette non enregistré" }); break; }
                    _overlay.Navigate();
                    _server.Publish("{\"t\":\"os\"}");
                    Reply(new { type = "bonesSaved" });
                    break;
                }
            }
        }
        catch (Exception ex) { Reply(new { type = "error", message = ex.Message }); }
        PushState();
    }

    System.Windows.Forms.Timer? _padReloadTimer;

    string PadsJson() => System.Text.Json.JsonSerializer.Serialize(new
    {
        profiles = AppPaths.PadProfiles().Select(p => new { file = p.File, nom = p.Nom, modele = p.Modele }),
        models = AppPaths.PadModels(),
        textures = AppPaths.PadTextures(),
        hidden = _settings.HiddenPads,
    });

    void OnPadEditorMessage(System.Text.Json.JsonElement msg)
    {
        void Reply(object o) => _padEditorForm?.Post(System.Text.Json.JsonSerializer.Serialize(o));
        try
        {
            var type = msg.GetProperty("type").GetString();
            switch (type)
            {
                case "import": RunImport(msg.GetProperty("kind").GetString() ?? "", _padEditorForm); break;
                case "savePad":
                {
                    var file = msg.GetProperty("file").GetString() ?? "";
                    if (!AppPaths.SavePad(file, msg.GetProperty("data"))) { Reply(new { type = "error", message = "manette non enregistrée" }); break; }
                    if (_settings.PadModel == "perso:" + Path.GetFileName(file))
                    {
                        _padReloadTimer ??= new System.Windows.Forms.Timer { Interval = 1500 };
                        _padReloadTimer.Tick -= PadReloadTick; _padReloadTimer.Tick += PadReloadTick;
                        _padReloadTimer.Stop(); _padReloadTimer.Start();
                    }
                    break;
                }
                case "createPad":
                {
                    var data = msg.GetProperty("data");
                    var nom = data.TryGetProperty("nom", out var n) ? n.GetString() ?? "" : "";
                    var file = AppPaths.NewPadFile(nom);
                    if (AppPaths.SavePad(file, data)) Reply(new { type = "padCreated", file });
                    else Reply(new { type = "error", message = "manette non créée" });
                    break;
                }
                case "deletePad":
                {
                    var path = Path.Combine(AppPaths.ManettesDir, Path.GetFileName(msg.GetProperty("file").GetString() ?? ""));
                    if (path.EndsWith(".json", StringComparison.OrdinalIgnoreCase) && File.Exists(path))
                    {
                        Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(path, Microsoft.VisualBasic.FileIO.UIOption.OnlyErrorDialogs, Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin);
                        if (_settings.PadModel == "perso:" + Path.GetFileName(path)) ApplySetting("padModel", "xbox");
                    }
                    break;
                }
                case "usePad": ApplySetting("padModel", msg.GetProperty("id").GetString() ?? ""); break;
                case "saveTexture":
                {
                    var bytes = Convert.FromBase64String(msg.GetProperty("data").GetString() ?? "");
                    if (bytes.Length < 8 || bytes[0] != 0x89 || bytes[1] != (byte)'P') throw new InvalidDataException("image PNG attendue");
                    var file = AppPaths.NewPadFile(Path.GetFileNameWithoutExtension(msg.GetProperty("name").GetString() ?? "texture"), ".png");
                    Directory.CreateDirectory(AppPaths.ManettesDir);
                    File.WriteAllBytes(Path.Combine(AppPaths.ManettesDir, file), bytes);
                    bool paint = msg.TryGetProperty("paint", out var pt) && pt.ValueKind == System.Text.Json.JsonValueKind.True;
                    if (paint) OpenInPaint(Path.Combine(AppPaths.ManettesDir, file));
                    Reply(new { type = "textureSaved", file, paint });
                    break;
                }
                case "openPaint": OpenInPaint(Path.Combine(AppPaths.ManettesDir, Path.GetFileName(msg.GetProperty("file").GetString() ?? ""))); break;
                case "hidePads":
                    _settings.HiddenPads = msg.GetProperty("ids").EnumerateArray().Select(e => e.GetString() ?? "").Where(s => s is "8bitdo" or "xbox" or "xbox25").ToList();
                    _settings.Save(); PushState();
                    break;
                case "action": DoAction(msg.GetProperty("name").GetString()!); break;
            }
        }
        catch (Exception ex) { Reply(new { type = "error", message = ex.Message }); }
        _padsCache = null;
        PushState();
    }
    void PadReloadTick(object? s, EventArgs e) { _padReloadTimer?.Stop(); PageSettingsChanged(); }

    static void OpenInPaint(string path)
    {
        if (!File.Exists(path)) return;
        try { Process.Start(new ProcessStartInfo("mspaint.exe", $"\"{path}\"") { UseShellExecute = true }); }
        catch { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); }
    }

    void OpenSettings()
    {
        if (_settingsForm == null || _settingsForm.IsDisposed)
        {
            _settingsForm = new SettingsForm(_server.Url + "settings.html", AppIcon());
            _settingsForm.MessageReceived += OnSettingsMessage;
            _settingsForm.VisibleChanged += (_, _) => { if (_settingsForm is { Visible: false }) { _releaseSettings.Stop(); _releaseSettings.Start(); } };
            _releaseSettings.Tick -= ReleaseSettings; _releaseSettings.Tick += ReleaseSettings;
        }
        _releaseSettings.Stop();
        _settingsForm.Show();
        if (_settingsForm.WindowState == FormWindowState.Minimized) _settingsForm.WindowState = FormWindowState.Normal;
        _settingsForm.Activate();
        RefreshSlowInfo();
    }

    (string Id, string Name)[] _micDevicesCache = [];
    string[] _modelsCache = [];
    AppPaths.FaceSet[] _facesCache = [];
    bool _startupCache;

    void RefreshSlowInfo()
    {
        _padsCache = null;
        RefreshSlowInfoCore();
    }

    void RefreshSlowInfoCore()
    {
        var ui = SynchronizationContext.Current;
        Task.Run(() =>
        {
            var mics = MicCapture.Devices().ToArray();
            var models = AppPaths.MiiModels();
            var faces = AppPaths.FaceSets();
            var startup = IsStartupEnabled();
            ui?.Post(_ => { _micDevicesCache = mics; _modelsCache = models; _facesCache = faces; _startupCache = startup; PushState(); }, null);
        });
    }

    long _lastMouseTick, _maxMouseGap, _lastPushMs;

    void PushState()
    {
        if (_settingsForm == null || _settingsForm.IsDisposed || !_settingsForm.Visible) return;
        var sw = Stopwatch.StartNew();
        _settingsForm.Post(StateJson());
        _lastPushMs = sw.ElapsedMilliseconds;
    }

    string StateJson()
    {
        return System.Text.Json.JsonSerializer.Serialize(new
        {
            type = "state",
            settings = _settings,
            windowVisible = _overlay.Visible,
            startup = _startupCache,
            models = _modelsCache,
            faces = _facesCache.Select(f => new { name = f.Name, blink = f.Blink, mouths = f.Mouths }),
            appName = AppPaths.Name,
            sceneObjects = SceneObjectCount(),
            jeu = _game,
            dernierJeu = _lastGame,
            scenePresets = Presets().Select(p => new { file = p.File, nom = p.Nom, objets = p.Objets, description = p.Description }),
            pads = (_padsCache ??= AppPaths.PadProfiles()).Select(p => new { id = "perso:" + p.File, nom = p.Nom.Length > 0 ? p.Nom : p.File }),
            perso = _persoItems.Select(i => new
            {
                id = i.Id, nom = i.Nom.Length > 0 ? i.Nom : i.Id, type = i.Type, touche = i.Touche, maintien = i.Maintien, boucle = i.Boucle, uneFois = i.JoueUneFois,
                on = _settings.PersoOn.Contains(i.Id) || _persoHeld.ContainsKey(i.Id),
                autreMii = i.Mii.Length > 0 && !string.Equals(i.Mii, _settings.Model, StringComparison.OrdinalIgnoreCase) ? i.Mii : null,
            }),
            micDevices = _micDevicesCache.Select(d => new { id = d.Id, name = d.Name }),
            micError = _settings.MicEnabled ? _mic.Error : null,
            obsUrl = ObsUrl,
            update = new
            {
                current = Updater.CurrentText, latest = _updater.Latest, status = _updater.Status, available = _updater.Available,
                busy = _updater.Busy, notes = _updater.Notes, canInstall = Updater.CanInstall,
            },
            status = new
            {
                pages = _server.ClientCount,
                wheel = ReaderState("wheel", _wheel?.Status ?? "", "choisissez l'instrument Volant"),
                vr = ReaderState("vr", _vr.Status, "choisissez l'instrument Debout (casque VR)"),
                pad = ReaderState("pad", _pad.Status, "choisissez l'instrument Manette"),
                track = TrackState,
                cameras = _cam?.Cameras ?? [],
                screens = _screens.Status,
            },
        });
    }

    int SceneObjectCount()
    {
        if (_sceneCount >= 0) return _sceneCount;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(AppPaths.LoadSceneJson());
            _sceneCount = doc.RootElement.TryGetProperty("objects", out var o) ? o.GetArrayLength() : 0;
        }
        catch { _sceneCount = 0; }
        return _sceneCount;
    }

    string ObsUrl => $"{_server.Url}?follow=1&bg=transparent";

    void OnSettingsMessage(System.Text.Json.JsonElement msg)
    {
        try
        {
            var type = msg.GetProperty("type").GetString();
            if (type == "set")
                ApplySetting(msg.GetProperty("key").GetString()!, msg.GetProperty("value"));
            else if (type == "action")
                DoAction(msg.GetProperty("name").GetString()!, msg.TryGetProperty("arg", out var a) ? a.ToString() : null);
            else if (type == "captureKey") { _captureKey = true; _captureFor = _settingsForm; }
            else if (type == "cancelCapture") { _captureKey = false; _captureFor = null; }
            else if (type == "listApps") _settingsForm?.Post(System.Text.Json.JsonSerializer.Serialize(new { type = "apps", list = GameDetector.OpenApps() }));
            else if (type == "import") RunImport(msg.GetProperty("kind").GetString() ?? "", _settingsForm);
        }
        catch { }
        PushState();
    }

    void ApplySetting(string key, object raw)
    {
        var v = raw as System.Text.Json.JsonElement?;
        bool B() => v?.ValueKind == System.Text.Json.JsonValueKind.True || raw is true;
        string? S() => v is { ValueKind: System.Text.Json.JsonValueKind.String } e ? e.GetString() : raw as string;
        int I() => v is { ValueKind: System.Text.Json.JsonValueKind.Number } e ? e.GetInt32() : Convert.ToInt32(raw);
        double D() => v is { ValueKind: System.Text.Json.JsonValueKind.Number } e ? e.GetDouble() : Convert.ToDouble(raw);
        string[] Allowed(params string[] values) => values;

        switch (key)
        {
            case "showWindow": ToggleWindow(B()); return;
            case "topMost": _settings.TopMost = B(); _overlay.ApplyWindowStyle(); break;
            case "clickThrough": _settings.ClickThrough = B(); _overlay.ApplyWindowStyle(); break;
            case "size": _overlay.SetSize(Math.Clamp(I(), 150, 2000)); return;
            case "background":
                if (S() is { } bg && Allowed("transparent", "green", "dark").Contains(bg)) { _settings.Background = bg; _overlay.ApplyWindowStyle(); PageSettingsChanged(); }
                break;
            case "mode":
                if (S() is { } m && Allowed("keyboard", "bongo", "vr", "wheel", "pad").Contains(m)) { _settings.Mode = m; _settings.Save(); UpdateVrTracker(); PageSettingsChanged(); }
                break;
            case "view":
                if (S() is { } vw && Allowed("bust", "full").Contains(vw)) { _settings.View = vw; PageSettingsChanged(); }
                break;
            case "decor": _settings.Decor = B(); _settings.Save(); PageSettingsChanged(); UpdateVrTracker(); break;
            case "decorView":
                if (S() is { } dv && Allowed("back", "back2", "front", "tri", "tri2").Contains(dv)) { _settings.DecorView = dv; PageSettingsChanged(); }
                break;
            case "decoration":
                if (S() is { } d && d.Split(':') is [var id, var state] && Allowed("screens", "chair", "cinema").Contains(id))
                {
                    _settings.Decorations.Remove(id);
                    if (state == "on") _settings.Decorations.Add(id);
                    _settings.Save(); PageSettingsChanged(); UpdateVrTracker();
                }
                break;
            case "floor":
                if (S() is { } fl && Allowed("classic", "wood", "tiles", "carpet", "grass").Contains(fl)) { _settings.Floor = fl; PageSettingsChanged(); }
                break;
            case "screenFps":
                {
                    bool wasOff = _settings.ScreenFps == 0;
                    _settings.ScreenFps = Math.Clamp(I(), 0, 15);
                    if (_settings.ScreenFps > 0) _screens.Fps = _settings.ScreenFps;
                    _settings.Save(); UpdateVrTracker();
                    if (wasOff != (_settings.ScreenFps == 0)) PageSettingsChanged();
                }
                break;
            case "micEnabled":
                _settings.MicEnabled = B(); _settings.Save();
                if (_settings.MicEnabled) StartMic(); else _mic.Stop();
                break;
            case "micFloor": _settings.MicFloorDb = Math.Clamp(D(), -70, -20); _mic.FloorDb = _settings.MicFloorDb; break;
            case "micDevice": _settings.MicDeviceId = string.IsNullOrEmpty(S()) ? null : S(); _settings.Save(); if (_settings.MicEnabled) StartMic(); break;
            case "wheelRange": _settings.WheelRange = Math.Clamp(I(), 180, 1080); if (_wheel != null) _wheel.RangeDegrees = _settings.WheelRange; break;
            case "vrMirror": _settings.VrMirror = B(); PageSettingsChanged(); break;
            case "trackHead": _settings.SuiviTete = B(); PageSettingsChanged(); UpdateVrTracker(); break;
            case "trackHands": _settings.SuiviMains = B(); PageSettingsChanged(); UpdateVrTracker(); break;
            case "camera":
                if (S() is { } cam && cam.Length < 300) { _settings.Camera = cam; _settings.Save(); UpdateVrTracker(); }
                break;
            case "trackSource":
                if (S() is "cam" or "steamvr") { _settings.SuiviSource = S()!; _settings.Save(); UpdateVrTracker(); }
                break;
            case "padModel":
                if (S() is { } pm && (Allowed("8bitdo", "xbox", "xbox25").Contains(pm)
                    || pm.StartsWith("perso:") && File.Exists(Path.Combine(AppPaths.ManettesDir, Path.GetFileName(pm[6..])))))
                { _settings.PadModel = pm.StartsWith("perso:") ? "perso:" + Path.GetFileName(pm[6..]) : pm; PageSettingsChanged(); }
                break;
            case "orbit":
                if (v is { ValueKind: System.Text.Json.JsonValueKind.Object } o)
                {
                    if (o.TryGetProperty("on", out var on)) _settings.Orbit = on.ValueKind == System.Text.Json.JsonValueKind.True;
                    if (o.TryGetProperty("az", out var az) && az.TryGetDouble(out var a)) _settings.OrbitAz = ((a % 360) + 540) % 360 - 180;
                    if (o.TryGetProperty("el", out var el) && el.TryGetDouble(out var e)) _settings.OrbitEl = Math.Clamp(e, -10, 85);
                    if (o.TryGetProperty("zoom", out var zm) && zm.TryGetDouble(out var z)) _settings.OrbitZoom = Math.Clamp(z, 0.5, 3);
                    if (o.TryGetProperty("reset", out var rs) && rs.ValueKind == System.Text.Json.JsonValueKind.True)
                    { _settings.OrbitAz = 30; _settings.OrbitEl = 18; _settings.OrbitZoom = 1; }
                    _server.Publish(_server.ConfigMessage());
                    SaveSoon();
                }
                return;
            case "model":
                if (S() is { } f && File.Exists(Path.Combine(AppPaths.MiiDir, Path.GetFileName(f)))) { _settings.Model = Path.GetFileName(f); PageSettingsChanged(); }
                break;
            case "showObjects": _settings.ShowObjects = B(); PageSettingsChanged(); UpdateVrTracker(); break;
            case "padMinis": _settings.PadMinis = B(); PageSettingsChanged(); break;
            case "calmGames": _settings.TeteCalmeJeux = B(); break;
            case "kbSlide": _settings.ClavierGlisse = B(); _settings.Save(); _server.Publish(_server.ConfigMessage()); break;
            case "mouseLift": _settings.SourisLevee = B(); _settings.Save(); _server.Publish(_server.ConfigMessage()); break;
            case "mouseSize":
                if (double.IsFinite(D())) { _settings.TailleSouris = Math.Round(Math.Clamp(D(), 0.6, 3), 2); _settings.Save(); _server.Publish(_server.ConfigMessage()); }
                break;
            case "gameAdd":
                if (S() is { Length: > 0 and < 120 } ga && !_settings.Jeux.Contains(ga, StringComparer.OrdinalIgnoreCase))
                    _settings.Jeux = _settings.Jeux.Append(ga).ToList();
                break;
            case "gameRemove":
                if (S() is { } gr) _settings.Jeux = _settings.Jeux.Where(j => !string.Equals(j, gr, StringComparison.OrdinalIgnoreCase)).ToList();
                break;
            case "scenePreset":
                if (S() is { } spf) ApplyPreset(spf);
                return;
            case "scenePresetSave":
                if (S() is { } spn)
                {
                    using var cur = System.Text.Json.JsonDocument.Parse(AppPaths.LoadSceneJson());
                    var saved = AppPaths.SaveScenePreset(spn, cur.RootElement);
                    if (saved == null) _tray.ShowBalloonTip(3000, AppPaths.Name, "Préréglage non enregistré (nom vide ?).", ToolTipIcon.Warning);
                    else _settings.ScenePreset = saved;
                    PresetsChanged();
                }
                break;
            case "scenePresetRename":
                if (v is { ValueKind: System.Text.Json.JsonValueKind.Object } rn && rn.TryGetProperty("file", out var rnF) && rn.TryGetProperty("name", out var rnN))
                {
                    var to = AppPaths.RenameScenePreset(rnF.GetString() ?? "", rnN.GetString() ?? "");
                    if (to == null) _tray.ShowBalloonTip(3000, AppPaths.Name, "Renommage impossible : nom vide ou déjà pris.", ToolTipIcon.Warning);
                    else
                    {
                        if (string.Equals(_settings.ScenePreset, rnF.GetString(), StringComparison.OrdinalIgnoreCase)) _settings.ScenePreset = to;
                        RenameShortcuts(rnF.GetString(), to);
                    }
                    PresetsChanged();
                }
                break;
            case "scenePresetDelete":
                if (S() is { } spd) { AppPaths.DeleteScenePreset(spd); PresetsChanged(); }
                break;
            case "theme":
                if (S() is { } th && Allowed("classique", "wii", "carnet", "notice", "windows", "xbox", "switch", "playstation").Contains(th))
                {
                    _settings.Theme = th;
                    var oldMenu = _tray.ContextMenuStrip; _tray.ContextMenuStrip = BuildTrayMenu(); oldMenu?.Dispose();
                    _server.Publish(_server.ConfigMessage());
                }
                break;
            case "themeSombre":
            {
                _settings.ThemeSombre = B();
                var oldMenu = _tray.ContextMenuStrip; _tray.ContextMenuStrip = BuildTrayMenu(); oldMenu?.Dispose();
                _server.Publish(_server.ConfigMessage());
                break;
            }
            case "hideOccluders": _settings.HideOccluders = B(); PageSettingsChanged(); break;
            case "face":
                if (S() is { } fc && (fc == "" || Directory.Exists(Path.Combine(AppPaths.FacesDir, Path.GetFileName(fc)))))
                { _settings.Face = fc == "" ? "" : Path.GetFileName(fc); PageSettingsChanged(); }
                break;
            case "playAnim":
                if (S() is { } pa && _persoItems.Any(i => i.Id == pa)) PlayAnim(pa);
                return;
            case "persoItem":
                if (S() is { } pi && pi.LastIndexOf(':') is var cut and > 0)
                {
                    var pid = pi[..cut]; bool pon = pi[(cut + 1)..] == "on";
                    if (pon && !_settings.PersoOn.Contains(pid) && _persoItems.Any(i => i.Id == pid)) _settings.PersoOn.Add(pid);
                    if (!pon) { _settings.PersoOn.Remove(pid); _persoHeld.Remove(pid); }
                    PublishPersoOn();
                }
                break;
            case "shortcutAdd":
                if (v is { ValueKind: System.Text.Json.JsonValueKind.Object } sa
                    && sa.TryGetProperty("action", out var act) && act.GetString() is { Length: > 0 and < 120 } actS
                    && sa.TryGetProperty("touche", out var tch) && tch.GetString() is { Length: > 0 and < 60 } tchS
                    && _settings.Raccourcis.Count < 100)
                    _settings.Raccourcis.Add(new Settings.Raccourci { Id = Guid.NewGuid().ToString("N")[..10], Action = actS, Touche = tchS });
                break;
            case "shortcutKey":
                if (v is { ValueKind: System.Text.Json.JsonValueKind.Object } sk && sk.TryGetProperty("id", out var skId)
                    && _settings.Raccourcis.FirstOrDefault(r => r.Id == skId.GetString()) is { } rk
                    && sk.TryGetProperty("touche", out var skT) && skT.GetString() is { Length: > 0 and < 60 } skTs)
                    rk.Touche = skTs;
                break;
            case "shortcutDelete":
                if (S() is { } sd) _settings.Raccourcis.RemoveAll(r => r.Id == sd);
                break;
            case "shortcutsEnabled":
                _settings.RaccourcisActifs = B();
                if (!_settings.RaccourcisActifs && _persoHeld.Count > 0) { _persoHeld.Clear(); PublishPersoOn(); }
                break;
            case "persoKey":
                if (v is { ValueKind: System.Text.Json.JsonValueKind.Object } pk && pk.TryGetProperty("id", out var pkId) && pkId.GetString() is { } pkIdS)
                {
                    string? touche = pk.TryGetProperty("touche", out var pkT) ? pkT.GetString() ?? "" : null;
                    bool? maintien = pk.TryGetProperty("maintien", out var pkM) ? pkM.ValueKind == System.Text.Json.JsonValueKind.True : null;
                    if (AppPaths.SetPersoKey(pkIdS, touche, maintien))
                    {
                        ReloadPersoItems();
                        _persoHeld.Remove(pkIdS);
                        _charEditorForm?.Post(System.Text.Json.JsonSerializer.Serialize(new { type = "persoKey", id = pkIdS, touche, maintien }));
                    }
                }
                break;
            case "fluidite":
                if (S() is { } fl2 && Allowed("60", "auto", "30").Contains(fl2))
                {
                    _settings.Fluidite = fl2;
                    _server.Publish(_server.ConfigMessage());
                }
                break;
            case "startup": SetStartup(B()); _startupCache = B(); return;
            case "menuStyle":
                if (S() is { } ms && Allowed("window", "full").Contains(ms))
                {
                    _settings.MenuStyle = ms; _settings.Save();
                    var old = _tray.ContextMenuStrip; _tray.ContextMenuStrip = BuildTrayMenu(); old?.Dispose();
                    if (ms == "full")
                    {
                        _settingsForm?.Hide();
                        _tray.ShowBalloonTip(3000, AppPaths.Name, "Clic droit sur l'icône : menu complet.\nPour revenir à la fenêtre : menu → « Utiliser la fenêtre de réglages ».", ToolTipIcon.Info);
                    }
                    else OpenSettings();
                }
                return;
        }
        _settings.Save();
    }

    System.Windows.Forms.Timer? _saveTimer;
    void SaveSoon()
    {
        if (_saveTimer == null)
        {
            _saveTimer = new System.Windows.Forms.Timer { Interval = 600 };
            _saveTimer.Tick += (_, _) => { _saveTimer.Stop(); _settings.Save(); PushState(); };
        }
        _saveTimer.Stop();
        _saveTimer.Start();
    }

    void DoAction(string name, string? arg = null)
    {
        switch (name)
        {
            case "copyObs":
                Clipboard.SetText(ObsUrl);
                _tray.ShowBalloonTip(3000, AppPaths.Name, $"URL copiée :\n{ObsUrl}\n\nOBS → Sources → + → Navigateur\nLa source suivra ensuite vos réglages toute seule.", ToolTipIcon.Info);
                break;
            case "openBrowser":
                Process.Start(new ProcessStartInfo($"{_server.Url}?{_settings.Query("dark")}") { UseShellExecute = true });
                break;
            case "openModels":
                Directory.CreateDirectory(AppPaths.MiiDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.MiiDir}\"") { UseShellExecute = true });
                break;
            case "openEditor": OpenEditor(); break;
            case "openEditors": OpenEditors(_editorPage); break;
            case "openCharEditor": OpenCharEditor(); break;
            case "openPerso":
                Directory.CreateDirectory(AppPaths.PersoDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.PersoDir}\"") { UseShellExecute = true });
                break;
            case "openExpressions":
                Directory.CreateDirectory(AppPaths.ExpressionsDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.ExpressionsDir}\"") { UseShellExecute = true });
                break;
            case "openAccessoires":
                Directory.CreateDirectory(AppPaths.AccessoiresDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.AccessoiresDir}\"") { UseShellExecute = true });
                break;
            case "openPadEditor": OpenPadEditor(); break;
            case "openManettes":
                Directory.CreateDirectory(AppPaths.ManettesDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.ManettesDir}\"") { UseShellExecute = true });
                break;
            case "openScenes":
                Directory.CreateDirectory(AppPaths.ScenesDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.ScenesDir}\"") { UseShellExecute = true });
                break;
            case "openTextures":
                Directory.CreateDirectory(AppPaths.ImagesDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.ImagesDir}\"") { UseShellExecute = true });
                break;
            case "openObjets":
                Directory.CreateDirectory(AppPaths.ObjectsDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.ObjectsDir}\"") { UseShellExecute = true });
                break;
            case "openFaces":
                Directory.CreateDirectory(AppPaths.FacesDir);
                Process.Start(new ProcessStartInfo("explorer.exe", $"\"{AppPaths.FacesDir}\"") { UseShellExecute = true });
                break;
            case "reload": PageSettingsChanged(); break;
            case "refresh": RefreshSlowInfo(); ReloadPersoItems(); _padsCache = null; break;
            case "recalibrate": _wheel?.Recalibrate(); break;
            case "vrRecenter": _server.Publish("{\"t\":\"vrc\"}"); _cam?.Recenter(); break;
            case "quit": ExitThread(); break;
            case "updateCheck": _ = _updater.CheckAsync(); break;
            case "updateInstall": _ = InstallUpdate(); break;
            case "updatePage":
                var page = _updater.PageUrl ?? $"https://github.com/{Updater.Repo}/releases/latest";
                if (page.StartsWith("https://github.com/", StringComparison.OrdinalIgnoreCase))
                    Process.Start(new ProcessStartInfo(page) { UseShellExecute = true });
                break;
        }
    }

    async Task InstallUpdate()
    {
        if (!await _updater.InstallAsync() || _updater.StagedExe is not { } staged) return;
        try
        {
            Process.Start(new ProcessStartInfo(staged, $"--finish-update {Environment.ProcessId}")
            {
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(staged)!,
            });
        }
        catch (Exception ex)
        {
            Updater.Log("lancement de la nouvelle version impossible : " + ex.Message);
            _tray.ShowBalloonTip(5000, AppPaths.Name, "Mise à jour téléchargée, mais son installation n'a pas pu démarrer : réessayez. (" + ex.Message + ")", ToolTipIcon.Warning);
            return;
        }
        new Thread(() => { Thread.Sleep(8000); Environment.Exit(0); }) { IsBackground = true, Name = "UpdateExit" }.Start();
        try { ExitThread(); }
        catch (Exception ex) { Updater.Log("fermeture : " + ex.Message); Environment.Exit(0); }
    }

    void PageSettingsChanged()
    {
        _overlay.Navigate();
        _server.Publish(_server.ConfigMessage());
    }

    void StartMic()
    {
        _mic.Start(_settings.MicDeviceId);
        if (_mic.Error != null)
            _tray.ShowBalloonTip(4000, AppPaths.Name, "Micro indisponible : " + _mic.Error, ToolTipIcon.Warning);
    }

    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";

    const string OldRunValue = "MiiBongo";

    static bool IsStartupEnabled()
    {
        using var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKey);
        return k?.GetValue(AppPaths.Name) is string;
    }

    static void SetStartup(bool enabled)
    {
        using var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(RunKey);
        if (enabled) k.SetValue(AppPaths.Name, $"\"{Environment.ProcessPath}\"");
        else k.DeleteValue(AppPaths.Name, false);
        k.DeleteValue(OldRunValue, false);
    }

    static void RefreshStartupEntry()
    {
        try
        {
            bool wanted, needed;
            using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(RunKey))
            {
                wanted = k?.GetValue(OldRunValue) is string || k?.GetValue(AppPaths.Name) is string;
                needed = k?.GetValue(AppPaths.Name) as string != $"\"{Environment.ProcessPath}\"" || k?.GetValue(OldRunValue) != null;
            }
            if (wanted && needed) SetStartup(true);
        }
        catch { }
    }

    void ToggleWindow(bool visible)
    {
        _settings.ShowWindow = visible;
        _settings.Save();
        if (visible) { _overlay.Show(); _overlay.Activate(); }
        else _overlay.Hide();
    }

    public static Icon AppIcon(int size = 32)
    {
        try
        {
            using var s = AppPaths.Resource("app.ico");
            if (s != null) return new Icon(s, size, size);
        }
        catch { }
        return MakeIcon();
    }

    static Icon MakeIcon()
    {
        using var bmp = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);
            using var red = new SolidBrush(Color.FromArgb(200, 30, 30));
            using var purple = new SolidBrush(Color.FromArgb(90, 30, 100));
            using var skin = new SolidBrush(Color.FromArgb(250, 210, 170));
            g.FillPie(red, 2, 0, 28, 24, 180, 90);
            g.FillPie(purple, 2, 0, 28, 24, 270, 90);
            g.FillEllipse(skin, 7, 9, 18, 21);
            g.FillEllipse(Brushes.Black, 11, 16, 4, 4);
            g.FillEllipse(Brushes.Black, 18, 16, 4, 4);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    protected override void ExitThreadCore()
    {
        _settings.Save();

        _readersTimer.Stop();
        _deviceWatcher?.DestroyHandle();
        _hooks.Dispose();
        _rawMouse?.Dispose();
        _mic.Dispose();
        _vr.Dispose();
        _cam?.Dispose();
        _wheel?.Dispose();
        _pad.Dispose();
        _screens.Dispose();
        _server.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
        _overlay.Dispose();
        _settingsForm?.Dispose();
        _editorsForm?.Dispose();
        _closing = true;
        _openSignal?.Set();
        _editorSignal?.Set();
        base.ExitThreadCore();
    }
}

sealed class DeviceWatcher : NativeWindow
{
    public event Action? Changed;
    public DeviceWatcher() => CreateHandle(new CreateParams { Caption = "SullysMiiBongoDevices" });

    protected override void WndProc(ref Message m)
    {
        const int WM_DEVICECHANGE = 0x0219;
        if (m.Msg == WM_DEVICECHANGE) Changed?.Invoke();
        base.WndProc(ref m);
    }
}

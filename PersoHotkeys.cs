using System.Runtime.InteropServices;

namespace SullysMiiBongo;

sealed class PersoHotkeys
{
    readonly HashSet<uint> _mods = new();

    public event Action<string, uint>? Pressed;
    public event Action<uint>? Released;

    static bool IsMod(uint vk) => vk is 0x10 or 0x11 or 0x12 or 0xA0 or 0xA1 or 0xA2 or 0xA3 or 0xA4 or 0xA5 or 0x5B or 0x5C;

    public void OnKey(uint vk, bool down)
    {
        if (IsMod(vk))
        {
            if (down) _mods.Add(vk); else _mods.Remove(vk);
            return;
        }
        if (!down) { Released?.Invoke(vk); return; }
        _mods.RemoveWhere(m => (GetAsyncKeyState((int)m) & 0x8000) == 0);
        Pressed?.Invoke(Combo(vk), vk);
    }

    string Combo(uint vk)
    {
        bool altGr = _mods.Contains(0xA5);
        bool ctrl = _mods.Contains(0xA3) || (_mods.Contains(0xA2) && !altGr) || (_mods.Contains(0x11) && !altGr);
        bool alt = _mods.Contains(0xA4) || (_mods.Contains(0x12) && !altGr);
        bool shift = _mods.Contains(0xA0) || _mods.Contains(0xA1) || _mods.Contains(0x10);
        bool win = _mods.Contains(0x5B) || _mods.Contains(0x5C);
        var parts = new List<string>();
        if (ctrl) parts.Add("Ctrl");
        if (alt) parts.Add("Alt");
        if (altGr) parts.Add("AltGr");
        if (shift) parts.Add("Maj");
        if (win) parts.Add("Win");
        parts.Add(KeyName(vk));
        return string.Join("+", parts);
    }

    static readonly Dictionary<uint, string> Names = new()
    {
        [0x04] = "SourisMilieu", [0x05] = "Souris4", [0x06] = "Souris5",
        [0x08] = "Retour", [0x09] = "Tab", [0x0D] = "Entrée", [0x13] = "Pause", [0x14] = "VerrMaj", [0x1B] = "Échap",
        [0x20] = "Espace", [0x21] = "PgPréc", [0x22] = "PgSuiv", [0x23] = "Fin", [0x24] = "Début",
        [0x25] = "Gauche", [0x26] = "Haut", [0x27] = "Droite", [0x28] = "Bas", [0x2C] = "ImprÉcran", [0x2D] = "Inser", [0x2E] = "Suppr",
        [0x6A] = "Num*", [0x6B] = "Num+", [0x6D] = "Num-", [0x6E] = "Num.", [0x6F] = "Num/", [0x90] = "VerrNum", [0x91] = "ArrêtDéfil",
        [0xAD] = "Muet", [0xAE] = "Volume-", [0xAF] = "Volume+", [0xB0] = "Suivant", [0xB1] = "Précédent", [0xB2] = "Stop", [0xB3] = "Lecture",
    };

    public static string KeyName(uint vk)
    {
        if (vk is >= 0x41 and <= 0x5A or >= 0x30 and <= 0x39) return ((char)vk).ToString();
        if (vk is >= 0x70 and <= 0x87) return "F" + (vk - 0x6F);
        if (vk is >= 0x60 and <= 0x69) return "Num" + (vk - 0x60);
        if (Names.TryGetValue(vk, out var n)) return n;
        try
        {
            uint scan = MapVirtualKey(vk, 0);
            var sb = new System.Text.StringBuilder(32);
            if (scan != 0 && GetKeyNameText((int)(scan << 16), sb, sb.Capacity) > 0) return sb.ToString().Replace("+", "Plus");
        }
        catch { }
        return "VK" + vk.ToString("X2");
    }

    public static string Normalize(string? combo)
    {
        if (string.IsNullOrWhiteSpace(combo)) return "";
        var parts = combo.Split('+', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "";
        var order = new[] { "ctrl", "alt", "altgr", "maj", "win" };
        var mods = new HashSet<string>();
        foreach (var p in parts[..^1])
            mods.Add(p.ToLowerInvariant() switch { "control" or "ctl" or "contrôle" => "ctrl", "shift" => "maj", "windows" or "meta" => "win", var x => x });
        var main = parts[^1];
        return string.Join("+", order.Where(mods.Contains).Select(m => m switch { "ctrl" => "Ctrl", "alt" => "Alt", "altgr" => "AltGr", "maj" => "Maj", _ => "Win" })
            .Append(main.Length == 1 ? main.ToUpperInvariant() : main)).ToLowerInvariant();
    }

    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint uCode, uint uMapType);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetKeyNameText(int lParam, System.Text.StringBuilder lpString, int cchSize);
}

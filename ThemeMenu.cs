using System.Drawing.Drawing2D;

namespace SullysMiiBongo;

static class ThemeMenu
{
    static readonly Color Blue = Color.FromArgb(42, 179, 232), BlueSoft = Color.FromArgb(227, 245, 253),
        Text = Color.FromArgb(59, 59, 59), Line = Color.FromArgb(214, 216, 219), Back = Color.FromArgb(251, 251, 251);

    public static void Apply(ToolStrip menu, string theme, bool dark = false)
    {
        if (dark && theme is "wii" or "windows" or "switch") theme += "-dark";
        if (theme is not ("wii" or "carnet" or "notice") && !Flats.ContainsKey(theme)) { menu.RenderMode = ToolStripRenderMode.ManagerRenderMode; return; }
        menu.Renderer = MakeRenderer(theme);
        menu.BackColor = BackOf(theme);
        menu.ForeColor = InkOf(theme);
        menu.Padding = new Padding(theme == "notice" ? 2 : 4);
        if (FontOf(theme) is { } f) menu.Font = f;
        foreach (ToolStripItem it in menu.Items) Style(it, theme);
    }

    static ToolStripRenderer MakeRenderer(string theme) => theme switch
    {
        "carnet" => new CarnetRenderer(),
        "notice" => new NoticeRenderer(),
        _ when Flats.TryGetValue(theme, out var p) => new FlatRenderer(p),
        _ => new WiiRenderer(),
    };

    static Color BackOf(string theme) => theme switch { "carnet" => Carnet.Paper, "notice" => Notice.Paper, _ when Flats.TryGetValue(theme, out var p) => p.Back, _ => Back };
    static Color InkOf(string theme) => theme switch { "carnet" => Carnet.Ink, "notice" => Notice.Ink, _ when Flats.TryGetValue(theme, out var p) => p.Text, _ => Text };
    static Font? FontOf(string theme) => theme == "notice" ? Notice.Font : Flats.TryGetValue(theme, out var p) ? p.Font : null;

    sealed record Flat(Color Back, Color Text, Color Muted, Color SelBack, Color SelText, Color Border, Color Sep, Color Mark, int Radius, bool Outline, Font Font);

    static readonly Dictionary<string, Flat> Flats = new()
    {
        ["windows"] = new(Color.FromArgb(249, 249, 249), Color.FromArgb(27, 27, 27), Color.FromArgb(150, 150, 150), Color.FromArgb(234, 234, 234), Color.FromArgb(27, 27, 27),
            Color.FromArgb(220, 220, 220), Color.FromArgb(229, 229, 229), Color.FromArgb(0, 95, 184), 4, false, new Font("Segoe UI", 9.5f)),
        ["xbox"] = new(Color.FromArgb(31, 31, 31), Color.FromArgb(242, 242, 242), Color.FromArgb(120, 120, 120), Color.FromArgb(16, 124, 16), Color.White,
            Color.FromArgb(60, 60, 60), Color.FromArgb(55, 55, 55), Color.White, 4, false, new Font("Segoe UI Semibold", 9.5f)),
        ["switch"] = new(Color.FromArgb(250, 250, 250), Color.FromArgb(45, 45, 45), Color.FromArgb(160, 160, 160), Color.White, Color.FromArgb(10, 176, 214),
            Color.FromArgb(220, 220, 220), Color.FromArgb(225, 225, 225), Color.FromArgb(0, 195, 227), 10, true, new Font("Segoe UI Semibold", 9.5f)),
        ["playstation"] = new(Color.FromArgb(10, 27, 70), Color.White, Color.FromArgb(120, 135, 170), Color.White, Color.FromArgb(11, 29, 71),
            Color.FromArgb(40, 62, 120), Color.FromArgb(35, 55, 105), Color.White, 8, false, new Font("Segoe UI", 9.5f)),
        ["wii-dark"] = new(Color.FromArgb(42, 45, 49), Color.FromArgb(232, 233, 234), Color.FromArgb(130, 135, 140), Color.FromArgb(27, 74, 94), Color.FromArgb(159, 226, 250),
            Color.FromArgb(72, 76, 82), Color.FromArgb(62, 66, 71), Color.FromArgb(42, 179, 232), 9, true, new Font("Segoe UI", 9.5f)),
        ["windows-dark"] = new(Color.FromArgb(44, 44, 44), Color.White, Color.FromArgb(120, 120, 120), Color.FromArgb(61, 61, 61), Color.White,
            Color.FromArgb(28, 28, 28), Color.FromArgb(60, 60, 60), Color.FromArgb(76, 194, 255), 4, false, new Font("Segoe UI", 9.5f)),
        ["switch-dark"] = new(Color.FromArgb(58, 58, 58), Color.White, Color.FromArgb(140, 140, 140), Color.FromArgb(70, 70, 70), Color.FromArgb(62, 224, 248),
            Color.FromArgb(85, 85, 85), Color.FromArgb(80, 80, 80), Color.FromArgb(0, 195, 227), 10, true, new Font("Segoe UI Semibold", 9.5f)),
    };

    sealed class FlatColors(Flat p) : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => p.Back;
        public override Color ImageMarginGradientBegin => p.Back;
        public override Color ImageMarginGradientMiddle => p.Back;
        public override Color ImageMarginGradientEnd => p.Back;
        public override Color MenuBorder => p.Border;
        public override Color SeparatorDark => p.Sep;
        public override Color SeparatorLight => p.Back;
        public override Color MenuItemBorder => Color.Transparent;
        public override Color MenuItemSelected => p.SelBack;
        public override Color CheckBackground => p.Back;
        public override Color CheckSelectedBackground => p.SelBack;
        public override Color CheckPressedBackground => p.SelBack;
    }

    sealed class FlatRenderer : ToolStripProfessionalRenderer
    {
        readonly Flat _p;
        public FlatRenderer(Flat p) : base(new FlatColors(p)) { _p = p; RoundedEdges = false; }

        static GraphicsPath Round(RectangleF r, float rad)
        {
            var g = new GraphicsPath();
            float d = rad * 2;
            g.AddArc(r.X, r.Y, d, d, 180, 90);
            g.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            g.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            g.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            g.CloseFigure();
            return g;
        }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            if (!e.Item.Selected || !e.Item.Enabled) return;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new RectangleF(4, 1, e.Item.Width - 8, e.Item.Height - 2);
            using var path = Round(r, _p.Radius);
            using var fill = new SolidBrush(_p.SelBack);
            e.Graphics.FillPath(fill, path);
            if (_p.Outline)
            {
                using var pen = new Pen(_p.Mark, 2.5f);
                e.Graphics.DrawPath(pen, path);
            }
            else if (_p.Mark != _p.SelText)
            {
                using var bar = Round(new RectangleF(5, e.Item.Height / 2f - 7, 3, 14), 1.5f);
                using var b = new SolidBrush(_p.Mark);
                e.Graphics.FillPath(b, bar);
            }
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = !e.Item.Enabled ? _p.Muted : e.Item.Selected ? _p.SelText : _p.Text;
            base.OnRenderItemText(e);
        }

        protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
        {
            e.ArrowColor = e.Item?.Selected == true ? _p.SelText : _p.Text;
            base.OnRenderArrow(e);
        }

        protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
        {
            var r = e.ImageRectangle;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(e.Item.Selected ? _p.SelText : _p.Mark == Color.White ? _p.Text : _p.Mark, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            e.Graphics.DrawLines(pen, new[] { new PointF(r.X + r.Width * .2f, r.Y + r.Height * .55f), new PointF(r.X + r.Width * .42f, r.Y + r.Height * .76f), new PointF(r.X + r.Width * .82f, r.Y + r.Height * .26f) });
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            int y = e.Item.Height / 2;
            using var pen = new Pen(_p.Sep, 1f);
            e.Graphics.DrawLine(pen, 8, y, e.Item.Width - 8, y);
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            using var pen = new Pen(_p.Border, 1f);
            e.Graphics.DrawRectangle(pen, 0, 0, e.AffectedBounds.Width - 1, e.AffectedBounds.Height - 1);
        }
    }

    static void Style(ToolStripItem it, string theme)
    {
        it.ForeColor = InkOf(theme);
        if (FontOf(theme) is { } f) it.Font = f;
        if (it is ToolStripMenuItem mi)
        {
            mi.Padding = theme == "notice" ? new Padding(2, 4, 2, 4) : new Padding(4, 5, 4, 5);
            mi.DropDown.Renderer = MakeRenderer(theme);
            mi.DropDown.BackColor = BackOf(theme);
            if (FontOf(theme) is { } df) mi.DropDown.Font = df;
            mi.DropDownOpening += (_, _) => { foreach (ToolStripItem sub in mi.DropDownItems) Style(sub, theme); };
        }
    }

    static class Notice
    {
        public static readonly Color Paper = Color.FromArgb(243, 240, 232), Ink = Color.FromArgb(27, 27, 25),
            Faint = Color.FromArgb(213, 207, 193), Red = Color.FromArgb(212, 68, 28), Muted = Color.FromArgb(150, 146, 136);
        public static readonly Font Font = new("Bahnschrift", 10f, FontStyle.Regular, GraphicsUnit.Point);
    }

    sealed class NoticeColors : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => Notice.Paper;
        public override Color ImageMarginGradientBegin => Notice.Paper;
        public override Color ImageMarginGradientMiddle => Notice.Paper;
        public override Color ImageMarginGradientEnd => Notice.Paper;
        public override Color MenuBorder => Notice.Ink;
        public override Color SeparatorDark => Notice.Faint;
        public override Color SeparatorLight => Notice.Paper;
        public override Color MenuItemBorder => Notice.Ink;
        public override Color MenuItemSelected => Notice.Ink;
        public override Color CheckBackground => Notice.Paper;
        public override Color CheckSelectedBackground => Notice.Ink;
        public override Color CheckPressedBackground => Notice.Ink;
    }

    sealed class NoticeRenderer : ToolStripProfessionalRenderer
    {
        public NoticeRenderer() : base(new NoticeColors()) { RoundedEdges = false; }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            if (!e.Item.Selected || !e.Item.Enabled) return;
            using var fill = new SolidBrush(Notice.Ink);
            e.Graphics.FillRectangle(fill, 1, 0, e.Item.Width - 2, e.Item.Height);
            using var mark = new SolidBrush(Notice.Red);
            e.Graphics.FillRectangle(mark, 1, 0, 3, e.Item.Height);
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = !e.Item.Enabled ? Notice.Muted : e.Item.Selected ? Notice.Paper : Notice.Ink;
            base.OnRenderItemText(e);
        }

        protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e)
        {
            e.ArrowColor = e.Item?.Selected == true ? Notice.Paper : Notice.Ink;
            base.OnRenderArrow(e);
        }

        protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
        {
            var r = e.ImageRectangle;
            var box = new Rectangle(r.X + r.Width / 2 - 6, r.Y + r.Height / 2 - 6, 12, 12);
            bool sel = e.Item.Selected;
            using var fill = new SolidBrush(sel ? Notice.Paper : Notice.Ink);
            e.Graphics.FillRectangle(fill, box);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(sel ? Notice.Ink : Notice.Paper, 1.8f);
            e.Graphics.DrawLines(pen, new[] { new PointF(box.X + 2.5f, box.Y + 6), new PointF(box.X + 5, box.Y + 8.7f), new PointF(box.X + 9.6f, box.Y + 3.4f) });
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            int y = e.Item.Height / 2;
            using var pen = new Pen(Notice.Faint, 1f);
            e.Graphics.DrawLine(pen, 4, y, e.Item.Width - 4, y);
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            using var pen = new Pen(Notice.Ink, 1f);
            e.Graphics.DrawRectangle(pen, 0, 0, e.AffectedBounds.Width - 1, e.AffectedBounds.Height - 1);
        }
    }

    static class Carnet
    {
        public static readonly Color Paper = Color.FromArgb(255, 251, 241), Ink = Color.FromArgb(43, 40, 36),
            Faint = Color.FromArgb(205, 191, 165), Highlight = Color.FromArgb(230, 255, 223, 94);
    }

    sealed class CarnetColors : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => Carnet.Paper;
        public override Color ImageMarginGradientBegin => Carnet.Paper;
        public override Color ImageMarginGradientMiddle => Carnet.Paper;
        public override Color ImageMarginGradientEnd => Carnet.Paper;
        public override Color MenuBorder => Carnet.Ink;
        public override Color SeparatorDark => Carnet.Faint;
        public override Color SeparatorLight => Carnet.Paper;
        public override Color MenuItemBorder => Color.Transparent;
        public override Color MenuItemSelected => Carnet.Highlight;
        public override Color CheckBackground => Carnet.Paper;
        public override Color CheckSelectedBackground => Carnet.Paper;
        public override Color CheckPressedBackground => Carnet.Paper;
    }

    sealed class CarnetRenderer : ToolStripProfessionalRenderer
    {
        public CarnetRenderer() : base(new CarnetColors()) { RoundedEdges = false; }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            if (!e.Item.Selected || !e.Item.Enabled) return;
            float w = e.Item.Width, h = e.Item.Height;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var path = new GraphicsPath();
            path.AddBezier(4, 4, w * .35f, 2, w * .65f, 5, w - 4, 3);
            path.AddLine(w - 4, 3, w - 5, h - 3);
            path.AddBezier(w - 5, h - 3, w * .6f, h - 1, w * .3f, h - 4, 3, h - 2);
            path.CloseFigure();
            using var fill = new SolidBrush(Carnet.Highlight);
            e.Graphics.FillPath(fill, path);
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = e.Item.Enabled ? Carnet.Ink : Color.FromArgb(150, 140, 125);
            base.OnRenderItemText(e);
        }

        protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e)
        {
            var r = e.ImageRectangle;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Carnet.Ink, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            e.Graphics.DrawLines(pen, new[] { new PointF(r.X + r.Width * .18f, r.Y + r.Height * .55f), new PointF(r.X + r.Width * .42f, r.Y + r.Height * .8f), new PointF(r.X + r.Width * .86f, r.Y + r.Height * .2f) });
        }

        protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e)
        {
            float y = e.Item.Height / 2f, w = e.Item.Width;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Carnet.Faint, 1.3f);
            e.Graphics.DrawBezier(pen, 28, y, w * .4f, y - 1.5f, w * .7f, y + 1.5f, w - 8, y);
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            float w = e.AffectedBounds.Width - 1, h = e.AffectedBounds.Height - 1;
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Carnet.Ink, 1.6f);
            using var pen2 = new Pen(Color.FromArgb(90, Carnet.Ink), 1f);
            e.Graphics.DrawPolygon(pen, new[] { new PointF(1, 1.5f), new PointF(w - 1, 1), new PointF(w - .5f, h - 1), new PointF(1.5f, h - .5f) });
            e.Graphics.DrawPolygon(pen2, new[] { new PointF(2, 1), new PointF(w - 1.5f, 2), new PointF(w - 1.5f, h - 1.5f), new PointF(1, h - 1.5f) });
        }
    }

    sealed class WiiColors : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => Back;
        public override Color ImageMarginGradientBegin => Back;
        public override Color ImageMarginGradientMiddle => Back;
        public override Color ImageMarginGradientEnd => Back;
        public override Color MenuBorder => Line;
        public override Color SeparatorDark => Line;
        public override Color SeparatorLight => Color.White;
        public override Color MenuItemBorder => Blue;
        public override Color MenuItemSelected => BlueSoft;
        public override Color CheckBackground => BlueSoft;
        public override Color CheckSelectedBackground => BlueSoft;
        public override Color CheckPressedBackground => BlueSoft;
    }

    sealed class WiiRenderer : ToolStripProfessionalRenderer
    {
        public WiiRenderer() : base(new WiiColors()) { RoundedEdges = true; }

        protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
        {
            if (!e.Item.Selected || !e.Item.Enabled) return;
            var r = new Rectangle(3, 1, e.Item.Width - 6, e.Item.Height - 2);
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            using var path = Rounded(r, 9);
            using var fill = new LinearGradientBrush(r, Color.White, BlueSoft, LinearGradientMode.Vertical);
            using var pen = new Pen(Blue, 1.6f);
            e.Graphics.FillPath(fill, path);
            e.Graphics.DrawPath(pen, path);
        }

        protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e)
        {
            e.TextColor = e.Item.Selected ? Color.FromArgb(15, 111, 153) : Text;
            base.OnRenderItemText(e);
        }

        protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e)
        {
            e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
            var r = new Rectangle(0, 0, e.AffectedBounds.Width - 1, e.AffectedBounds.Height - 1);
            using var pen = new Pen(Line, 1.5f);
            e.Graphics.DrawRectangle(pen, r);
        }

        static GraphicsPath Rounded(Rectangle r, int radius)
        {
            var p = new GraphicsPath();
            int d = radius * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }
    }
}

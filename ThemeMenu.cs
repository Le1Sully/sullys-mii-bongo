using System.Drawing.Drawing2D;

namespace SullysMiiBongo;

static class ThemeMenu
{
    static readonly Color Blue = Color.FromArgb(42, 179, 232), BlueSoft = Color.FromArgb(227, 245, 253),
        Text = Color.FromArgb(59, 59, 59), Line = Color.FromArgb(214, 216, 219), Back = Color.FromArgb(251, 251, 251);

    public static void Apply(ToolStrip menu, string theme)
    {
        if (theme is not ("wii" or "carnet")) { menu.RenderMode = ToolStripRenderMode.ManagerRenderMode; return; }
        bool carnet = theme == "carnet";
        menu.Renderer = carnet ? new CarnetRenderer() : new WiiRenderer();
        menu.BackColor = carnet ? Carnet.Paper : Back;
        menu.ForeColor = carnet ? Carnet.Ink : Text;
        menu.Padding = new Padding(4);
        foreach (ToolStripItem it in menu.Items) Style(it, carnet);
    }

    static void Style(ToolStripItem it, bool carnet)
    {
        it.ForeColor = carnet ? Carnet.Ink : Text;
        if (it is ToolStripMenuItem mi)
        {
            mi.Padding = new Padding(4, 5, 4, 5);
            mi.DropDown.Renderer = carnet ? new CarnetRenderer() : new WiiRenderer();
            mi.DropDown.BackColor = carnet ? Carnet.Paper : Back;
            mi.DropDownOpening += (_, _) => { foreach (ToolStripItem sub in mi.DropDownItems) Style(sub, carnet); };
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

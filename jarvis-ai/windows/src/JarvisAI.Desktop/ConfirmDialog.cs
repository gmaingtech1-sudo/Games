namespace JarvisAI.Desktop;

/// <summary>
/// The native "JARVIS wants to…" approval window. It is drawn by the app
/// itself (not the web page), shows exactly what will happen, and defaults
/// to Deny.
/// </summary>
sealed class ConfirmDialog : Form
{
    static readonly Color Bg = Color.FromArgb(4, 19, 31);
    static readonly Color Fg = Color.FromArgb(217, 245, 255);
    static readonly Color Accent = Color.FromArgb(56, 220, 255);

    readonly CheckBox? remember;

    ConfirmDialog(string heading, string title, string details, bool offerRemember, string allowText)
    {
        Text = "JARVIS AI - approval needed";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = MaximizeBox = false;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.CenterParent;
        BackColor = Bg;
        ForeColor = Fg;
        Font = new Font("Segoe UI", 10f);
        AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(620, 420);
        Padding = new Padding(16);

        var head = new Label { Text = heading, Dock = DockStyle.Top, Height = 26, ForeColor = Accent, Font = new Font("Segoe UI Semibold", 10f) };
        var titleLabel = new Label { Text = title, Dock = DockStyle.Top, Height = 34, Font = new Font("Segoe UI Semibold", 13f) };
        var box = new TextBox
        {
            Text = details.Replace("\r\n", "\n").Replace("\n", Environment.NewLine),
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Both,
            WordWrap = false,
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(1, 10, 18),
            ForeColor = Fg,
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Consolas", 10f),
            TabStop = false,
        };
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 48, FlowDirection = FlowDirection.RightToLeft, Padding = new Padding(0, 10, 0, 0) };
        var deny = MakeButton("Deny", DialogResult.No, Color.FromArgb(70, 20, 32));
        var allow = MakeButton(allowText, DialogResult.Yes, Color.FromArgb(8, 70, 92));
        buttons.Controls.Add(deny);
        buttons.Controls.Add(allow);
        if (offerRemember)
        {
            remember = new CheckBox { Text = "Allow read-only actions without asking until JARVIS restarts", AutoSize = true, ForeColor = Fg, Margin = new Padding(0, 6, 16, 0) };
            buttons.Controls.Add(remember);
        }
        Controls.Add(box);
        Controls.Add(buttons);
        Controls.Add(titleLabel);
        Controls.Add(head);
        CancelButton = deny;
        Shown += (_, _) => { deny.Focus(); Activate(); };
    }

    static Button MakeButton(string text, DialogResult result, Color back) => new()
    {
        Text = text,
        DialogResult = result,
        AutoSize = true,
        MinimumSize = new Size(110, 34),
        FlatStyle = FlatStyle.Flat,
        BackColor = back,
        ForeColor = Color.White,
        Margin = new Padding(8, 0, 0, 0),
    };

    public static ConfirmDialog? Current { get; private set; }

    /// <summary>Shows the dialog modally. Returns (allowed, rememberReadOnly).</summary>
    public static (bool Allowed, bool Remember) Ask(IWin32Window? owner, string heading, string title, string details, bool offerRemember, string allowText = "Allow")
    {
        using var dlg = new ConfirmDialog(heading, title, details, offerRemember, allowText);
        Current = dlg;
        try
        {
            var result = owner == null ? dlg.ShowDialog() : dlg.ShowDialog(owner);
            return (result == DialogResult.Yes, dlg.remember?.Checked == true);
        }
        finally
        {
            Current = null;
        }
    }

    /// <summary>Emergency stop: close an open approval as denied.</summary>
    public static void DenyCurrent()
    {
        if (Current is { IsDisposed: false } d)
        {
            d.DialogResult = DialogResult.No;
            d.Close();
        }
    }
}

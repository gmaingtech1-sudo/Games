using System.Text.Json;
using JarvisAI.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace JarvisAI.Desktop;

/// <summary>
/// The JARVIS AI window: the shared web interface in WebView2, plus native
/// speech, PC tools, a tray icon and global hotkeys.
/// </summary>
sealed partial class MainForm : Form
{
    const string Host = "jarvis.app.local";
    const string Origin = "https://" + Host + "/";
    const int HotkeyStop = 1, HotkeyListen = 2;
    public const string StopHotkeyText = "Ctrl+Shift+F12";
    public const string ListenHotkeyText = "Ctrl+Alt+J";

    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(2, 7, 13) };
    readonly NotifyIcon tray = new();
    readonly SpeechService speech;
    readonly ToolConfig toolConfig;
    readonly ActionLog actionLog = new(AppPaths.ActionLog);
    readonly CommandRunner commands = new();
    readonly ToolEngine tools;
    bool reallyExit;
    bool trayHintShown;

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public MainForm()
    {
        Text = "JARVIS AI";
        BackColor = Color.FromArgb(2, 7, 13);
        MinimumSize = new Size(420, 560);
        Size = new Size(1220, 800);
        StartPosition = FormStartPosition.CenterScreen;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch (Exception) { }
        Controls.Add(web);
        LoadWindowBounds();

        speech = new SpeechService(Emit);
        toolConfig = ToolConfig.Load(AppPaths.ToolsConfig, AppPaths.Notes, AppPaths.Backups);
        tools = new ToolEngine(toolConfig, new WindowsActions(tray), commands);

        tray.Icon = Icon ?? SystemIcons.Application;
        tray.Text = "JARVIS AI";
        tray.Visible = true;
        tray.DoubleClick += (_, _) => ShowFromTray();
        var menu = new ContextMenuStrip();
        menu.Items.Add("Show JARVIS", null, (_, _) => ShowFromTray());
        menu.Items.Add($"Listen ({ListenHotkeyText})", null, (_, _) => { ShowFromTray(); Emit("hotkey.listen", new { }); });
        menu.Items.Add($"Emergency stop ({StopHotkeyText})", null, (_, _) => EmergencyStop());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Exit", null, (_, _) => { reallyExit = true; Close(); });
        tray.ContextMenuStrip = menu;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        NativeMethods.UseDarkTitleBar(Handle);
        if (!NativeMethods.RegisterHotKey(Handle, HotkeyStop, NativeMethods.MOD_CONTROL | NativeMethods.MOD_SHIFT | NativeMethods.MOD_NOREPEAT, NativeMethods.VK_F12))
            actionLog.Write("WARN", $"Could not register the emergency stop hotkey {StopHotkeyText} (another app uses it).");
        NativeMethods.RegisterHotKey(Handle, HotkeyListen, NativeMethods.MOD_CONTROL | NativeMethods.MOD_ALT | NativeMethods.MOD_NOREPEAT, 'J');
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == NativeMethods.WM_HOTKEY)
        {
            if (m.WParam == HotkeyStop) EmergencyStop();
            else if (m.WParam == HotkeyListen) { ShowFromTray(); Emit("hotkey.listen", new { }); }
        }
        base.WndProc(ref m);
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        try
        {
            var env = await CoreWebView2Environment.CreateAsync(null, AppPaths.WebViewData);
            await web.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            var open = MessageBox.Show(this,
                "JARVIS AI needs the Microsoft Edge WebView2 Runtime, which is normally part of Windows 10 and 11 but is missing here.\n\nOpen the download page now? Install the \"Evergreen Bootstrapper\", then start JARVIS again.",
                "WebView2 Runtime missing", MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (open == DialogResult.Yes)
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("https://developer.microsoft.com/microsoft-edge/webview2/") { UseShellExecute = true });
            reallyExit = true;
            Close();
            return;
        }

        var core = web.CoreWebView2;
        core.SetVirtualHostNameToFolderMapping(Host, AppPaths.Ui, CoreWebView2HostResourceAccessKind.Deny);
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
#if !DEBUG
        core.Settings.AreDevToolsEnabled = false;
#endif
        // The page uses Windows speech through the bridge, never the browser's own microphone/camera access.
        core.PermissionRequested += (_, a) => a.State = CoreWebView2PermissionState.Deny;
        core.NavigationStarting += (_, a) =>
        {
            if (a.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) return;
            a.Cancel = true;
            OpenExternal(a.Uri);
        };
        core.NewWindowRequested += (_, a) =>
        {
            a.Handled = true;
            OpenExternal(a.Uri);
        };
        core.WebMessageReceived += (_, a) =>
        {
            if (!a.Source.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) return;
            string raw;
            try { raw = a.TryGetWebMessageAsString(); } catch (ArgumentException) { return; }
            HandleMessage(raw);
        };
        core.Navigate(Origin + "index.html");
    }

    static void OpenExternal(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp))
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true });
    }

    /// <summary>Sends an event to the page. Safe to call from any thread.</summary>
    void Emit(string evt, object data) => Post(new { @event = evt, data });

    void Post(object message)
    {
        if (IsDisposed) return;
        var json = JsonSerializer.Serialize(message, Json);
        if (InvokeRequired)
        {
            try { BeginInvoke(() => Post(json)); } catch (InvalidOperationException) { }
            return;
        }
        Post(json);
    }

    void Post(string json)
    {
        if (web.CoreWebView2 != null && !IsDisposed) web.CoreWebView2.PostWebMessageAsString(json);
    }

    void ShowFromTray()
    {
        Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        Activate();
        BringToFront();
    }

    /// <summary>Stops everything: approvals are denied, commands killed, speech stopped, the page told to abort.</summary>
    void EmergencyStop()
    {
        stopRequested?.Cancel();
        ConfirmDialog.DenyCurrent();
        var killed = commands.KillAll();
        speech.StopSpeaking();
        speech.CancelDictation();
        Emit("emergency.stop", new { });
        actionLog.Write("STOP", $"Emergency stop ({killed} running command(s) killed).");
        tray.ShowBalloonTip(3000, "JARVIS AI", "Emergency stop: everything was stopped.", ToolTipIcon.Warning);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // With wake word on, closing the window keeps JARVIS listening in the tray.
        if (!reallyExit && e.CloseReason == CloseReason.UserClosing && speech.WakeActive)
        {
            e.Cancel = true;
            Hide();
            if (!trayHintShown)
            {
                tray.ShowBalloonTip(5000, "JARVIS AI is still running", "Wake word listening is on, so JARVIS stays in the tray. Right-click the tray icon and choose Exit to quit.", ToolTipIcon.Info);
                trayHintShown = true;
            }
            return;
        }
        SaveWindowBounds();
        base.OnFormClosing(e);
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        NativeMethods.UnregisterHotKey(Handle, HotkeyStop);
        NativeMethods.UnregisterHotKey(Handle, HotkeyListen);
        commands.KillAll();
        speech.Dispose();
        tray.Visible = false;
        tray.Dispose();
        base.OnFormClosed(e);
    }

    sealed record SavedBounds(int X, int Y, int W, int H, bool Max);

    void LoadWindowBounds()
    {
        try
        {
            if (!File.Exists(AppPaths.WindowState)) return;
            var b = JsonSerializer.Deserialize<SavedBounds>(File.ReadAllText(AppPaths.WindowState));
            if (b == null) return;
            var rect = new Rectangle(b.X, b.Y, b.W, b.H);
            if (!Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(rect))) return;
            StartPosition = FormStartPosition.Manual;
            Bounds = rect;
            if (b.Max) WindowState = FormWindowState.Maximized;
        }
        catch (Exception) { /* use defaults */ }
    }

    void SaveWindowBounds()
    {
        try
        {
            var r = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            Directory.CreateDirectory(AppPaths.Data);
            File.WriteAllText(AppPaths.WindowState, JsonSerializer.Serialize(new SavedBounds(r.X, r.Y, r.Width, r.Height, WindowState == FormWindowState.Maximized)));
        }
        catch (Exception) { }
    }
}

namespace JarvisAI.Desktop;

/// <summary>Where the Windows app keeps its files. Nothing is stored outside these folders.</summary>
static class AppPaths
{
    /// <summary>%APPDATA%\JarvisAI: settings, approved tools, action log, encrypted device token, backups.</summary>
    public static string Data { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "JarvisAI");

    /// <summary>%LOCALAPPDATA%\JarvisAI\WebView2: the embedded browser's cache and local storage.</summary>
    public static string WebViewData { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JarvisAI", "WebView2");

    public static string ToolsConfig => Path.Combine(Data, "tools.json");
    public static string ActionLog => Path.Combine(Data, "actions.log");
    public static string Secure => Path.Combine(Data, "secure");
    public static string Backups => Path.Combine(Data, "Backups");
    public static string WindowState => Path.Combine(Data, "window.json");
    public static string Notes { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "JARVIS Notes");
    public static string Ui { get; } = Path.Combine(AppContext.BaseDirectory, "ui");
}

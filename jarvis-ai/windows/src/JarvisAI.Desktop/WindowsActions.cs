using System.Diagnostics;
using JarvisAI.Core;

namespace JarvisAI.Desktop;

/// <summary>Starts programs, Explorer and the browser for approved tool calls.</summary>
sealed class WindowsActions(NotifyIcon tray) : IPlatformActions
{
    public void OpenApp(AppEntry app)
    {
        try
        {
            Process.Start(new ProcessStartInfo(app.Path) { UseShellExecute = true });
        }
        catch (System.ComponentModel.Win32Exception e)
        {
            throw new ToolException($"Windows could not start {app.Name}: {e.Message}");
        }
    }

    public void OpenFolder(string path)
    {
        var psi = new ProcessStartInfo("explorer.exe") { UseShellExecute = false };
        psi.ArgumentList.Add(path);
        Process.Start(psi);
    }

    public void OpenUrl(string url)
    {
        if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) && !url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            throw new ToolException("Only web addresses can be opened.");
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    public void Notify(string title, string message) => tray.ShowBalloonTip(6000, title, message, ToolTipIcon.Info);
}

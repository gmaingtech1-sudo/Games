namespace JarvisAI.Desktop;

static class Program
{
    [STAThread]
    static void Main()
    {
        // One JARVIS at a time: a second launch just brings the first window forward.
        using var mutex = new Mutex(true, @"Local\JarvisAI.SingleInstance", out var first);
        using var showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\JarvisAI.Show");
        if (!first)
        {
            showSignal.Set();
            return;
        }

        ApplicationConfiguration.Initialize();
        Application.SetColorMode(SystemColorMode.Dark);
        Application.ThreadException += (_, e) => ShowCrash(e.Exception);
        AppDomain.CurrentDomain.UnhandledException += (_, e) => ShowCrash(e.ExceptionObject as Exception);

        var form = new MainForm();
        var waiter = new Thread(() =>
        {
            while (showSignal.WaitOne())
            {
                if (form.IsDisposed) return;
                try { form.BeginInvoke(() => { form.Show(); form.WindowState = FormWindowState.Normal; form.Activate(); }); }
                catch (InvalidOperationException) { return; }
            }
        }) { IsBackground = true };
        waiter.Start();
        Application.Run(form);
    }

    static void ShowCrash(Exception? e)
    {
        try
        {
            var log = Path.Combine(AppPaths.Data, "crash.log");
            Directory.CreateDirectory(AppPaths.Data);
            File.AppendAllText(log, $"{DateTime.Now:u} {e}{Environment.NewLine}");
            MessageBox.Show($"JARVIS AI hit an unexpected error:\n\n{e?.Message}\n\nDetails were saved to {log}.", "JARVIS AI", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        catch (Exception) { }
    }
}

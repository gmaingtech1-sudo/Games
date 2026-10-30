using System.Diagnostics;
using System.Text;

namespace JarvisAI.Core;

/// <summary>
/// Runs one of YOUR approved commands (never text the AI wrote), with a
/// timeout, captured output and an emergency stop that kills the whole
/// process tree.
/// </summary>
public sealed class CommandRunner
{
    readonly HashSet<Process> running = new();
    public const int MaxOutputChars = 20_000;

    public async Task<(int ExitCode, string Output, bool TimedOut)> RunAsync(CommandEntry command, TimeSpan timeout, CancellationToken ct)
    {
        var psi = OperatingSystem.IsWindows()
            ? new ProcessStartInfo("cmd.exe") { ArgumentList = { "/d", "/s", "/c", command.Command } }
            : new ProcessStartInfo("/bin/sh") { ArgumentList = { "-c", command.Command } };
        psi.WorkingDirectory = command.Cwd;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.RedirectStandardInput = true;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;

        var output = new StringBuilder();
        void Append(string? line)
        {
            if (line == null) return;
            lock (output)
            {
                if (output.Length < MaxOutputChars) output.AppendLine(line);
            }
        }

        using var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, e) => Append(e.Data);
        process.ErrorDataReceived += (_, e) => Append(e.Data);
        if (!process.Start()) throw new ToolException("The command could not be started.");
        process.StandardInput.Close();
        lock (running) running.Add(process);
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();

        using var timeoutCts = new CancellationTokenSource(timeout);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, timeoutCts.Token);
        var timedOut = false;
        try
        {
            await process.WaitForExitAsync(linked.Token);
        }
        catch (OperationCanceledException)
        {
            timedOut = timeoutCts.IsCancellationRequested && !ct.IsCancellationRequested;
            Kill(process);
            await process.WaitForExitAsync(CancellationToken.None);
            if (!timedOut) throw;
        }
        finally
        {
            lock (running) running.Remove(process);
        }
        process.WaitForExit(); // flush the async output readers
        string text;
        lock (output) text = output.ToString();
        if (text.Length >= MaxOutputChars) text += $"{Environment.NewLine}[output truncated at {MaxOutputChars:N0} characters]";
        return (timedOut ? -1 : process.ExitCode, text, timedOut);
    }

    /// <summary>Emergency stop: kill every command JARVIS started.</summary>
    public int KillAll()
    {
        Process[] list;
        lock (running) list = running.ToArray();
        foreach (var p in list) Kill(p);
        return list.Length;
    }

    static void Kill(Process p)
    {
        try { if (!p.HasExited) p.Kill(entireProcessTree: true); }
        catch (InvalidOperationException) { }
        catch (System.ComponentModel.Win32Exception) { }
    }
}

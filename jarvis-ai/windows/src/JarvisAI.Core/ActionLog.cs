namespace JarvisAI.Core;

/// <summary>Append-only log of everything JARVIS asked to do on this PC and what happened (%APPDATA%\JarvisAI\actions.log).</summary>
public sealed class ActionLog(string file)
{
    readonly object gate = new();
    public string FilePath { get; } = file;

    public void Write(string kind, string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss}  {kind,-9} {message.Replace('\r', ' ').Replace('\n', ' ')}";
        lock (gate)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
            File.AppendAllText(FilePath, line + Environment.NewLine);
            // Keep the log from growing forever: roll over at 2 MB.
            if (new FileInfo(FilePath).Length > 2_000_000) File.Move(FilePath, FilePath + ".1", overwrite: true);
        }
    }

    public string Tail(int lines)
    {
        lock (gate)
        {
            if (!File.Exists(FilePath)) return "";
            var all = File.ReadAllLines(FilePath);
            return string.Join(Environment.NewLine, all.Skip(Math.Max(0, all.Length - lines)));
        }
    }
}

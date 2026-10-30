using System.Text.Json;
using System.Text.Json.Serialization;

namespace JarvisAI.Core;

public sealed record AppEntry(string Name, string Path, bool Builtin = false);

public sealed record CommandEntry(string Name, string Command, string Cwd);

/// <summary>
/// What JARVIS may do on this PC: approved folders, apps and commands.
/// Stored as JSON in %APPDATA%\JarvisAI\tools.json and changed only from the
/// app's own Settings screen, never by the AI.
/// </summary>
public sealed class ToolConfig
{
    public List<string> Folders { get; set; } = new();
    public List<AppEntry> Apps { get; set; } = new();
    public List<CommandEntry> Commands { get; set; } = new();
    public string NotesFolder { get; set; } = "";
    public string BackupFolder { get; set; } = "";

    [JsonIgnore] public string? FilePath { get; private set; }

    static readonly JsonSerializerOptions Json = new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public static IReadOnlyList<AppEntry> BuiltinApps { get; } = new[]
    {
        new AppEntry("Notepad", "notepad.exe", true),
        new AppEntry("Calculator", "calc.exe", true),
        new AppEntry("File Explorer", "explorer.exe", true),
        new AppEntry("Paint", "mspaint.exe", true),
        new AppEntry("Snipping Tool", "snippingtool.exe", true),
    };

    public static ToolConfig Load(string file, string defaultNotes, string defaultBackups)
    {
        ToolConfig config;
        try
        {
            config = File.Exists(file) ? JsonSerializer.Deserialize<ToolConfig>(File.ReadAllText(file), Json) ?? new() : new();
        }
        catch (JsonException)
        {
            // A corrupt file must not unlock anything: start empty (and keep a copy for inspection).
            File.Copy(file, file + ".corrupt", overwrite: true);
            config = new();
        }
        config.FilePath = file;
        if (string.IsNullOrWhiteSpace(config.NotesFolder)) config.NotesFolder = defaultNotes;
        if (string.IsNullOrWhiteSpace(config.BackupFolder)) config.BackupFolder = defaultBackups;
        config.Apps = BuiltinApps.Concat(config.Apps.Where(a => !a.Builtin && !BuiltinApps.Any(b => b.Name.Equals(a.Name, StringComparison.OrdinalIgnoreCase)))).ToList();
        config.Folders = config.Folders.Where(f => !string.IsNullOrWhiteSpace(f)).Select(PathPolicy.Normalize).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        return config;
    }

    public void Save()
    {
        if (FilePath == null) return;
        Directory.CreateDirectory(Path.GetDirectoryName(FilePath)!);
        var toSave = new ToolConfig
        {
            Folders = Folders,
            Apps = Apps.Where(a => !a.Builtin).ToList(),
            Commands = Commands,
            NotesFolder = NotesFolder,
            BackupFolder = BackupFolder,
        };
        var tmp = FilePath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(toSave, Json));
        File.Move(tmp, FilePath, overwrite: true);
    }

    public string AddFolder(string folder)
    {
        if (!Directory.Exists(folder)) throw new ToolException("That folder does not exist.");
        var full = PathPolicy.Normalize(folder);
        if (Path.GetPathRoot(full)?.TrimEnd('\\', '/') == full.TrimEnd('\\', '/'))
            throw new ToolException("Approving a whole drive is not allowed. Pick a specific folder, such as your projects folder.");
        if (!Folders.Contains(full, StringComparer.OrdinalIgnoreCase)) Folders.Add(full);
        Save();
        return full;
    }

    public void RemoveFolder(string folder)
    {
        Folders.RemoveAll(f => f.Equals(folder, StringComparison.OrdinalIgnoreCase));
        Commands.RemoveAll(c => !Folders.Any(f => PathPolicy.IsInside(f, PathPolicy.Normalize(c.Cwd))));
        Save();
    }

    public void AddApp(string name, string path)
    {
        name = name.Trim();
        if (name.Length is 0 or > 60) throw new ToolException("Give the app a name (60 characters max).");
        var ext = Path.GetExtension(path).ToLowerInvariant();
        if (ext is not (".exe" or ".lnk" or ".url" or ".appref-ms")) throw new ToolException("Pick an .exe program or a shortcut.");
        if (Apps.Any(a => a.Name.Equals(name, StringComparison.OrdinalIgnoreCase))) throw new ToolException($"An app called {name} is already approved.");
        Apps.Add(new AppEntry(name, path));
        Save();
    }

    public void RemoveApp(string name)
    {
        Apps.RemoveAll(a => !a.Builtin && a.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        Save();
    }

    public void AddCommand(string name, string command, string cwd)
    {
        name = name.Trim();
        command = command.Trim();
        if (name.Length is 0 or > 40) throw new ToolException("Give the command a short name (40 characters max).");
        if (command.Length is 0 or > 300) throw new ToolException("Enter the command line (300 characters max).");
        if (command.Contains('\n') || command.Contains('\r')) throw new ToolException("A command must be a single line.");
        if (!PathPolicy.TryResolve(Folders, cwd, out var full, out var error)) throw new ToolException(error);
        if (Commands.Any(c => c.Name.Equals(name, StringComparison.OrdinalIgnoreCase))) throw new ToolException($"A command called {name} already exists.");
        Commands.Add(new CommandEntry(name, command, full));
        Save();
    }

    public void RemoveCommand(string name)
    {
        Commands.RemoveAll(c => c.Name.Equals(name, StringComparison.OrdinalIgnoreCase));
        Save();
    }
}

/// <summary>A tool failure with a message meant for the user and the AI.</summary>
public sealed class ToolException(string message) : Exception(message);

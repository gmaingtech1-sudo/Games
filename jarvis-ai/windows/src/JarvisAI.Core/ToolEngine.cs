using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace JarvisAI.Core;

/// <summary>Things only the Windows app can do (start programs, show notifications).</summary>
public interface IPlatformActions
{
    void OpenApp(AppEntry app);
    void OpenFolder(string path);
    void OpenUrl(string url);
    void Notify(string title, string message);
}

public sealed record ToolCall(string Id, string Name, JsonElement Input);

public sealed record ToolResult(string Content, bool IsError = false, string? Summary = null, bool Declined = false);

/// <summary>
/// What a tool call will do, worked out (and validated) BEFORE anything runs,
/// so the confirmation dialog can show it exactly.
/// </summary>
public sealed record ToolPlan(string Title, string Details, bool ReadOnly, Func<CancellationToken, Task<ToolResult>> Run);

/// <summary>
/// The PC tools offered to the AI. Nothing here deletes files, changes
/// system settings, installs software or runs commands the user didn't
/// approve in Settings.
/// </summary>
public sealed class ToolEngine(ToolConfig config, IPlatformActions platform, CommandRunner runner)
{
    public static readonly TimeSpan CommandTimeout = TimeSpan.FromMinutes(5);

    static JsonObject Schema(params (string Name, string Type, string Description, bool Required)[] props)
    {
        var properties = new JsonObject();
        var required = new JsonArray();
        foreach (var p in props)
        {
            properties[p.Name] = new JsonObject { ["type"] = p.Type, ["description"] = p.Description };
            if (p.Required) required.Add(p.Name);
        }
        return new JsonObject { ["type"] = "object", ["properties"] = properties, ["required"] = required, ["additionalProperties"] = false };
    }

    static JsonObject Tool(string name, string description, JsonObject schema) =>
        new() { ["name"] = name, ["description"] = description, ["input_schema"] = schema };

    /// <summary>Tool definitions sent to the AI, reflecting what is currently approved.</summary>
    public JsonArray Definitions()
    {
        var apps = string.Join(", ", config.Apps.Select(a => a.Name));
        var commands = config.Commands.Count == 0 ? "none approved yet" : string.Join(", ", config.Commands.Select(c => $"\"{c.Name}\" ({c.Command})"));
        var folders = config.Folders.Count == 0 ? "none approved yet" : string.Join("; ", config.Folders);
        var list = new JsonArray
        {
            Tool("open_app", $"Open one of the user's approved applications. Approved: {apps}.",
                Schema(("name", "string", "The approved app's name", true))),
            Tool("open_folder", $"Open a folder in File Explorer. Only inside approved folders: {folders}.",
                Schema(("path", "string", "Full folder path", true))),
            Tool("open_website", "Open a web page in the default browser (http/https only).",
                Schema(("url", "string", "Full URL", true))),
            Tool("search_files", $"Search file names in the approved folders ({folders}). Skips Library, Temp, obj, bin, node_modules and .git.",
                Schema(("query", "string", "Part of the file name, or a wildcard pattern like *.cs", true),
                       ("folder", "string", "Optional: limit the search to this approved folder or a subfolder", false),
                       ("extension", "string", "Optional: only files with this extension, e.g. .cs", false))),
            Tool("list_folder", "List the files and subfolders of a folder inside the approved folders.",
                Schema(("path", "string", "Full folder path", true))),
            Tool("read_file", "Read a text or code file inside the approved folders (up to about 120,000 characters).",
                Schema(("path", "string", "Full file path", true))),
            Tool("write_file", "Create or overwrite a text/code file inside the approved folders. The user must approve it, and any existing file is backed up first. Read the file first if it exists. Always write the complete file content.",
                Schema(("path", "string", "Full file path", true), ("content", "string", "The complete new file content", true))),
            Tool("create_note", "Save a Markdown note in the user's JARVIS Notes folder.",
                Schema(("title", "string", "Note title", true), ("content", "string", "Note text (Markdown)", true))),
            Tool("run_command", $"Run one of the user's approved development commands by name and return its output. Approved commands: {commands}. You cannot run any other command.",
                Schema(("name", "string", "The approved command's name", true))),
            Tool("system_info", "Basic information about this PC: Windows version, CPU cores, memory, disk space, uptime.",
                Schema()),
            Tool("show_notification", "Show a Windows notification, e.g. a reminder that something finished.",
                Schema(("title", "string", "Short title", true), ("message", "string", "Notification text", true))),
            Tool("unity_project_overview", "Summarise a Unity project inside the approved folders: Unity version, packages, scenes and C# scripts. Use before reviewing or changing a Unity project.",
                Schema(("path", "string", "The Unity project folder (or any folder inside it)", true))),
        };
        return list;
    }

    static string Str(JsonElement input, string name, bool required = true, int max = 2000)
    {
        if (input.ValueKind != JsonValueKind.Object) throw new ToolException("Tool input must be an object.");
        if (!input.TryGetProperty(name, out var v) || v.ValueKind == JsonValueKind.Null)
        {
            if (required) throw new ToolException($"Missing \"{name}\".");
            return "";
        }
        if (v.ValueKind != JsonValueKind.String) throw new ToolException($"\"{name}\" must be text.");
        var s = v.GetString() ?? "";
        if (s.Length > max) throw new ToolException($"\"{name}\" is too long.");
        return s;
    }

    string Resolve(string path)
    {
        if (!PathPolicy.TryResolve(config.Folders, path, out var full, out var error)) throw new ToolException(error);
        return full;
    }

    string ApprovedRootOf(string fullPath) =>
        config.Folders.First(f => PathPolicy.IsInside(PathPolicy.Normalize(f), fullPath));

    static Task<ToolResult> Done(string content, string? summary = null) => Task.FromResult(new ToolResult(content, false, summary ?? content));

    /// <summary>Validates a tool call and describes it. Throws <see cref="ToolException"/> for invalid or forbidden requests.</summary>
    public ToolPlan Plan(ToolCall call)
    {
        var input = call.Input;
        switch (call.Name)
        {
            case "open_app":
            {
                var name = Str(input, "name", max: 100);
                var app = config.Apps.FirstOrDefault(a => a.Name.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase))
                          ?? throw new ToolException($"\"{name}\" is not an approved app. Approved apps: {string.Join(", ", config.Apps.Select(a => a.Name))}. The user can add apps in Settings > PC tools.");
                return new ToolPlan($"Open {app.Name}", app.Path, false, _ =>
                {
                    platform.OpenApp(app);
                    return Done($"Opened {app.Name}.");
                });
            }
            case "open_folder":
            {
                var path = Resolve(Str(input, "path"));
                if (!Directory.Exists(path)) throw new ToolException("That folder does not exist.");
                return new ToolPlan("Open folder in File Explorer", path, true, _ =>
                {
                    platform.OpenFolder(path);
                    return Done($"Opened {path}.");
                });
            }
            case "open_website":
            {
                var url = Str(input, "url", max: 2000).Trim();
                if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
                    throw new ToolException("Only http:// and https:// web addresses can be opened.");
                return new ToolPlan("Open website in your browser", uri.AbsoluteUri, true, _ =>
                {
                    platform.OpenUrl(uri.AbsoluteUri);
                    return Done($"Opened {uri.Host} in the browser.");
                });
            }
            case "search_files":
            {
                var query = Str(input, "query", max: 200);
                var folder = Str(input, "folder", required: false);
                var ext = Str(input, "extension", required: false, max: 20);
                var roots = string.IsNullOrWhiteSpace(folder) ? config.Folders.ToList() : new List<string> { Resolve(folder) };
                if (roots.Count == 0) throw new ToolException("No folders are approved yet. Add one in Settings > PC tools.");
                return new ToolPlan("Search file names", $"\"{query}\"{(ext.Length > 0 ? $" ({ext} files)" : "")} in {string.Join("; ", roots)}", true, _ =>
                {
                    var found = FileTools.Search(roots, query, ext);
                    return Task.FromResult(new ToolResult(found, false, $"Searched for \"{query}\"."));
                });
            }
            case "list_folder":
            {
                var path = Resolve(Str(input, "path"));
                return new ToolPlan("List folder", path, true, _ => Task.FromResult(new ToolResult(FileTools.ListFolder(path), false, $"Listed {path}.")));
            }
            case "read_file":
            {
                var path = Resolve(Str(input, "path"));
                if (!File.Exists(path)) throw new ToolException($"{path} does not exist.");
                return new ToolPlan("Read file", path, true, _ =>
                    Task.FromResult(new ToolResult(FileTools.Read(path), false, $"Read {Path.GetFileName(path)}.")));
            }
            case "write_file":
            {
                var path = Resolve(Str(input, "path"));
                var content = Str(input, "content", max: FileTools.MaxWriteChars);
                if (FileTools.IsWriteBlocked(path)) throw new ToolException($"JARVIS is not allowed to write {Path.GetExtension(path)} files.");
                var exists = File.Exists(path);
                var preview = content.Length > 1500 ? content[..1500] + "\n…" : content;
                var details = $"{path}\n{(exists ? $"OVERWRITES the existing file ({FileTools.FormatSize(new FileInfo(path).Length)}). A backup copy is saved first in {config.BackupFolder}." : "Creates a new file.")}\nNew content ({content.Length:N0} characters):\n\n{preview}";
                return new ToolPlan(exists ? "Overwrite file (with backup)" : "Create file", details, false, _ =>
                {
                    var backup = FileTools.WriteWithBackup(path, content, config.BackupFolder, ApprovedRootOf(path));
                    return Done(backup == null ? $"Created {path}." : $"Saved {path}. The previous version was backed up to {backup}.",
                                backup == null ? $"Created {Path.GetFileName(path)}." : $"Saved {Path.GetFileName(path)} (backup made).");
                });
            }
            case "create_note":
            {
                var title = Str(input, "title", max: 200);
                var content = Str(input, "content", max: 200_000);
                return new ToolPlan("Create a note", $"\"{title}\" in {config.NotesFolder}", false, _ =>
                {
                    var file = FileTools.CreateNote(config.NotesFolder, title, content);
                    return Done($"Saved the note as {file}.", $"Saved note \"{title}\".");
                });
            }
            case "run_command":
            {
                var name = Str(input, "name", max: 100);
                var cmd = config.Commands.FirstOrDefault(c => c.Name.Equals(name.Trim(), StringComparison.OrdinalIgnoreCase))
                          ?? throw new ToolException($"\"{name}\" is not an approved command. Approved commands: {(config.Commands.Count == 0 ? "none" : string.Join(", ", config.Commands.Select(c => c.Name)))}. Only the user can add commands, in Settings > PC tools.");
                if (!PathPolicy.TryResolve(config.Folders, cmd.Cwd, out _, out var cwdError)) throw new ToolException(cwdError);
                return new ToolPlan($"Run command \"{cmd.Name}\"", $"{cmd.Command}\nin {cmd.Cwd}\n(stops after {CommandTimeout.TotalMinutes:0} minutes, or on emergency stop)", false, async ct =>
                {
                    var (exit, output, timedOut) = await runner.RunAsync(cmd, CommandTimeout, ct);
                    var status = timedOut ? "timed out and was stopped" : $"exited with code {exit}";
                    return new ToolResult($"Command \"{cmd.Command}\" {status}.\n{output}", timedOut || exit != 0, $"\"{cmd.Name}\" {status}.");
                });
            }
            case "system_info":
                return new ToolPlan("Check basic system information", "Windows version, CPU, memory, disk space, uptime", true, _ => Done(SystemInfo(), "Checked system information."));
            case "show_notification":
            {
                var title = Str(input, "title", max: 100);
                var message = Str(input, "message", max: 500);
                return new ToolPlan("Show a notification", $"{title}: {message}", true, _ =>
                {
                    platform.Notify(title, message);
                    return Done("Notification shown.");
                });
            }
            case "unity_project_overview":
            {
                var path = Resolve(Str(input, "path"));
                return new ToolPlan("Summarise Unity project", path, true, _ =>
                    Task.FromResult(new ToolResult(FileTools.UnityOverview(path), false, "Summarised the Unity project.")));
            }
            default:
                throw new ToolException($"Unknown tool \"{call.Name}\".");
        }
    }

    public static string SystemInfo()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"OS: {RuntimeInformation.OSDescription} ({RuntimeInformation.OSArchitecture})");
        sb.AppendLine($"CPU cores: {Environment.ProcessorCount}");
        var mem = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes;
        sb.AppendLine($"Memory: {mem / (1024.0 * 1024 * 1024):0.0} GB");
        sb.AppendLine($"Uptime: {TimeSpan.FromMilliseconds(Environment.TickCount64):d\\.hh\\:mm} (days.hours:minutes)");
        foreach (var d in DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType == DriveType.Fixed))
        {
            try { sb.AppendLine($"Drive {d.Name} {d.AvailableFreeSpace / 1e9:0.0} GB free of {d.TotalSize / 1e9:0.0} GB"); }
            catch (IOException) { }
        }
        sb.AppendLine($".NET: {RuntimeInformation.FrameworkDescription}");
        return sb.ToString().TrimEnd();
    }
}

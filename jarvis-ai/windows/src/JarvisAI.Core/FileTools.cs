using System.Text;
using System.Text.Json;

namespace JarvisAI.Core;

/// <summary>File operations for the AI, always inside approved folders (callers resolve paths with <see cref="PathPolicy"/>).</summary>
public static class FileTools
{
    public const int MaxReadBytes = 400_000;
    public const int MaxWriteChars = 1_000_000;

    // Folders that are huge, generated or private: never searched.
    static readonly HashSet<string> SkipDirs = new(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".svn", ".vs", ".idea", "node_modules", "Library", "Temp", "Logs", "obj", "bin", "UserSettings", "MemoryCaptures", "__pycache__", ".gradle", "build",
    };

    // Never written by JARVIS, even inside approved folders.
    static readonly HashSet<string> BlockedWriteExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".exe", ".dll", ".bat", ".cmd", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".msi", ".msp", ".reg", ".lnk", ".url", ".scr", ".com", ".pif", ".hta", ".cpl", ".jar", ".sys",
    };

    public static bool IsWriteBlocked(string path) => BlockedWriteExtensions.Contains(Path.GetExtension(path));

    public static string Search(IReadOnlyList<string> roots, string query, string? extension, int maxResults = 50)
    {
        var pattern = query.Trim();
        var ext = string.IsNullOrWhiteSpace(extension) ? null : (extension.StartsWith('.') ? extension : "." + extension);
        var results = new List<string>();
        var scanned = 0;
        foreach (var root in roots)
        {
            var stack = new Stack<(string Dir, int Depth)>();
            stack.Push((root, 0));
            while (stack.Count > 0 && results.Count < maxResults && scanned < 50_000)
            {
                var (dir, depth) = stack.Pop();
                IEnumerable<string> entries;
                try { entries = Directory.EnumerateFileSystemEntries(dir); }
                catch (Exception e) when (e is UnauthorizedAccessException or IOException) { continue; }
                foreach (var entry in entries)
                {
                    scanned++;
                    var name = Path.GetFileName(entry);
                    var isDir = Directory.Exists(entry);
                    if (isDir)
                    {
                        if (depth < 14 && !SkipDirs.Contains(name) && !name.StartsWith('.') && new DirectoryInfo(entry).LinkTarget == null) stack.Push((entry, depth + 1));
                        continue;
                    }
                    if (ext != null && !name.EndsWith(ext, StringComparison.OrdinalIgnoreCase)) continue;
                    if (pattern.Length > 0 && pattern != "*" && !Matches(name, pattern)) continue;
                    var fi = new FileInfo(entry);
                    results.Add($"{entry}  ({FormatSize(fi.Length)}, modified {fi.LastWriteTime:yyyy-MM-dd HH:mm})");
                    if (results.Count >= maxResults) break;
                }
            }
        }
        if (results.Count == 0) return "No matching files found in the approved folders.";
        var more = results.Count >= maxResults ? $"{Environment.NewLine}(showing the first {maxResults}; narrow the search for more)" : "";
        return string.Join(Environment.NewLine, results) + more;
    }

    static bool Matches(string name, string pattern)
    {
        if (pattern.Contains('*') || pattern.Contains('?'))
        {
            var regex = "^" + System.Text.RegularExpressions.Regex.Escape(pattern).Replace(@"\*", ".*").Replace(@"\?", ".") + "$";
            return System.Text.RegularExpressions.Regex.IsMatch(name, regex, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        }
        return name.Contains(pattern, StringComparison.OrdinalIgnoreCase);
    }

    public static string ListFolder(string dir)
    {
        if (!Directory.Exists(dir)) throw new ToolException("That folder does not exist.");
        var sb = new StringBuilder();
        var count = 0;
        foreach (var d in Directory.EnumerateDirectories(dir).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            if (++count > 200) break;
            sb.AppendLine($"[folder] {Path.GetFileName(d)}");
        }
        foreach (var f in Directory.EnumerateFiles(dir).OrderBy(x => x, StringComparer.OrdinalIgnoreCase))
        {
            if (++count > 200) { sb.AppendLine("(more entries not shown)"); break; }
            sb.AppendLine($"{Path.GetFileName(f)}  ({FormatSize(new FileInfo(f).Length)})");
        }
        return count == 0 ? "(empty folder)" : sb.ToString().TrimEnd();
    }

    public static string Read(string path, int maxChars = 120_000)
    {
        var text = TextFileReader.ReadFile(path, MaxReadBytes);
        return text.Length > maxChars ? text[..maxChars] + $"{Environment.NewLine}[file truncated at {maxChars:N0} characters]" : text;
    }

    /// <summary>Writes a text file, first copying any existing version into the backup folder. Returns the backup path (or null for a new file).</summary>
    public static string? WriteWithBackup(string path, string content, string backupRoot, string approvedRoot)
    {
        if (IsWriteBlocked(path)) throw new ToolException($"JARVIS is not allowed to write {Path.GetExtension(path)} files.");
        if (content.Length > MaxWriteChars) throw new ToolException("The content is too large to write (1,000,000 characters max).");
        if (Directory.Exists(path)) throw new ToolException("That path is a folder.");
        string? backup = null;
        if (File.Exists(path))
        {
            var relative = Path.GetRelativePath(approvedRoot, path);
            backup = Path.Combine(backupRoot, DateTime.Now.ToString("yyyyMMdd-HHmmss-fff"), Path.GetFileName(approvedRoot.TrimEnd('\\', '/')), relative);
            Directory.CreateDirectory(Path.GetDirectoryName(backup)!);
            File.Copy(path, backup, overwrite: false);
        }
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".jarvis-tmp";
        File.WriteAllText(tmp, content, new UTF8Encoding(false));
        File.Move(tmp, path, overwrite: true);
        return backup;
    }

    public static string CreateNote(string notesFolder, string title, string content)
    {
        Directory.CreateDirectory(notesFolder);
        var safe = new string(title.Select(c => Path.GetInvalidFileNameChars().Contains(c) || c is '/' or '\\' or ':' ? '-' : c).ToArray()).Trim().Trim('.');
        if (safe.Length == 0) safe = "Note";
        if (safe.Length > 80) safe = safe[..80];
        var file = Path.Combine(notesFolder, $"{DateTime.Now:yyyy-MM-dd} {safe}.md");
        for (var i = 2; File.Exists(file); i++) file = Path.Combine(notesFolder, $"{DateTime.Now:yyyy-MM-dd} {safe} ({i}).md");
        File.WriteAllText(file, $"# {title}{Environment.NewLine}{Environment.NewLine}{content}{Environment.NewLine}", new UTF8Encoding(false));
        return file;
    }

    /// <summary>Summary of a Unity project: version, packages, scenes and scripts.</summary>
    public static string UnityOverview(string path)
    {
        var root = path;
        while (root != null && !(Directory.Exists(Path.Combine(root, "Assets")) && Directory.Exists(Path.Combine(root, "ProjectSettings"))))
            root = Path.GetDirectoryName(root);
        if (root == null) throw new ToolException("No Unity project found there (a Unity project has Assets and ProjectSettings folders).");

        var sb = new StringBuilder();
        sb.AppendLine($"Unity project: {root}");
        var versionFile = Path.Combine(root, "ProjectSettings", "ProjectVersion.txt");
        if (File.Exists(versionFile))
        {
            var line = File.ReadLines(versionFile).FirstOrDefault(l => l.StartsWith("m_EditorVersion:"));
            if (line != null) sb.AppendLine($"Editor version: {line["m_EditorVersion:".Length..].Trim()}");
        }
        var manifest = Path.Combine(root, "Packages", "manifest.json");
        if (File.Exists(manifest))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(manifest));
                if (doc.RootElement.TryGetProperty("dependencies", out var deps))
                {
                    var names = deps.EnumerateObject().Select(p => $"{p.Name}@{p.Value}").Where(n => !n.StartsWith("com.unity.modules.")).ToList();
                    sb.AppendLine($"Packages ({names.Count}): {string.Join(", ", names.Take(40))}");
                }
            }
            catch (JsonException) { sb.AppendLine("Packages: manifest.json could not be parsed."); }
        }
        var assets = Path.Combine(root, "Assets");
        var scripts = SafeFiles(assets, "*.cs").ToList();
        var scenes = SafeFiles(assets, "*.unity").ToList();
        var prefabs = SafeFiles(assets, "*.prefab").Count();
        var asmdefs = SafeFiles(assets, "*.asmdef").Count();
        sb.AppendLine($"Scenes ({scenes.Count}): {string.Join(", ", scenes.Take(30).Select(s => Path.GetRelativePath(root, s)))}");
        sb.AppendLine($"Prefabs: {prefabs}; assembly definitions: {asmdefs}");
        sb.AppendLine($"C# scripts ({scripts.Count}):");
        foreach (var s in scripts.Take(300))
        {
            int lines;
            try { lines = File.ReadLines(s).Count(); } catch (IOException) { lines = -1; }
            sb.AppendLine($"  {Path.GetRelativePath(root, s)} ({lines} lines)");
        }
        if (scripts.Count > 300) sb.AppendLine($"  ... and {scripts.Count - 300} more");
        return sb.ToString().TrimEnd();
    }

    static IEnumerable<string> SafeFiles(string dir, string pattern)
    {
        try
        {
            return Directory.EnumerateFiles(dir, pattern, new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint })
                .OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList();
        }
        catch (DirectoryNotFoundException) { return Array.Empty<string>(); }
    }

    public static string FormatSize(long bytes) => bytes switch
    {
        < 1024 => $"{bytes} B",
        < 1024 * 1024 => $"{bytes / 1024.0:0.#} KB",
        _ => $"{bytes / (1024.0 * 1024):0.#} MB",
    };
}

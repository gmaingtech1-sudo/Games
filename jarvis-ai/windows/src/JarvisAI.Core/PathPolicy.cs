namespace JarvisAI.Core;

/// <summary>
/// Decides whether a path the AI asked for is inside one of the folders you
/// approved. Everything the file tools touch goes through here.
/// </summary>
public static class PathPolicy
{
    static readonly StringComparison Cmp = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;

    /// <summary>Resolves <paramref name="path"/> (absolute, or relative to the first approved folder) and checks it is inside an approved folder.</summary>
    public static bool TryResolve(IReadOnlyList<string> approvedFolders, string? path, out string fullPath, out string error)
    {
        fullPath = "";
        error = "";
        if (approvedFolders.Count == 0)
        {
            error = "No folders are approved yet. Add one in Settings > PC tools > Approved folders.";
            return false;
        }
        if (string.IsNullOrWhiteSpace(path))
        {
            error = "A path is required.";
            return false;
        }
        path = path.Trim().Trim('"');
        if (path.StartsWith(@"\\?\") || path.StartsWith(@"\\.\") || path.StartsWith("//?/"))
        {
            error = "Device paths are not allowed.";
            return false;
        }
        // Alternate data streams (file.txt:hidden) - a colon is only valid after a drive letter.
        var colon = path.IndexOf(':');
        if (colon >= 0 && !(colon == 1 && char.IsLetter(path[0]) && path.IndexOf(':', 2) < 0))
        {
            error = "That path is not allowed.";
            return false;
        }

        string candidate;
        try
        {
            candidate = Path.GetFullPath(Path.IsPathRooted(path) ? path : Path.Combine(approvedFolders[0], path));
        }
        catch (Exception e) when (e is ArgumentException or NotSupportedException or PathTooLongException)
        {
            error = "That is not a valid path.";
            return false;
        }

        foreach (var folder in approvedFolders)
        {
            var root = Normalize(folder);
            if (!IsInside(root, candidate)) continue;
            if (HasLinkEscape(root, candidate))
            {
                error = "That path goes through a link or junction that points elsewhere, so it is not allowed.";
                return false;
            }
            fullPath = candidate;
            return true;
        }
        error = $"\"{path}\" is outside your approved folders. Approve its folder in Settings > PC tools first.";
        return false;
    }

    public static string Normalize(string folder) => Path.TrimEndingDirectorySeparator(Path.GetFullPath(folder));

    public static bool IsInside(string root, string candidate)
    {
        candidate = Path.TrimEndingDirectorySeparator(candidate);
        if (candidate.Equals(root, Cmp)) return true;
        // "C:\Projects2" must not count as inside "C:\Projects".
        return candidate.StartsWith(root + Path.DirectorySeparatorChar, Cmp);
    }

    /// <summary>True if any existing part of the path below the approved root is a symbolic link or junction.</summary>
    static bool HasLinkEscape(string root, string candidate)
    {
        var current = Path.TrimEndingDirectorySeparator(candidate);
        while (current.Length > root.Length)
        {
            try
            {
                FileSystemInfo info = Directory.Exists(current) ? new DirectoryInfo(current) : new FileInfo(current);
                if (info.Exists && info.LinkTarget != null) return true;
            }
            catch (IOException) { return true; }
            catch (UnauthorizedAccessException) { return true; }
            current = Path.GetDirectoryName(current) ?? root;
        }
        return false;
    }
}

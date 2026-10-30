using System.Text;

namespace JarvisAI.Core;

/// <summary>Reads text and code files safely: size-limited, binary files refused, UTF-8 with a Windows-1252 fallback.</summary>
public static class TextFileReader
{
    static TextFileReader() => Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

    public static string Decode(string name, byte[] bytes, int maxBytes)
    {
        if (bytes.Length > maxBytes) throw new ToolException($"{name} is too large ({bytes.Length / 1024:N0} KB; the limit is {maxBytes / 1024:N0} KB).");
        if (Array.IndexOf(bytes, (byte)0) >= 0) throw new ToolException($"{name} looks like a binary file, so it can't be read as text.");
        var start = bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF ? 3 : 0;
        try
        {
            return new UTF8Encoding(false, throwOnInvalidBytes: true).GetString(bytes, start, bytes.Length - start);
        }
        catch (DecoderFallbackException)
        {
            return Encoding.GetEncoding(1252).GetString(bytes, start, bytes.Length - start);
        }
    }

    public static string ReadFile(string path, int maxBytes)
    {
        var info = new FileInfo(path);
        if (!info.Exists) throw new ToolException($"{info.Name} does not exist.");
        if (info.Length > maxBytes) throw new ToolException($"{info.Name} is too large ({info.Length / 1024:N0} KB; the limit is {maxBytes / 1024:N0} KB).");
        return Decode(info.Name, File.ReadAllBytes(path), maxBytes);
    }
}

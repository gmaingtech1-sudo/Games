using System.Security.Cryptography;
using System.Text;

namespace JarvisAI.Desktop;

/// <summary>
/// Encrypted storage for the device token, using Windows DPAPI: only your
/// Windows user account on this PC can decrypt it.
/// </summary>
static class SecureStore
{
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("JarvisAI.SecureStore.v1");

    static string FileFor(string key)
    {
        var safe = new string(key.Where(char.IsLetterOrDigit).ToArray());
        if (safe.Length == 0) throw new ArgumentException("Invalid key");
        return Path.Combine(AppPaths.Secure, safe + ".bin");
    }

    public static string? Get(string key)
    {
        var file = FileFor(key);
        if (!File.Exists(file)) return null;
        try
        {
            return Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(file), Entropy, DataProtectionScope.CurrentUser));
        }
        catch (CryptographicException)
        {
            File.Delete(file);
            return null;
        }
    }

    public static void Set(string key, string value)
    {
        Directory.CreateDirectory(AppPaths.Secure);
        File.WriteAllBytes(FileFor(key), ProtectedData.Protect(Encoding.UTF8.GetBytes(value), Entropy, DataProtectionScope.CurrentUser));
    }

    public static void Remove(string key)
    {
        var file = FileFor(key);
        if (File.Exists(file)) File.Delete(file);
    }
}

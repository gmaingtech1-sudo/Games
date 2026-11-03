using System;
using System.IO;
using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Local, offline persistence. Writes are atomic (temp file + replace) and the previous save is
    /// kept as a backup. Loading falls back to the backup if the main file is missing or corrupted, and
    /// a corrupted file is preserved (renamed) rather than deleted.
    /// </summary>
    public static class SaveSystem
    {
        const string SaveFile = "bodyos_save.json";
        const string SettingsFile = "bodyos_settings.json";

        public static string Folder => Application.persistentDataPath;
        static string SavePath => Path.Combine(Folder, SaveFile);
        static string SettingsPath => Path.Combine(Folder, SettingsFile);

        public static string LastError { get; private set; } = "";
        public static string LastSaveTime { get; private set; } = "never";

        public static bool HasSave => File.Exists(SavePath) || File.Exists(SavePath + ".bak");

        public static bool Save(SaveData data)
        {
            try
            {
                data.version = SaveData.CurrentVersion;
                data.savedAtUtc = DateTime.UtcNow.ToString("o");
                WriteAtomic(SavePath, JsonUtility.ToJson(data, false));
                LastSaveTime = DateTime.Now.ToString("HH:mm:ss");
                return true;
            }
            catch (Exception e)
            {
                LastError = e.Message;
                Debug.LogWarning("[BODY.OS] Save failed: " + e.Message);
                return false;
            }
        }

        /// <summary>Returns a validated save, or null if no readable save exists.</summary>
        public static SaveData Load()
        {
            var data = TryRead(SavePath);
            if (data == null && File.Exists(SavePath))
            {
                // Keep the broken file for inspection instead of silently destroying it.
                try { File.Copy(SavePath, SavePath + ".corrupt", true); } catch { /* ignore */ }
                Debug.LogWarning("[BODY.OS] Main save unreadable, trying backup.");
            }
            if (data == null) data = TryRead(SavePath + ".bak");
            if (data == null) return null;
            Migrate(data);
            SaveValidator.Validate(data);
            return data;
        }

        public static void DeleteSave()
        {
            try
            {
                // The old progress is kept as ".previous" (never loaded automatically) as a last-resort
                // recovery copy after the player confirms New Game.
                if (File.Exists(SavePath)) { File.Copy(SavePath, SavePath + ".previous", true); File.Delete(SavePath); }
                if (File.Exists(SavePath + ".bak")) File.Delete(SavePath + ".bak");
            }
            catch (Exception e) { LastError = e.Message; }
        }

        static SaveData TryRead(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                string json = File.ReadAllText(path);
                if (string.IsNullOrWhiteSpace(json) || json[0] != '{') return null;
                var data = new SaveData();
                JsonUtility.FromJsonOverwrite(json, data);
                return data;
            }
            catch (Exception e)
            {
                LastError = e.Message;
                return null;
            }
        }

        /// <summary>Upgrades older save formats in place. Add a case per version bump.</summary>
        static void Migrate(SaveData data)
        {
            if (data.version < 1) data.version = 1;
            // Future: if (data.version < 2) { ...convert...; data.version = 2; }
            // Saves from a newer build are loaded best-effort: unknown fields are ignored by JsonUtility.
        }

        static void WriteAtomic(string path, string contents)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, contents);
            if (File.Exists(path)) File.Copy(path, path + ".bak", true);
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
        }

        // ---------------- Settings ----------------

        public static GameSettings LoadSettings()
        {
            var s = new GameSettings();
            try
            {
                if (File.Exists(SettingsPath)) JsonUtility.FromJsonOverwrite(File.ReadAllText(SettingsPath), s);
            }
            catch (Exception e) { Debug.LogWarning("[BODY.OS] Settings unreadable, using defaults: " + e.Message); s = new GameSettings(); }
            SaveValidator.Validate(s);
            return s;
        }

        public static void SaveSettings(GameSettings s)
        {
            try { WriteAtomic(SettingsPath, JsonUtility.ToJson(s, true)); }
            catch (Exception e) { LastError = e.Message; }
        }
    }
}

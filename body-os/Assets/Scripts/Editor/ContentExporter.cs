#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

namespace BodyOS.EditorTools
{
    /// <summary>
    /// Writes the built-in (code-defined) content out as ScriptableObject assets so designers can edit
    /// them in the Inspector. Assets in Resources override code defaults with the same id, and new assets
    /// add content without code changes.
    /// </summary>
    public static class ContentExporter
    {
        const string Root = "Assets/ScriptableObjects/Resources/ScriptableObjects";

        [MenuItem("BODY.OS/Export Default Content to ScriptableObjects", priority = 40)]
        public static void Export()
        {
            int n = 0;
            n += Write(DefaultContent.Upgrades(), "Upgrades");
            n += Write(DefaultContent.Abilities(), "Abilities");
            n += Write(DefaultContent.Items(), "Items");
            n += Write(DefaultContent.Missions(), "Missions");
            n += Write(DefaultContent.Locations(), "Locations");
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[BODY.OS] Exported " + n + " new content assets to " + Root + ". Existing assets were left untouched.");
        }

        static int Write<T>(T[] items, string folder) where T : ScriptableObject
        {
            string dir = Root + "/" + folder;
            BodyOSProjectSetup.EnsureFolder(dir);
            int written = 0;
            foreach (var item in items)
            {
                string path = dir + "/" + item.name + ".asset";
                if (AssetDatabase.LoadAssetAtPath<T>(path) != null) continue;
                AssetDatabase.CreateAsset(item, path);
                written++;
            }
            return written;
        }
    }
}
#endif

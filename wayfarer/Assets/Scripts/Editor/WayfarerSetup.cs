using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Wayfarer.EditorTools
{
    /// <summary>
    /// One-time project setup, run automatically the first time the project is
    /// opened: creates the game scene, adds it to the build, switches to linear
    /// colour and makes sure the classic Input Manager is enabled. Everything
    /// else in the game is built from code when you press Play.
    /// </summary>
    [InitializeOnLoad]
    public static class WayfarerSetup
    {
        const string ScenePath = "Assets/Scenes/Wayfarer.unity";
        const string DoneKey = "Wayfarer.SetupDone.v1";

        static WayfarerSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (!SessionState.GetBool(DoneKey, false))
                {
                    SessionState.SetBool(DoneKey, true);
                    Run(false);
                }
            };
        }

        [MenuItem("Wayfarer/Set Up Project", priority = 1)]
        public static void RunFromMenu() => Run(true);

        static void Run(bool verbose)
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;

            if (PlayerSettings.colorSpace != ColorSpace.Linear) PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.productName = "Wayfarer";
            if (PlayerSettings.companyName == "DefaultCompany") PlayerSettings.companyName = "Wayfarer";
            PlayerSettings.runInBackground = true;
            PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow;
            PlayerSettings.defaultIsNativeResolution = true;

            if (!File.Exists(ScenePath))
            {
                Directory.CreateDirectory("Assets/Scenes");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var note = new GameObject("Wayfarer (starts automatically when you press Play)");
                note.hideFlags = HideFlags.None;
                EditorSceneManager.SaveScene(scene, ScenePath);
                AssetDatabase.Refresh();
                Debug.Log("Wayfarer: created " + ScenePath + ". Press Play to start the game.");
            }
            var scenes = EditorBuildSettings.scenes;
            bool listed = false;
            foreach (var s in scenes) if (s.path == ScenePath) listed = true;
            if (!listed)
            {
                var list = new System.Collections.Generic.List<EditorBuildSettingsScene>(scenes);
                list.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
                EditorBuildSettings.scenes = list.ToArray();
            }
            if (SceneManager.GetActiveScene().path != ScenePath && string.IsNullOrEmpty(SceneManager.GetActiveScene().path))
                EditorSceneManager.OpenScene(ScenePath);

            EnsureLegacyInput(verbose);
            if (verbose) Debug.Log("Wayfarer: project set up. Open Assets/Scenes/Wayfarer.unity and press Play.");
        }

        /// <summary>The game reads the keyboard and mouse through the classic Input
        /// Manager. If the project only has the new Input System enabled, switch to "Both".</summary>
        static void EnsureLegacyInput(bool verbose)
        {
#if !ENABLE_LEGACY_INPUT_MANAGER
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (assets == null || assets.Length == 0) return;
            var so = new SerializedObject(assets[0]);
            var prop = so.FindProperty("activeInputHandler");
            if (prop != null)
            {
                prop.intValue = 2; // both
                so.ApplyModifiedProperties();
                EditorUtility.DisplayDialog("Wayfarer",
                    "Wayfarer uses the classic Input Manager. Active Input Handling has been set to \"Both\".\n\nPlease restart Unity for the change to take effect.",
                    "OK");
            }
#else
            if (verbose) Debug.Log("Wayfarer: classic input is enabled.");
#endif
        }

        [MenuItem("Wayfarer/Open Game Scene", priority = 2)]
        static void OpenScene()
        {
            if (!File.Exists(ScenePath)) Run(false);
            if (EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) EditorSceneManager.OpenScene(ScenePath);
        }

        [MenuItem("Wayfarer/Delete Saved Game", priority = 20)]
        static void DeleteSave()
        {
            string path = Path.Combine(Application.persistentDataPath, "wayfarer_save.json");
            if (!File.Exists(path)) { EditorUtility.DisplayDialog("Wayfarer", "There is no saved game.", "OK"); return; }
            if (EditorUtility.DisplayDialog("Wayfarer", "Delete your saved journey?\n\n" + path, "Delete", "Cancel"))
            {
                File.Delete(path);
                Debug.Log("Wayfarer: save deleted.");
            }
        }

        [MenuItem("Wayfarer/Show Save Folder", priority = 21)]
        static void ShowSaveFolder() => EditorUtility.RevealInFinder(Application.persistentDataPath);

        [MenuItem("Wayfarer/Rebuild Models With Blender...", priority = 40)]
        static void RebuildModels()
        {
            string blender = EditorPrefs.GetString("Wayfarer.BlenderPath", "");
            if (string.IsNullOrEmpty(blender) || !File.Exists(blender))
            {
                blender = EditorUtility.OpenFilePanel("Find the Blender executable (4.2 or newer)", "", "");
                if (string.IsNullOrEmpty(blender)) return;
                EditorPrefs.SetString("Wayfarer.BlenderPath", blender);
            }
            string project = Path.GetDirectoryName(Application.dataPath);
            string script = Path.Combine(project, "Blender", "build_assets.py");
            if (!File.Exists(script)) { EditorUtility.DisplayDialog("Wayfarer", "Couldn't find " + script, "OK"); return; }
            var psi = new System.Diagnostics.ProcessStartInfo(blender, $"--background --python \"{script}\"")
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = project,
            };
            EditorUtility.DisplayProgressBar("Wayfarer", "Blender is building the models…", 0.5f);
            try
            {
                using (var p = System.Diagnostics.Process.Start(psi))
                {
                    string output = p.StandardOutput.ReadToEnd();
                    string err = p.StandardError.ReadToEnd();
                    p.WaitForExit();
                    Debug.Log("Blender output:\n" + output + (string.IsNullOrEmpty(err) ? "" : "\n" + err));
                }
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }
            AssetDatabase.Refresh();
        }
    }
}

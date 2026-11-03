#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace BodyOS.EditorTools
{
    /// <summary>
    /// One-click project configuration: scenes, Build Settings, Android player settings, input handling,
    /// shader inclusion, template materials and a placeholder icon. Runs automatically the first time the
    /// project is opened (if the scenes are missing) and can be re-run from the BODY.OS menu.
    /// </summary>
    [InitializeOnLoad]
    public static class BodyOSProjectSetup
    {
        public const string ProductName = "BODY.OS: BEYOND EXISTENCE";
        public const string CompanyName = "BodyOS Studio";
        public const string ApplicationId = "com.bodyos.beyondexistence";
        public const string ScenesFolder = "Assets/Scenes";
        public static readonly string[] BuildScenes = { "Bootstrap", "MainMenu", "Derelict" };
        const string MaterialsFolder = "Assets/Resources/BodyOS/Materials";

        static BodyOSProjectSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (Application.isBatchMode) return;
                if (!File.Exists(Path.Combine(ScenesFolder, "Bootstrap.unity")))
                {
                    Debug.Log("[BODY.OS] First open detected: running project setup.");
                    Run();
                }
            };
        }

        [MenuItem("BODY.OS/Setup Project", priority = 0)]
        public static void Run()
        {
            ConfigurePlayer();
            ConfigureInput();
            ConfigureGraphics();
            CreateTemplateMaterials();
            CreateIcon();
            CreateScenes();
            ConfigureBuildSettings();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[BODY.OS] Project setup complete. Open Assets/Scenes/Bootstrap.unity and press Play, or use BODY.OS > Build Android APK.");
        }

        static void ConfigurePlayer()
        {
            PlayerSettings.companyName = CompanyName;
            PlayerSettings.productName = ProductName;
            PlayerSettings.bundleVersion = "0.1.0";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, ApplicationId);
            PlayerSettings.Android.bundleVersionCode = 1;

            // Landscape only, either way up.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;

            // Android 7.0+ minimum; target the highest SDK installed with the editor.
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)24;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64 | AndroidArchitecture.ARMv7;
            PlayerSettings.Android.forceInternetPermission = false;
            PlayerSettings.Android.startInFullscreen = true;
            PlayerSettings.Android.renderOutsideSafeArea = true;

            // Built-in render pipeline, gamma space: consistent on low-end GLES devices.
            PlayerSettings.colorSpace = ColorSpace.Gamma;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, true);
            PlayerSettings.runInBackground = false;
        }

        /// <summary>The game uses the legacy Input Manager (via uGUI's StandaloneInputModule for touch).
        /// If the project was created with "Input System only", switch to "Both" so legacy calls work.</summary>
        static void ConfigureInput()
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (assets == null || assets.Length == 0) return;
            var so = new SerializedObject(assets[0]);
            var p = so.FindProperty("activeInputHandler");
            if (p != null && p.intValue == 1)
            {
                p.intValue = 2;
                so.ApplyModifiedPropertiesWithoutUndo();
                Debug.LogWarning("[BODY.OS] Active Input Handling set to 'Both'. Restart the editor for it to take effect.");
            }
        }

        /// <summary>Makes sure shaders created from code are in the build and fog variants are kept.</summary>
        static void ConfigureGraphics()
        {
            var gs = AssetDatabase.LoadAssetAtPath<Object>("ProjectSettings/GraphicsSettings.asset");
            if (gs == null) return;
            var so = new SerializedObject(gs);
            var list = so.FindProperty("m_AlwaysIncludedShaders");
            if (list != null)
            {
                foreach (var name in new[] { "Unlit/Color", "Legacy Shaders/Particles/Additive", "Sprites/Default", "UI/Default" })
                {
                    var shader = Shader.Find(name);
                    if (shader == null) continue;
                    bool present = false;
                    for (int i = 0; i < list.arraySize; i++)
                        if (list.GetArrayElementAtIndex(i).objectReferenceValue == shader) { present = true; break; }
                    if (present) continue;
                    list.InsertArrayElementAtIndex(list.arraySize);
                    list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = shader;
                }
            }
            SetInt(so, "m_FogStripping", 1); // custom: keep the fog modes below
            SetBool(so, "m_FogKeepLinear", true);
            SetBool(so, "m_FogKeepExp", true);
            SetBool(so, "m_FogKeepExp2", true);
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        static void SetInt(SerializedObject so, string name, int v) { var p = so.FindProperty(name); if (p != null) p.intValue = v; }
        static void SetBool(SerializedObject so, string name, bool v) { var p = so.FindProperty(name); if (p != null) p.boolValue = v; }

        /// <summary>Template materials referenced from Resources so their shaders/keywords ship with the build.</summary>
        static void CreateTemplateMaterials()
        {
            EnsureFolder(MaterialsFolder);
            MakeMaterial("Lit", "Standard", false);
            MakeMaterial("LitEmissive", "Standard", true);
            MakeMaterial("Unlit", "Unlit/Color", false);
            MakeMaterial("UnlitTexture", "Unlit/Texture", false);
            MakeMaterial("Glow", "Legacy Shaders/Particles/Additive", false);
        }

        static void MakeMaterial(string name, string shaderName, bool emissive)
        {
            string path = MaterialsFolder + "/" + name + ".mat";
            if (AssetDatabase.LoadAssetAtPath<Material>(path) != null) return;
            var shader = Shader.Find(shaderName);
            if (shader == null) { Debug.LogWarning("[BODY.OS] Shader not found: " + shaderName); return; }
            var m = new Material(shader) { name = name };
            if (emissive)
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", Color.white);
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            }
            AssetDatabase.CreateAsset(m, path);
        }

        /// <summary>Generates a placeholder holographic app icon (replace Assets/Textures/AppIcon.png with final art).</summary>
        static void CreateIcon()
        {
            const string path = "Assets/Textures/AppIcon.png";
            EnsureFolder("Assets/Textures");
            if (!File.Exists(path))
            {
                const int n = 512;
                var tex = new Texture2D(n, n, TextureFormat.RGBA32, false);
                var px = new Color32[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float dx = (x - n / 2f) / (n / 2f), dy = (y - n / 2f) / (n / 2f);
                        float d = Mathf.Sqrt(dx * dx + dy * dy);
                        Color c = Color.Lerp(new Color(0.02f, 0.05f, 0.1f), new Color(0.01f, 0.02f, 0.04f), d);
                        float ring = Mathf.Abs(d - 0.62f);
                        if (ring < 0.035f) c = Color.Lerp(new Color(0.1f, 0.9f, 1f), c, ring / 0.035f);
                        float ring2 = Mathf.Abs(d - 0.42f);
                        if (ring2 < 0.02f && (Mathf.Atan2(dy, dx) * 4f % 1f + 1f) % 1f > 0.3f) c = Color.Lerp(new Color(0.3f, 0.5f, 1f), c, ring2 / 0.02f);
                        if (d < 0.18f) c = Color.Lerp(new Color(0.6f, 0.95f, 1f), new Color(0.1f, 0.9f, 1f), d / 0.18f);
                        px[y * n + x] = c;
                    }
                tex.SetPixels32(px);
                tex.Apply();
                File.WriteAllBytes(path, tex.EncodeToPNG());
                Object.DestroyImmediate(tex);
                AssetDatabase.ImportAsset(path);
            }
            var icon = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            if (icon != null) PlayerSettings.SetIcons(NamedBuildTarget.Unknown, new[] { icon }, IconKind.Any);
        }

        static void CreateScenes()
        {
            EnsureFolder(ScenesFolder);
            var active = SceneManager.GetActiveScene();
            string activePath = active.path;
            foreach (var name in new[] { "Bootstrap", "MainMenu", "Derelict", "Veyra" })
            {
                string path = ScenesFolder + "/" + name + ".unity";
                if (File.Exists(path)) continue;
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                // Scenes are intentionally empty: GameBootstrap starts the game and the world builders
                // construct each location procedurally. The note documents this for anyone opening them.
                var note = new GameObject("README: built at runtime by BODY.OS (see Scripts/World)");
                note.AddComponent<SceneNote>().text = name == "Veyra"
                    ? "Expansion stub. VEYRA is not playable yet: add a VeyraBuilder and a case in WorldBuilders.Build."
                    : "This scene is populated at runtime by GameBootstrap/WorldBuilders.";
                EditorSceneManager.SaveScene(scene, path);
            }
            if (!string.IsNullOrEmpty(activePath) && File.Exists(activePath)) EditorSceneManager.OpenScene(activePath);
            else EditorSceneManager.OpenScene(ScenesFolder + "/Bootstrap.unity");
        }

        static void ConfigureBuildSettings()
        {
            var scenes = new EditorBuildSettingsScene[BuildScenes.Length];
            for (int i = 0; i < BuildScenes.Length; i++)
                scenes[i] = new EditorBuildSettingsScene(ScenesFolder + "/" + BuildScenes[i] + ".unity", true);
            EditorBuildSettings.scenes = scenes;
            EditorUserBuildSettings.buildAppBundle = false;
            EditorUserBuildSettings.development = true;
            if (BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android))
            {
                if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                    EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
            }
            else Debug.LogWarning("[BODY.OS] Android Build Support is not installed. Add it in Unity Hub > Installs > Add modules.");
        }

        public static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }
    }
}
#endif

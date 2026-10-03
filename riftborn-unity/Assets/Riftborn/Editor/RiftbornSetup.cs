// Riftborn — one-click project setup. Runs by itself the first time the
// project is opened (and again from the menu: Riftborn → Set up project):
// makes the game scene, the material templates, turns on ARCore (Android)
// and ARKit (iPhone), and sets the player settings AR needs.
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.Management;

namespace Riftborn.EditorTools
{
    [InitializeOnLoad]
    public static class RiftbornSetup
    {
        const string DONE = "ProjectSettings/RiftbornSetup.txt";
        public const string SCENE = "Assets/Scenes/Riftborn.unity";
        const string MATS = "Assets/Riftborn/Resources/Materials";

        static RiftbornSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (!File.Exists(DONE) && !EditorApplication.isPlayingOrWillChangePlaymode) Run();
            };
        }

        [MenuItem("Riftborn/Set up project", priority = 1)]
        public static void Run()
        {
            Materials();
            Scene();
            Player();
            XR();
            AssetDatabase.SaveAssets();
            File.WriteAllText(DONE, "Riftborn setup done. Delete this file to run it again on open.\n");
            Debug.Log("Riftborn: project set up. Press Play to try it here (WASD to walk), or Riftborn → Build Android APK.");
        }

        static void Folder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            var parent = Path.GetDirectoryName(path).Replace('\\', '/');
            Folder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        // Template materials in Resources, so builds include the shader
        // variants the game uses.
        static void Materials()
        {
            Folder(MATS);
            void Make(string name, string shader, params string[] keywords)
            {
                string path = $"{MATS}/{name}.mat";
                if (AssetDatabase.LoadAssetAtPath<Material>(path) != null) return;
                var s = Shader.Find(shader);
                if (s == null) { Debug.LogError($"Riftborn: shader {shader} not found."); return; }
                var m = new Material(s);
                foreach (var k in keywords) m.EnableKeyword(k);
                if (keywords.Length > 0)
                {
                    m.SetTexture("_BumpMap", Texture2D.normalTexture);
                    m.SetTexture("_DetailNormalMap", Texture2D.normalTexture);
                    m.SetTexture("_DetailAlbedoMap", Texture2D.grayTexture);
                    m.SetTexture("_EmissionMap", Texture2D.blackTexture);
                    m.SetColor("_EmissionColor", Color.black);
                    m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
                }
                AssetDatabase.CreateAsset(m, path);
            }
            Make("RB_Solid", "Standard");
            Make("RB_Skin", "Standard", "_NORMALMAP", "_DETAIL_MULX2", "_EMISSION");
            Make("RB_Unlit", "Riftborn/Unlit");
            Make("RB_Glow", "Riftborn/Additive");
            Make("RB_Shadow", "Riftborn/ShadowCatcher");
        }

        // An empty scene: the game builds everything itself when it starts.
        static void Scene()
        {
            if (!File.Exists(SCENE))
            {
                Folder("Assets/Scenes");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                // Fog on in the scene so builds keep the fog shader variants.
                RenderSettings.fog = true;
                RenderSettings.fogMode = FogMode.Linear;
                RenderSettings.fogStartDistance = 300;
                RenderSettings.fogEndDistance = 1000;
                EditorSceneManager.SaveScene(scene, SCENE);
            }
            else if (EditorSceneManager.GetActiveScene().path != SCENE && !EditorSceneManager.GetActiveScene().isDirty)
                EditorSceneManager.OpenScene(SCENE);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(SCENE, true) };
        }

        static void Player()
        {
            PlayerSettings.companyName = "Riftborn";
            PlayerSettings.productName = "Riftborn";
#if UNITY_2021_2_OR_NEWER
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.riftborn.game");
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, "com.riftborn.game");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
#else
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, "com.riftborn.game");
            PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.iOS, "com.riftborn.game");
            PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android, ScriptingImplementation.IL2CPP);
#endif
            PlayerSettings.bundleVersion = "1.0.0";
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;

            // Android: ARCore needs Android 7+, 64-bit (IL2CPP, ARM64) and OpenGL ES 3.
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.OpenGLES3 });

            // iPhone: say why the camera and location are needed.
            PlayerSettings.iOS.cameraUsageDescription = "Riftborn uses the camera to show creatures in AR.";
            PlayerSettings.iOS.locationUsageDescription = "Riftborn uses your location to put Rifts and creatures around you.";
            PlayerSettings.iOS.targetOSVersionString = "13.0";

            // Use both input systems: the Input System package for touch
            // and keys, the old one for GPS and the compass.
            var ps = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (ps.Length > 0)
            {
                var so = new SerializedObject(ps[0]);
                var p = so.FindProperty("activeInputHandler");
                if (p != null && p.intValue != 2)
                {
                    p.intValue = 2;
                    so.ApplyModifiedProperties();
                    Debug.Log("Riftborn: Active Input Handling set to Both. Unity may ask to restart the editor — say yes.");
                }
            }
        }

        // Turn on ARCore for Android and ARKit for iPhone.
        static void XR()
        {
            if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out XRGeneralSettingsPerBuildTarget per) || per == null)
            {
                Folder("Assets/XR");
                per = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(per, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, per, true);
            }
            foreach (var (group, loader) in new[] { (BuildTargetGroup.Android, "UnityEngine.XR.ARCore.ARCoreLoader"), (BuildTargetGroup.iOS, "UnityEngine.XR.ARKit.ARKitLoader") })
            {
                if (!per.HasManagerSettingsForBuildTarget(group)) per.CreateDefaultManagerSettingsForBuildTarget(group);
                var settings = per.SettingsForBuildTarget(group);
                settings.InitManagerOnStart = true;
                if (!XRPackageMetadataStore.AssignLoader(settings.Manager, loader, group))
                    Debug.LogWarning($"Riftborn: couldn't turn on {loader}. Do it in Project Settings → XR Plug-in Management.");
                EditorUtility.SetDirty(settings);
            }
            EditorUtility.SetDirty(per);
        }

        /* ------------------ Builds ------------------ */

        [MenuItem("Riftborn/Build Android APK", priority = 20)]
        public static void BuildApk() => Build(false);

        [MenuItem("Riftborn/Build and run on Android phone (USB)", priority = 21)]
        public static void BuildAndRun() => Build(true);

        static void Build(bool run)
        {
            if (!File.Exists(DONE)) Run();
            Directory.CreateDirectory("Builds");
            var opts = new BuildPlayerOptions
            {
                scenes = new[] { SCENE },
                locationPathName = "Builds/Riftborn.apk",
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = run ? BuildOptions.AutoRunPlayer : BuildOptions.None,
            };
            EditorUserBuildSettings.buildAppBundle = false;
            var report = BuildPipeline.BuildPlayer(opts);
            if (report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                Debug.Log($"Riftborn: built {Path.GetFullPath(opts.locationPathName)} ({report.summary.totalSize / 1048576} MB).");
                if (!run)
                {
                    EditorUtility.RevealInFinder(opts.locationPathName);
                    EditorUtility.DisplayDialog("Riftborn: phone app ready", $"Your app is {Path.GetFullPath(opts.locationPathName)}\n\nTo install it:\n1. Copy Riftborn.apk to your phone (USB cable, Google Drive or email).\n2. Tap it on the phone. If asked, allow installing apps from that source.\n3. Open Riftborn and allow location and camera.", "OK");
                }
            }
            else Debug.LogError("Riftborn: Android build failed. Check that Android Build Support (with SDK, NDK and OpenJDK) is installed in Unity Hub.");
        }

        // A Windows game you can run without Unity: Builds/Windows/Riftborn.exe.
        // On a PC there's no AR or GPS, so encounters happen in 3D and you
        // walk with WASD.
        [MenuItem("Riftborn/Build Windows game (.exe)", priority = 19)]
        public static void BuildWindows()
        {
            if (!File.Exists(DONE)) Run();
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 800;
            PlayerSettings.resizableWindow = true;
            Directory.CreateDirectory("Builds/Windows");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { SCENE },
                locationPathName = "Builds/Windows/Riftborn.exe",
                target = BuildTarget.StandaloneWindows64,
                targetGroup = BuildTargetGroup.Standalone,
            });
            if (report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                Debug.Log($"Riftborn: built {Path.GetFullPath("Builds/Windows/Riftborn.exe")} ({report.summary.totalSize / 1048576} MB). Double-click it to play.");
                EditorUtility.RevealInFinder("Builds/Windows/Riftborn.exe");
            }
            else Debug.LogError("Riftborn: Windows build failed. Look at the red lines above for why.");
        }

        [MenuItem("Riftborn/Build iPhone Xcode project", priority = 22)]
        public static void BuildIos()
        {
            if (!File.Exists(DONE)) Run();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { SCENE }, locationPathName = "Builds/iOS", target = BuildTarget.iOS, targetGroup = BuildTargetGroup.iOS });
            if (report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorUtility.RevealInFinder("Builds/iOS");
            else Debug.LogError("Riftborn: iOS build failed. It needs iOS Build Support in Unity Hub, then Xcode on a Mac to install it.");
        }
    }
}

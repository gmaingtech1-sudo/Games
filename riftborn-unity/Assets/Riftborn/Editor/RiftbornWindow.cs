// Riftborn — a control panel in the editor (Riftborn → Open Riftborn window).
// It opens by itself with the project. It has big buttons to play the game,
// build it for Windows, Android or iPhone, and hook up imported Asset Store
// art, and it shows what's set up.
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Riftborn.EditorTools
{
    [InitializeOnLoad]
    public class RiftbornWindow : EditorWindow
    {
        static RiftbornWindow()
        {
            // Once per editor session, when the project opens.
            EditorApplication.delayCall += () =>
            {
                if (SessionState.GetBool("RiftbornWindowShown", false) || EditorApplication.isPlayingOrWillChangePlaymode) return;
                SessionState.SetBool("RiftbornWindowShown", true);
                Open();
            };
        }

        [MenuItem("Riftborn/Open Riftborn window", priority = 0)]
        public static void Open()
        {
            var w = GetWindow<RiftbornWindow>("Riftborn");
            w.minSize = new Vector2(340, 520);
            w.Show();
        }

        Vector2 scroll;

        void OnGUI()
        {
            var title = new GUIStyle(EditorStyles.boldLabel) { fontSize = 22, alignment = TextAnchor.MiddleCenter };
            var big = new GUIStyle(GUI.skin.button) { fontSize = 16, fontStyle = FontStyle.Bold, fixedHeight = 46 };
            var btn = new GUIStyle(GUI.skin.button) { fontSize = 13, fixedHeight = 32 };
            var note = new GUIStyle(EditorStyles.wordWrappedLabel) { fontSize = 12 };

            scroll = EditorGUILayout.BeginScrollView(scroll);
            GUILayout.Space(10);
            GUILayout.Label("RIFTBORN", title);
            GUILayout.Label("The game builds itself when you press Play, so the scene looks empty in the editor. That's normal.", note);
            GUILayout.Space(8);

            if (EditorApplication.isPlaying)
            {
                GUI.backgroundColor = new Color(1f, 0.55f, 0.55f);
                if (GUILayout.Button("■  Stop playing", big)) EditorApplication.isPlaying = false;
                GUI.backgroundColor = Color.white;
                GUILayout.Label("Click the Game view first. WASD or arrow keys walk, Shift runs, drag turns, scroll zooms, click things to use them.", note);
            }
            else
            {
                GUI.backgroundColor = new Color(0.45f, 1f, 0.8f);
                if (GUILayout.Button("▶  Play the game", big)) Play();
                GUI.backgroundColor = Color.white;
            }

            GUILayout.Space(10);
            GUI.backgroundColor = new Color(1f, 0.8f, 0.4f);
            if (GUILayout.Button("📱  Make phone app (Android)", big)) Later(PhoneApp);
            GUI.backgroundColor = Color.white;
            GUILayout.Label("Makes Builds/Riftborn.apk. Copy it to your phone and open it to install, or plug the phone in with USB and use \"Build and run\" below.", note);

            GUILayout.Space(14);
            GUILayout.Label("Make the game", EditorStyles.boldLabel);
            if (GUILayout.Button("Build Windows game (.exe)", btn)) Later(RiftbornSetup.BuildWindows);
            GUILayout.Label("Makes Builds/Windows/Riftborn.exe in this project's folder. Double-click it to play on a PC (no AR or GPS there, so you walk with WASD and catch in 3D).", note);
            GUILayout.Space(4);
            if (GUILayout.Button("Build Android APK", btn)) Later(RiftbornSetup.BuildApk);
            if (GUILayout.Button("Build and run on Android phone (USB)", btn)) Later(RiftbornSetup.BuildAndRun);
            GUILayout.Label("Needs Android Build Support from Unity Hub. With AR, GPS and the camera on the phone.", note);
            if (GUILayout.Button("Open the Builds folder", btn))
            {
                Directory.CreateDirectory("Builds");
                EditorUtility.RevealInFinder(Path.GetFullPath("Builds"));
            }

            GUILayout.Space(14);
            GUILayout.Label("Dinosaurs, portals and effects", EditorStyles.boldLabel);
            var links = AssetDatabase.LoadAssetAtPath<AssetLinks>(RiftbornAssets.LINKS);
            if (links == null) GUILayout.Label("Not hooked up yet. Import the packs, then click below.", note);
            else
            {
                int used = links.species.Count((s) => s.model >= 0);
                int fx = new[] { links.dartHit, links.bullseye, links.blastHit, links.strikeHit, links.catchBurst, links.breakout, links.appear, links.guard, links.hack, links.claim, links.levelUp, links.projectile }.Count((x) => x != null);
                GUILayout.Label($"Dinosaur models: {links.dinosaurs.Count}" + (links.dinosaurs.Count > 0 ? $" ({string.Join(", ", links.dinosaurs.Select((d) => d.name))})" : ""), note);
                GUILayout.Label($"Species using them: {used} of {Species.All.Length}", note);
                GUILayout.Label($"Portals: {links.portals.Count}    Effect slots filled: {fx} of 12", note);
            }
            if (GUILayout.Button("Use imported assets (find them again)", btn)) Later(RiftbornAssets.Menu);
            if (GUILayout.Button("Show asset links (change what's used)", btn)) RiftbornAssets.Show();

            GUILayout.Space(14);
            GUILayout.Label("If something's wrong", EditorStyles.boldLabel);
            if (GUILayout.Button("Set up project again", btn)) Later(RiftbornSetup.Run);
            GUILayout.Label("Fixes pink objects and missing settings. Red lines in the Console tab say what went wrong.", note);
            EditorGUILayout.EndScrollView();
        }

        // Builds and dialogs run after this window has finished drawing.
        static void Later(System.Action a) => EditorApplication.delayCall += () => a();

        // Android needs Unity's Android Build Support; say how to get it.
        public static void PhoneApp()
        {
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android))
            {
                EditorUtility.DisplayDialog("Riftborn: one more thing first",
                    "To make a phone app, Unity needs Android Build Support:\n\n" +
                    "1. Close Unity and open Unity Hub.\n" +
                    "2. Click Installs, then the cog next to your Unity 6 version, then Add modules.\n" +
                    "3. Tick Android Build Support, with OpenJDK and Android SDK & NDK Tools under it.\n" +
                    "4. Click Install, wait, then open Riftborn again and click Make phone app.", "OK");
                return;
            }
            if (!EditorUtility.DisplayDialog("Riftborn", "Make the Android phone app now? The first time takes 10–20 minutes while Unity prepares Android. Unity is busy until it's done.", "Make it", "Not now")) return;
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
            RiftbornSetup.BuildApk();
        }

        static void Play()
        {
            if (!File.Exists("ProjectSettings/RiftbornSetup.txt")) RiftbornSetup.Run();
            var active = EditorSceneManager.GetActiveScene();
            if (File.Exists(RiftbornSetup.SCENE) && active.path != RiftbornSetup.SCENE)
            {
                if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
                EditorSceneManager.OpenScene(RiftbornSetup.SCENE);
            }
            EditorApplication.EnterPlaymode();
        }

        void OnInspectorUpdate() => Repaint();
    }
}

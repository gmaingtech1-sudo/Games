#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace BodyOS.EditorTools
{
    /// <summary>
    /// Android APK builds from the menu or the command line:
    ///   Unity -batchmode -nographics -quit -projectPath body-os -executeMethod BodyOS.EditorTools.AndroidBuilder.BuildDevelopmentApk -logFile build.log
    /// The APK is written to body-os/Builds/Android/.
    /// </summary>
    public static class AndroidBuilder
    {
        const string OutputFolder = "Builds/Android";

        [MenuItem("BODY.OS/Build Android APK (Development)", priority = 20)]
        public static void BuildDevelopmentApk() { Build(true); }

        [MenuItem("BODY.OS/Build Android APK (Release, debug-signed)", priority = 21)]
        public static void BuildReleaseApk() { Build(false); }

        static void Build(bool development)
        {
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Android, BuildTarget.Android))
            {
                Fail("Android Build Support is not installed for this editor (Unity Hub > Installs > Add modules > Android Build Support, including OpenJDK and Android SDK & NDK Tools).");
                return;
            }
            BodyOSProjectSetup.Run();

            var scenes = new string[BodyOSProjectSetup.BuildScenes.Length];
            for (int i = 0; i < scenes.Length; i++) scenes[i] = BodyOSProjectSetup.ScenesFolder + "/" + BodyOSProjectSetup.BuildScenes[i] + ".unity";

            Directory.CreateDirectory(OutputFolder);
            string file = Path.Combine(OutputFolder, development ? "BodyOS-BeyondExistence-dev.apk" : "BodyOS-BeyondExistence.apk");
            EditorUserBuildSettings.buildAppBundle = false;

            var options = new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = file,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = development ? (BuildOptions.Development | BuildOptions.AllowDebugging) : BuildOptions.None,
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            var summary = report.summary;
            if (summary.result == BuildResult.Succeeded)
            {
                Debug.Log("[BODY.OS] APK built: " + Path.GetFullPath(file) + " (" + (summary.totalSize / (1024 * 1024)) + " MB)");
                if (Application.isBatchMode) EditorApplication.Exit(0);
                else EditorUtility.RevealInFinder(file);
            }
            else Fail("Build " + summary.result + " with " + summary.totalErrors + " error(s). See the Console/log for details.");
        }

        static void Fail(string message)
        {
            Debug.LogError("[BODY.OS] " + message);
            if (Application.isBatchMode) EditorApplication.Exit(1);
            else EditorUtility.DisplayDialog("BODY.OS Android build", message, "OK");
        }
    }
}
#endif

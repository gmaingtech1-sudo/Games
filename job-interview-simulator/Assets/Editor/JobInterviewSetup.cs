using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

// The first time the project is opened, this makes an empty scene, saves it and
// adds it to the build settings. The game builds itself when you press Play.
[InitializeOnLoad]
public static class JobInterviewSetup
{
    const string ScenePath = "Assets/Scenes/Interview.unity";

    static JobInterviewSetup()
    {
        EditorApplication.delayCall += Setup;
    }

    static void Setup()
    {
        if (EditorApplication.isPlayingOrWillChangePlaymode) return;

        if (!System.IO.File.Exists(ScenePath))
        {
            if (SceneManager.GetActiveScene().isDirty) return; // never throw away someone's unsaved work
            if (!AssetDatabase.IsValidFolder("Assets/Scenes")) AssetDatabase.CreateFolder("Assets", "Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        if (EditorBuildSettings.scenes.Length == 0)
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };

        if (string.IsNullOrEmpty(SceneManager.GetActiveScene().path) && !SceneManager.GetActiveScene().isDirty)
            EditorSceneManager.OpenScene(ScenePath);
    }
}

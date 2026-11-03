using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Starts BODY.OS automatically in any scene, so the game runs even before the editor setup has
    /// generated scenes. The Bootstrap scene therefore only needs to exist for Build Settings.
    /// </summary>
    public static class GameBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            Game.EnsureExists();
        }
    }
}

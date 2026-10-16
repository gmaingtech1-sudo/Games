using UnityEngine;

namespace Wayfarer
{
    /// <summary>Starts the game automatically when you press Play in any scene,
    /// or when a built player loads its first scene.</summary>
    public static class Bootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Start()
        {
            Game.Boot();
        }
    }
}

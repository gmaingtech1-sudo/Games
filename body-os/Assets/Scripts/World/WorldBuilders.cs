using UnityEngine;

namespace BodyOS
{
    public struct SpawnPoint
    {
        public Vector3 position;
        public float yaw;
    }

    /// <summary>
    /// Entry point for building playable locations. To add a destination: write a builder (see
    /// DerelictBuilder), add a case here, and give its LocationDefinition a playableKey.
    /// </summary>
    public static class WorldBuilders
    {
        public static SpawnPoint LastSpawn { get; private set; }

        public static SpawnPoint Build(string key)
        {
            SpawnPoint spawn;
            switch (key)
            {
                // case "veyra": spawn = VeyraBuilder.Build(); break;   // expansion point
                case "derelict":
                default:
                    spawn = DerelictBuilder.Build();
                    break;
            }
            LastSpawn = spawn;
            return spawn;
        }

        public static void SetCheckpoint(SpawnPoint p) { LastSpawn = p; }
    }
}

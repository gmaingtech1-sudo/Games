using System;
using UnityEngine;

namespace BodyOS
{
    [Serializable]
    public class MemoryFragment
    {
        public string id;
        [Tooltip("Memory attribute needed to recover this fragment.")]
        public int memoryRequired = 5;
        [TextArea] public string text;
    }

    /// <summary>A discoverable location (a room on the ship or a planet-level destination).</summary>
    [CreateAssetMenu(menuName = "BODY.OS/Location", fileName = "Location")]
    public class LocationDefinition : ScriptableObject
    {
        public string id;
        public string displayName;
        [TextArea] public string description;
        [Tooltip("Planet-level destination shown in Navigation, rather than a room.")]
        public bool isDestination;
        [Tooltip("Scene/builder key for playable destinations. Empty = not yet playable.")]
        public string playableKey = "";
        public string lockedReason = "";
        public int discoveryXp = 25;
        public MemoryFragment[] fragments = new MemoryFragment[0];
    }
}

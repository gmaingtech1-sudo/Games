using System;
using UnityEngine;

namespace BodyOS
{
    [Serializable]
    public class ObjectiveDefinition
    {
        [Tooltip("Story flag that completes this objective, e.g. scanned.bulkhead")]
        public string flag;
        public string text;
        [Tooltip("Shown after the objective has been active for a while, without giving the solution away.")]
        public string hint;
        public int xp = 30;
        public int pointReward;
    }

    /// <summary>A linear mission made of flag-driven objectives. Add new missions as assets.</summary>
    [CreateAssetMenu(menuName = "BODY.OS/Mission", fileName = "Mission")]
    public class MissionDefinition : ScriptableObject
    {
        public string id = "mission";
        public string title = "Mission";
        [TextArea] public string summary = "";
        [Tooltip("Flag that makes this mission available. Empty = available immediately.")]
        public string startFlag = "";
        public ObjectiveDefinition[] objectives = new ObjectiveDefinition[0];
        public int rewardXp = 100;
        public int rewardPoints = 1;
        public int rewardNanites;
        [Tooltip("Flag set when the mission completes.")]
        public string completeFlag = "";
    }
}

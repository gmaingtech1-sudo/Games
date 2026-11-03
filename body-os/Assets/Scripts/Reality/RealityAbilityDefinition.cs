using UnityEngine;

namespace BodyOS
{
    public enum RealityAbilityType { ReducedGravity, TimeDistortion, SpatialAnomaly, DimensionalPerception, MatterInteraction }

    /// <summary>Data for a reality-manipulation ability. Behaviour lives in an IRealityEffect handler.</summary>
    [CreateAssetMenu(menuName = "BODY.OS/Reality Ability", fileName = "Ability")]
    public class RealityAbilityDefinition : ScriptableObject
    {
        public string id = "ability";
        public string displayName = "Ability";
        [Tooltip("Short label for the HUD quick-slot button.")]
        public string shortName = "ABIL";
        [TextArea] public string description = "";
        public RealityAbilityType type;
        public float energyCost = 25f;
        public float duration = 8f;
        public float cooldown = 15f;
        [Tooltip("Upgrade id that unlocks this ability (via an UnlockAbility effect).")]
        public string unlockedBy = "";
        public Color color = new Color(0.7f, 0.35f, 1f);
        [Tooltip("Effect radius for area abilities.")]
        public float radius = 15f;
    }
}

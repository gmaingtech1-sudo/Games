using System;
using UnityEngine;

namespace BodyOS
{
    public enum UpgradeCategory { Movement, Senses, Energy, Protection, Recovery, Scanner, Neural, Reality }

    public enum UpgradeEffectType
    {
        MaxEnergy,          // +value per tier
        MaxHealth,
        BodyBudget,
        BrainBudget,
        StatCap,            // +value cap for 'stat' per tier
        RegenMultiplier,    // +value (fraction) per tier
        ProtectionCold,
        ProtectionToxic,
        ProtectionRadiation,
        ScannerRange,       // +value (fraction) per tier
        VisionDrainMultiplier, // -value (fraction) per tier
        UnlockVision,       // key = VisionModeId name
        UnlockAbility,      // key = ability id
        SuitCapacity,
    }

    [Serializable]
    public class UpgradeEffect
    {
        public UpgradeEffectType type;
        public float valuePerTier = 1f;
        public StatId stat;
        public string key = "";
    }

    /// <summary>
    /// Data-driven technology upgrade. Create new upgrades as assets via
    /// Assets > Create > BODY.OS > Upgrade and place them in a Resources/ScriptableObjects/Upgrades folder;
    /// no code changes are needed. Assets with the same id override the built-in defaults.
    /// </summary>
    [CreateAssetMenu(menuName = "BODY.OS/Upgrade", fileName = "Upgrade")]
    public class UpgradeDefinition : ScriptableObject
    {
        public string id = "new_upgrade";
        public string displayName = "New Upgrade";
        [TextArea] public string description = "";
        public UpgradeCategory category;
        [Min(1)] public int maxTier = 1;
        [Tooltip("Upgrade point cost for each tier (index 0 = tier 1).")]
        public int[] pointCost = { 1 };
        [Tooltip("Nanite cost for each tier (index 0 = tier 1).")]
        public int[] naniteCost = { 0 };
        public int requiredLevel = 1;
        public string[] requiredUpgrades = new string[0];
        [Tooltip("Story flags that must be set, e.g. schematic.thermal or mission.wake.complete.")]
        public string[] requiredFlags = new string[0];
        [Tooltip("Shown while requiredFlags are missing.")]
        public string lockedHint = "";
        public UpgradeEffect[] effects = new UpgradeEffect[0];

        public int PointCost(int tier) { return CostAt(pointCost, tier); }
        public int NaniteCost(int tier) { return CostAt(naniteCost, tier); }

        static int CostAt(int[] costs, int tier)
        {
            if (costs == null || costs.Length == 0) return 0;
            return costs[Mathf.Clamp(tier - 1, 0, costs.Length - 1)];
        }
    }
}

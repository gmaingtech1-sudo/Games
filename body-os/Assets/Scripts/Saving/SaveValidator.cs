using System.Collections.Generic;
using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Structural validation of loaded data: removes nulls, clamps numbers into sane ranges and drops
    /// duplicate entries. Rule-dependent checks (stat caps that depend on upgrades, unknown upgrade ids)
    /// are applied afterwards by the systems that own those rules.
    /// </summary>
    public static class SaveValidator
    {
        public static void Validate(SaveData d)
        {
            if (d.vitals == null) d.vitals = new VitalsData();
            if (d.progress == null) d.progress = new ProgressData();
            if (d.inventory == null) d.inventory = new InventoryData();
            if (d.story == null) d.story = new StoryData();
            if (d.upgrades == null) d.upgrades = new List<UpgradeState>();
            if (d.presets == null) d.presets = new List<ConfigPreset>();
            if (d.abilitySlots == null) d.abilitySlots = new List<string>();
            while (d.abilitySlots.Count < 2) d.abilitySlots.Add("");
            if (string.IsNullOrEmpty(d.activeVision)) d.activeVision = "Normal";
            if (float.IsNaN(d.playTimeSeconds) || d.playTimeSeconds < 0) d.playTimeSeconds = 0;

            d.vitals.health = SafeRange(d.vitals.health, 1f, 1000f, 100f);
            d.vitals.energy = SafeRange(d.vitals.energy, 0f, 1000f, 100f);
            d.vitals.suit = SafeRange(d.vitals.suit, 0f, 100f, 100f);

            var p = d.progress;
            p.level = Mathf.Clamp(p.level, 1, ProgressionSystem.MaxLevel);
            p.xp = Mathf.Max(0, p.xp);
            p.upgradePoints = Mathf.Clamp(p.upgradePoints, 0, 999);
            p.discoveredLocations = Clean(p.discoveredLocations);
            p.revealedFragments = Clean(p.revealedFragments);

            var items = new List<ItemStack>();
            if (d.inventory.items != null)
                foreach (var it in d.inventory.items)
                    if (it != null && !string.IsNullOrEmpty(it.id) && it.amount > 0)
                    {
                        it.amount = Mathf.Min(it.amount, 9999);
                        items.Add(it);
                    }
            d.inventory.items = items;

            var ups = new List<UpgradeState>();
            foreach (var u in d.upgrades)
                if (u != null && !string.IsNullOrEmpty(u.id) && u.tier > 0 && ups.FindIndex(x => x.id == u.id) < 0) ups.Add(u);
            d.upgrades = ups;

            var presets = new List<ConfigPreset>();
            foreach (var pr in d.presets)
                if (pr != null && !string.IsNullOrEmpty(pr.id) && presets.FindIndex(x => x.id == pr.id) < 0) presets.Add(pr);
            d.presets = presets;

            var s = d.story;
            s.flags = Clean(s.flags);
            if (s.missions == null) s.missions = new List<MissionState>();
            s.missions.RemoveAll(m => m == null || string.IsNullOrEmpty(m.id));
            if (s.log == null) s.log = new List<string>();
            if (s.activeMission == null) s.activeMission = "";
            if (string.IsNullOrEmpty(s.location)) s.location = "derelict";
            if (float.IsNaN(s.posX) || float.IsNaN(s.posY) || float.IsNaN(s.posZ) || Mathf.Abs(s.posY) > 500f) s.hasPosition = false;

            // Stats are re-checked against caps/budgets by BodySystem once upgrades are known;
            // here we only guarantee the array shape.
            var stats = d.stats;
            StatRules.Sanitize(ref stats, _ => StatRules.AbsoluteMax, 999, 999);
            d.stats = stats;
        }

        public static void Validate(GameSettings s)
        {
            s.masterVolume = SafeRange(s.masterVolume, 0f, 1f, 0.9f);
            s.musicVolume = SafeRange(s.musicVolume, 0f, 1f, 0.6f);
            s.sfxVolume = SafeRange(s.sfxVolume, 0f, 1f, 0.85f);
            s.cameraSensitivity = SafeRange(s.cameraSensitivity, 0.2f, 3f, 1f);
            s.controlSensitivity = SafeRange(s.controlSensitivity, 0.5f, 2f, 1f);
            s.uiScale = SafeRange(s.uiScale, 0.8f, 1.3f, 1f);
            s.graphicsQuality = Mathf.Clamp(s.graphicsQuality, 0, 2);
        }

        static float SafeRange(float v, float min, float max, float fallback)
        {
            if (float.IsNaN(v) || float.IsInfinity(v)) return fallback;
            return Mathf.Clamp(v, min, max);
        }

        static List<string> Clean(List<string> list)
        {
            var result = new List<string>();
            if (list == null) return result;
            foreach (var s in list)
                if (!string.IsNullOrEmpty(s) && !result.Contains(s)) result.Add(s);
            return result;
        }
    }
}

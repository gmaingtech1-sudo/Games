using System.Collections.Generic;
using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Installs data-driven upgrades and aggregates their effects into cached totals. Every other system
    /// reads totals from here, so a new upgrade only needs a definition with existing effect types.
    /// </summary>
    public sealed class UpgradeSystem
    {
        readonly Game game;
        readonly float[] totals = new float[System.Enum.GetValues(typeof(UpgradeEffectType)).Length];
        readonly int[] statCapBonus = new int[StatRules.Count];
        readonly HashSet<string> unlockedVisions = new HashSet<string>();
        readonly HashSet<string> unlockedAbilities = new HashSet<string>();

        public UpgradeSystem(Game game)
        {
            this.game = game;
            // Drop upgrades that no longer exist in the content and clamp tiers to the definition.
            game.Data.upgrades.RemoveAll(u => game.Content.Upgrade(u.id) == null);
            foreach (var u in game.Data.upgrades) u.tier = Mathf.Clamp(u.tier, 0, game.Content.Upgrade(u.id).maxTier);
            Recompute();
        }

        public int Tier(string id)
        {
            var s = game.Data.upgrades.Find(u => u.id == id);
            return s != null ? s.tier : 0;
        }

        public float Total(UpgradeEffectType t) => totals[(int)t];
        public int StatCapBonus(StatId id) => statCapBonus[(int)id];
        public bool VisionUnlocked(string mode) => unlockedVisions.Contains(mode);
        public bool AbilityUnlocked(string id) => unlockedAbilities.Contains(id);
        public int InstalledCount => game.Data.upgrades.Count;

        void Recompute()
        {
            System.Array.Clear(totals, 0, totals.Length);
            System.Array.Clear(statCapBonus, 0, statCapBonus.Length);
            unlockedVisions.Clear();
            unlockedAbilities.Clear();
            foreach (var state in game.Data.upgrades)
            {
                var def = game.Content.Upgrade(state.id);
                if (def == null || state.tier <= 0 || def.effects == null) continue;
                foreach (var fx in def.effects)
                {
                    if (fx == null) continue;
                    switch (fx.type)
                    {
                        case UpgradeEffectType.StatCap: statCapBonus[(int)fx.stat] += Mathf.RoundToInt(fx.valuePerTier * state.tier); break;
                        case UpgradeEffectType.UnlockVision: unlockedVisions.Add(fx.key); break;
                        case UpgradeEffectType.UnlockAbility: unlockedAbilities.Add(fx.key); break;
                        default: totals[(int)fx.type] += fx.valuePerTier * state.tier; break;
                    }
                }
            }
        }

        public enum State { Available, Installed, Locked, CannotAfford }

        /// <summary>Evaluates whether the next tier can be installed and why not.</summary>
        public State Evaluate(UpgradeDefinition def, out string reason)
        {
            int tier = Tier(def.id);
            reason = "";
            if (tier >= def.maxTier) { reason = "Fully installed"; return State.Installed; }
            if (game.Progression.Level < def.requiredLevel) { reason = "Requires level " + def.requiredLevel; return State.Locked; }
            if (def.requiredUpgrades != null)
                foreach (var r in def.requiredUpgrades)
                    if (!string.IsNullOrEmpty(r) && Tier(r) <= 0)
                    {
                        var rd = game.Content.Upgrade(r);
                        reason = "Requires " + (rd != null ? rd.displayName : r);
                        return State.Locked;
                    }
            if (def.requiredFlags != null)
                foreach (var f in def.requiredFlags)
                    if (!string.IsNullOrEmpty(f) && !game.HasFlag(f))
                    {
                        reason = string.IsNullOrEmpty(def.lockedHint) ? "Locked" : def.lockedHint;
                        return State.Locked;
                    }
            int pts = def.PointCost(tier + 1), nan = def.NaniteCost(tier + 1);
            if (game.Progression.Points < pts) { reason = "Needs " + pts + " upgrade point" + (pts == 1 ? "" : "s"); return State.CannotAfford; }
            if (game.Inventory.Count("nanites") < nan) { reason = "Needs " + nan + " nanites"; return State.CannotAfford; }
            return State.Available;
        }

        public bool Install(string id)
        {
            var def = game.Content.Upgrade(id);
            if (def == null) return false;
            if (Evaluate(def, out string reason) != State.Available)
            {
                AudioManager.I?.Play(Sfx.Denied);
                GameEvents.Notify(def.displayName + ": " + reason, NoticeType.Warning);
                return false;
            }
            int tier = Tier(id) + 1;
            int nan = def.NaniteCost(tier);
            game.Progression.SpendPoints(def.PointCost(tier));
            if (nan > 0) game.Inventory.Remove("nanites", nan);

            var s = game.Data.upgrades.Find(u => u.id == id);
            if (s == null) { s = new UpgradeState { id = id, tier = 0 }; game.Data.upgrades.Add(s); }
            s.tier = tier;
            Recompute();

            AudioManager.I?.Play(Sfx.Upgrade);
            Game.Vibrate();
            GameEvents.Notify("INSTALLED: " + def.displayName + (def.maxTier > 1 ? " (tier " + tier + ")" : ""), NoticeType.Success);
            game.Log("Installed " + def.displayName + " tier " + tier + ".");
            game.SetFlag("upgrade." + id);
            game.Reality.AutoAssignSlots();
            game.Vitals.OnCapacityChanged();
            game.Body.Revalidate(false);
            GameEvents.RaiseStats();
            GameEvents.RaiseAbilities();
            GameEvents.RaiseVision();
            game.SaveGame(false);
            return true;
        }

        /// <summary>System Restore: uninstalls everything and refunds all points and nanites, so no player can soft-lock.</summary>
        public void RefundAll()
        {
            int pts = 0, nan = 0;
            foreach (var s in game.Data.upgrades)
            {
                var def = game.Content.Upgrade(s.id);
                if (def == null) continue;
                for (int t = 1; t <= s.tier; t++) { pts += def.PointCost(t); nan += def.NaniteCost(t); }
            }
            game.Data.upgrades.Clear();
            Recompute();
            game.Progression.AddPoints(pts);
            if (nan > 0) game.Inventory.Add("nanites", nan, false);
            game.Reality.CancelAll();
            game.Body.Revalidate(true);
            game.Vision.ValidateMode();
            game.Vitals.OnCapacityChanged();
            AudioManager.I?.Play(Sfx.Reality);
            GameEvents.Notify("System Restore complete. Refunded " + pts + " points and " + nan + " nanites.", NoticeType.Info);
            game.Log("System Restore: upgrades refunded.");
            GameEvents.RaiseStats();
            GameEvents.RaiseAbilities();
            GameEvents.RaiseVision();
            game.SaveGame(false);
        }
    }
}

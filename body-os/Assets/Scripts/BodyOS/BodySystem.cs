using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Owns the current BODY.OS attribute values (stored in SaveData.stats) and enforces caps and
    /// allocation budgets. Derived gameplay values are computed here and read by the player controller,
    /// vitals, interactions and UI, so there is exactly one source of truth.
    /// </summary>
    public sealed class BodySystem
    {
        readonly Game game;
        public BodySystem(Game game)
        {
            this.game = game;
            Revalidate(false);
        }

        int[] V => game.Data.stats;

        public int Get(StatId id) => V[(int)id];
        public int[] Snapshot() => (int[])V.Clone();

        public int Cap(StatId id) => Mathf.Clamp(StatRules.BaseCap + game.Upgrades.StatCapBonus(id), StatRules.Min, StatRules.AbsoluteMax);
        public int BodyBudget => StatRules.BaseBodyBudget + Mathf.RoundToInt(game.Upgrades.Total(UpgradeEffectType.BodyBudget));
        public int BrainBudget => StatRules.BaseBrainBudget + Mathf.RoundToInt(game.Upgrades.Total(UpgradeEffectType.BrainBudget));
        public int BudgetFor(StatPool pool) => pool == StatPool.Body ? BodyBudget : pool == StatPool.Brain ? BrainBudget : 0;
        public int Used(StatPool pool) => StatRules.PoolTotal(V, pool);
        public int Free(StatPool pool) => BudgetFor(pool) - Used(pool);

        /// <summary>Highest value this stat can be set to right now (cap and free allocation).</summary>
        public int MaxSettable(StatId id)
        {
            var pool = StatRules.Get(id).Pool;
            int cap = Cap(id);
            if (pool == StatPool.None) return cap;
            return Mathf.Min(cap, Get(id) + Mathf.Max(0, Free(pool)));
        }

        /// <summary>Attempts to set an attribute. Fails with a reason if it would exceed a cap or budget.</summary>
        public bool TrySet(StatId id, int value, out string reason)
        {
            reason = "";
            value = Mathf.Clamp(value, StatRules.Min, StatRules.AbsoluteMax);
            int old = Get(id);
            if (value == old) return true;
            if (value > Cap(id))
            {
                reason = StatRules.Get(id).Name + " is capped at " + Cap(id) + ". Technology upgrades can raise the cap.";
                return false;
            }
            var pool = StatRules.Get(id).Pool;
            if (pool != StatPool.None && value > old && Used(pool) - old + value > BudgetFor(pool))
            {
                reason = (pool == StatPool.Body ? "Bio" : "Neural") + "-allocation full (" + Used(pool) + "/" + BudgetFor(pool) + "). Lower another attribute first.";
                return false;
            }
            V[(int)id] = value;
            OnChanged(id);
            return true;
        }

        /// <summary>Applies a full value set (preset). Values are sanitised against caps and budgets first.
        /// Returns true if the preset had to be adapted.</summary>
        public bool ApplyAll(int[] values)
        {
            var copy = values != null ? (int[])values.Clone() : StatRules.DefaultValues();
            bool adapted = StatRules.Sanitize(ref copy, Cap, BodyBudget, BrainBudget);
            int oldMemory = Get(StatId.Memory);
            System.Array.Copy(copy, V, StatRules.Count);
            game.SetFlag("os.adjusted");
            GameEvents.RaiseStats();
            if (Get(StatId.Memory) != oldMemory) game.Progression.RevealFragments();
            return adapted;
        }

        /// <summary>Re-applies caps/budgets, e.g. after loading or after upgrades are refunded.</summary>
        public void Revalidate(bool notify)
        {
            var v = game.Data.stats;
            bool changed = StatRules.Sanitize(ref v, Cap, BodyBudget, BrainBudget);
            game.Data.stats = v;
            if (changed && notify) GameEvents.Notify("Configuration adapted to current hardware limits.", NoticeType.Warning);
            if (changed) GameEvents.RaiseStats();
        }

        public void ResetToBalanced()
        {
            ApplyAll(StatRules.DefaultValues());
            GameEvents.Notify("Configuration recalibrated to balanced defaults.", NoticeType.Info);
        }

        void OnChanged(StatId id)
        {
            game.SetFlag("os.adjusted");
            GameEvents.RaiseStats();
            if (id == StatId.Memory) game.Progression.RevealFragments();
        }

        // ---------------- Derived values ----------------

        public float Throttle => Get(StatId.EnergyThrottle);
        public float BaseMoveSpeed => StatRules.MoveSpeed(Get(StatId.Speed), Get(StatId.EnergyThrottle));
        public float BaseJumpHeight => StatRules.JumpHeight(Get(StatId.Jump), Get(StatId.EnergyThrottle));
        public int Strength => Get(StatId.Strength);
        public float ConsumptionMultiplier => StatRules.ThrottleConsumption(Get(StatId.EnergyThrottle));
        public float EnduranceMultiplier => StatRules.EnduranceDrain(Get(StatId.Endurance));
        public float ThreatRadius => StatRules.ThreatRadius(Get(StatId.ThreatDetection));
        public bool ThreatDirection => StatRules.ThreatShowsDirection(Get(StatId.ThreatDetection));
        public float CalibrationWindow => StatRules.CalibrationWindow(Get(StatId.Reaction));
        public float CalibrationSpeed => StatRules.CalibrationSpeed(Get(StatId.Reaction));
        public float InterferenceChance => StatRules.InterferenceChance(Get(StatId.Concentration));
        public float AnalysisTime => StatRules.AnalysisTimeMultiplier(Get(StatId.Analysis));
        public float AnalysisCost => StatRules.AnalysisCostMultiplier(Get(StatId.Analysis));

        /// <summary>Human-readable consequence of an attribute value, shown under each slider.</summary>
        public string DescribeEffect(StatId id, int value)
        {
            int t = Get(StatId.EnergyThrottle);
            switch (id)
            {
                case StatId.Strength: return "Push objects up to mass class " + value + ".";
                case StatId.Speed: return "Move speed " + StatRules.MoveSpeed(value, t).ToString("0.0") + " m/s. Movement drain x" + (value / 5f).ToString("0.00") + ".";
                case StatId.Jump: return "Jump height " + StatRules.JumpHeight(value, t).ToString("0.00") + " m (normal gravity).";
                case StatId.Endurance: return "Sustained drain x" + StatRules.EnduranceDrain(value).ToString("0.00") + " (movement, vision).";
                case StatId.Recovery: return "Energy regen " + (StatRules.EnergyRegen(value) * (1f + game.Upgrades.Total(UpgradeEffectType.RegenMultiplier))).ToString("0.00") + "/s, health regen " + StatRules.HealthRegen(value).ToString("0.0") + "/s.";
                case StatId.EnergyThrottle: return "Performance x" + StatRules.ThrottlePerformance(value).ToString("0.00") + ", consumption x" + StatRules.ThrottleConsumption(value).ToString("0.00") + ".";
                case StatId.Reaction: return "Calibration window " + Mathf.RoundToInt(StatRules.CalibrationWindow(value) * 100) + "%, marker speed " + StatRules.CalibrationSpeed(value).ToString("0.00") + ".";
                case StatId.Concentration: return "Interference disrupts scans " + Mathf.RoundToInt(StatRules.InterferenceChance(value) * 100) + "% of the time.";
                case StatId.Memory: return "Recovers memory fragments rated " + value + " or lower.";
                case StatId.ThreatDetection: return "Detect hostiles within " + StatRules.ThreatRadius(value).ToString("0") + " m" + (StatRules.ThreatShowsDirection(value) ? " with direction." : ". 7+ shows direction.");
                case StatId.Analysis: return "Scan time and energy x" + StatRules.AnalysisTimeMultiplier(value).ToString("0.00") + ".";
            }
            return "";
        }
    }
}

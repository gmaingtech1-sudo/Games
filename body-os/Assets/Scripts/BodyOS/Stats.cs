using System;
using UnityEngine;

namespace BodyOS
{
    /// <summary>Every adjustable BODY.OS attribute. Append new values at the end to keep saves compatible.</summary>
    public enum StatId
    {
        // Body
        Strength = 0,
        Speed = 1,
        Jump = 2,
        Endurance = 3,
        Recovery = 4,
        EnergyThrottle = 5,
        // Brain
        Reaction = 6,
        Concentration = 7,
        Memory = 8,
        ThreatDetection = 9,
        Analysis = 10,
    }

    public enum StatPool { Body, Brain, None }

    public sealed class StatInfo
    {
        public StatId Id;
        public string Name;
        public string Description;
        public StatPool Pool;
        public int Default = 5;
    }

    /// <summary>
    /// Pure balancing rules for BODY.OS attributes. Kept free of MonoBehaviours so it can be unit tested.
    ///
    /// Balance model:
    ///  - every attribute ranges 1..10 but is capped (default 8) until upgrades raise the cap;
    ///  - body and brain attributes each draw from a shared allocation budget, so raising one
    ///    attribute means lowering another until upgrades expand the budget;
    ///  - body attributes above the balanced value (5) add passive "overclock" energy drain;
    ///  - Energy Throttle is a trade-off dial: more performance for more consumption.
    /// </summary>
    public static class StatRules
    {
        public const int Count = 11;
        public const int Min = 1;
        public const int AbsoluteMax = 10;
        public const int BaseCap = 8;
        public const int Balanced = 5;
        public const int BaseBodyBudget = 26;
        public const int BaseBrainBudget = 26;

        public static readonly StatInfo[] Info =
        {
            new StatInfo { Id = StatId.Strength, Pool = StatPool.Body, Name = "Strength",
                Description = "Myofiber output. Determines the heaviest object you can push." },
            new StatInfo { Id = StatId.Speed, Pool = StatPool.Body, Name = "Movement Speed",
                Description = "Locomotion actuator output. Faster exploration, higher movement drain." },
            new StatInfo { Id = StatId.Jump, Pool = StatPool.Body, Name = "Jump Height",
                Description = "Leg actuator burst. Reach higher platforms." },
            new StatInfo { Id = StatId.Endurance, Pool = StatPool.Body, Name = "Endurance",
                Description = "Reduces the energy cost of sustained activity: movement and vision modes." },
            new StatInfo { Id = StatId.Recovery, Pool = StatPool.Body, Name = "Recovery Efficiency",
                Description = "Energy and health regeneration rate." },
            new StatInfo { Id = StatId.EnergyThrottle, Pool = StatPool.None, Name = "Energy Consumption",
                Description = "Power throttle. Higher settings boost speed and jump but drain energy faster. Does not use allocation." },
            new StatInfo { Id = StatId.Reaction, Pool = StatPool.Brain, Name = "Reaction Speed",
                Description = "Widens the success window and slows the marker in timed calibrations." },
            new StatInfo { Id = StatId.Concentration, Pool = StatPool.Brain, Name = "Concentration",
                Description = "Resists interference that interrupts scans and analysis." },
            new StatInfo { Id = StatId.Memory, Pool = StatPool.Brain, Name = "Memory",
                Description = "Recovers memory fragments about discovered locations." },
            new StatInfo { Id = StatId.ThreatDetection, Pool = StatPool.Brain, Name = "Threat Detection",
                Description = "Detection range for hostiles. 7+ shows their direction." },
            new StatInfo { Id = StatId.Analysis, Pool = StatPool.Brain, Name = "Analysis Efficiency",
                Description = "Scans and analysis take less time and energy." },
        };

        public static StatInfo Get(StatId id) { return Info[(int)id]; }

        public static int[] DefaultValues()
        {
            var v = new int[Count];
            for (int i = 0; i < Count; i++) v[i] = Info[i].Default;
            return v;
        }

        public static int PoolTotal(int[] values, StatPool pool)
        {
            int sum = 0;
            for (int i = 0; i < Count && i < values.Length; i++)
                if (Info[i].Pool == pool) sum += values[i];
            return sum;
        }

        /// <summary>
        /// Clamps an arbitrary (possibly corrupted or edited) value array to the rules:
        /// correct length, per-stat range and caps, and pool budgets. When a pool is over budget the
        /// highest attributes are reduced first. Returns true if anything had to be changed.
        /// </summary>
        public static bool Sanitize(ref int[] values, Func<StatId, int> capOf, int bodyBudget, int brainBudget)
        {
            bool changed = false;
            if (values == null) { values = DefaultValues(); changed = true; }
            if (values.Length != Count)
            {
                var fixedValues = DefaultValues();
                for (int i = 0; i < Count && i < values.Length; i++) fixedValues[i] = values[i];
                values = fixedValues;
                changed = true;
            }
            for (int i = 0; i < Count; i++)
            {
                int cap = Mathf.Clamp(capOf((StatId)i), Min, AbsoluteMax);
                int c = Mathf.Clamp(values[i], Min, cap);
                if (c != values[i]) { values[i] = c; changed = true; }
            }
            changed |= FitBudget(values, StatPool.Body, bodyBudget);
            changed |= FitBudget(values, StatPool.Brain, brainBudget);
            return changed;
        }

        static bool FitBudget(int[] values, StatPool pool, int budget)
        {
            bool changed = false;
            int guard = 200;
            while (PoolTotal(values, pool) > budget && guard-- > 0)
            {
                int best = -1;
                for (int i = 0; i < Count; i++)
                    if (Info[i].Pool == pool && values[i] > Min && (best < 0 || values[i] > values[best])) best = i;
                if (best < 0) break;
                values[best]--;
                changed = true;
            }
            return changed;
        }

        // ---------- Derived gameplay values (all fictional game mechanics) ----------

        /// <summary>Performance multiplier from the energy throttle (0.92 .. 1.10).</summary>
        public static float ThrottlePerformance(int throttle) { return 0.90f + 0.02f * throttle; }
        /// <summary>Energy consumption multiplier from the energy throttle (0.6 .. 1.5).</summary>
        public static float ThrottleConsumption(int throttle) { return 0.5f + 0.1f * throttle; }
        /// <summary>Sustained-activity drain multiplier from endurance (1.24 .. 0.70).</summary>
        public static float EnduranceDrain(int endurance) { return 1.30f - 0.06f * endurance; }

        public static float MoveSpeed(int speed, int throttle) { return (2.6f + 0.48f * speed) * ThrottlePerformance(throttle); }
        public static float JumpHeight(int jump, int throttle) { return (0.55f + 0.2f * jump) * ThrottlePerformance(throttle); }
        public static float EnergyRegen(int recovery) { return 0.4f + 0.12f * recovery; }
        public static float HealthRegen(int recovery) { return 0.3f + 0.1f * recovery; }

        /// <summary>Calibration success window as a fraction of the bar.</summary>
        public static float CalibrationWindow(int reaction) { return 0.08f + 0.025f * reaction; }
        /// <summary>Calibration marker speed in sweeps per second.</summary>
        public static float CalibrationSpeed(int reaction) { return 1.6f - 0.08f * reaction; }
        /// <summary>Chance that an interference spike interrupts a scan (per spike).</summary>
        public static float InterferenceChance(int concentration) { return Mathf.Clamp01(0.70f - 0.07f * concentration); }
        public static float ThreatRadius(int threat) { return 6f + 2.5f * threat; }
        public static bool ThreatShowsDirection(int threat) { return threat >= 7; }
        public static float AnalysisTimeMultiplier(int analysis) { return 1.4f - 0.08f * analysis; }
        public static float AnalysisCostMultiplier(int analysis) { return 1.4f - 0.08f * analysis; }

        /// <summary>Passive drain caused by running body attributes above the balanced value.</summary>
        public static float OverclockDrain(int[] values)
        {
            int over = 0;
            for (int i = 0; i < Count && i < values.Length; i++)
                if (Info[i].Pool == StatPool.Body && values[i] > Balanced) over += values[i] - Balanced;
            return over * 0.06f;
        }
    }
}

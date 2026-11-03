using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace BodyOS.Tests
{
    /// <summary>
    /// Edit-mode tests (Window > General > Test Runner > EditMode). They cover balancing rules, content
    /// integrity, puzzle solvability and save-data robustness without needing a scene.
    /// </summary>
    public class StatRulesTests
    {
        [Test]
        public void DefaultsAreBalancedAndWithinBudget()
        {
            var v = StatRules.DefaultValues();
            Assert.AreEqual(StatRules.Count, v.Length);
            Assert.LessOrEqual(StatRules.PoolTotal(v, StatPool.Body), StatRules.BaseBodyBudget);
            Assert.LessOrEqual(StatRules.PoolTotal(v, StatPool.Brain), StatRules.BaseBrainBudget);
            Assert.AreEqual(0f, StatRules.OverclockDrain(v), 1e-5f);
        }

        [Test]
        public void SanitizeFixesLengthRangeCapsAndBudget()
        {
            var v = new[] { 10, 10, 10, 10, 10, 99, -4 }; // too short, out of range, over budget
            bool changed = StatRules.Sanitize(ref v, _ => StatRules.BaseCap, StatRules.BaseBodyBudget, StatRules.BaseBrainBudget);
            Assert.IsTrue(changed);
            Assert.AreEqual(StatRules.Count, v.Length);
            foreach (var x in v) Assert.That(x, Is.InRange(StatRules.Min, StatRules.BaseCap));
            Assert.LessOrEqual(StatRules.PoolTotal(v, StatPool.Body), StatRules.BaseBodyBudget);
            Assert.LessOrEqual(StatRules.PoolTotal(v, StatPool.Brain), StatRules.BaseBrainBudget);
        }

        [Test]
        public void SanitizeNullProducesDefaults()
        {
            int[] v = null;
            StatRules.Sanitize(ref v, _ => StatRules.BaseCap, StatRules.BaseBodyBudget, StatRules.BaseBrainBudget);
            CollectionAssert.AreEqual(StatRules.DefaultValues(), v);
        }

        [Test]
        public void DerivedValuesIncreaseWithAttributes()
        {
            for (int i = 1; i < 10; i++)
            {
                Assert.Less(StatRules.MoveSpeed(i, 5), StatRules.MoveSpeed(i + 1, 5));
                Assert.Less(StatRules.JumpHeight(i, 5), StatRules.JumpHeight(i + 1, 5));
                Assert.Less(StatRules.EnergyRegen(i), StatRules.EnergyRegen(i + 1));
                Assert.Greater(StatRules.EnduranceDrain(i), StatRules.EnduranceDrain(i + 1));
                Assert.Less(StatRules.CalibrationWindow(i), StatRules.CalibrationWindow(i + 1));
                Assert.Greater(StatRules.InterferenceChance(i), StatRules.InterferenceChance(i + 1) - 1e-6f);
            }
        }

        [Test]
        public void CharacterCannotBecomeInfinitelyPowerful()
        {
            // Absolute maximums with every cap raised and throttle maxed.
            Assert.Less(StatRules.MoveSpeed(10, 10), 9f);
            Assert.Less(StatRules.JumpHeight(10, 10), 3f);
            Assert.Greater(StatRules.ThrottleConsumption(10), StatRules.ThrottleConsumption(5));
        }
    }

    public class PuzzleDesignTests
    {
        // Geometry constants from DerelictBuilder.
        const float CatwalkHeight = 1.9f;
        const float LowGravityShelf = 3.0f, LowGravity = 0.4f;
        const float LabLedge = 3.8f, ReducedGravity = 0.35f;

        [Test]
        public void CatwalkNeedsJumpAdjustment()
        {
            Assert.Less(StatRules.JumpHeight(5, 5), CatwalkHeight, "Default jump must not reach the catwalk");
            Assert.Greater(StatRules.JumpHeight(7, 5), CatwalkHeight, "Jump 7 must reach the catwalk");
            // Jump 7 is achievable within the base budget (cap 8) by lowering other attributes.
            Assert.LessOrEqual(7, StatRules.BaseCap);
        }

        [Test]
        public void LowGravityShelfReachableOnlyInLowGravity()
        {
            Assert.Less(StatRules.JumpHeight(StatRules.AbsoluteMax, 10), LowGravityShelf);
            Assert.Greater(StatRules.JumpHeight(5, 5) / LowGravity, LowGravityShelf);
        }

        [Test]
        public void LabLedgeNeedsReducedGravityAbility()
        {
            Assert.Less(StatRules.JumpHeight(StatRules.AbsoluteMax, 10), LabLedge);
            Assert.Greater(StatRules.JumpHeight(5, 5) / ReducedGravity, LabLedge);
        }

        [Test]
        public void PulseBarrierRequiresTimeDistortion()
        {
            const float depth = 2.6f, offTime = 0.2f, distortion = 0.2f;
            float fastest = StatRules.MoveSpeed(StatRules.AbsoluteMax, 10);
            Assert.Greater(depth / fastest, offTime, "Barrier must be uncrossable at normal time flow");
            Assert.Less(depth / StatRules.MoveSpeed(5, 5), offTime / distortion, "Barrier must be crossable with Time Distortion at default speed");
        }
    }

    public class ContentTests
    {
        [Test]
        public void UpgradeIdsUniqueAndRequirementsResolve()
        {
            var ups = DefaultContent.Upgrades();
            var ids = new HashSet<string>();
            foreach (var u in ups) Assert.IsTrue(ids.Add(u.id), "Duplicate upgrade id " + u.id);
            var abilities = new HashSet<string>();
            foreach (var a in DefaultContent.Abilities()) abilities.Add(a.id);
            foreach (var u in ups)
            {
                Assert.GreaterOrEqual(u.maxTier, 1);
                Assert.IsNotEmpty(u.pointCost);
                foreach (var r in u.requiredUpgrades) Assert.IsTrue(ids.Contains(r), u.id + " requires unknown " + r);
                foreach (var fx in u.effects)
                    if (fx.type == UpgradeEffectType.UnlockAbility) Assert.IsTrue(abilities.Contains(fx.key), u.id + " unlocks unknown ability " + fx.key);
            }
        }

        [Test]
        public void EveryAbilityCanBeUnlocked()
        {
            var unlocked = new HashSet<string>();
            foreach (var u in DefaultContent.Upgrades())
                foreach (var fx in u.effects)
                    if (fx.type == UpgradeEffectType.UnlockAbility) unlocked.Add(fx.key);
            foreach (var a in DefaultContent.Abilities())
            {
                Assert.IsTrue(unlocked.Contains(a.id), a.id + " has no unlocking upgrade");
                Assert.Greater(a.energyCost, 0f);
                Assert.Greater(a.cooldown, 0f);
            }
        }

        [Test]
        public void PresetsRespectBaseRules()
        {
            foreach (var p in DefaultContent.Presets())
            {
                Assert.AreEqual(StatRules.Count, p.stats.Length, p.id);
                var v = (int[])p.stats.Clone();
                bool changed = StatRules.Sanitize(ref v, _ => StatRules.BaseCap, StatRules.BaseBodyBudget, StatRules.BaseBrainBudget);
                Assert.IsFalse(changed, "Preset " + p.id + " violates base caps or budgets");
            }
        }

        [Test]
        public void MissionsAreWellFormed()
        {
            foreach (var m in DefaultContent.Missions())
            {
                Assert.IsNotEmpty(m.objectives, m.id);
                foreach (var o in m.objectives)
                {
                    Assert.IsFalse(string.IsNullOrEmpty(o.flag), m.id + " has an objective without a flag");
                    Assert.IsFalse(string.IsNullOrEmpty(o.text));
                }
            }
        }

        [Test]
        public void UnfinishedDestinationsAreNotMarkedPlayable()
        {
            foreach (var l in DefaultContent.Locations())
                if (l.isDestination && l.id != "derelict") Assert.IsTrue(string.IsNullOrEmpty(l.playableKey), l.id + " should be locked");
        }
    }

    public class SaveDataTests
    {
        [Test]
        public void RoundTripPreservesProgress()
        {
            var d = new SaveData();
            d.progress.level = 4; d.progress.xp = 37; d.progress.upgradePoints = 2;
            d.upgrades.Add(new UpgradeState { id = "kinetic_actuators", tier = 1 });
            d.story.flags.Add("power.bulkhead");
            d.stats[(int)StatId.Jump] = 7;
            string json = JsonUtility.ToJson(d);
            var back = new SaveData();
            JsonUtility.FromJsonOverwrite(json, back);
            SaveValidator.Validate(back);
            Assert.AreEqual(4, back.progress.level);
            Assert.AreEqual(37, back.progress.xp);
            Assert.AreEqual(1, back.upgrades.Count);
            Assert.Contains("power.bulkhead", back.story.flags);
            Assert.AreEqual(7, back.stats[(int)StatId.Jump]);
        }

        [Test]
        public void MissingOptionalFieldsKeepDefaults()
        {
            // An older save without abilitySlots/presets/vitals must load without losing progress.
            const string json = "{\"version\":1,\"progress\":{\"level\":3,\"xp\":10,\"upgradePoints\":1}}";
            var d = new SaveData();
            JsonUtility.FromJsonOverwrite(json, d);
            SaveValidator.Validate(d);
            Assert.AreEqual(3, d.progress.level);
            Assert.AreEqual(2, d.abilitySlots.Count);
            Assert.AreEqual(100f, d.vitals.health);
            Assert.AreEqual(StatRules.Count, d.stats.Length);
        }

        [Test]
        public void InvalidValuesAreRepaired()
        {
            var d = new SaveData();
            d.vitals.health = float.NaN;
            d.vitals.energy = -50f;
            d.progress.level = 999;
            d.progress.upgradePoints = -3;
            d.stats = new[] { 50, -2 };
            d.upgrades.Add(null);
            d.upgrades.Add(new UpgradeState { id = "", tier = 1 });
            d.inventory.items.Add(new ItemStack { id = "nanites", amount = -5 });
            d.story.posY = float.NaN; d.story.hasPosition = true;
            SaveValidator.Validate(d);
            Assert.AreEqual(100f, d.vitals.health);
            Assert.AreEqual(0f, d.vitals.energy);
            Assert.AreEqual(ProgressionSystem.MaxLevel, d.progress.level);
            Assert.AreEqual(0, d.progress.upgradePoints);
            Assert.AreEqual(StatRules.Count, d.stats.Length);
            Assert.AreEqual(0, d.upgrades.Count);
            Assert.AreEqual(0, d.inventory.items.Count);
            Assert.IsFalse(d.story.hasPosition);
        }

        [Test]
        public void SettingsAreClamped()
        {
            var s = new GameSettings { masterVolume = 5f, uiScale = 0.1f, graphicsQuality = 9, cameraSensitivity = float.PositiveInfinity };
            SaveValidator.Validate(s);
            Assert.AreEqual(1f, s.masterVolume);
            Assert.AreEqual(0.8f, s.uiScale, 1e-5f);
            Assert.AreEqual(2, s.graphicsQuality);
            Assert.AreEqual(1f, s.cameraSensitivity);
        }

        [Test]
        public void XpCurveIsIncreasing()
        {
            for (int l = 1; l < ProgressionSystem.MaxLevel; l++)
                Assert.Less(ProgressionSystem.XpForLevel(l), ProgressionSystem.XpForLevel(l + 1));
        }
    }
}

using UnityEngine;

namespace BodyOS
{
    /// <summary>Per-second energy flows, exposed for the Diagnostics panel so consumption is understandable.</summary>
    public struct EnergyBreakdown
    {
        public float regen, passive, overclock, movement, vision, environment;
        public float Drain => passive + overclock + movement + vision + environment;
        public float Net => regen - Drain;
    }

    /// <summary>
    /// Health, energy and suit (environmental protection) reserves.
    ///
    /// Energy model (all per second): regeneration from Recovery, minus a small passive drain, minus
    /// overclock drain for body attributes above balanced, minus movement drain (scaled by speed and
    /// endurance), minus vision-mode drain, minus environmental drain (cold). Abilities pay up-front costs.
    /// Ordinary exploration with normal or night vision stays net positive, so energy only becomes a
    /// concern when using expensive modes, abilities or hazardous areas.
    /// </summary>
    public sealed class VitalsSystem
    {
        public const float LowEnergyFraction = 0.2f;
        public const float CriticalEnergyFraction = 0.06f;

        readonly Game game;
        public float Health { get; private set; }
        public float Energy { get; private set; }
        public float Suit { get; private set; }
        public EnergyBreakdown Breakdown { get; private set; }
        public bool PlayerMoving { get; set; }

        float regenDelay;
        float healthRegenDelay;
        bool lowWarned, criticalWarned;
        float raiseTimer;

        public VitalsSystem(Game game)
        {
            this.game = game;
            var v = game.Data.vitals;
            Health = Mathf.Clamp(v.health, 1f, MaxHealth);
            Energy = Mathf.Clamp(v.energy, 0f, MaxEnergy);
            Suit = Mathf.Clamp(v.suit, 0f, MaxSuit);
        }

        public float MaxHealth => 100f + game.Upgrades.Total(UpgradeEffectType.MaxHealth);
        public float MaxEnergy => 100f + game.Upgrades.Total(UpgradeEffectType.MaxEnergy);
        public float MaxSuit => 100f + game.Upgrades.Total(UpgradeEffectType.SuitCapacity);
        public float EnergyFraction => MaxEnergy > 0 ? Energy / MaxEnergy : 0f;
        public float HealthFraction => Health / MaxHealth;
        public float SuitFraction => Suit / MaxSuit;
        public bool IsLowEnergy => EnergyFraction < LowEnergyFraction;
        public bool IsCriticalEnergy => EnergyFraction < CriticalEnergyFraction;
        public float RegenMultiplier => 1f + game.Upgrades.Total(UpgradeEffectType.RegenMultiplier);

        /// <summary>Movement performance penalty when energy is nearly depleted ("low power mode").</summary>
        public float LowPowerSpeedMultiplier => IsCriticalEnergy ? 0.75f : 1f;

        public void Tick(float dt)
        {
            var body = game.Body;
            float cons = body.ConsumptionMultiplier;
            float endur = body.EnduranceMultiplier;

            var b = new EnergyBreakdown();
            b.passive = 0.25f * cons;
            b.overclock = StatRules.OverclockDrain(game.Data.stats) * cons;
            b.movement = PlayerMoving ? 0.35f * (body.Get(StatId.Speed) / 5f) * endur * cons : 0f;
            b.vision = game.Vision.CurrentDrain * endur * cons;
            b.environment = game.Environment.ExtraEnergyDrain;
            b.regen = regenDelay > 0f ? 0f : StatRules.EnergyRegen(body.Get(StatId.Recovery)) * RegenMultiplier;
            Breakdown = b;
            if (regenDelay > 0f) regenDelay -= dt;

            Energy = Mathf.Clamp(Energy + b.Net * dt, 0f, MaxEnergy);

            // Health regenerates slowly a few seconds after the last damage.
            if (healthRegenDelay > 0f) healthRegenDelay -= dt;
            else if (Health < MaxHealth && !game.Environment.IsDamaging)
                Health = Mathf.Min(MaxHealth, Health + StatRules.HealthRegen(body.Get(StatId.Recovery)) * RegenMultiplier * dt);

            CheckWarnings();

            raiseTimer -= dt;
            if (raiseTimer <= 0f) { raiseTimer = 0.1f; GameEvents.RaiseVitals(); }
        }

        void CheckWarnings()
        {
            float f = EnergyFraction;
            if (!lowWarned && f < LowEnergyFraction)
            {
                lowWarned = true;
                AudioManager.I?.Play(Sfx.LowEnergy);
                GameEvents.Notify("LOW ENERGY. Expensive modes and abilities are restricted. Find a recharge station.", NoticeType.Warning);
            }
            else if (lowWarned && f > LowEnergyFraction + 0.08f) lowWarned = false;

            if (!criticalWarned && f < CriticalEnergyFraction)
            {
                criticalWarned = true;
                AudioManager.I?.Play(Sfx.LowEnergy);
                Game.Vibrate();
                GameEvents.Notify("CRITICAL ENERGY. Low power mode: movement reduced.", NoticeType.Danger);
            }
            else if (criticalWarned && f > CriticalEnergyFraction + 0.05f) criticalWarned = false;
        }

        public bool CanSpend(float amount) => Energy >= amount;

        public bool TrySpend(float amount)
        {
            if (Energy < amount) return false;
            Energy -= amount;
            regenDelay = 1.5f;
            GameEvents.RaiseVitals();
            return true;
        }

        public void AddEnergy(float amount)
        {
            Energy = Mathf.Clamp(Energy + amount, 0f, MaxEnergy);
            GameEvents.RaiseVitals();
        }

        public void RefillAll()
        {
            Energy = MaxEnergy;
            Suit = MaxSuit;
            Health = Mathf.Min(MaxHealth, Health + 25f);
            GameEvents.RaiseVitals();
        }

        public void Heal(float amount)
        {
            Health = Mathf.Clamp(Health + amount, 0f, MaxHealth);
            GameEvents.RaiseVitals();
        }

        public void Damage(float amount, string source)
        {
            if (amount <= 0f || !game.InGame) return;
            Health -= amount;
            healthRegenDelay = 4f;
            UIRoot.I?.Fx.DamageFlash();
            GameEvents.RaiseVitals();
            if (Health <= 0f)
            {
                Health = 0f;
                game.Log("Collapsed: " + source + ".");
                game.RespawnAtCheckpoint();
            }
        }

        public void DrainSuit(float amount) { Suit = Mathf.Max(0f, Suit - amount); }
        public void ChargeSuit(float amount) { Suit = Mathf.Min(MaxSuit, Suit + amount); }

        public void ReviveAfterCollapse()
        {
            Health = MaxHealth;
            Energy = Mathf.Max(Energy, MaxEnergy * 0.5f);
            Suit = MaxSuit;
            healthRegenDelay = 0f;
            GameEvents.RaiseVitals();
        }

        public void OnCapacityChanged()
        {
            Health = Mathf.Min(Health, MaxHealth);
            Energy = Mathf.Min(Energy, MaxEnergy);
            Suit = Mathf.Min(Suit, MaxSuit);
            GameEvents.RaiseVitals();
        }

        public void WriteToSave()
        {
            var v = game.Data.vitals;
            v.health = Mathf.Max(1f, Health);
            v.energy = Energy;
            v.suit = Suit;
        }
    }
}

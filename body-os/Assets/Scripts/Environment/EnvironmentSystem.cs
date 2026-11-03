using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Evaluates the player's surroundings against their protection and applies gameplay effects:
    ///  - cold: raises energy consumption and slows movement when unprotected;
    ///  - toxic atmosphere: drains suit reserve, then health;
    ///  - radiation: drains suit reserve, then health;
    ///  - gravity: scales the player's gravity (jumping) and can add a drift force.
    /// Protection that meets a hazard's severity neutralises it. The suit reserve absorbs shortfalls,
    /// giving the player time to cross hazards before taking damage.
    /// </summary>
    public sealed class EnvironmentSystem
    {
        readonly Game game;
        public ZoneConditions Current { get; private set; } = ZoneConditions.ShipStandard;
        public HazardZone CurrentZone { get; private set; }
        public float ExtraEnergyDrain { get; private set; }
        public float SpeedMultiplier { get; private set; } = 1f;
        public bool IsDamaging { get; private set; }
        public int ColdDeficit { get; private set; }
        public int ToxicDeficit { get; private set; }
        public int RadiationDeficit { get; private set; }
        float pollTimer;
        float warnTimer;

        public EnvironmentSystem(Game game) { this.game = game; }

        public int ProtectionCold => 1 + Mathf.RoundToInt(game.Upgrades.Total(UpgradeEffectType.ProtectionCold));
        public int ProtectionToxic => Mathf.RoundToInt(game.Upgrades.Total(UpgradeEffectType.ProtectionToxic));
        public int ProtectionRadiation => Mathf.RoundToInt(game.Upgrades.Total(UpgradeEffectType.ProtectionRadiation));
        public float Gravity => Current.gravity;
        public Vector3 Drift => Current.drift;
        public bool HasDeficit => ColdDeficit > 0 || ToxicDeficit > 0 || RadiationDeficit > 0;

        public void Tick(float dt)
        {
            pollTimer -= dt;
            if (pollTimer <= 0f) { pollTimer = 0.2f; Poll(); }

            var v = game.Vitals;
            var c = Current;
            int cold = c.ColdSeverity, toxic = c.ToxicSeverity, rad = c.radiation;
            ColdDeficit = Mathf.Max(0, cold - ProtectionCold);
            ToxicDeficit = Mathf.Max(0, toxic - ProtectionToxic);
            RadiationDeficit = Mathf.Max(0, rad - ProtectionRadiation);

            // Extreme cold always costs some energy (heating), more when unprotected.
            ExtraEnergyDrain = cold * 0.35f + ColdDeficit * 0.8f;
            SpeedMultiplier = ColdDeficit > 0 ? 0.8f : 1f;

            int deficit = ToxicDeficit + RadiationDeficit + ColdDeficit;
            IsDamaging = false;
            if (deficit > 0)
            {
                if (v.Suit > 0f) v.DrainSuit(deficit * 7f * dt);
                else
                {
                    IsDamaging = true;
                    float dmg = (ToxicDeficit * 5f + RadiationDeficit * 6f + ColdDeficit * 2f) * dt;
                    v.Damage(dmg, c.name);
                }
            }
            else if (!c.IsHazardous) v.ChargeSuit(6f * dt);
            else v.ChargeSuit(1.5f * dt);

            warnTimer -= dt;
            if (IsDamaging && warnTimer <= 0f)
            {
                warnTimer = 4f;
                AudioManager.I?.Play(Sfx.Hazard);
                Game.Vibrate();
                GameEvents.Notify("SUIT DEPLETED. Taking environmental damage. Leave the area.", NoticeType.Danger);
            }
        }

        void Poll()
        {
            if (game.Player == null) return;
            Vector3 p = game.Player.transform.position + Vector3.up * 0.9f;
            HazardZone best = null;
            var zones = Registry<HazardZone>.Items;
            for (int i = 0; i < zones.Count; i++)
            {
                var z = zones[i];
                if (z.WorldBounds.Contains(p) && (best == null || z.priority > best.priority)) best = z;
            }
            if (best == CurrentZone) return;
            CurrentZone = best;
            Current = best != null ? best.conditions : ZoneConditions.ShipStandard;
            OnZoneChanged();
        }

        void OnZoneChanged()
        {
            var c = Current;
            if (CurrentZone != null)
            {
                string msg = BuildWarning(c);
                if (msg.Length > 0)
                {
                    AudioManager.I?.Play(Sfx.Hazard);
                    GameEvents.Notify(msg, HasDeficitFor(c) ? NoticeType.Danger : NoticeType.Warning);
                }
                if (Mathf.Abs(c.gravity - 1f) > 0.05f)
                    GameEvents.Notify("GRAVITY ANOMALY: " + c.gravity.ToString("0.0") + " g", NoticeType.Info);
                game.SetFlag("hazard.entered");
            }
            GameEvents.RaiseEnvironment();
        }

        bool HasDeficitFor(ZoneConditions c)
        {
            return c.ColdSeverity > ProtectionCold || c.ToxicSeverity > ProtectionToxic || c.radiation > ProtectionRadiation;
        }

        string BuildWarning(ZoneConditions c)
        {
            var sb = new System.Text.StringBuilder();
            if (c.ColdSeverity > 0) sb.Append("EXTREME COLD ").Append(c.temperature.ToString("0")).Append("°C (protection ").Append(ProtectionCold).Append('/').Append(c.ColdSeverity).Append(")  ");
            if (c.ToxicSeverity > 0) sb.Append(c.atmosphere == Atmosphere.Toxic ? "TOXIC ATMOSPHERE" : "THIN ATMOSPHERE").Append(" (protection ").Append(ProtectionToxic).Append('/').Append(c.ToxicSeverity).Append(")  ");
            if (c.radiation > 0) sb.Append("RADIATION ").Append(c.radiation).Append(" (protection ").Append(ProtectionRadiation).Append('/').Append(c.radiation).Append(")");
            return sb.ToString().Trim();
        }

        public static string AtmosphereName(Atmosphere a) { return a == Atmosphere.Safe ? "Breathable" : a == Atmosphere.Thin ? "Thin" : "Toxic"; }
    }
}

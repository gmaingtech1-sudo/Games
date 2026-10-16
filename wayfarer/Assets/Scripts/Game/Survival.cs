using UnityEngine;

namespace Wayfarer
{
    /// <summary>Life support, hazard protection, shield and health, and the
    /// planet's temperature where you stand.</summary>
    public sealed class Survival
    {
        public float Temperature;
        public float Exposure;          // current hazard strength 0..1
        public bool Sheltered;
        public float LastHit = -10f;
        public string Warning;
        float warnTimer;
        bool lowLifeWarned, lowHazardWarned;

        public bool Dead => Profile.Data.Health <= 0f;

        public void Tick(float dt, Game g)
        {
            var d = Profile.Data;
            var planet = g.View.Ref;
            bool onFoot = g.Mode == PlayerMode.OnFoot;
            Sheltered = !onFoot;
            Exposure = 0f;
            Temperature = 0f;
            Warning = null;

            if (planet != null)
            {
                var pd = planet.Data;
                Vector3d up = onFoot ? g.Player.Up : g.Ship.Pos.normalized;
                float day = planet.DayFactor(up, (Vector3d)g.View.SunDirRef);
                double alt = (onFoot ? g.Player.Pos.magnitude : g.Ship.Pos.magnitude) - pd.Radius;
                Temperature = (float)(pd.BaseTemperature + pd.DayNightSwing * (day - 0.5) * 2 - System.Math.Max(0, alt) * 0.0065 * 2.5);
                float lvl = (float)pd.HazardLevel;
                switch (pd.Hazard)
                {
                    case HazardType.Heat: Exposure = lvl * (0.55f + 0.7f * day); break;
                    case HazardType.Cold: Exposure = lvl * (0.55f + 0.7f * (1f - day)); break;
                    case HazardType.Toxic: Exposure = lvl; break;
                    case HazardType.Radiation: Exposure = lvl * (pd.HasAtmosphere ? 1f : 0.7f + 0.5f * day); break;
                }
                if (g.Player.Swimming && onFoot) Exposure *= 0.6f;
                if (onFoot && g.NearShelter()) Sheltered = true;
            }

            if (onFoot && planet != null && !Sheltered)
            {
                float lifeDrain = 0.24f / (1f + 0.3f * Profile.Level("suit_life"));
                if (g.Player.Jetting) lifeDrain *= 1.6f;
                d.LifeSupport = Mathf.Max(0f, d.LifeSupport - lifeDrain * dt);
                float hz = Exposure * 1.15f / (1f + 0.3f * Profile.Level("suit_hazard"));
                d.Hazard = Mathf.Max(0f, d.Hazard - hz * dt);
                if (d.LifeSupport <= 0f) Damage(2.5f * dt, "suffocation", g);
                if (d.Hazard <= 0f && Exposure > 0.02f) Damage(Exposure * 5f * dt, "exposure", g);
            }
            else
            {
                // inside the ship or a building everything slowly recovers
                d.Hazard = Mathf.Min(100f, d.Hazard + 6f * dt);
                if (!onFoot) d.LifeSupport = Mathf.Min(100f, d.LifeSupport + 0.6f * dt);
            }

            if (Time.time - LastHit > 5f)
            {
                d.Shield = Mathf.Min(100f, d.Shield + 14f * dt);
                if (d.Shield >= 100f && Exposure < 0.05f && d.LifeSupport > 0f) d.Health = Mathf.Min(100f, d.Health + 0.8f * dt);
            }

            // warnings
            warnTimer -= dt;
            if (onFoot && d.LifeSupport < 20f && !lowLifeWarned) { lowLifeWarned = true; g.Toast("Life support low: recharge it with Oxygen (Tab)", true); g.Audio.Play(Sfx.Warning); }
            if (d.LifeSupport > 30f) lowLifeWarned = false;
            if (onFoot && d.Hazard < 20f && Exposure > 0.05f && !lowHazardWarned) { lowHazardWarned = true; g.Toast("Hazard protection failing: recharge it with Sodium (Tab)", true); g.Audio.Play(Sfx.Warning); }
            if (d.Hazard > 30f) lowHazardWarned = false;
            if (onFoot && (d.LifeSupport <= 0f || d.Hazard <= 0f && Exposure > 0.02f)) Warning = d.LifeSupport <= 0f ? "LIFE SUPPORT DEPLETED" : "HAZARD PROTECTION FAILED";
        }

        public void Damage(float amount, string cause, Game g)
        {
            var d = Profile.Data;
            LastHit = Time.time;
            float s = Mathf.Min(d.Shield, amount);
            d.Shield -= s;
            amount -= s;
            if (amount > 0) d.Health = Mathf.Max(0f, d.Health - amount);
            g.Post.Damage = Mathf.Max(g.Post.Damage, Mathf.Clamp01(0.25f + amount * 0.05f + s * 0.02f));
        }

        public static void Refill()
        {
            var d = Profile.Data;
            d.Health = 100; d.Shield = 100; d.LifeSupport = 100; d.Hazard = 100;
        }
    }
}

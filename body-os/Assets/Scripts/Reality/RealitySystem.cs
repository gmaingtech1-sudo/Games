using System.Collections.Generic;
using UnityEngine;

namespace BodyOS
{
    /// <summary>Objects that can be slowed by Time Distortion implement this and register in Registry&lt;ITimeScalable&gt;.</summary>
    public interface ITimeScalable
    {
        Vector3 Position { get; }
        /// <summary>Multiplier applied to the object's own delta time (1 = normal).</summary>
        float LocalTimeScale { get; set; }
    }

    /// <summary>Behaviour of one reality ability. Add a new ability by implementing this and registering it.</summary>
    public interface IRealityEffect
    {
        void Begin(RealitySystem sys, RealityAbilityDefinition def);
        void Tick(RealitySystem sys, RealityAbilityDefinition def, float dt);
        void End(RealitySystem sys, RealityAbilityDefinition def);
    }

    /// <summary>
    /// Modular, controlled reality manipulation. Each ability has an unlock requirement (upgrade),
    /// an up-front energy cost, a duration and a cooldown. There is deliberately no free-form world
    /// editing: abilities only affect objects designed for them (ITimeScalable, SpatialPortal,
    /// PhaseLockedObject, hidden VisionTargets) and the player's own gravity response.
    /// </summary>
    public sealed class RealitySystem
    {
        public sealed class Runtime
        {
            public RealityAbilityDefinition def;
            public float active;
            public float cooldown;
            public bool IsActive => active > 0f;
            public float ActiveFraction => def.duration > 0 ? active / def.duration : 0f;
            public float CooldownFraction => def.cooldown > 0 ? cooldown / def.cooldown : 0f;
        }

        readonly Game game;
        readonly Dictionary<RealityAbilityType, IRealityEffect> handlers = new Dictionary<RealityAbilityType, IRealityEffect>();
        public readonly List<Runtime> Abilities = new List<Runtime>();

        public bool DimensionalActive { get; set; }
        public bool SpatialActive { get; set; }
        public bool MatterActive { get; set; }
        public float GravityMultiplier { get; set; } = 1f;
        public float TimeDistortionRadius { get; set; }
        public float TimeDistortionScale { get; set; } = 1f;

        public RealitySystem(Game game)
        {
            this.game = game;
            handlers[RealityAbilityType.ReducedGravity] = new ReducedGravityEffect();
            handlers[RealityAbilityType.TimeDistortion] = new TimeDistortionEffect();
            handlers[RealityAbilityType.SpatialAnomaly] = new FlagEffect(s => s.SpatialActive = true, s => s.SpatialActive = false);
            handlers[RealityAbilityType.DimensionalPerception] = new FlagEffect(s => s.DimensionalActive = true, s => s.DimensionalActive = false);
            handlers[RealityAbilityType.MatterInteraction] = new FlagEffect(s => s.MatterActive = true, s => s.MatterActive = false);
            foreach (var def in game.Content.Abilities) Abilities.Add(new Runtime { def = def });
        }

        public Runtime Get(string id) => Abilities.Find(a => a.def.id == id);

        /// <summary>Puts newly unlocked abilities into empty HUD quick slots.</summary>
        public void AutoAssignSlots()
        {
            var slots = game.Data.abilitySlots;
            foreach (var r in Abilities)
            {
                string id = r.def.id;
                if (!IsUnlocked(id) || slots.Contains(id)) continue;
                int free = slots.IndexOf("");
                if (free < 0) return;
                slots[free] = id;
            }
        }
        public bool IsUnlocked(string id) => game.Upgrades.AbilityUnlocked(id);
        public bool AnyUnlocked
        {
            get { foreach (var a in Abilities) if (IsUnlocked(a.def.id)) return true; return false; }
        }

        public bool CanActivate(string id, out string reason)
        {
            reason = "";
            var r = Get(id);
            if (r == null) { reason = "Unknown ability."; return false; }
            if (!IsUnlocked(id)) { reason = r.def.displayName + " is locked. Install its reality module."; return false; }
            if (r.IsActive) { reason = r.def.displayName + " is already active."; return false; }
            if (r.cooldown > 0f) { reason = r.def.displayName + " recharging (" + Mathf.CeilToInt(r.cooldown) + "s)."; return false; }
            if (game.Vitals.IsLowEnergy) { reason = "Energy too low for reality manipulation (needs 20%+)."; return false; }
            if (!game.Vitals.CanSpend(r.def.energyCost)) { reason = "Needs " + r.def.energyCost.ToString("0") + " energy."; return false; }
            return true;
        }

        public bool TryActivate(string id)
        {
            if (!CanActivate(id, out string reason))
            {
                AudioManager.I?.Play(Sfx.Denied);
                GameEvents.Notify(reason, NoticeType.Warning);
                return false;
            }
            var r = Get(id);
            game.Vitals.TrySpend(r.def.energyCost);
            r.active = r.def.duration;
            if (handlers.TryGetValue(r.def.type, out var h)) h.Begin(this, r.def);
            AudioManager.I?.Play(Sfx.Reality);
            Game.Vibrate();
            if (game.Player != null) RealityPulse.Spawn(game.Player.transform.position + Vector3.up, r.def.color, r.def.radius);
            UIRoot.I?.Fx.RealityFlash(r.def.color);
            GameEvents.Notify(r.def.displayName.ToUpperInvariant() + " ENGAGED (" + r.def.duration.ToString("0") + "s)", NoticeType.Info);
            game.SetFlag("ability." + id);
            game.Log("Used " + r.def.displayName + ".");
            GameEvents.RaiseAbilities();
            return true;
        }

        public void Tick(float dt)
        {
            for (int i = 0; i < Abilities.Count; i++)
            {
                var r = Abilities[i];
                if (r.active > 0f)
                {
                    r.active -= dt;
                    if (handlers.TryGetValue(r.def.type, out var h))
                    {
                        if (r.active > 0f) h.Tick(this, r.def, dt);
                        else
                        {
                            r.active = 0f;
                            h.End(this, r.def);
                            r.cooldown = r.def.cooldown;
                            GameEvents.Notify(r.def.displayName + " ended.", NoticeType.Info);
                            GameEvents.RaiseAbilities();
                        }
                    }
                }
                else if (r.cooldown > 0f)
                {
                    r.cooldown -= dt;
                    if (r.cooldown <= 0f) { r.cooldown = 0f; GameEvents.RaiseAbilities(); }
                }
            }
        }

        /// <summary>Ends all effects immediately (used by System Restore and on scene changes).</summary>
        public void CancelAll()
        {
            foreach (var r in Abilities)
            {
                if (r.active > 0f && handlers.TryGetValue(r.def.type, out var h)) h.End(this, r.def);
                r.active = 0f;
            }
            GameEvents.RaiseAbilities();
        }

        /// <summary>Time scale an ITimeScalable at <paramref name="pos"/> should use.</summary>
        public float TimeScaleAt(Vector3 pos)
        {
            if (TimeDistortionScale >= 1f || game.Player == null) return 1f;
            float r = TimeDistortionRadius;
            return (pos - game.Player.transform.position).sqrMagnitude <= r * r ? TimeDistortionScale : 1f;
        }

        // ---------------------------------------------------------------- Handlers

        sealed class ReducedGravityEffect : IRealityEffect
        {
            public void Begin(RealitySystem s, RealityAbilityDefinition d) { s.GravityMultiplier = 0.35f; }
            public void Tick(RealitySystem s, RealityAbilityDefinition d, float dt) { }
            public void End(RealitySystem s, RealityAbilityDefinition d) { s.GravityMultiplier = 1f; }
        }

        sealed class TimeDistortionEffect : IRealityEffect
        {
            public void Begin(RealitySystem s, RealityAbilityDefinition d) { s.TimeDistortionScale = 0.2f; s.TimeDistortionRadius = d.radius; Apply(s); }
            public void Tick(RealitySystem s, RealityAbilityDefinition d, float dt) { Apply(s); }
            public void End(RealitySystem s, RealityAbilityDefinition d)
            {
                s.TimeDistortionScale = 1f;
                var items = Registry<ITimeScalable>.Items;
                for (int i = 0; i < items.Count; i++) items[i].LocalTimeScale = 1f;
            }

            static void Apply(RealitySystem s)
            {
                var items = Registry<ITimeScalable>.Items;
                for (int i = 0; i < items.Count; i++) items[i].LocalTimeScale = s.TimeScaleAt(items[i].Position);
            }
        }

        /// <summary>Generic handler for abilities that simply enable a capability for their duration.</summary>
        sealed class FlagEffect : IRealityEffect
        {
            readonly System.Action<RealitySystem> begin, end;
            public FlagEffect(System.Action<RealitySystem> begin, System.Action<RealitySystem> end) { this.begin = begin; this.end = end; }
            public void Begin(RealitySystem s, RealityAbilityDefinition d) { begin(s); }
            public void Tick(RealitySystem s, RealityAbilityDefinition d, float dt) { }
            public void End(RealitySystem s, RealityAbilityDefinition d) { end(s); }
        }
    }
}

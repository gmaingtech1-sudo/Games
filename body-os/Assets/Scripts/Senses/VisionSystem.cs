using System;
using System.Collections.Generic;
using UnityEngine;

namespace BodyOS
{
    public enum VisionModeId { Normal, Night, Thermal, Scanner, Dimensional }

    /// <summary>
    /// Describes a vision mode. To add a new mode: add an enum value, add a definition here, and handle it
    /// in <see cref="VisionTarget.MaterialFor"/> and the screen effect (UI/ScreenFX). Nothing else changes.
    /// </summary>
    public sealed class VisionModeInfo
    {
        public VisionModeId id;
        public string name;
        public string description;
        public float drainPerSecond;
        /// <summary>Upgrade-unlock key (UnlockVision effect). Empty = available from the start.</summary>
        public string unlockKey = "";
        /// <summary>Unavailable below this energy fraction.</summary>
        public float minEnergyFraction;
        public Color tint;
        public Color ambient;
    }

    /// <summary>
    /// Vision mode manager. Uses only performant built-in techniques that work on every render pipeline
    /// configuration we ship (built-in RP): ambient light changes, cached material swaps on registered
    /// <see cref="VisionTarget"/>s and a full-screen UI tint. No post-processing stack is required.
    /// </summary>
    public sealed class VisionSystem
    {
        public static readonly VisionModeInfo[] Modes =
        {
            new VisionModeInfo { id = VisionModeId.Normal, name = "NORMAL", description = "Standard optical perception. No energy cost.",
                drainPerSecond = 0f, tint = new Color(0, 0, 0, 0) },
            new VisionModeInfo { id = VisionModeId.Night, name = "NIGHT VISION", description = "Light amplification. See clearly in dark areas. Low drain.",
                drainPerSecond = 0.6f, minEnergyFraction = 0.01f, tint = new Color(0.2f, 1f, 0.35f, 0.16f), ambient = new Color(0.45f, 0.7f, 0.48f) },
            new VisionModeInfo { id = VisionModeId.Scanner, name = "SCANNER", description = "Highlights interactables (cyan), collectables (gold), clues (magenta) and hostiles (red). Enables object analysis.",
                drainPerSecond = 0.9f, minEnergyFraction = 0.01f, tint = new Color(0.1f, 0.8f, 1f, 0.08f), ambient = new Color(0.22f, 0.28f, 0.34f) },
            new VisionModeInfo { id = VisionModeId.Thermal, name = "THERMAL", description = "Heat signatures glow; cold matter fades to blue. Reveals creatures and powered machinery. Medium drain.",
                drainPerSecond = 1.6f, unlockKey = "Thermal", minEnergyFraction = VitalsSystem.LowEnergyFraction, tint = new Color(0.1f, 0.05f, 0.3f, 0.12f), ambient = new Color(0.1f, 0.1f, 0.2f) },
            new VisionModeInfo { id = VisionModeId.Dimensional, name = "DIMENSIONAL", description = "Perceive adjacent dimensional layers: hidden objects and anomalies become visible and tangible. High drain.",
                drainPerSecond = 3.0f, unlockKey = "Dimensional", minEnergyFraction = VitalsSystem.LowEnergyFraction, tint = new Color(0.55f, 0.2f, 1f, 0.16f), ambient = new Color(0.3f, 0.2f, 0.45f) },
        };

        public static VisionModeInfo Info(VisionModeId id)
        {
            for (int i = 0; i < Modes.Length; i++) if (Modes[i].id == id) return Modes[i];
            return Modes[0];
        }

        readonly Game game;
        public VisionModeId Current { get; private set; }
        public bool HiddenRevealed { get; private set; }
        float pulse;

        public VisionSystem(Game game)
        {
            this.game = game;
            VisionModeId mode;
            if (!Enum.TryParse(game.Data.activeVision, out mode)) mode = VisionModeId.Normal;
            Current = IsUnlocked(mode) ? mode : VisionModeId.Normal;
        }

        public VisionModeInfo CurrentInfo => Info(Current);

        public float ScannerRange => 14f * (1f + game.Upgrades.Total(UpgradeEffectType.ScannerRange));

        public float CurrentDrain
        {
            get
            {
                float reduction = Mathf.Clamp(game.Upgrades.Total(UpgradeEffectType.VisionDrainMultiplier), 0f, 0.6f);
                return CurrentInfo.drainPerSecond * (1f - reduction);
            }
        }

        public bool IsUnlocked(VisionModeId id)
        {
            var info = Info(id);
            return string.IsNullOrEmpty(info.unlockKey) || game.Upgrades.VisionUnlocked(info.unlockKey);
        }

        public bool CanActivate(VisionModeId id, out string reason)
        {
            reason = "";
            var info = Info(id);
            if (!IsUnlocked(id)) { reason = info.name + " requires a technology upgrade."; return false; }
            if (id != VisionModeId.Normal && game.Vitals.EnergyFraction < Mathf.Max(info.minEnergyFraction, 0.01f))
            {
                reason = "Not enough energy for " + info.name + ".";
                return false;
            }
            return true;
        }

        public bool SetMode(VisionModeId id, bool feedback = true)
        {
            if (!CanActivate(id, out string reason))
            {
                if (feedback) { AudioManager.I?.Play(Sfx.Denied); GameEvents.Notify(reason, NoticeType.Warning); }
                return false;
            }
            if (id == Current) return true;
            Current = id;
            game.Data.activeVision = id.ToString();
            if (feedback)
            {
                AudioManager.I?.Play(id == VisionModeId.Scanner ? Sfx.Scan : Sfx.Vision);
                GameEvents.Notify("VISION: " + Info(id).name, NoticeType.Info);
            }
            game.SetFlag("vision." + id.ToString().ToLowerInvariant());
            ApplyToWorld();
            GameEvents.RaiseVision();
            return true;
        }

        /// <summary>Cycles to the next unlocked mode (HUD quick button).</summary>
        public void Cycle()
        {
            int start = Array.FindIndex(Modes, m => m.id == Current);
            for (int i = 1; i <= Modes.Length; i++)
            {
                var next = Modes[(start + i) % Modes.Length];
                if (IsUnlocked(next.id) && CanActivate(next.id, out _)) { SetMode(next.id); return; }
            }
        }

        /// <summary>Called after upgrades are refunded: drop modes that are no longer unlocked.</summary>
        public void ValidateMode()
        {
            if (!IsUnlocked(Current)) SetMode(VisionModeId.Normal, false);
        }

        public void Tick(float dt)
        {
            // Energy restrictions: expensive modes switch off when energy runs low.
            var info = CurrentInfo;
            if (Current != VisionModeId.Normal && game.Vitals.EnergyFraction < Mathf.Max(info.minEnergyFraction, 0.005f))
            {
                SetMode(VisionModeId.Normal, false);
                AudioManager.I?.Play(Sfx.Denied);
                GameEvents.Notify(info.name + " offline: insufficient energy.", NoticeType.Warning);
            }

            bool reveal = Current == VisionModeId.Dimensional || game.Reality.DimensionalActive;
            if (reveal != HiddenRevealed) { HiddenRevealed = reveal; ApplyToWorld(); }

            if (Current == VisionModeId.Scanner || HiddenRevealed)
            {
                pulse += dt;
                VisionMaterials.Pulse(pulse);
            }
        }

        /// <summary>Applies the current mode to lighting and all registered targets. Only runs on changes.</summary>
        public void ApplyToWorld()
        {
            HiddenRevealed = Current == VisionModeId.Dimensional || (game.Reality != null && game.Reality.DimensionalActive);
            WorldLighting.Apply(Current);
            var targets = Registry<VisionTarget>.Items;
            for (int i = 0; i < targets.Count; i++) targets[i].Apply(Current, HiddenRevealed);
        }
    }

    /// <summary>Remembers the location's base lighting so vision modes can modify and restore it.</summary>
    public static class WorldLighting
    {
        static Color baseAmbient = new Color(0.12f, 0.13f, 0.16f);
        static bool baseFog;
        static Color baseFogColor = Color.black;
        static float baseFogDensity = 0.02f;

        public static void SetBase(Color ambient, bool fog, Color fogColor, float fogDensity)
        {
            baseAmbient = ambient; baseFog = fog; baseFogColor = fogColor; baseFogDensity = fogDensity;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.fogMode = FogMode.Exponential;
            Apply(VisionModeId.Normal);
        }

        public static void Apply(VisionModeId mode)
        {
            var info = VisionSystem.Info(mode);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            switch (mode)
            {
                case VisionModeId.Normal:
                    RenderSettings.ambientLight = baseAmbient;
                    RenderSettings.fog = baseFog;
                    RenderSettings.fogColor = baseFogColor;
                    RenderSettings.fogDensity = baseFogDensity;
                    break;
                case VisionModeId.Night:
                    RenderSettings.ambientLight = info.ambient;
                    RenderSettings.fog = baseFog;
                    RenderSettings.fogColor = new Color(0.05f, 0.15f, 0.06f);
                    RenderSettings.fogDensity = baseFogDensity * 0.4f;
                    break;
                default:
                    RenderSettings.ambientLight = Color.Lerp(baseAmbient, info.ambient, 0.7f);
                    RenderSettings.fog = baseFog;
                    RenderSettings.fogColor = info.ambient * 0.3f;
                    RenderSettings.fogDensity = baseFogDensity;
                    break;
            }
        }
    }

    /// <summary>Shared materials used by vision modes (created once, animated by changing a handful of colours).</summary>
    public static class VisionMaterials
    {
        static Material cold, coldDim, warm, hot, scanInteract, scanCollect, scanClue, scanHostile, dimEnv, dimReveal;
        static readonly Color InteractColor = new Color(0.1f, 0.9f, 1f);
        static readonly Color CollectColor = new Color(1f, 0.8f, 0.2f);
        static readonly Color ClueColor = new Color(1f, 0.3f, 0.9f);
        static readonly Color HostileColor = new Color(1f, 0.2f, 0.2f);
        static readonly Color RevealColor = new Color(0.8f, 0.45f, 1f);

        public static Material Cold => cold != null ? cold : (cold = Art.Unlit("vision_cold", new Color(0.05f, 0.08f, 0.32f)));
        public static Material ColdDim => coldDim != null ? coldDim : (coldDim = Art.Unlit("vision_cold_dim", new Color(0.03f, 0.05f, 0.2f)));
        public static Material Warm => warm != null ? warm : (warm = Art.Unlit("vision_warm", new Color(0.9f, 0.25f, 0.3f)));
        public static Material Hot => hot != null ? hot : (hot = Art.Unlit("vision_hot", new Color(1f, 0.85f, 0.3f)));
        public static Material DimEnv => dimEnv != null ? dimEnv : (dimEnv = Art.Lit("vision_dim_env", new Color(0.25f, 0.18f, 0.35f), 0.6f, 0.2f));
        public static Material DimReveal => dimReveal != null ? dimReveal : (dimReveal = Art.Unlit("vision_dim_reveal", RevealColor));

        public static Material Scan(ScanCategory c)
        {
            switch (c)
            {
                case ScanCategory.Collectable: return scanCollect != null ? scanCollect : (scanCollect = Art.Unlit("scan_collect", CollectColor));
                case ScanCategory.Clue: return scanClue != null ? scanClue : (scanClue = Art.Unlit("scan_clue", ClueColor));
                case ScanCategory.Hostile: return scanHostile != null ? scanHostile : (scanHostile = Art.Unlit("scan_hostile", HostileColor));
                default: return scanInteract != null ? scanInteract : (scanInteract = Art.Unlit("scan_interact", InteractColor));
            }
        }

        public static Color ColorOf(ScanCategory c)
        {
            switch (c)
            {
                case ScanCategory.Collectable: return CollectColor;
                case ScanCategory.Clue: return ClueColor;
                case ScanCategory.Hostile: return HostileColor;
                default: return InteractColor;
            }
        }

        public static void Pulse(float t)
        {
            float k = 0.65f + 0.35f * Mathf.Sin(t * 4f);
            if (scanInteract != null) Art.SetColor(scanInteract, InteractColor * k);
            if (scanCollect != null) Art.SetColor(scanCollect, CollectColor * k);
            if (scanClue != null) Art.SetColor(scanClue, ClueColor * k);
            if (scanHostile != null) Art.SetColor(scanHostile, HostileColor * k);
            if (dimReveal != null) Art.SetColor(dimReveal, RevealColor * (0.7f + 0.3f * Mathf.Sin(t * 2.5f)));
        }
    }
}

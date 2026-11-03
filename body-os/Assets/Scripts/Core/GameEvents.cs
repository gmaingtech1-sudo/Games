using System;
using UnityEngine;

namespace BodyOS
{
    public enum NoticeType { Info, Success, Warning, Danger, Reward, Story }

    /// <summary>
    /// Central, allocation-free event hub. Gameplay systems raise events here and the UI listens,
    /// so no UI component ever keeps its own copy of game state.
    /// </summary>
    public static class GameEvents
    {
        /// <summary>Body/brain configuration, upgrades or anything that changes derived stats.</summary>
        public static event Action StatsChanged;
        public static event Action VitalsChanged;
        public static event Action ProgressionChanged;
        public static event Action InventoryChanged;
        public static event Action MissionChanged;
        public static event Action VisionChanged;
        public static event Action AbilitiesChanged;
        public static event Action EnvironmentChanged;
        public static event Action SettingsChanged;
        /// <summary>A story/mission flag was set for the first time.</summary>
        public static event Action<string> FlagSet;
        public static event Action<string, NoticeType> Notice;

        public static void RaiseStats() { StatsChanged?.Invoke(); }
        public static void RaiseVitals() { VitalsChanged?.Invoke(); }
        public static void RaiseProgression() { ProgressionChanged?.Invoke(); }
        public static void RaiseInventory() { InventoryChanged?.Invoke(); }
        public static void RaiseMission() { MissionChanged?.Invoke(); }
        public static void RaiseVision() { VisionChanged?.Invoke(); }
        public static void RaiseAbilities() { AbilitiesChanged?.Invoke(); }
        public static void RaiseEnvironment() { EnvironmentChanged?.Invoke(); }
        public static void RaiseSettings() { SettingsChanged?.Invoke(); }
        public static void RaiseFlag(string flag) { FlagSet?.Invoke(flag); }

        public static void Notify(string message, NoticeType type = NoticeType.Info)
        {
            Notice?.Invoke(message, type);
        }

        // Static events survive play sessions when domain reload is disabled in the editor.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            StatsChanged = null; VitalsChanged = null; ProgressionChanged = null; InventoryChanged = null;
            MissionChanged = null; VisionChanged = null; AbilitiesChanged = null; EnvironmentChanged = null;
            SettingsChanged = null; FlagSet = null; Notice = null;
        }
    }
}

using System;
using System.Collections.Generic;

namespace BodyOS
{
    /// <summary>
    /// Versioned save format. Serialized with JsonUtility.FromJsonOverwrite onto a freshly constructed
    /// default instance, so fields added in later versions simply keep their defaults instead of
    /// erasing progress. Bump <see cref="CurrentVersion"/> and extend SaveSystem.Migrate when a field
    /// changes meaning.
    /// </summary>
    [Serializable]
    public class SaveData
    {
        public const int CurrentVersion = 1;

        public int version = CurrentVersion;
        public string savedAtUtc = "";
        public float playTimeSeconds;

        public VitalsData vitals = new VitalsData();
        public ProgressData progress = new ProgressData();
        public InventoryData inventory = new InventoryData();
        public int[] stats = StatRules.DefaultValues();
        public string activeVision = "Normal";
        public List<UpgradeState> upgrades = new List<UpgradeState>();
        public List<string> abilitySlots = new List<string> { "", "" };
        public List<ConfigPreset> presets = new List<ConfigPreset>();
        public StoryData story = new StoryData();
    }

    [Serializable]
    public class VitalsData
    {
        public float health = 100f;
        public float energy = 100f;
        public float suit = 100f;
    }

    [Serializable]
    public class ProgressData
    {
        public int level = 1;
        public int xp;
        public int upgradePoints = 1;
        public List<string> discoveredLocations = new List<string>();
        public List<string> revealedFragments = new List<string>();
    }

    [Serializable]
    public class ItemStack
    {
        public string id;
        public int amount;
    }

    [Serializable]
    public class InventoryData
    {
        public List<ItemStack> items = new List<ItemStack>();
    }

    [Serializable]
    public class UpgradeState
    {
        public string id;
        public int tier;
    }

    [Serializable]
    public class ConfigPreset
    {
        public string id;
        public string name;
        public string description;
        public int[] stats;
        public string vision = "Normal";
        public bool customised;
    }

    [Serializable]
    public class MissionState
    {
        public string id;
        public int objective;
        public bool completed;
    }

    [Serializable]
    public class StoryData
    {
        public List<string> flags = new List<string>();
        public List<MissionState> missions = new List<MissionState>();
        public string activeMission = "";
        public string location = "derelict";
        public bool hasPosition;
        public float posX, posY, posZ, yaw;
        public List<string> log = new List<string>();
    }

    /// <summary>Game settings are stored separately from progress so New Game never resets them.</summary>
    [Serializable]
    public class GameSettings
    {
        public const int CurrentVersion = 1;
        public int version = CurrentVersion;
        public float masterVolume = 0.9f;
        public float musicVolume = 0.6f;
        public float sfxVolume = 0.85f;
        public float cameraSensitivity = 1f;
        public float controlSensitivity = 1f;
        public int graphicsQuality = 1; // 0 low, 1 medium, 2 high
        public float uiScale = 1f;
        public bool vibration = true;
        public bool invertCamera;
        public bool showFps;
    }
}

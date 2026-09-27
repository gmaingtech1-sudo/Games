using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Wayfarer
{
    [Serializable]
    public sealed class Discovery
    {
        public string Id;          // unique key
        public string Kind;        // System, Planet, Fauna, Flora, Mineral, Place
        public string Name;
        public string Where;       // system / planet
        public string Details;
        public int Reward;
        public double When;
    }

    [Serializable]
    public sealed class UpgradeLevel
    {
        public string Id;
        public int Level;
    }

    public sealed class UpgradeDef
    {
        public string Id, Name, Category, Description;
        public int MaxLevel;
        public int[] Prices;
        public string[] Materials;   // one extra item per level
    }

    /// <summary>Everything that is saved.</summary>
    [Serializable]
    public sealed class SaveData
    {
        public int Version = 1;
        public string GalaxySeed = "1461384717";
        public string StarId;
        public double SystemTime;
        public double PlayTime;

        // 0 on foot, 1 in ship, 2 docked
        public int Mode;
        public int RefPlanet = -1;
        public double[] PlayerPos = new double[3];
        public double[] PlayerVel = new double[3];
        public float[] PlayerRot = { 0, 0, 0, 1 };
        public float PlayerPitch;

        public int ShipPlanet = -1;
        public double[] ShipPos = new double[3];
        public float[] ShipRot = { 0, 0, 0, 1 };
        public bool ShipLanded = true;

        public Inventory Inv = new Inventory();
        public float LifeSupport = 100, Hazard = 100, Shield = 100, Health = 100;
        public float LaunchFuel = 0, PulseFuel = 60, ToolCharge = 100, Hull = 100, ShipShield = 100;
        public List<UpgradeLevel> Upgrades = new List<UpgradeLevel>();
        public List<Discovery> Discoveries = new List<Discovery>();
        public List<string> Visited = new List<string>();
        public List<string> Looted = new List<string>();
        public List<string> KnownPois = new List<string>();
        public int MissionStage;
        public int Jumps;
        public double DistanceWalked, DistanceFlown;
        public int CreaturesScanned, Kills;
        public string ShipName = "Wanderer";
        public float[] ShipHull = { 0.82f, 0.84f, 0.86f };
        public float[] ShipAccent = { 0.92f, 0.42f, 0.12f };
        public bool Tutorial = true;
    }

    /// <summary>The player's persistent state and the save file.</summary>
    public static class Profile
    {
        public static SaveData Data = new SaveData();
        public static readonly HashSet<string> DiscoveredIds = new HashSet<string>();
        public static readonly HashSet<string> LootedIds = new HashSet<string>();
        public static readonly HashSet<string> KnownPoiIds = new HashSet<string>();

        public static string SavePath => Path.Combine(Application.persistentDataPath, "wayfarer_save.json");
        public static bool HasSave => File.Exists(SavePath);

        public static readonly UpgradeDef[] UpgradeDefs =
        {
            new UpgradeDef { Id = "suit_life", Name = "Life Support Module", Category = "Exosuit", MaxLevel = 3,
                Description = "Life support lasts 30% longer per level.", Prices = new[] { 6000, 18000, 45000 }, Materials = new[] { "oxygen", "copper", "gold" } },
            new UpgradeDef { Id = "suit_hazard", Name = "Hazard Shielding", Category = "Exosuit", MaxLevel = 3,
                Description = "Hazards drain protection 30% slower per level.", Prices = new[] { 7000, 20000, 50000 }, Materials = new[] { "sodium", "copper", "silver" } },
            new UpgradeDef { Id = "suit_jet", Name = "Jetpack Booster", Category = "Exosuit", MaxLevel = 3,
                Description = "More jetpack fuel and thrust.", Prices = new[] { 5000, 15000, 38000 }, Materials = new[] { "hydrogen", "copper", "gold" } },
            new UpgradeDef { Id = "suit_slots", Name = "Exosuit Pockets", Category = "Exosuit", MaxLevel = 4,
                Description = "Six more inventory slots per level.", Prices = new[] { 8000, 20000, 40000, 80000 }, Materials = new[] { "ferrite", "ferrite", "silver", "gold" } },
            new UpgradeDef { Id = "tool_mining", Name = "Optical Drill", Category = "Multi-Tool", MaxLevel = 3,
                Description = "Mine 40% faster and get more per rock.", Prices = new[] { 6000, 16000, 42000 }, Materials = new[] { "ferrite", "copper", "platinum" } },
            new UpgradeDef { Id = "tool_blaster", Name = "Boltcaster Coils", Category = "Multi-Tool", MaxLevel = 3,
                Description = "Blaster bolts hit 40% harder.", Prices = new[] { 7000, 18000, 45000 }, Materials = new[] { "ferrite", "silver", "gold" } },
            new UpgradeDef { Id = "ship_range", Name = "Hyperdrive Tuning", Category = "Starship", MaxLevel = 4,
                Description = "Adds 70 light-years of jump range per level.", Prices = new[] { 12000, 30000, 70000, 150000 }, Materials = new[] { "helium3", "copper", "gold", "platinum" } },
            new UpgradeDef { Id = "ship_shield", Name = "Deflector Shield", Category = "Starship", MaxLevel = 3,
                Description = "Ship shields absorb 40% more.", Prices = new[] { 9000, 24000, 60000 }, Materials = new[] { "sodium", "silver", "gold" } },
            new UpgradeDef { Id = "ship_guns", Name = "Photon Cannon Upgrade", Category = "Starship", MaxLevel = 3,
                Description = "Ship guns hit 35% harder and mine asteroids faster.", Prices = new[] { 9000, 24000, 60000 }, Materials = new[] { "ferrite", "copper", "platinum" } },
            new UpgradeDef { Id = "ship_slots", Name = "Cargo Bulkhead", Category = "Starship", MaxLevel = 4,
                Description = "Eight more cargo slots per level.", Prices = new[] { 10000, 25000, 60000, 120000 }, Materials = new[] { "ferrite", "ferrite", "gold", "platinum" } },
            new UpgradeDef { Id = "ship_pulse", Name = "Pulse Engine Efficiency", Category = "Starship", MaxLevel = 3,
                Description = "Pulse travel uses 30% less fuel per level.", Prices = new[] { 8000, 20000, 50000 }, Materials = new[] { "helium3", "silver", "gold" } },
        };

        public static int Level(string id)
        {
            foreach (var u in Data.Upgrades) if (u.Id == id) return u.Level;
            return 0;
        }

        public static void SetLevel(string id, int level)
        {
            foreach (var u in Data.Upgrades)
                if (u.Id == id) { u.Level = level; ApplyUpgrades(); return; }
            Data.Upgrades.Add(new UpgradeLevel { Id = id, Level = level });
            ApplyUpgrades();
        }

        public static void ApplyUpgrades()
        {
            Data.Inv.SuitSlots = 24 + 6 * Level("suit_slots");
            Data.Inv.ShipSlots = 20 + 8 * Level("ship_slots");
        }

        public static double JumpRange => 90 + 70 * Level("ship_range");

        public static void NewGame(ulong seed)
        {
            Data = new SaveData { GalaxySeed = seed.ToString() };
            DiscoveredIds.Clear();
            LootedIds.Clear();
            KnownPoiIds.Clear();
            ApplyUpgrades();
        }

        public static ulong Seed => ulong.TryParse(Data.GalaxySeed, out var s) ? s : 1461384717UL;

        public static bool Discover(Discovery d)
        {
            if (DiscoveredIds.Contains(d.Id)) return false;
            DiscoveredIds.Add(d.Id);
            d.When = Data.PlayTime;
            Data.Discoveries.Add(d);
            Data.Inv.Units += d.Reward;
            return true;
        }

        public static bool IsDiscovered(string id) => DiscoveredIds.Contains(id);

        public static void MarkLooted(string id)
        {
            if (LootedIds.Add(id)) Data.Looted.Add(id);
        }

        public static void MarkKnown(string poiId)
        {
            if (KnownPoiIds.Add(poiId)) Data.KnownPois.Add(poiId);
        }

        public static void Save()
        {
            try
            {
                Data.Discoveries.RemoveAll(x => x == null);
                string json = JsonUtility.ToJson(Data, false);
                string tmp = SavePath + ".tmp";
                File.WriteAllText(tmp, json);
                if (File.Exists(SavePath)) File.Delete(SavePath);
                File.Move(tmp, SavePath);
            }
            catch (Exception e)
            {
                Debug.LogError("Wayfarer: could not save: " + e.Message);
            }
        }

        public static bool Load()
        {
            try
            {
                if (!HasSave) return false;
                var d = JsonUtility.FromJson<SaveData>(File.ReadAllText(SavePath));
                if (d == null) return false;
                Data = d;
                if (Data.Inv == null) Data.Inv = new Inventory();
                DiscoveredIds.Clear();
                foreach (var x in Data.Discoveries) if (x != null) DiscoveredIds.Add(x.Id);
                LootedIds.Clear();
                foreach (var x in Data.Looted) LootedIds.Add(x);
                KnownPoiIds.Clear();
                foreach (var x in Data.KnownPois) KnownPoiIds.Add(x);
                ApplyUpgrades();
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError("Wayfarer: could not load save: " + e.Message);
                return false;
            }
        }

        public static void DeleteSave()
        {
            try { if (HasSave) File.Delete(SavePath); } catch { }
        }

        public static double[] Pack(Vector3d v) => new[] { v.x, v.y, v.z };
        public static Vector3d UnpackD(double[] a) => a != null && a.Length == 3 ? new Vector3d(a[0], a[1], a[2]) : Vector3d.zero;
        public static float[] Pack(Quaternion q) => new[] { q.x, q.y, q.z, q.w };
        public static Quaternion UnpackQ(float[] a) => a != null && a.Length == 4 ? new Quaternion(a[0], a[1], a[2], a[3]) : Quaternion.identity;
    }
}

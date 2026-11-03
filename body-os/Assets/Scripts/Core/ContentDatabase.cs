using System.Collections.Generic;
using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// All game content definitions. Code defaults are loaded first, then any ScriptableObject assets in
    /// Resources/ScriptableObjects/{Upgrades,Abilities,Items,Missions,Locations} override or extend them by id.
    /// </summary>
    public sealed class ContentDatabase
    {
        public readonly List<UpgradeDefinition> Upgrades = new List<UpgradeDefinition>();
        public readonly List<RealityAbilityDefinition> Abilities = new List<RealityAbilityDefinition>();
        public readonly List<ItemDefinition> Items = new List<ItemDefinition>();
        public readonly List<MissionDefinition> Missions = new List<MissionDefinition>();
        public readonly List<LocationDefinition> Locations = new List<LocationDefinition>();

        public static ContentDatabase Load()
        {
            var db = new ContentDatabase();
            Merge(db.Upgrades, DefaultContent.Upgrades(), "ScriptableObjects/Upgrades", u => u.id);
            Merge(db.Abilities, DefaultContent.Abilities(), "ScriptableObjects/Abilities", a => a.id);
            Merge(db.Items, DefaultContent.Items(), "ScriptableObjects/Items", i => i.id);
            Merge(db.Missions, DefaultContent.Missions(), "ScriptableObjects/Missions", m => m.id);
            Merge(db.Locations, DefaultContent.Locations(), "ScriptableObjects/Locations", l => l.id);
            return db;
        }

        static void Merge<T>(List<T> target, T[] defaults, string resourcePath, System.Func<T, string> idOf) where T : Object
        {
            target.AddRange(defaults);
            T[] assets;
            try { assets = Resources.LoadAll<T>(resourcePath); }
            catch { assets = new T[0]; }
            foreach (var a in assets)
            {
                if (a == null || string.IsNullOrEmpty(idOf(a))) continue;
                int i = target.FindIndex(x => idOf(x) == idOf(a));
                if (i >= 0) target[i] = a; else target.Add(a);
            }
        }

        public UpgradeDefinition Upgrade(string id) { return Upgrades.Find(u => u.id == id); }
        public RealityAbilityDefinition Ability(string id) { return Abilities.Find(a => a.id == id); }
        public ItemDefinition Item(string id) { return Items.Find(i => i.id == id); }
        public MissionDefinition Mission(string id) { return Missions.Find(m => m.id == id); }
        public LocationDefinition Location(string id) { return Locations.Find(l => l.id == id); }

        public string ItemName(string id)
        {
            var i = Item(id);
            return i != null ? i.displayName : id;
        }
    }
}

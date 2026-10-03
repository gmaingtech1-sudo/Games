// Riftborn — art from the Asset Store, hooked into the game: animated
// dinosaur models (e.g. "PBR Animated Dinosaurs" by Ferocious Industries)
// that replace the built-in creatures, portal models (e.g. "The Portal
// Collection" by ReversedInt) for the Rifts, and particle effects (e.g.
// "Magic Effects FREE" by Hovl Studio) for hits, blasts, catches and hacks.
//
// Riftborn → Use imported assets (in the editor) finds them in the project
// and fills in Resources/RiftbornAssetLinks.asset. Everything it guessed can
// be changed in that asset's Inspector. Without it, the game keeps its own
// generated creatures and effects.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Riftborn
{
    [Serializable]
    public class DinoModel
    {
        public string name;
        public GameObject prefab;
        [Tooltip("Which kind of creature this model stands in for.")]
        public Plan plan;
        [Tooltip("Turn the model so its head points forward (degrees).")]
        public float yaw;
        [Tooltip("Generated from the model's animation clips: one state per clip.")]
        public RuntimeAnimatorController controller;
        [Tooltip("State names in the controller (empty: not available).")]
        public string idle, walk, run, attack, roar, hit, die, fly;
        [Tooltip("Alternative materials (skins); species pick one each.")]
        public Material[] skins = new Material[0];
        [Tooltip("Tint towards each species' colours (0 = the model's own colours).")]
        [Range(0, 1)] public float tint = 0.3f;
    }

    [Serializable]
    public class SpeciesModel
    {
        public string species;
        [Tooltip("Index into the dinosaur list, or -1 for the game's own model.")]
        public int model = -1;
        [Tooltip("Index into that model's skins, or -1 to pick by species.")]
        public int skin = -1;
    }

    [Serializable]
    public class ElementFx { public El element; public GameObject projectile, hit; }

    [CreateAssetMenu(menuName = "Riftborn/Asset links")]
    public class AssetLinks : ScriptableObject
    {
        [Header("Use")]
        public bool useDinosaurs = true;
        public bool usePortals = true;
        public bool useEffects = true;

        [Header("Dinosaurs")]
        public List<DinoModel> dinosaurs = new List<DinoModel>();
        [Tooltip("Which model each species uses.")]
        public List<SpeciesModel> species = new List<SpeciesModel>();

        [Header("Portals (Rifts)")]
        public List<GameObject> portals = new List<GameObject>();

        [Header("Effects")]
        public GameObject dartHit, bullseye, blastHit, strikeHit, catchBurst, breakout, appear, guard, hack, claim, levelUp, projectile;
        public List<ElementFx> elements = new List<ElementFx>();
        [Tooltip("Effects scale on the map, where everything is drawn big.")]
        public float mapEffectScale = 6;

        static AssetLinks inst;
        static bool loaded;
        public static AssetLinks I
        {
            get
            {
                if (!loaded) { loaded = true; inst = Resources.Load<AssetLinks>("RiftbornAssetLinks"); }
                return inst;
            }
        }

        // Imported models and effects can be switched off in the Menu.
        static bool On => GameState.save == null || GameState.save.settings.imported;

        public static DinoModel ModelFor(string speciesId, out Material skin)
        {
            skin = null;
            var L = I;
            if (L == null || !L.useDinosaurs || !On || L.dinosaurs.Count == 0) return null;
            var e = L.species.Find((x) => x.species == speciesId);
            if (e == null || e.model < 0 || e.model >= L.dinosaurs.Count) return null;
            var m = L.dinosaurs[e.model];
            if (m.prefab == null) return null;
            if (m.skins != null && m.skins.Length > 0)
            {
                int k = e.skin >= 0 ? e.skin : (int)(Rng.Hash("skin:" + speciesId) % (uint)(m.skins.Length + 1)) - 1;
                if (k >= 0 && k < m.skins.Length) skin = m.skins[k];
            }
            return m;
        }

        public static GameObject Portal(string seed)
        {
            var L = I;
            if (L == null || !L.usePortals || !On) return null;
            var list = L.portals.FindAll((p) => p != null);
            return list.Count == 0 ? null : list[(int)(Rng.Hash("portal:" + seed) % (uint)list.Count)];
        }

        public static bool Effects => I != null && I.useEffects && On;
    }
}

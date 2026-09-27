using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    /// <summary>The Blender-made models in Assets/Resources/Models. Each model's
    /// material slots are named (Hull, Glow, Leaf, ...) and swapped for the
    /// game's own materials when the model is used.</summary>
    public static class Models
    {
        public sealed class MeshPart
        {
            public Mesh Mesh;
            public Matrix4x4 Local;   // mesh space -> model space
            public string[] Slots;    // material slot name per submesh
        }

        static readonly Dictionary<string, GameObject> prefabs = new Dictionary<string, GameObject>();
        static readonly Dictionary<string, MeshPart> parts = new Dictionary<string, MeshPart>();
        static readonly HashSet<string> warned = new HashSet<string>();

        public static GameObject Prefab(string name)
        {
            if (prefabs.TryGetValue(name, out var p)) return p;
            p = Resources.Load<GameObject>("Models/" + name);
            if (p == null && warned.Add(name))
                Debug.LogWarning($"Wayfarer: model '{name}' missing from Assets/Resources/Models. Run Blender/build_assets.py to rebuild the models.");
            prefabs[name] = p;
            return p;
        }

        /// <summary>Strips the suffixes Unity and Blender add to material names.</summary>
        public static string SlotName(string matName)
        {
            if (string.IsNullOrEmpty(matName)) return "";
            string s = matName.Replace(" (Instance)", "");
            int dot = s.IndexOf('.');
            if (dot > 0) s = s.Substring(0, dot);
            return s.Trim();
        }

        /// <summary>Instantiates a model and gives every renderer the materials picked by `pick`.</summary>
        public static GameObject Spawn(string name, Transform parent, Func<string, Material> pick, bool castShadows = true)
        {
            var prefab = Prefab(name);
            GameObject go;
            if (prefab != null)
            {
                go = UnityEngine.Object.Instantiate(prefab, parent, false);
            }
            else
            {
                go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                var col = go.GetComponent<Collider>();
                if (col != null) UnityEngine.Object.Destroy(col);
                go.transform.SetParent(parent, false);
                go.GetComponent<Renderer>().sharedMaterial.name = "Hull";
            }
            go.name = name;
            foreach (var lg in go.GetComponentsInChildren<LODGroup>(true)) UnityEngine.Object.Destroy(lg);
            foreach (var r in go.GetComponentsInChildren<Renderer>(true))
            {
                if (r.gameObject.name.EndsWith("_LOD1")) { r.enabled = false; continue; }
                var mats = r.sharedMaterials;
                for (int i = 0; i < mats.Length; i++)
                    mats[i] = pick(SlotName(mats[i] != null ? mats[i].name : "Hull"));
                r.sharedMaterials = mats;
                r.shadowCastingMode = castShadows ? ShadowCastingMode.On : ShadowCastingMode.Off;
                r.lightProbeUsage = LightProbeUsage.Off;
                r.reflectionProbeUsage = ReflectionProbeUsage.BlendProbesAndSkybox;
            }
            return go;
        }

        /// <summary>Finds a named empty (attachment point) anywhere inside a model.</summary>
        public static Transform Find(Transform root, string name)
        {
            if (root.name == name) return root;
            for (int i = 0; i < root.childCount; i++)
            {
                var t = Find(root.GetChild(i), name);
                if (t != null) return t;
            }
            return null;
        }

        /// <summary>Mesh + transform of a model for instanced drawing. `lod` 0 or 1.</summary>
        public static MeshPart Part(string name, int lod = 0)
        {
            string key = name + "#" + lod;
            if (parts.TryGetValue(key, out var part)) return part;
            var prefab = Prefab(name);
            MeshFilter found = null;
            if (prefab != null)
            {
                var filters = prefab.GetComponentsInChildren<MeshFilter>(true);
                string suffix = "_LOD" + lod;
                foreach (var f in filters) if (f.name.EndsWith(suffix)) { found = f; break; }
                if (found == null && lod > 0) return Part(name, 0);
                if (found == null && filters.Length > 0) found = filters[0];
            }
            if (found == null)
            {
                parts[key] = null;
                return null;
            }
            var mr = found.GetComponent<MeshRenderer>();
            var slots = new string[found.sharedMesh.subMeshCount];
            for (int i = 0; i < slots.Length; i++)
                slots[i] = mr != null && i < mr.sharedMaterials.Length && mr.sharedMaterials[i] != null ? SlotName(mr.sharedMaterials[i].name) : "Stone";
            part = new MeshPart
            {
                Mesh = found.sharedMesh,
                Local = prefab.transform.worldToLocalMatrix * found.transform.localToWorldMatrix,
                Slots = slots,
            };
            parts[key] = part;
            return part;
        }

        /// <summary>Approximate size of a model part (for colliders and placement).</summary>
        public static Bounds PartBounds(MeshPart p)
        {
            if (p == null) return new Bounds(Vector3.zero, Vector3.one);
            var b = p.Mesh.bounds;
            var c = p.Local.MultiplyPoint3x4(b.center);
            var e = p.Local.MultiplyVector(b.extents);
            return new Bounds(c, new Vector3(Mathf.Abs(e.x), Mathf.Abs(e.y), Mathf.Abs(e.z)) * 2f);
        }
    }

    /// <summary>A colour scheme for a ship or building.</summary>
    public sealed class Livery
    {
        public Color Hull = new Color(0.8f, 0.82f, 0.84f);
        public Color Accent = new Color(0.9f, 0.4f, 0.1f);
        public Color Dark = new Color(0.12f, 0.13f, 0.15f);
        public Color Glow = new Color(0.35f, 0.8f, 1f);
        public Color GlowAlt = new Color(1f, 0.55f, 0.2f);
        public float GlowIntensity = 4f;
        readonly Dictionary<string, Material> cache = new Dictionary<string, Material>();

        public Material Pick(string slot)
        {
            if (cache.TryGetValue(slot, out var m)) return m;
            switch (slot)
            {
                case "Hull": m = Materials.Prop(Hull, 0.35f, 0.55f, 0.25f, 0.6f); break;
                case "HullAccent": m = Materials.Prop(Accent, 0.25f, 0.5f, 0.25f, 0.3f); break;
                case "HullDark": m = Materials.Prop(Dark, 0.6f, 0.45f, 0.35f, 0.4f); break;
                case "Metal": m = Materials.Prop(new Color(0.5f, 0.52f, 0.55f), 0.9f, 0.55f, 0.3f); break;
                case "Glass": m = Materials.Prop(new Color(0.03f, 0.06f, 0.09f), 0.1f, 0.95f, 0f); break;
                case "Glow": m = Materials.Glow(Glow, GlowIntensity); break;
                case "GlowAlt": m = Materials.Glow(GlowAlt, GlowIntensity); break;
                case "Rubber": m = Materials.Prop(new Color(0.04f, 0.04f, 0.04f), 0f, 0.2f, 0.2f); break;
                case "Stone": m = Materials.Prop(new Color(0.45f, 0.43f, 0.4f), 0f, 0.15f, 0.6f); break;
                case "Crystal": m = Materials.Glow(Glow, 1.5f); break;
                default: m = Materials.Prop(Hull, 0.3f, 0.5f, 0.3f); break;
            }
            cache[slot] = m;
            return m;
        }

        public static Livery Random(Rng r)
        {
            var l = new Livery
            {
                Hull = r.Hsv(0f, 1f, 0.02f, 0.2f, 0.65f, 0.9f),
                Accent = r.Hsv(0f, 1f, 0.6f, 0.9f, 0.6f, 0.95f),
                Dark = r.Hsv(0f, 1f, 0.05f, 0.25f, 0.1f, 0.2f),
                Glow = r.Hsv(0f, 1f, 0.5f, 0.9f, 0.9f, 1f),
            };
            return l;
        }
    }
}

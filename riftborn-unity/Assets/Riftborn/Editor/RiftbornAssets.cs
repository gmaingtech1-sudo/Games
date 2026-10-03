// Riftborn — hooks Asset Store art into the game (Riftborn → Use imported
// assets). It looks through the project for:
//   - animated dinosaur models (e.g. "PBR Animated Dinosaurs"), works out
//     their animations, which way they face and their skins, makes an
//     Animator Controller for each, and picks one for every species by body
//     type (raptor, rex, horned, plated, long-neck, flyer);
//   - portal models (e.g. "The Portal Collection") for the Rifts;
//   - particle effects (e.g. "Magic Effects FREE") for darts, catches,
//     battle hits, guards, hacks and level ups, by their names.
// The result is Assets/Riftborn/Resources/RiftbornAssetLinks.asset, which
// you can change by hand in the Inspector. It runs by itself the first time
// it finds the packs.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace Riftborn.EditorTools
{
    [InitializeOnLoad]
    public static class RiftbornAssets
    {
        const string LINKS = "Assets/Riftborn/Resources/RiftbornAssetLinks.asset";
        const string GEN = "Assets/Riftborn/Generated";

        static RiftbornAssets()
        {
            EditorApplication.delayCall += () =>
            {
                if (EditorApplication.isPlayingOrWillChangePlaymode || File.Exists(LINKS)) return;
                if (Scan().Any()) Run(false);
            };
        }

        [MenuItem("Riftborn/Use imported assets (dinosaurs, portals, effects)", priority = 5)]
        static void Menu()
        {
            if (File.Exists(LINKS) && !EditorUtility.DisplayDialog("Riftborn", "Look for dinosaurs, portals and effects again? This replaces the choices in RiftbornAssetLinks.", "Look again", "Cancel")) return;
            Run(true);
        }

        [MenuItem("Riftborn/Show asset links", priority = 6)]
        static void Show()
        {
            var a = AssetDatabase.LoadAssetAtPath<AssetLinks>(LINKS);
            if (a == null) { EditorUtility.DisplayDialog("Riftborn", "No asset links yet. Use Riftborn → Use imported assets first.", "OK"); return; }
            Selection.activeObject = a;
            EditorGUIUtility.PingObject(a);
        }

        /* ------------------ Finding things ------------------ */

        // Dinosaur names → the game's body types (longest names first).
        static readonly (string key, Plan plan)[] DINOS =
        {
            ("velociraptor", Plan.Raptor), ("deinonychus", Plan.Raptor), ("utahraptor", Plan.Raptor), ("compsognathus", Plan.Raptor), ("dilophosaurus", Plan.Raptor),
            ("gallimimus", Plan.Raptor), ("oviraptor", Plan.Raptor), ("troodon", Plan.Raptor), ("raptor", Plan.Raptor), ("compy", Plan.Raptor),
            ("tyrannosaurus", Plan.Rex), ("giganotosaurus", Plan.Rex), ("carnotaurus", Plan.Rex), ("spinosaurus", Plan.Rex), ("allosaurus", Plan.Rex),
            ("baryonyx", Plan.Rex), ("t-rex", Plan.Rex), ("t_rex", Plan.Rex), ("trex", Plan.Rex), ("rex", Plan.Rex),
            ("pachycephalosaurus", Plan.Horned), ("pachycephalasaurus", Plan.Horned), ("styracosaurus", Plan.Horned), ("triceratops", Plan.Horned),
            ("protoceratops", Plan.Horned), ("centrosaurus", Plan.Horned), ("chasmosaurus", Plan.Horned), ("torosaurus", Plan.Horned), ("pachy", Plan.Horned),
            ("stegosaurus", Plan.Plated), ("stegasaurus", Plan.Plated), ("ankylosaurus", Plan.Plated), ("kentrosaurus", Plan.Plated), ("euoplocephalus", Plan.Plated), ("stego", Plan.Plated),
            ("brachiosaurus", Plan.Longneck), ("diplodocus", Plan.Longneck), ("apatosaurus", Plan.Longneck), ("brontosaurus", Plan.Longneck), ("argentinosaurus", Plan.Longneck),
            ("parasaurolophus", Plan.Longneck), ("edmontosaurus", Plan.Longneck), ("iguanodon", Plan.Longneck), ("sauropod", Plan.Longneck), ("hadrosaur", Plan.Longneck),
            ("quetzalcoatlus", Plan.Flyer), ("pteranodon", Plan.Flyer), ("pterodactyl", Plan.Flyer), ("dimorphodon", Plan.Flyer), ("rhamphorhynchus", Plan.Flyer), ("pterosaur", Plan.Flyer),
        };
        static readonly string[] NOT_CREATURES = { "skeleton", "bone", "fossil", "skull", "egg", "statue", "toy" };

        class Found { public string path, low, key; public GameObject go; public Plan plan; public bool prefab; }

        static (string key, Plan plan)? DinoOf(string low)
        {
            if (NOT_CREATURES.Any(low.Contains)) return null;
            foreach (var d in DINOS) if (low.Contains(d.key)) return d;
            return null;
        }

        static bool Mine(string p) => !p.StartsWith("Assets/") || p.StartsWith("Assets/Riftborn") || p.StartsWith("Assets/Scenes") || p.StartsWith("Assets/XR");

        static IEnumerable<Found> Scan()
        {
            var seen = new HashSet<string>();
            foreach (var kind in new[] { "t:Prefab", "t:Model" })
                foreach (var guid in AssetDatabase.FindAssets(kind))
                {
                    string p = AssetDatabase.GUIDToAssetPath(guid);
                    if (Mine(p) || !seen.Add(p)) continue;
                    var go = AssetDatabase.LoadAssetAtPath<GameObject>(p);
                    if (go == null) continue;
                    string low = p.ToLowerInvariant();
                    var f = new Found { path = p, low = low, go = go, prefab = kind == "t:Prefab" };
                    bool skinned = go.GetComponentInChildren<SkinnedMeshRenderer>(true) != null;
                    var d = DinoOf(Path.GetFileNameWithoutExtension(low)) ?? DinoOf(low);
                    if (skinned && d.HasValue) { f.key = "dino:" + d.Value.key; f.plan = d.Value.plan; yield return f; continue; }
                    if (!f.prefab) continue;
                    bool particles = go.GetComponentInChildren<ParticleSystem>(true) != null;
                    bool meshes = go.GetComponentInChildren<MeshRenderer>(true) != null;
                    if (low.Contains("portal") && meshes && !low.Contains("hovl")) { f.key = "portal"; yield return f; continue; }
                    if (particles && !skinned) { f.key = "fx"; yield return f; }
                }
        }

        /* ------------------ Building the links ------------------ */

        static void Run(bool tell)
        {
            var found = Scan().ToList();
            Folder(Path.GetDirectoryName(LINKS).Replace('\\', '/'));
            Folder(GEN + "/Controllers");
            var links = AssetDatabase.LoadAssetAtPath<AssetLinks>(LINKS);
            if (links == null) { links = ScriptableObject.CreateInstance<AssetLinks>(); AssetDatabase.CreateAsset(links, LINKS); }

            // Dinosaurs: one model per kind (prefabs before bare models).
            links.dinosaurs.Clear();
            foreach (var g in found.Where((f) => f.key.StartsWith("dino:")).GroupBy((f) => f.key))
            {
                var all = g.OrderByDescending((f) => f.prefab).ThenBy((f) => f.path.Length).ToList();
                var m = MakeDino(g.Key.Substring(5), all[0], all);
                if (m != null) links.dinosaurs.Add(m);
            }
            MatchSpecies(links);

            // Portals
            links.portals = found.Where((f) => f.key == "portal").OrderBy((f) => f.path).Select((f) => f.go).Distinct().ToList();

            // Effects: from a magic/spell effects pack when there is one, so
            // things like muzzle flashes from other packs aren't used.
            var fx = found.Where((f) => f.key == "fx").ToList();
            var magic = fx.Where((f) => new[] { "hovl", "magic", "spell", "vfx", "effects" }.Any(f.low.Contains)).ToList();
            PickEffects(links, magic.Count > 0 ? magic : fx);

            EditorUtility.SetDirty(links);
            AssetDatabase.SaveAssets();
            string summary = $"Dinosaurs: {links.dinosaurs.Count} ({string.Join(", ", links.dinosaurs.Select((d) => d.name))})\n" +
                $"Species using them: {links.species.Count((s) => s.model >= 0)} of {Species.All.Length}\n" +
                $"Portals: {links.portals.Count}\n" +
                $"Effects: {new[] { links.dartHit, links.bullseye, links.blastHit, links.strikeHit, links.catchBurst, links.breakout, links.appear, links.guard, links.hack, links.claim, links.levelUp, links.projectile }.Count((x) => x != null)} slots filled";
            Debug.Log("Riftborn: imported assets hooked up.\n" + summary);
            if (tell) EditorUtility.DisplayDialog("Riftborn", "Imported assets hooked up.\n\n" + summary + "\n\nChange anything in Riftborn → Show asset links.", "OK");
            Selection.activeObject = links;
        }

        static void Folder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            var parent = Path.GetDirectoryName(path).Replace('\\', '/');
            Folder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        /* ------------------ Dinosaurs ------------------ */

        static readonly (string role, string[] keys)[] ROLES =
        {
            ("idle", new[] { "idle", "breath", "stand", "look" }),
            ("walk", new[] { "walk" }),
            ("run", new[] { "run", "sprint", "gallop", "charge", "trot" }),
            ("attack", new[] { "attack", "bite", "strike", "claw", "tailwhip", "tail_whip", "headbutt", "ram" }),
            ("roar", new[] { "roar", "call", "scream", "growl", "howl", "bellow", "screech" }),
            ("hit", new[] { "hit", "hurt", "damage", "flinch", "impact", "pain" }),
            ("die", new[] { "die", "death", "dead", "dying" }),
            ("fly", new[] { "fly", "flap", "glide", "soar", "hover" }),
        };

        static DinoModel MakeDino(string key, Found main, List<Found> group)
        {
            var go = main.go;
            // Every clip that belongs to this dinosaur.
            var clips = new List<AnimationClip>();
            void AddFrom(string path) { foreach (var c in AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>()) if (!c.name.StartsWith("__preview__")) clips.Add(c); }
            foreach (var f in group)
            {
                var an = f.go.GetComponentInChildren<Animator>(true);
                if (an != null && an.runtimeAnimatorController != null) clips.AddRange(an.runtimeAnimatorController.animationClips);
                foreach (var smr in f.go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                    if (smr.sharedMesh != null) AddFrom(AssetDatabase.GetAssetPath(smr.sharedMesh));
            }
            string dir = Path.GetDirectoryName(main.path).Replace('\\', '/');
            string up = Path.GetDirectoryName(dir)?.Replace('\\', '/');
            var folders = new[] { dir, up }.Where((d) => !string.IsNullOrEmpty(d) && AssetDatabase.IsValidFolder(d) && d != "Assets").Distinct().ToArray();
            if (folders.Length > 0)
                foreach (var guid in AssetDatabase.FindAssets("t:AnimationClip", folders))
                {
                    string p = AssetDatabase.GUIDToAssetPath(guid);
                    if (p.ToLowerInvariant().Contains(key)) AddFrom(p);
                }
            clips = clips.Where((c) => c != null).GroupBy((c) => c.name).Select((g) => g.First()).ToList();

            var m = new DinoModel { name = Cap(key), prefab = go, plan = main.plan };
            string Pick(string[] keys) => clips.Where((c) => keys.Any((k) => c.name.ToLowerInvariant().Contains(k))).OrderBy((c) => c.name.Length).Select((c) => c.name).FirstOrDefault() ?? "";
            var picked = ROLES.ToDictionary((r) => r.role, (r) => Pick(r.keys));
            if (picked["idle"] == "" && clips.Count > 0) picked["idle"] = clips[0].name;

            // A controller with one state per clip; the game plays them by name.
            if (clips.Count > 0)
            {
                string cpath = $"{GEN}/Controllers/{Cap(key)}.controller";
                AssetDatabase.DeleteAsset(cpath);
                var ctrl = AnimatorController.CreateAnimatorControllerAtPath(cpath);
                var sm = ctrl.layers[0].stateMachine;
                var names = new Dictionary<string, string>();
                foreach (var c in clips)
                {
                    var st = sm.AddState(c.name);
                    st.motion = c;
                    names[c.name] = st.name;
                    if (c.name == picked["idle"]) sm.defaultState = st;
                }
                string N(string role) => picked[role] != "" && names.TryGetValue(picked[role], out var n) ? n : "";
                m.controller = ctrl;
                m.idle = N("idle"); m.walk = N("walk"); m.run = N("run"); m.attack = N("attack");
                m.roar = N("roar"); m.hit = N("hit"); m.die = N("die"); m.fly = N("fly");
            }

            // Skins: the materials of every version of this model, plus any
            // in its folder named after it.
            var skins = new List<Material>();
            foreach (var f in group)
                foreach (var r in f.go.GetComponentsInChildren<Renderer>(true))
                    if (r.sharedMaterial != null) skins.Add(r.sharedMaterial);
            if (folders.Length > 0)
                foreach (var guid in AssetDatabase.FindAssets("t:Material", folders))
                {
                    string p = AssetDatabase.GUIDToAssetPath(guid);
                    if (Path.GetFileName(p).ToLowerInvariant().Contains(key)) skins.Add(AssetDatabase.LoadAssetAtPath<Material>(p));
                }
            m.skins = skins.Where((x) => x != null).Distinct().ToArray();
            if (m.skins.Length < 2) m.skins = new Material[0];

            m.yaw = GuessYaw(go);
            return m;
        }

        static string Cap(string s) => string.Join("", s.Split('-', '_', ' ').Where((x) => x != "").Select((x) => char.ToUpperInvariant(x[0]) + x.Substring(1)));

        // Which way the model faces: from its middle towards its head bone.
        static float GuessYaw(GameObject prefab)
        {
            var go = UnityEngine.Object.Instantiate(prefab);
            try
            {
                go.transform.position = Vector3.zero; go.transform.rotation = Quaternion.identity;
                var rs = go.GetComponentsInChildren<Renderer>();
                if (rs.Length == 0) return 0;
                var b = rs[0].bounds; foreach (var r in rs) b.Encapsulate(r.bounds);
                var all = go.GetComponentsInChildren<Transform>();
                var head = all.FirstOrDefault((t) => t.name.ToLowerInvariant().Contains("head") && t.childCount > 0) ?? all.FirstOrDefault((t) => t.name.ToLowerInvariant().Contains("head"));
                Vector3 dir;
                if (head != null) dir = head.position - b.center;
                else dir = b.size.x > b.size.z ? Vector3.right : Vector3.forward;
                dir.y = 0;
                if (dir.sqrMagnitude < 1e-6f) return 0;
                float yaw = -Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
                return Mathf.Round(yaw / 90) * 90;   // models face along an axis
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
        }

        // Each species gets a model of its body type (or the closest),
        // preferring an obvious match for its features.
        static void MatchSpecies(AssetLinks links)
        {
            links.species.Clear();
            var near = new Dictionary<Plan, Plan[]>
            {
                { Plan.Raptor, new[] { Plan.Raptor, Plan.Rex } }, { Plan.Rex, new[] { Plan.Rex, Plan.Raptor } },
                { Plan.Horned, new[] { Plan.Horned, Plan.Plated, Plan.Longneck } }, { Plan.Plated, new[] { Plan.Plated, Plan.Horned, Plan.Longneck } },
                { Plan.Longneck, new[] { Plan.Longneck, Plan.Plated, Plan.Horned } }, { Plan.Flyer, new[] { Plan.Flyer } },
            };
            var prefer = new (string feat, string[] keys)[]
            {
                ("dome", new[] { "pachy" }), ("sail", new[] { "spino" }), ("club", new[] { "ankylo" }),
                ("plates", new[] { "stego", "stega" }), ("frill", new[] { "tricer", "styraco" }), ("horns3", new[] { "tricer" }),
            };
            foreach (var sp in Species.All)
            {
                int pick = -1;
                foreach (var (feat, keys) in prefer)
                {
                    if (!sp.Has(feat)) continue;
                    pick = links.dinosaurs.FindIndex((d) => keys.Any((k) => d.name.ToLowerInvariant().Contains(k)));
                    if (pick >= 0) break;
                }
                if (pick < 0)
                    foreach (var plan in near[sp.plan])
                    {
                        var idx = Enumerable.Range(0, links.dinosaurs.Count).Where((i) => links.dinosaurs[i].plan == plan).ToList();
                        if (idx.Count == 0) continue;
                        pick = idx[(int)(Rng.Hash("model:" + sp.id) % (uint)idx.Count)];
                        break;
                    }
                links.species.Add(new SpeciesModel { species = sp.id, model = pick, skin = -1 });
            }
        }

        /* ------------------ Effects ------------------ */

        static void PickEffects(AssetLinks links, List<Found> fx)
        {
            var used = new HashSet<GameObject>();
            string Name(Found f) => Path.GetFileNameWithoutExtension(f.path).ToLowerInvariant();
            GameObject Pick(params string[] keys)
            {
                foreach (var k in keys)
                {
                    var f = fx.Where((x) => Name(x).Contains(k)).OrderBy((x) => used.Contains(x.go) ? 1 : 0).ThenBy((x) => x.path.Length).FirstOrDefault();
                    if (f != null) { used.Add(f.go); return f.go; }
                }
                return null;
            }
            GameObject Any() { var f = fx.FirstOrDefault((x) => !used.Contains(x.go)) ?? fx.FirstOrDefault(); if (f != null) used.Add(f.go); return f?.go; }

            links.blastHit = Pick("explosion", "explode", "blast", "burst", "nova", "boom");
            links.dartHit = Pick("spark", "hit", "impact", "small", "flash");
            links.bullseye = Pick("star", "crit", "flash", "spark");
            links.strikeHit = Pick("slash", "claw", "cut", "hit", "impact");
            links.catchBurst = Pick("star", "sparkle", "heal", "burst", "circle", "explosion");
            links.breakout = Pick("explosion", "burst", "blast", "nova");
            links.appear = Pick("portal", "summon", "spawn", "teleport", "circle");
            links.guard = Pick("shield", "barrier", "aura", "circle");
            links.hack = Pick("circle", "rune", "magic", "spark", "aura");
            links.claim = Pick("pillar", "beam", "circle", "rune", "explosion");
            links.levelUp = Pick("level", "buff", "heal", "pillar", "aura", "star", "circle");
            links.projectile = Pick("projectile", "missile", "bolt", "fireball", "ball", "orb", "bullet", "trail");
            if (fx.Count > 0)
            {
                links.blastHit ??= Any(); links.dartHit ??= links.blastHit; links.strikeHit ??= links.dartHit;
                links.catchBurst ??= links.blastHit; links.breakout ??= links.blastHit;
            }

            // Effects named after an element replace the tinted ones.
            var elKeys = new Dictionary<El, string[]>
            {
                { El.Ember, new[] { "fire", "flame", "burn", "ember", "lava", "magma" } },
                { El.Tide, new[] { "water", "ice", "frost", "aqua", "wave", "snow", "bubble" } },
                { El.Gale, new[] { "wind", "air", "tornado", "gust", "cyclone", "leaf" } },
                { El.Stone, new[] { "earth", "rock", "stone", "sand", "ground", "dust" } },
                { El.Volt, new[] { "lightning", "electric", "thunder", "shock", "zap", "volt" } },
                { El.Void, new[] { "dark", "shadow", "void", "purple", "arcane", "poison", "black" } },
            };
            links.elements.Clear();
            foreach (var kv in elKeys)
            {
                var mine = fx.Where((x) => kv.Value.Any((k) => Name(x).Contains(k))).ToList();
                if (mine.Count == 0) continue;
                var proj = mine.FirstOrDefault((x) => new[] { "projectile", "missile", "bolt", "ball", "orb", "bullet", "trail" }.Any((k) => Name(x).Contains(k)));
                var hit = mine.FirstOrDefault((x) => x != proj && new[] { "explosion", "hit", "impact", "blast", "burst", "nova" }.Any((k) => Name(x).Contains(k))) ?? mine.FirstOrDefault((x) => x != proj);
                links.elements.Add(new ElementFx { element = kv.Key, projectile = proj?.go, hit = hit?.go });
            }
        }
    }
}

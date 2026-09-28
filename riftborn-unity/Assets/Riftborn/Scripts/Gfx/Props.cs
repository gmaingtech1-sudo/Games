// Riftborn — the things on the map besides creatures: Rift towers (a
// floating crystal over standing stones, a beam of light, orbiting shards),
// supply crates, Rift Orbs, boulders, markers and your agent.
using System.Collections.Generic;
using UnityEngine;

namespace Riftborn
{
    // Turns a quad to face the camera.
    public class Billboard : MonoBehaviour
    {
        void LateUpdate()
        {
            var cam = Camera.main;
            if (cam) transform.rotation = cam.transform.rotation;
        }
    }

    public static class Props
    {
        static Mesh quad;
        public static Mesh Quad
        {
            get
            {
                if (quad != null) return quad;
                quad = Shapes.Build(new List<Vector3> { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) },
                    new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) }, new List<int> { 0, 2, 1, 0, 3, 2 }, "quad", true);
                return quad;
            }
        }

        public static GameObject Mesh(string name, Mesh mesh, Material mat, Transform parent = null, bool shadow = true)
        {
            var go = new GameObject(name);
            if (parent) go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = shadow ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = shadow;
            return go;
        }

        // A soft glowing sprite that always faces the camera.
        public static GameObject Glow(Color color, float size, Transform parent = null)
        {
            var go = Mesh("glow", Quad, Mats.Glow(color), parent, false);
            go.transform.localScale = Vector3.one * size;
            go.AddComponent<Billboard>();
            return go;
        }

        // A flat glowing ring on the ground.
        public static GameObject Ring(Color color, float radius, Transform parent = null)
        {
            var go = Mesh("ring", Quad, Mats.Glow(color, Tex.Ring), parent, false);
            go.transform.localRotation = Quaternion.Euler(90, 0, 0);
            go.transform.localScale = Vector3.one * radius * 2;
            return go;
        }

        /* ------------------ Rocks ------------------ */

        static readonly Dictionary<int, Mesh> rocks = new Dictionary<int, Mesh>();
        static Material stone;

        static Mesh Icosphere(int detail)
        {
            float t = (1 + Mathf.Sqrt(5)) / 2;
            var v = new List<Vector3> { new Vector3(-1, t, 0), new Vector3(1, t, 0), new Vector3(-1, -t, 0), new Vector3(1, -t, 0), new Vector3(0, -1, t), new Vector3(0, 1, t), new Vector3(0, -1, -t), new Vector3(0, 1, -t), new Vector3(t, 0, -1), new Vector3(t, 0, 1), new Vector3(-t, 0, -1), new Vector3(-t, 0, 1) };
            for (int i = 0; i < v.Count; i++) v[i] = v[i].normalized;
            var f = new List<int> { 0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1 };
            for (int d = 0; d < detail; d++)
            {
                var mid = new Dictionary<long, int>();
                int Mid(int a, int b)
                {
                    long key = a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a;
                    if (mid.TryGetValue(key, out int m)) return m;
                    v.Add(((v[a] + v[b]) * 0.5f).normalized);
                    return mid[key] = v.Count - 1;
                }
                var nf = new List<int>();
                for (int k = 0; k < f.Count; k += 3)
                {
                    int a = f[k], b = f[k + 1], c = f[k + 2], ab = Mid(a, b), bc = Mid(b, c), ca = Mid(c, a);
                    nf.AddRange(new[] { a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca });
                }
                f = nf;
            }
            var uv = new List<Vector2>();
            foreach (var p in v) uv.Add(new Vector2(Mathf.Atan2(p.z, p.x) / (Mathf.PI * 2) + 0.5f, p.y * 0.5f + 0.5f));
            return Shapes.Build(v, uv, f, "icosphere");
        }

        // Boulders: a sphere pushed in and out by layered noise, flattened at
        // the bottom, with a few split faces.
        public static GameObject Rock(int i, Transform parent = null)
        {
            int k = i % 4;
            if (!rocks.TryGetValue(k, out var mesh))
            {
                mesh = Icosphere(3);
                var r = new Seeded("rock" + k);
                var bumps = new List<(Vector3 d, float a)>();
                for (int b = 0; b < 6; b++) bumps.Add((new Vector3((float)r.Next() - 0.5f, (float)r.Next() - 0.5f, (float)r.Next() - 0.5f).normalized, ((float)r.Next() - 0.4f) * 0.5f));
                var verts = mesh.vertices;
                for (int j = 0; j < verts.Length; j++)
                {
                    var n = verts[j].normalized;
                    float s = 1;
                    foreach (var (d, a) in bumps) s += a * Mathf.Pow(Mathf.Max(0, Vector3.Dot(n, d)), 2);
                    s += (Tex.Noise(n.x * 2.2f + k * 7 + 50, n.y * 2.2f + n.z * 1.7f + 50, 11) - 0.5f) * 0.35f;
                    s += (Tex.Noise(n.x * 6 + 80, n.z * 6 + n.y * 3 + 80, 12) - 0.5f) * 0.12f;
                    s = Mathf.Min(s, 1.12f - Mathf.Abs(Vector3.Dot(n, bumps[0].d)) * 0.1f);
                    var p = n * s;
                    if (p.y < -0.3f) p.y = -0.3f + (p.y + 0.3f) * 0.3f;
                    verts[j] = p;
                }
                mesh.vertices = verts;
                mesh.RecalculateNormals();
                mesh.RecalculateBounds();
                rocks[k] = mesh;
            }
            if (stone == null)
            {
                var tex = Tex.Make(256, 128, (x, y) =>
                {
                    float n = Tex.Fbm(x / 16f, y / 16f, 5, 16);
                    float speck = Tex.Noise(x * 1.7f, y * 1.7f, 9);
                    var c = Color.Lerp(new Color(0.36f, 0.35f, 0.34f), new Color(0.52f, 0.5f, 0.47f), n);
                    if (speck > 0.8f) c *= 0.75f; else if (speck < 0.12f) c = Color.Lerp(c, Color.white, 0.2f);
                    if (y > 96 && Tex.Noise(x / 6f, y / 6f, 3) > 0.6f) c = Color.Lerp(c, new Color(0.42f, 0.5f, 0.3f), 0.5f);
                    c.a = 1; return c;
                });
                stone = Mats.Skin(tex, new Vector2(3, 2), null, 0.15f);
            }
            return Mesh("rock", mesh, stone, parent);
        }

        /* ------------------ Rift ------------------ */

        public class RiftProp
        {
            public GameObject root; GameObject crystal, glow, beam, ring, ready; readonly List<GameObject> shards = new List<GameObject>();
            Material crystalMat, glowMat, beamMat, ringMat, shardMat; int level; float t = Random.value * 10;
            public Collider pick;

            public RiftProp()
            {
                root = new GameObject("Rift");
                for (int i = 0; i < 7; i++)
                {
                    float a = i / 7f * Mathf.PI * 2;
                    var rk = Rock(i, root.transform);
                    rk.transform.localPosition = new Vector3(Mathf.Cos(a) * 4.2f, 1.4f, Mathf.Sin(a) * 4.2f);
                    rk.transform.localScale = new Vector3(1, 2.4f + (i % 3) * 0.7f, 1);
                    rk.transform.localRotation = Quaternion.Euler(0.15f * Mathf.Cos(a) * Mathf.Rad2Deg, a * Mathf.Rad2Deg, 0.15f * Mathf.Sin(a) * Mathf.Rad2Deg);
                }
                crystalMat = Mats.Emissive(Color.white, Color.white, 0.85f);
                crystal = Mesh("crystal", Octahedron(), crystalMat, root.transform);
                crystal.transform.localScale = new Vector3(1.8f, 4.6f, 1.8f);
                glow = Glow(Color.white, 9, root.transform); glowMat = glow.GetComponent<Renderer>().sharedMaterial;
                beamMat = Mats.Glow(Color.white, Tex.Beam);
                beam = Mesh("beam", Cylinder(), beamMat, root.transform, false);
                beam.transform.localPosition = new Vector3(0, 45, 0);
                beam.transform.localScale = new Vector3(1.1f, 90, 1.1f);
                ring = Ring(Color.white, 8, root.transform); ringMat = ring.GetComponent<Renderer>().sharedMaterial;
                ring.transform.localPosition = new Vector3(0, 0.25f, 0);
                ready = Ring(Color.white, 11, root.transform);
                ready.transform.localPosition = new Vector3(0, 0.3f, 0);
                shardMat = Mats.Emissive(Color.white, Color.white, 0.8f);
                for (int i = 0; i < 8; i++)
                {
                    var sh = Mesh("shard", Octahedron(), shardMat, root.transform);
                    sh.transform.localScale = new Vector3(0.6f, 1.1f, 0.6f);
                    shards.Add(sh);
                }
                var col = root.AddComponent<CapsuleCollider>();
                col.center = new Vector3(0, 10, 0); col.radius = 7; col.height = 24;
                pick = col;
            }

            public void Set(RiftState st, Color color, bool canHack)
            {
                bool held = st.faction != null;
                crystalMat.color = color;
                crystalMat.SetColor("_EmissionColor", color * (held ? 1.4f : 0.3f));
                glowMat.color = color; glow.SetActive(held);
                beamMat.color = color * 0.6f; beam.SetActive(held);
                ringMat.color = color;
                shardMat.color = color; shardMat.SetColor("_EmissionColor", color * 1.4f);
                level = held ? st.level : 0;
                for (int i = 0; i < shards.Count; i++) shards[i].SetActive(i < level);
                ready.SetActive(canHack);
            }

            public void Update(float dt)
            {
                t += dt;
                crystal.transform.localPosition = new Vector3(0, 10 + Mathf.Sin(t * 1.4f) * 0.6f, 0);
                crystal.transform.localRotation = Quaternion.Euler(0, t * 34, 0);
                glow.transform.localPosition = crystal.transform.localPosition;
                ring.transform.localScale = Vector3.one * 16 * (1 + Mathf.Sin(t * 2) * 0.05f);
                ready.transform.localRotation = Quaternion.Euler(90, -t * 46, 0);
                for (int i = 0; i < shards.Count; i++)
                {
                    float a = t * 0.5f + i / (float)Mathf.Max(1, level) * Mathf.PI * 2;
                    shards[i].transform.localPosition = new Vector3(Mathf.Cos(a) * 6.5f, 6 + Mathf.Sin(t * 2 + i) * 0.5f, Mathf.Sin(a) * 6.5f);
                    shards[i].transform.localRotation = Quaternion.Euler(0, t * 57, 0);
                }
            }
        }

        static Mesh octa, cyl;
        public static Mesh Octahedron()
        {
            if (octa != null) return octa;
            var v = new List<Vector3> { Vector3.up, Vector3.down, Vector3.right, Vector3.left, Vector3.forward, Vector3.back };
            var f = new List<int> { 0, 4, 2, 0, 3, 4, 0, 5, 3, 0, 2, 5, 1, 2, 4, 1, 4, 3, 1, 3, 5, 1, 5, 2 };
            var pos = new List<Vector3>(); var uv = new List<Vector2>(); var tris = new List<int>();
            for (int k = 0; k < f.Count; k++) { pos.Add(v[f[k]]); uv.Add(Vector2.zero); tris.Add(k); }
            // Flat faces (each triangle has its own vertices).
            return octa = Shapes.Build(pos, uv, tris, "octahedron", true);
        }

        // An open tube from y = -0.5 to 0.5, narrower at the top (beams).
        public static Mesh Cylinder()
        {
            if (cyl != null) return cyl;
            var pos = new List<Vector3>(); var uv = new List<Vector2>(); var tris = new List<int>();
            const int S = 16;
            for (int k = 0; k <= S; k++)
            {
                float a = k / (float)S * Mathf.PI * 2;
                pos.Add(new Vector3(Mathf.Sin(a), -0.5f, Mathf.Cos(a))); uv.Add(new Vector2(k / (float)S, 0));
                pos.Add(new Vector3(Mathf.Sin(a) * 0.32f, 0.5f, Mathf.Cos(a) * 0.32f)); uv.Add(new Vector2(k / (float)S, 1));
                if (k > 0) { int b = (k - 1) * 2; tris.AddRange(new[] { b, b + 1, b + 2, b + 1, b + 3, b + 2 }); }
            }
            return cyl = Shapes.Build(pos, uv, tris, "beam", true);
        }

        /* ------------------ Crate ------------------ */

        public class CrateProp
        {
            public GameObject root; GameObject lid, light; public Collider pick; float t;
            static Material wood, metal;
            public CrateProp()
            {
                if (wood == null)
                {
                    wood = Mats.Skin(Tex.Make(128, 128, (x, y) =>
                    {
                        float grain = Tex.Noise(x / 30f, y / 3f, 21);
                        var c = Color.Lerp(new Color(0.46f, 0.3f, 0.14f), new Color(0.62f, 0.43f, 0.2f), grain);
                        if (y % 32 < 2) c *= 0.6f;
                        c.a = 1; return c;
                    }), new Vector2(1, 1), null, 0.2f);
                    metal = Mats.Solid(new Color(0.25f, 0.26f, 0.3f), 0.6f, 0.7f);
                }
                root = new GameObject("Cache");
                var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(box.GetComponent<Collider>());
                box.transform.SetParent(root.transform, false);
                box.transform.localScale = new Vector3(3.2f, 2, 2.2f);
                box.transform.localPosition = new Vector3(0, 1, 0);
                box.GetComponent<Renderer>().sharedMaterial = wood;
                lid = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(lid.GetComponent<Collider>());
                lid.transform.SetParent(root.transform, false);
                lid.transform.localScale = new Vector3(3.4f, 0.35f, 2.4f);
                lid.GetComponent<Renderer>().sharedMaterial = metal;
                light = Glow(new Color(1, 0.75f, 0.2f), 3, root.transform);
                light.transform.localPosition = new Vector3(1.2f, 3, 0.8f);
                var col = root.AddComponent<BoxCollider>();
                col.center = new Vector3(0, 2, 0); col.size = new Vector3(8, 6, 8);
                pick = col;
            }
            public void Set(bool full) { lid.transform.localPosition = full ? new Vector3(0, 2.15f, 0) : new Vector3(0, 2.8f, -0.8f); lid.transform.localRotation = full ? Quaternion.identity : Quaternion.Euler(-35, 0, 0); light.SetActive(full); }
            public void Update(float dt) { t += dt; light.transform.localScale = Vector3.one * (2.5f + Mathf.Sin(t * 6) * 0.8f); }
        }

        /* ------------------ Orb ------------------ */

        // A Rift Orb, radius 1: a glowing team-colour top over a dark bottom.
        public static GameObject Orb(Color color)
        {
            var root = new GameObject("Orb");
            Mesh("top", Shapes.Hemisphere(true), Mats.Emissive(color, color * 0.6f, 0.8f), root.transform);
            Mesh("bottom", Shapes.Hemisphere(false), Mats.Solid(new Color(0.11f, 0.09f, 0.19f), 0.8f, 0.6f), root.transform);
            var band = Mesh("band", Shapes.Torus(1, 0.09f, 8, 36), Mats.Solid(new Color(0.05f, 0.04f, 0.08f), 0.6f), root.transform);
            band.transform.localRotation = Quaternion.Euler(90, 0, 0);
            var button = Mesh("button", Shapes.Sphere(), Mats.Emissive(Color.white, color * 0.8f), root.transform);
            button.transform.localScale = new Vector3(0.28f, 0.28f, 0.12f);
            button.transform.localPosition = new Vector3(0, 0, 0.96f);
            return root;
        }

        /* ------------------ Agent ------------------ */

        // Your agent: a simple walking figure in a team-coloured jacket.
        public class Avatar
        {
            public GameObject root; readonly Transform legL, legR, armL, armR, hips; float ph, t;
            public Avatar(Color color)
            {
                root = new GameObject("Agent");
                var skin = Mats.Solid(new Color(0.79f, 0.56f, 0.42f), 0.35f);
                var jacket = Mats.Solid(color * 0.55f, 0.45f);
                var trim = Mats.Emissive(color, color * 1.2f);
                var pants = Mats.Solid(new Color(0.15f, 0.14f, 0.2f), 0.2f);
                hips = new GameObject("hips").transform; hips.SetParent(root.transform, false); hips.localPosition = new Vector3(0, 0.95f, 0);
                Transform Part(string n, Mesh m, Material mat, Transform parent, Vector3 pos, Vector3 scale)
                {
                    var go = Mesh(n, m, mat, parent); go.transform.localPosition = pos; go.transform.localScale = scale; return go.transform;
                }
                var sphere = Shapes.Sphere();
                Part("torso", sphere, jacket, hips, new Vector3(0, 0.35f, 0), new Vector3(0.24f, 0.34f, 0.16f));
                Part("trim", sphere, trim, hips, new Vector3(0, 0.36f, 0.12f), new Vector3(0.03f, 0.3f, 0.05f));
                Part("head", sphere, skin, hips, new Vector3(0, 0.8f, 0), new Vector3(0.12f, 0.14f, 0.13f));
                Part("hair", sphere, pants, hips, new Vector3(0, 0.86f, -0.02f), new Vector3(0.125f, 0.1f, 0.13f));
                Transform Limb(float x, float y, Material m, float len)
                {
                    var pivot = new GameObject("limb").transform; pivot.SetParent(hips, false); pivot.localPosition = new Vector3(x, y, 0);
                    Part("seg", sphere, m, pivot, new Vector3(0, -len / 2, 0), new Vector3(0.065f, len / 2, 0.07f));
                    return pivot;
                }
                legL = Limb(0.1f, 0, pants, 0.9f); legR = Limb(-0.1f, 0, pants, 0.9f);
                armL = Limb(0.28f, 0.6f, jacket, 0.6f); armR = Limb(-0.28f, 0.6f, jacket, 0.6f);
            }
            public void Update(float dt, float speed)
            {
                t += dt;
                float wk = Mathf.Min(1, speed / 1.2f);
                ph += dt * (2 + speed * 3.2f);
                float s = Mathf.Sin(ph) * wk;
                legL.localRotation = Quaternion.Euler(s * 30, 0, 0); legR.localRotation = Quaternion.Euler(-s * 30, 0, 0);
                armL.localRotation = Quaternion.Euler(-s * 25, 0, 5); armR.localRotation = Quaternion.Euler(s * 25, 0, -5);
                hips.localPosition = new Vector3(0, 0.95f + Mathf.Abs(Mathf.Cos(ph)) * 0.04f * wk + Mathf.Sin(t * 2) * 0.006f, 0);
            }
        }
    }
}

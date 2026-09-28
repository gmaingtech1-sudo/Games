// Riftborn — simple generated meshes: spheres (with the same UV layout as
// three.js, so eye textures line up), cones, capsule toes, tori, frills,
// plates and flat crests, plus a helper to put vertex lists into a Mesh.
using System.Collections.Generic;
using UnityEngine;

namespace Riftborn
{
    public static class Shapes
    {
        public static Mesh Build(List<Vector3> pos, List<Vector2> uv, List<int> tris, string name = "shape", bool doubleSided = false)
        {
            if (doubleSided)
            {
                int n = pos.Count;
                pos.AddRange(pos.GetRange(0, n));
                uv.AddRange(uv.GetRange(0, n));
                int t = tris.Count;
                for (int k = 0; k < t; k += 3) { tris.Add(tris[k] + n); tris.Add(tris[k + 2] + n); tris.Add(tris[k + 1] + n); }
            }
            var m = new Mesh { name = name };
            if (pos.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.SetVertices(pos);
            m.SetUVs(0, uv);
            m.SetTriangles(tris, 0);
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }

        static readonly Dictionary<string, Mesh> cache = new Dictionary<string, Mesh>();
        static Mesh Cached(string key, System.Func<Mesh> make) { if (!cache.TryGetValue(key, out var m) || m == null) cache[key] = m = make(); return m; }

        // Radius 1; u = 0.5 faces +x, like three.js's SphereGeometry.
        public static Mesh Sphere(int w = 16, int h = 12) => Cached($"sphere{w}x{h}", () =>
        {
            var pos = new List<Vector3>(); var uv = new List<Vector2>(); var tris = new List<int>();
            for (int iy = 0; iy <= h; iy++)
            {
                float v = iy / (float)h;
                for (int ix = 0; ix <= w; ix++)
                {
                    float u = ix / (float)w;
                    pos.Add(new Vector3(-Mathf.Cos(u * Mathf.PI * 2) * Mathf.Sin(v * Mathf.PI), Mathf.Cos(v * Mathf.PI), Mathf.Sin(u * Mathf.PI * 2) * Mathf.Sin(v * Mathf.PI)));
                    uv.Add(new Vector2(u, 1 - v));
                }
            }
            for (int iy = 0; iy < h; iy++)
                for (int ix = 0; ix < w; ix++)
                {
                    int a = iy * (w + 1) + ix + 1, b = iy * (w + 1) + ix, c = (iy + 1) * (w + 1) + ix, d = (iy + 1) * (w + 1) + ix + 1;
                    if (iy != 0) { tris.Add(a); tris.Add(b); tris.Add(d); }
                    if (iy != h - 1) { tris.Add(b); tris.Add(c); tris.Add(d); }
                }
            return Build(pos, uv, tris, "sphere");
        });

        // The top or bottom half of a unit sphere.
        public static Mesh Hemisphere(bool top, int w = 24, int h = 16) => Cached($"hemi{top}", () =>
        {
            var sphere = Sphere(w, h);
            var pos = new List<Vector3>(); sphere.GetVertices(pos);
            var uv = new List<Vector2>(); sphere.GetUVs(0, uv);
            var all = sphere.triangles; var tris = new List<int>();
            for (int k = 0; k < all.Length; k += 3)
            {
                float y = (pos[all[k]].y + pos[all[k + 1]].y + pos[all[k + 2]].y) / 3;
                if ((y >= 0) == top) { tris.Add(all[k]); tris.Add(all[k + 1]); tris.Add(all[k + 2]); }
            }
            return Build(pos, uv, tris, "hemisphere");
        });

        // Base radius 1 at y = 0, tip at y = 1.
        public static Mesh Cone(int segs = 8, float flatZ = 1) => Cached($"cone{segs}:{flatZ}", () =>
        {
            var pos = new List<Vector3>(); var uv = new List<Vector2>(); var tris = new List<int>();
            for (int k = 0; k < segs; k++)
            {
                float a0 = k / (float)segs * Mathf.PI * 2, a1 = (k + 1) / (float)segs * Mathf.PI * 2;
                int b = pos.Count;
                pos.Add(new Vector3(Mathf.Sin(a0), 0, Mathf.Cos(a0) * flatZ));
                pos.Add(new Vector3(Mathf.Sin(a1), 0, Mathf.Cos(a1) * flatZ));
                pos.Add(new Vector3(0, 1, 0));
                uv.Add(new Vector2(k / (float)segs, 0)); uv.Add(new Vector2((k + 1) / (float)segs, 0)); uv.Add(new Vector2((k + 0.5f) / segs, 1));
                tris.Add(b); tris.Add(b + 1); tris.Add(b + 2);
            }
            return Build(pos, uv, tris, "cone");
        });

        // A rounded toe from y = 0 to y = 1, radius 1 (flattened later).
        public static Mesh Toe() => Cached("toe", () =>
        {
            var sphere = Sphere(10, 8);
            var pos = new List<Vector3>(); sphere.GetVertices(pos);
            for (int i = 0; i < pos.Count; i++) { var p = pos[i]; pos[i] = new Vector3(p.x, 0.5f + p.y * 0.5f, p.z); }
            var uv = new List<Vector2>(); sphere.GetUVs(0, uv);
            return Build(pos, uv, new List<int>(sphere.triangles), "toe");
        });

        // A ring around the z axis (eyelids).
        public static Mesh Torus(float R = 0.86f, float r = 0.3f, int radial = 8, int tubular = 20) => Cached($"torus{R}:{r}", () =>
        {
            var pos = new List<Vector3>(); var uv = new List<Vector2>(); var tris = new List<int>();
            for (int j = 0; j <= radial; j++)
                for (int i = 0; i <= tubular; i++)
                {
                    float u = i / (float)tubular * Mathf.PI * 2, v = j / (float)radial * Mathf.PI * 2;
                    pos.Add(new Vector3((R + r * Mathf.Cos(v)) * Mathf.Cos(u), (R + r * Mathf.Cos(v)) * Mathf.Sin(u), r * Mathf.Sin(v)));
                    uv.Add(new Vector2(i / (float)tubular, j / (float)radial));
                }
            for (int j = 1; j <= radial; j++)
                for (int i = 1; i <= tubular; i++)
                {
                    int a = (tubular + 1) * j + i - 1, b = (tubular + 1) * (j - 1) + i - 1, c = (tubular + 1) * (j - 1) + i, d = (tubular + 1) * j + i;
                    tris.Add(a); tris.Add(b); tris.Add(d); tris.Add(b); tris.Add(c); tris.Add(d);
                }
            return Build(pos, uv, tris, "torus");
        });

        // A curved shield of skin with a scalloped rim (ceratopsian frill).
        public static Mesh Frill(float R, out List<(Vector3 pos, Vector3 dir)> knobs)
        {
            const int NR = 8, NA = 28;
            float a0 = -0.14f * Mathf.PI, a1 = 1.14f * Mathf.PI;
            float Rim(float a) => 1 + 0.05f * Mathf.Cos(a * 11);
            var pos = new List<Vector3>(); var uv = new List<Vector2>(); var tris = new List<int>();
            for (int i = 0; i <= NR; i++)
                for (int j = 0; j <= NA; j++)
                {
                    float a = a0 + (a1 - a0) * j / NA;
                    float rr = R * (0.12f + 0.88f * i / NR) * (i == NR ? Rim(a) : 1);
                    float x = -Mathf.Cos(a) * rr, y = Mathf.Sin(a) * rr * 0.85f;
                    pos.Add(new Vector3(x, y, x * x * 1.8f - (i / (float)NR) * 0.03f));
                    uv.Add(new Vector2(0.5f + x / (R * 2.3f), 0.5f + y / (R * 2.3f)));
                }
            for (int i = 0; i < NR; i++)
                for (int j = 0; j < NA; j++)
                {
                    int q0 = i * (NA + 1) + j, q1 = q0 + 1, q2 = q0 + NA + 1, q3 = q2 + 1;
                    tris.Add(q0); tris.Add(q1); tris.Add(q2); tris.Add(q1); tris.Add(q3); tris.Add(q2);
                }
            knobs = new List<(Vector3, Vector3)>();
            for (int k = 2; k < NA; k += 3)
            {
                float a = a0 + (a1 - a0) * k / NA;
                float lx = -Mathf.Cos(a) * R * Rim(a);
                knobs.Add((new Vector3(lx, Mathf.Sin(a) * R * 0.85f * Rim(a), lx * lx * 1.8f - 0.03f), new Vector3(-Mathf.Cos(a), Mathf.Sin(a), 0)));
            }
            return Build(pos, uv, tris, "frill", true);
        }

        // A flat, slightly thick shape in the x-y plane from an outline.
        public static Mesh Flat(List<Vector2> outline, float thick, string name)
        {
            var pos = new List<Vector3>(); var uv = new List<Vector2>(); var tris = new List<int>();
            var c = Vector2.zero; foreach (var p in outline) c += p; c /= outline.Count;
            foreach (float z in new[] { thick / 2, -thick / 2 })
            {
                int b = pos.Count;
                pos.Add(new Vector3(c.x, c.y, z)); uv.Add(new Vector2(0.5f, 0.5f));
                foreach (var p in outline) { pos.Add(new Vector3(p.x, p.y, z)); uv.Add(new Vector2(p.x + 0.5f, p.y)); }
                for (int k = 0; k < outline.Count; k++)
                {
                    int i0 = b + 1 + k, i1 = b + 1 + (k + 1) % outline.Count;
                    if (z > 0) { tris.Add(b); tris.Add(i0); tris.Add(i1); } else { tris.Add(b); tris.Add(i1); tris.Add(i0); }
                }
            }
            int n = outline.Count;
            for (int k = 0; k < n; k++)
            {
                int f0 = 1 + k, f1 = 1 + (k + 1) % n, k0 = n + 2 + k, k1 = n + 2 + (k + 1) % n;
                tris.Add(f0); tris.Add(k0); tris.Add(f1); tris.Add(f1); tris.Add(k0); tris.Add(k1);
            }
            return Build(pos, uv, tris, name, true);
        }

        // A stegosaur-style plate of height h (base on y = 0).
        public static Mesh Plate(float h)
        {
            float w = h * 0.9f;
            var o = new List<Vector2>();
            for (int k = 0; k <= 8; k++) { float t = k / 8f; o.Add(Quad(new Vector2(-w / 2, 0), new Vector2(-w * 0.6f, h * 0.6f), new Vector2(0, h), t)); }
            for (int k = 1; k < 8; k++) { float t = k / 8f; o.Add(Quad(new Vector2(0, h), new Vector2(w * 0.6f, h * 0.6f), new Vector2(w / 2, 0), t)); }
            return Flat(o, 0.012f, "plate");
        }

        static Vector2 Quad(Vector2 a, Vector2 b, Vector2 c, float t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
    }
}

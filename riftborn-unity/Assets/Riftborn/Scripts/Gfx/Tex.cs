// Riftborn — generated textures: soft glows and rings, reptile scales
// (a Voronoi pattern), and each species' skin, eyes, wings and sails.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Riftborn
{
    public static class Tex
    {
        public static Texture2D Make(int w, int h, Func<int, int, Color> px, bool linear = false, TextureWrapMode wrap = TextureWrapMode.Repeat)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, true, linear) { wrapMode = wrap, anisoLevel = 4, filterMode = FilterMode.Trilinear };
            var data = new Color[w * h];
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) data[y * w + x] = px(x, y);
            t.SetPixels(data);
            t.Apply(true, false);
            return t;
        }

        static Texture2D grey, flat, glow, ring, beam;
        public static Texture2D Grey => grey ??= Make(4, 4, (x, y) => new Color(0.5f, 0.5f, 0.5f, 1), true);
        public static Texture2D FlatNormal => flat ??= Make(4, 4, (x, y) => new Color(0.5f, 0.5f, 1, 0.5f), true);

        // Soft round glow for sprites and particles.
        public static Texture2D Glow => glow ??= Make(64, 64, (x, y) =>
        {
            float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(32, 32)) / 32f;
            float a = Mathf.Clamp01(1 - d);
            return new Color(1, 1, 1, a * a);
        }, false, TextureWrapMode.Clamp);

        // A glowing ring (Rift bases, reach circle, markers).
        public static Texture2D Ring => ring ??= Make(128, 128, (x, y) =>
        {
            float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(64, 64)) / 64f;
            float a = Mathf.Exp(-Mathf.Pow((d - 0.86f) / 0.06f, 2)) + 0.12f * Mathf.Clamp01(1 - d);
            return new Color(1, 1, 1, Mathf.Clamp01(d < 1 ? a : 0));
        }, false, TextureWrapMode.Clamp);

        // Vertical beam fading upwards.
        public static Texture2D Beam => beam ??= Make(32, 128, (x, y) =>
        {
            float across = 1 - Mathf.Abs((x + 0.5f) / 16f - 1);
            return new Color(1, 1, 1, across * across * (1 - y / 128f));
        }, false, TextureWrapMode.Clamp);

        /* ------------------ Noise ------------------ */

        static float Lattice(int x, int y, int seed)
        {
            unchecked
            {
                uint n = (uint)(x * 374761393 + y * 668265263 + seed * 144665);
                n = (n ^ (n >> 13)) * 1274126177;
                return ((n ^ (n >> 16)) & 0xFFFFFF) / 16777216f;
            }
        }

        // Smooth value noise that tiles every `period` cells in x.
        public static float Noise(float x, float y, int seed, int period = 1 << 20)
        {
            int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y);
            float u = x - xi, v = y - yi;
            u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
            int x0 = ((xi % period) + period) % period, x1 = (x0 + 1) % period;
            float a = Lattice(x0, yi, seed), b = Lattice(x1, yi, seed), c = Lattice(x0, yi + 1, seed), d = Lattice(x1, yi + 1, seed);
            return Mathf.Lerp(Mathf.Lerp(a, b, u), Mathf.Lerp(c, d, u), v);
        }

        public static float Fbm(float x, float y, int seed, int period)
        {
            float s = 0, amp = 0.5f;
            for (int o = 0; o < 4; o++) { s += Noise(x, y, seed + o * 31, period) * amp; x *= 2; y *= 2; period *= 2; amp *= 0.5f; }
            return s / 0.9375f;
        }

        /* ------------------ Reptile scales ------------------ */

        // Shared, tileable scales from a Voronoi pattern: a normal map for the
        // raised scales, and grooves (a "multiply x2" detail map: 0.5 is no
        // change, darker in the grooves between scales).
        static Texture2D scaleNormal, scaleGrooves;
        public static Texture2D ScaleNormal { get { if (scaleNormal == null) BuildScales(); return scaleNormal; } }
        public static Texture2D ScaleGrooves { get { if (scaleGrooves == null) BuildScales(); return scaleGrooves; } }

        static void BuildScales()
        {
            const int N = 256, cells = 16;
            var r = new Seeded("scales-v2");
            var seeds = new Vector3[cells * cells];
            for (int j = 0; j < cells; j++) for (int i = 0; i < cells; i++) seeds[j * cells + i] = new Vector3((i + 0.1f + (float)r.Next() * 0.8f) / cells, (j + 0.1f + (float)r.Next() * 0.8f) / cells, (float)r.Next());
            var hgt = new float[N * N]; var groove = new float[N * N];
            for (int y = 0; y < N; y++)
            {
                for (int x = 0; x < N; x++)
                {
                    float px = (x + 0.5f) / N, py = (y + 0.5f) / N;
                    int ci = Mathf.FloorToInt(px * cells), cj = Mathf.FloorToInt(py * cells);
                    float d1 = 9, d2 = 9, k1 = 0;
                    for (int dj = -2; dj <= 2; dj++)
                    {
                        for (int di = -2; di <= 2; di++)
                        {
                            int ii = ((ci + di) % cells + cells) % cells, jj = ((cj + dj) % cells + cells) % cells;
                            var sd = seeds[jj * cells + ii];
                            float sx = sd.x + Mathf.Floor((ci + di) / (float)cells), sy = sd.y + Mathf.Floor((cj + dj) / (float)cells);
                            float d = Mathf.Sqrt((px - sx) * (px - sx) + (py - sy) * (py - sy));
                            if (d < d1) { d2 = d1; d1 = d; k1 = sd.z; } else if (d < d2) d2 = d;
                        }
                    }
                    float edge = Mathf.Clamp01((d2 - d1) * cells * 2.2f);
                    float dome = 1 - Mathf.Clamp01(d1 * cells * 0.9f);
                    hgt[y * N + x] = Mathf.Pow(edge, 0.55f) * (0.7f + 0.3f * k1) + dome * 0.25f;
                    groove[y * N + x] = edge;
                }
            }
            float At(int x, int y) => hgt[((y + N) % N) * N + ((x + N) % N)];
            const float K = 2.6f;
            // Packed for both normal-map layouts Unity uses: x in red and
            // alpha, y in green, z in blue.
            scaleNormal = Make(N, N, (x, y) =>
            {
                float dx = (At(x + 1, y) - At(x - 1, y)) * K, dy = (At(x, y + 1) - At(x, y - 1)) * K;
                var n = new Vector3(-dx, -dy, 1).normalized;
                return new Color(n.x * 0.5f + 0.5f, n.y * 0.5f + 0.5f, n.z * 0.5f + 0.5f, n.x * 0.5f + 0.5f);
            }, true);
            scaleGrooves = Make(N, N, (x, y) => { float g = 0.5f * (0.62f + 0.38f * Mathf.Sqrt(groove[y * N + x])); return new Color(g, g, g, 1); }, true);
        }

        /* ------------------ Species ------------------ */

        // Real animals are rarely neon: tone the colours down to natural ones
        // (fantasy Void and glowing species keep more).
        public static Color[] Natural(Species sp)
        {
            bool fantasy = sp.el == El.Void || sp.Has("glow");
            var cols = new[] { sp.dorsal, sp.belly, sp.accent };
            for (int i = 0; i < 3; i++)
            {
                Color.RGBToHSV(cols[i], out float h, out float s, out float v);
                s *= fantasy ? 0.9f : i == 2 ? 0.78f : 0.62f;
                v = Mathf.Clamp(v * (i == 1 ? 0.95f : 0.92f), 0.14f, i == 1 ? 0.9f : 0.72f);
                cols[i] = Color.HSVToRGB(h, s, v);
            }
            return cols;
        }

        static Color Grad(float t, (float at, Color c)[] stops)
        {
            if (t <= stops[0].at) return stops[0].c;
            for (int k = 1; k < stops.Length; k++)
                if (t <= stops[k].at) return Color.Lerp(stops[k - 1].c, stops[k].c, (t - stops[k - 1].at) / (stops[k].at - stops[k - 1].at));
            return stops[stops.Length - 1].c;
        }

        // Countershaded skin: pale belly (top and bottom rows), dark back
        // (middle), soft blotches, stripes or spots, speckle and a row of
        // scutes down the spine. Returns the colour map and, for glowing
        // species, an emission map.
        public static (Texture2D skin, Texture2D glow) Skin(Species sp, Color[] c, Seeded r)
        {
            const int W = 512, H = 256;
            Color dorsal = c[0], belly = c[1], accent = c[2];
            Color flank = Color.Lerp(dorsal, belly, 0.35f), back = dorsal * 0.72f; back.a = 1;
            var stops = new[] { (0f, belly), (0.18f, belly), (0.32f, flank), (0.43f, dorsal), (0.5f, back), (0.57f, dorsal), (0.68f, flank), (0.82f, belly), (1f, belly) };
            int seed = (int)(Rng.Hash(sp.id) & 0xFFFF);
            bool stripes = sp.Has("stripes"), spotted = sp.Has("spots"), glows = sp.Has("glow");
            var stripeX = new List<(float x, float w, float spread, float lean)>();
            if (stripes) { int n = 11 + (int)(r.Next() * 4); for (int i = 0; i < n; i++) stripeX.Add(((0.1f + 0.7f * i / (n - 1)) * W + ((float)r.Next() - 0.5f) * 20, 12 + (float)r.Next() * 14, 0.17f + (float)r.Next() * 0.06f, ((float)r.Next() - 0.3f) * 1.4f)); }
            // Spots are drawn into a mask first (much faster than testing
            // every spot at every pixel).
            var spotK = new float[W * H]; var spotC = new Color[W * H];
            if (spotted)
            {
                for (int i = 0; i < 170; i++)
                {
                    float sx = (float)r.Next() * W, sy = (0.27f + (float)r.Next() * 0.46f) * H, rad = 4 + (float)r.Next() * 11;
                    var sc = r.Next() < 0.6 ? accent : belly * 1.02f;
                    for (int y = Mathf.Max(0, (int)(sy - rad * 1.2f)); y < Mathf.Min(H, (int)(sy + rad * 1.2f) + 1); y++)
                        for (int x0 = (int)(sx - rad * 1.7f); x0 <= (int)(sx + rad * 1.7f); x0++)
                        {
                            int x = ((x0 % W) + W) % W;
                            float dx = (x0 - sx) / (rad * 1.4f), dy = (y - sy) / rad, d = dx * dx + dy * dy;
                            float k = Mathf.Clamp01((1.2f - d) * 2) * 0.62f;
                            if (k > spotK[y * W + x]) { spotK[y * W + x] = k; spotC[y * W + x] = sc; }
                        }
                }
            }
            Color elc = Species.Elements[sp.el].color;
            var glowPx = glows ? new Color[W * H] : null;
            var tex = Make(W, H, (x, y) =>
            {
                float u = x / (float)W, v = y / (float)H;
                // Uneven edges between back and belly.
                float vv = v + (Fbm(u * 24, v * 3, seed, 24) - 0.5f) * 0.09f;
                var col = Grad(vv, stops);
                // Blotches
                float b = Fbm(u * 40, v * 8, seed + 7, 40);
                float mid = 1 - Mathf.Clamp01(Mathf.Abs(v - 0.5f) * 3.2f);
                if (b > 0.58f) col *= 1 - (b - 0.58f) * 1.3f * mid;
                else if (b < 0.3f) col = Color.Lerp(col, Color.white, (0.3f - b) * 0.25f * mid);
                // Stripes: from the spine down both flanks, soft-edged.
                foreach (var s in stripeX)
                {
                    float dv = Mathf.Abs(v - 0.5f);
                    if (dv > s.spread) continue;
                    float f = dv / s.spread;
                    float cx = s.x + s.lean * s.w * f + Mathf.Sin(f * 9 + s.x) * s.w * 0.25f;
                    float half = s.w / 2 * (1 - f * 0.7f);
                    float d = Mathf.Abs(x - cx) - half;
                    if (d < 2.5f) { float k = Mathf.Clamp01((2.5f - d) / 5f) * 0.62f; col = Color.Lerp(col, accent * 0.85f, k); if (glowPx != null && d < 0) glowPx[y * W + x] = elc; }
                }
                if (spotK[y * W + x] > 0) col = Color.Lerp(col, spotC[y * W + x], spotK[y * W + x]);
                // Scutes down the spine
                if (Mathf.Abs(v - 0.5f) < 0.02f && (x % 12) < 7) col *= 0.8f;
                // Speckle
                float sp2 = Lattice(x, y, seed + 99);
                if (sp2 > 0.93f) col *= 0.86f; else if (sp2 < 0.05f) col = Color.Lerp(col, Color.white, 0.07f);
                if (glowPx != null && Mathf.Abs(v - 0.5f) < 0.018f && (x % 26) < 12) glowPx[y * W + x] = elc;
                col.a = 1;
                return col;
            });
            Texture2D glowTex = null;
            if (glowPx != null)
            {
                for (int i = 0; i < glowPx.Length; i++) if (glowPx[i].a == 0) glowPx[i] = Color.black;
                glowTex = new Texture2D(W, H, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat };
                glowTex.SetPixels(glowPx);
                glowTex.Apply(true, false);
            }
            return (tex, glowTex);
        }

        // Limbs: same colouring, darker towards the feet (u runs down the leg).
        public static Texture2D Limb(Color[] c, int seed)
        {
            Color dorsal = c[0], belly = c[1], flank = Color.Lerp(dorsal, belly, 0.35f);
            var stops = new[] { (0f, belly), (0.3f, flank), (0.5f, dorsal), (0.7f, flank), (1f, belly) };
            return Make(256, 128, (x, y) =>
            {
                float u = x / 256f, v = y / 128f;
                var col = Grad(v, stops);
                col = Color.Lerp(col, new Color(0.09f, 0.06f, 0.05f), Mathf.Pow(u, 2.2f) * 0.6f);
                float n = Lattice(x, y, seed);
                if (n > 0.92f) col *= 0.86f;
                col.a = 1;
                return col;
            });
        }

        // A reptile eye: iris with streaks and a dark rim, and a slit pupil.
        // The middle of the texture faces +x on the eye sphere.
        public static Texture2D Eye(Color iris, int seed)
        {
            return Make(128, 64, (x, y) =>
            {
                float dx = x + 0.5f - 64, dy = y + 0.5f - 32;
                float d = Mathf.Sqrt(dx * dx + dy * dy);
                var rim = new Color(0.1f, 0.07f, 0.05f);
                if (d > 17) return rim;
                float k = d / 17f;
                var col = Color.Lerp(iris * 1.1f, iris * 0.55f, Mathf.Clamp01((k - 0.5f) * 2));
                float ang = Mathf.Atan2(dy, dx);
                col *= 0.85f + 0.3f * Noise(ang * 12, 0, seed);
                if (k > 0.9f) col = Color.Lerp(col, rim, (k - 0.9f) * 10);
                if ((dx * dx) / 5f + (dy * dy) / 144f < 1) col = new Color(0.02f, 0.015f, 0.01f);
                col.a = 1;
                return col;
            }, false, TextureWrapMode.Clamp);
        }

        // Wing membrane: darker near the arm, fine fibres, veins, a darker
        // trailing edge (v runs from the arm to the trailing edge).
        public static Texture2D Membrane(Color[] c, int seed)
        {
            var baseCol = Color.Lerp(c[0], c[2], 0.45f);
            return Make(256, 128, (x, y) =>
            {
                float v = 1 - y / 128f;
                var col = Color.Lerp(baseCol * 0.55f, Color.Lerp(baseCol, c[1], 0.25f), Mathf.Clamp01(v * 1.4f));
                float fib = Mathf.Sin((x + Noise(x * 0.05f, y * 0.05f, seed) * 20) * 0.9f);
                col *= 0.92f + 0.08f * fib;
                if (v > 0.88f) col *= 1 - (v - 0.88f) * 3;
                col.a = 1;
                return col;
            });
        }

        // Sail: body colour at the base fading to the accent at the top, with
        // the spines showing through (u along the back, v up the sail).
        public static Texture2D Sail(Color[] c, int seed)
        {
            return Make(256, 128, (x, y) =>
            {
                float v = y / 128f;
                var col = Color.Lerp(c[0], c[2], Mathf.Clamp01(v * 1.3f));
                float rib = Mathf.Repeat(x + Noise(0, y * 0.05f, seed) * 3, 9f);
                if (rib < 1.6f) col *= 0.7f; else if (rib < 2.4f) col = Color.Lerp(col, Color.white, 0.1f);
                col.a = 1;
                return col;
            });
        }

        // Frill: body colour in the middle, bold accent bands to the rim.
        public static Texture2D Frill(Color[] c)
        {
            return Make(128, 128, (x, y) =>
            {
                float dx = x - 64, dy = y - 64, d = Mathf.Sqrt(dx * dx + dy * dy) / 64f;
                var col = Grad(d, new[] { (0f, c[0]), (0.55f, Color.Lerp(c[0], c[2], 0.5f)), (0.8f, c[2]), (1f, c[0] * 0.6f) });
                float ang = Mathf.Atan2(dy, dx);
                if (Mathf.Abs(d - 0.62f) < 0.1f && Mathf.Repeat(ang / (Mathf.PI * 2) * 12, 1) < 0.45f) col *= 0.8f;
                col.a = 1;
                return col;
            }, false, TextureWrapMode.Clamp);
        }
    }
}

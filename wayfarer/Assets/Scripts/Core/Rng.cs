using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>Small, fast, seedable random numbers (SplitMix64). The whole
    /// universe is derived from seeds, so the same galaxy seed always gives the
    /// same stars, planets, plants and creatures.</summary>
    public sealed class Rng
    {
        ulong state;

        public Rng(ulong seed) { state = seed ^ 0x9E3779B97F4A7C15UL; if (state == 0) state = 1; }

        public ulong NextULong()
        {
            ulong z = (state += 0x9E3779B97F4A7C15UL);
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            return z ^ (z >> 31);
        }

        /// <summary>[0, 1)</summary>
        public double Next() => (NextULong() >> 11) * (1.0 / (1UL << 53));

        public float NextF() => (float)Next();

        public double Range(double a, double b) => a + (b - a) * Next();

        public float Range(float a, float b) => a + (b - a) * NextF();

        /// <summary>Inclusive on both ends.</summary>
        public int Int(int a, int b) => a + (int)(Next() * (b - a + 1));

        public bool Chance(double p) => Next() < p;

        public T Pick<T>(IList<T> list) => list[Math.Min(list.Count - 1, (int)(Next() * list.Count))];

        public double Gaussian()
        {
            double u = 1.0 - Next(), v = Next();
            return Math.Sqrt(-2.0 * Math.Log(u)) * Math.Cos(2.0 * Math.PI * v);
        }

        public Vector3d OnSphere()
        {
            double z = Range(-1.0, 1.0), a = Range(0.0, Math.PI * 2);
            double r = Math.Sqrt(1 - z * z);
            return new Vector3d(r * Math.Cos(a), z, r * Math.Sin(a));
        }

        public int Weighted(IList<double> weights)
        {
            double total = 0;
            foreach (var w in weights) total += w;
            double r = Next() * total;
            for (int i = 0; i < weights.Count; i++)
            {
                r -= weights[i];
                if (r <= 0) return i;
            }
            return weights.Count - 1;
        }

        public Color Hsv(float h0, float h1, float s0, float s1, float v0, float v1)
        {
            float h = Range(h0, h1);
            h -= Mathf.Floor(h);
            return Color.HSVToRGB(h, Range(s0, s1), Range(v0, v1));
        }

        public Rng Fork(ulong salt) => new Rng(Hash.Mix(NextULong(), salt));
    }

    public static class Hash
    {
        public static ulong Mix(ulong a, ulong b)
        {
            ulong h = a * 0x9E3779B97F4A7C15UL ^ (b + 0x632BE59BD9B4E019UL + (a << 6) + (a >> 2));
            h ^= h >> 33; h *= 0xFF51AFD7ED558CCDUL;
            h ^= h >> 33; h *= 0xC4CEB9FE1A85EC53UL;
            h ^= h >> 33;
            return h;
        }

        public static ulong Mix(ulong a, ulong b, ulong c) => Mix(Mix(a, b), c);

        public static ulong Mix(ulong a, long x, long y, long z) =>
            Mix(Mix(Mix(a, (ulong)x), (ulong)y), (ulong)z);

        public static ulong String(string s)
        {
            ulong h = 1469598103934665603UL;
            foreach (char ch in s) { h ^= ch; h *= 1099511628211UL; }
            return Mix(h, 0x51ED270B27D2D3A1UL);
        }

        /// <summary>A stable 0..1 value from integer coordinates.</summary>
        public static double Unit(ulong seed, long x, long y, long z) =>
            (Mix(seed, x, y, z) >> 11) * (1.0 / (1UL << 53));
    }
}

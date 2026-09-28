// Riftborn — seeded randomness and small helpers. The hash and generator
// match the web game's (js/core.js) bit for bit, so the Unity version
// puts the same Rifts, caches and creatures on the same street corners.
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Riftborn
{
    public static class Rng
    {
        // 32-bit string hash (FNV-1a with an avalanche finish).
        public static uint Hash(string s)
        {
            uint h = 2166136261;
            foreach (char c in s)
            {
                h ^= c;
                h *= 16777619;
            }
            h ^= h >> 16; h *= 2246822507;
            h ^= h >> 13; h *= 3266489909;
            h ^= h >> 16;
            return h;
        }

        public static string Key(params object[] parts)
        {
            var bits = new string[parts.Length];
            for (int i = 0; i < parts.Length; i++)
                bits[i] = Convert.ToString(parts[i], CultureInfo.InvariantCulture);
            return string.Join(":", bits);
        }

        public static int RandInt(int a, int b, Func<double> r = null) => a + (int)Math.Floor((r ?? Next)() * (b - a + 1));

        static readonly Random shared = new Random();
        public static double Next() => shared.NextDouble();

        public static T Pick<T>(IList<T> items, Func<double> r) => items[(int)Math.Floor(r() * items.Count)];

        // Pick from items by weight(item).
        public static T Weighted<T>(IList<T> items, Func<T, double> weight, Func<double> r = null)
        {
            double total = 0;
            foreach (var it in items) total += weight(it);
            double x = (r ?? Next)() * total;
            foreach (var it in items)
            {
                x -= weight(it);
                if (x <= 0) return it;
            }
            return items[items.Count - 1];
        }

        public static string Dist(double m) => m < 1000 ? $"{Math.Round(m)} m" : (m / 1000).ToString(m < 10000 ? "0.0" : "0", CultureInfo.InvariantCulture) + " km";

        public static string Time(double ms)
        {
            int s = Math.Max(0, (int)Math.Ceiling(ms / 1000));
            if (s < 60) return s + "s";
            int m = s / 60;
            if (m < 60) return s % 60 != 0 ? $"{m}m {s % 60}s" : $"{m}m";
            return $"{m / 60}h {m % 60}m";
        }

        public static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    // Seeded generator (mulberry32) giving numbers in [0, 1).
    public class Seeded
    {
        uint a;
        public Seeded(uint seed) { a = seed; }
        public Seeded(string seed) { a = Rng.Hash(seed); }

        public double Next()
        {
            a += 0x6D2B79F5;
            uint t = a;
            t = (t ^ (t >> 15)) * (t | 1);
            t ^= t + (t ^ (t >> 7)) * (t | 61);
            return (t ^ (t >> 14)) / 4294967296.0;
        }

        public Func<double> Fn => Next;
    }
}

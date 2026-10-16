using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    public enum StarClass { M, K, G, F, A, B, O }

    /// <summary>What the galaxy map knows about a star before you visit it.</summary>
    public sealed class StarInfo
    {
        public ulong Seed;
        public long Sx, Sy, Sz;
        public int Index;
        public Vector3d GalPos;       // light-years from the galactic core
        public string Name;
        public StarClass Class;
        public double Temperature;    // kelvin
        public Color Color;
        public double Luminosity;     // relative to a G star
        public int PlanetCount;
        public bool HasStation;
        public int SentinelLevel;     // 0 none .. 3 aggressive
        public string Economy;
        public int Wealth;            // 1..3

        public string Id => $"{Sx}_{Sy}_{Sz}_{Index}";

        public string ClassLabel
        {
            get
            {
                string sub = ((int)(Temperature / 1000) % 10).ToString();
                return Class + sub;
            }
        }

        public string MetalName => Galaxy.MetalFor(Class);
    }

    /// <summary>A procedurally generated spiral galaxy, split into cubic sectors.
    /// Stars are only ever generated for the sectors you look at.</summary>
    public static class Galaxy
    {
        public const double SectorSize = 16.0;   // light-years
        public const double Radius = 32000.0;
        public static ulong Seed = 0x57A2F00DUL;

        static readonly Dictionary<long, List<StarInfo>> cache = new Dictionary<long, List<StarInfo>>();

        public static readonly Vector3d StartRegion = new Vector3d(5200, 12, -17800);

        static readonly string[] Economies = {
            "Mining", "Trading", "Scientific", "Industrial", "Agricultural", "Manufacturing",
            "Power generation", "High tech", "Salvage", "Unexplored" };

        public static void Reset(ulong seed)
        {
            Seed = seed;
            cache.Clear();
        }

        public static string MetalFor(StarClass c)
        {
            switch (c)
            {
                case StarClass.M: return "Silver";
                case StarClass.K:
                case StarClass.G: return "Copper";
                case StarClass.F:
                case StarClass.A: return "Gold";
                default: return "Platinum";
            }
        }

        static long Key(long x, long y, long z) => (x & 0x1FFFFF) | ((y & 0x1FFFFF) << 21) | ((z & 0x1FFFFF) << 42);

        /// <summary>Relative star density: a thin disc with spiral arms and a bright core.</summary>
        public static double Density(Vector3d p)
        {
            double r = Math.Sqrt(p.x * p.x + p.z * p.z);
            double disc = Math.Exp(-Math.Abs(p.y) / 350.0) * Math.Exp(-r / 14000.0);
            double theta = Math.Atan2(p.z, p.x);
            double arm = Math.Cos(2.0 * (theta - Math.Log(Math.Max(r, 50) / 400.0) / Math.Tan(0.23)));
            double arms = 0.35 + 0.65 * Math.Pow(0.5 + 0.5 * arm, 2.0);
            double core = Math.Exp(-r / 2500.0) * 2.5;
            return disc * (arms + core) * 3.2;
        }

        public static List<StarInfo> StarsInSector(long sx, long sy, long sz)
        {
            long key = Key(sx, sy, sz);
            if (cache.TryGetValue(key, out var list)) return list;
            list = new List<StarInfo>();
            var center = new Vector3d((sx + 0.5) * SectorSize, (sy + 0.5) * SectorSize, (sz + 0.5) * SectorSize);
            double lambda = Density(center) * 1.1;
            var rng = new Rng(Hash.Mix(Seed, sx, sy, sz));
            int n = (int)Math.Floor(lambda + rng.Next());
            n = Math.Min(n, 3);
            for (int i = 0; i < n; i++) list.Add(MakeStar(sx, sy, sz, i, rng.NextULong()));
            if (cache.Count > 20000) cache.Clear();
            cache[key] = list;
            return list;
        }

        static StarInfo MakeStar(long sx, long sy, long sz, int index, ulong seed)
        {
            var r = new Rng(seed);
            var s = new StarInfo
            {
                Seed = seed, Sx = sx, Sy = sy, Sz = sz, Index = index,
                GalPos = new Vector3d(
                    (sx + r.Range(0.05, 0.95)) * SectorSize,
                    (sy + r.Range(0.05, 0.95)) * SectorSize,
                    (sz + r.Range(0.05, 0.95)) * SectorSize),
            };
            double[] weights = { 0.33, 0.25, 0.2, 0.11, 0.07, 0.03, 0.01 };
            s.Class = (StarClass)r.Weighted(weights);
            switch (s.Class)
            {
                case StarClass.M: s.Temperature = r.Range(2700, 3800); s.Luminosity = 0.55; break;
                case StarClass.K: s.Temperature = r.Range(3900, 5200); s.Luminosity = 0.75; break;
                case StarClass.G: s.Temperature = r.Range(5300, 6000); s.Luminosity = 1.0; break;
                case StarClass.F: s.Temperature = r.Range(6000, 7400); s.Luminosity = 1.2; break;
                case StarClass.A: s.Temperature = r.Range(7500, 9800); s.Luminosity = 1.45; break;
                case StarClass.B: s.Temperature = r.Range(10000, 28000); s.Luminosity = 1.8; break;
                default: s.Temperature = r.Range(30000, 42000); s.Luminosity = 2.2; break;
            }
            s.Color = MathUtil.BlackBody(s.Temperature);
            s.Name = NameGen.System(seed);
            s.PlanetCount = r.Int(2, 6);
            s.HasStation = r.Chance(0.85);
            s.SentinelLevel = r.Weighted(new[] { 0.15, 0.45, 0.3, 0.1 });
            s.Economy = r.Pick(Economies);
            s.Wealth = r.Int(1, 3);
            return s;
        }

        public static List<StarInfo> StarsNear(Vector3d pos, double radius)
        {
            var result = new List<StarInfo>();
            long x0 = (long)Math.Floor((pos.x - radius) / SectorSize), x1 = (long)Math.Floor((pos.x + radius) / SectorSize);
            long y0 = (long)Math.Floor((pos.y - radius) / SectorSize), y1 = (long)Math.Floor((pos.y + radius) / SectorSize);
            long z0 = (long)Math.Floor((pos.z - radius) / SectorSize), z1 = (long)Math.Floor((pos.z + radius) / SectorSize);
            double r2 = radius * radius;
            for (long x = x0; x <= x1; x++)
                for (long y = y0; y <= y1; y++)
                    for (long z = z0; z <= z1; z++)
                        foreach (var s in StarsInSector(x, y, z))
                            if ((s.GalPos - pos).sqrMagnitude <= r2) result.Add(s);
            return result;
        }

        public static StarInfo Find(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            var parts = id.Split('_');
            if (parts.Length != 4) return null;
            if (!long.TryParse(parts[0], out long x) || !long.TryParse(parts[1], out long y) ||
                !long.TryParse(parts[2], out long z) || !int.TryParse(parts[3], out int i)) return null;
            var list = StarsInSector(x, y, z);
            return i >= 0 && i < list.Count ? list[i] : null;
        }

        /// <summary>A pleasant G or K star with a station near the start region.</summary>
        public static StarInfo StartStar()
        {
            for (double r = 40; r < 400; r += 40)
            {
                StarInfo best = null;
                double bestD = double.MaxValue;
                foreach (var s in StarsNear(StartRegion, r))
                {
                    if ((s.Class != StarClass.G && s.Class != StarClass.K) || !s.HasStation || s.PlanetCount < 3) continue;
                    double d = (s.GalPos - StartRegion).magnitude;
                    if (d < bestD) { bestD = d; best = s; }
                }
                if (best != null) return best;
            }
            return StarsNear(StartRegion, 200)[0];
        }

        public static double DistanceToCore(Vector3d p) => p.magnitude;
    }
}

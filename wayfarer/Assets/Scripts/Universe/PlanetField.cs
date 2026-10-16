using System;

namespace Wayfarer
{
    /// <summary>The shape and climate of a planet as pure functions of direction.
    /// Used by the terrain worker threads to build meshes and by the game
    /// (on the main thread) for walking, landing and placing things, so the
    /// two always agree. Read-only after construction, so thread-safe.</summary>
    public sealed class PlanetField
    {
        public readonly PlanetData Data;
        readonly double R;
        readonly Simplex nWarp, nCont, nMask, nMtn, nHill, nDet, nClim, nTerr;
        readonly ulong craterSeed, spireSeed;
        readonly double duneFreq;
        readonly Vector3d duneDir;

        public PlanetField(PlanetData d)
        {
            Data = d;
            R = d.Radius;
            ulong s = d.Seed;
            nWarp = new Simplex(Hash.Mix(s, 1));
            nCont = new Simplex(Hash.Mix(s, 2));
            nMask = new Simplex(Hash.Mix(s, 3));
            nMtn = new Simplex(Hash.Mix(s, 4));
            nHill = new Simplex(Hash.Mix(s, 5));
            nDet = new Simplex(Hash.Mix(s, 6));
            nClim = new Simplex(Hash.Mix(s, 7));
            nTerr = new Simplex(Hash.Mix(s, 8));
            craterSeed = Hash.Mix(s, 9);
            spireSeed = Hash.Mix(s, 10);
            var r = new Rng(Hash.Mix(s, 11));
            duneFreq = 1.0 / r.Range(70, 140);
            duneDir = r.OnSphere();
        }

        public double Height(Vector3d dir) => Height(dir.x, dir.y, dir.z);

        /// <summary>Terrain height in metres above the base radius, for a unit direction.</summary>
        public double Height(double dx, double dy, double dz)
        {
            var d = Data;
            double x = dx * R, y = dy * R, z = dz * R;

            // large-scale domain warp so coastlines and ranges don't look like noise
            double wf = d.ContinentFreq * 1.4;
            double wx = nWarp.Fbm(x * wf, y * wf, z * wf, 2) * d.WarpAmp;
            double wy = nWarp.Fbm(x * wf + 31.7, y * wf - 12.1, z * wf + 5.3, 2) * d.WarpAmp;
            double wz = nWarp.Fbm(x * wf - 8.9, y * wf + 19.3, z * wf - 27.1, 2) * d.WarpAmp;
            double X = x + wx, Y = y + wy, Z = z + wz;

            // continents
            double cf = d.ContinentFreq;
            double land = nCont.Fbm(X * cf, Y * cf, Z * cf, 5) * 1.7 + d.ContinentBias;
            double baseH = land >= 0
                ? Math.Pow(Math.Min(land, 1.5), 0.85) * d.ContinentAmp
                : -Math.Pow(Math.Min(-land, 1.5), 0.8) * d.ContinentAmp * 1.5;

            // mountain ranges, masked so they form belts rather than covering everything
            double mask = nMask.Fbm(X * cf * 2.2, Y * cf * 2.2, Z * cf * 2.2, 3) * 0.9 + land * 0.55 + (d.MountainCover - 0.55);
            mask = MathUtil.SmoothStep(0.08, 0.6, mask);
            double mtn = 0;
            if (mask > 0.001)
            {
                double mf = d.MountainFreq;
                double ridge = nMtn.Ridged(X * mf, Y * mf, Z * mf, 6);
                mtn = Math.Pow(ridge, d.MountainSharp) * d.MountainAmp * mask * 1.6;
            }

            // rolling hills, detail and micro-relief (unwarped so they stay crisp)
            const double hf = 1.0 / 650.0;
            double hills = nHill.Fbm(x * hf, y * hf, z * hf, 4) * d.HillAmp * (0.45 + 0.55 * Math.Min(1, Math.Abs(land) * 3));
            const double df = 1.0 / 55.0;
            double det = nDet.Fbm(x * df, y * df, z * df, 4) * d.DetailAmp;
            double micro = nDet.Noise(x * 0.23, y * 0.23, z * 0.23) * 0.3;

            double h = baseH + mtn + hills + det + micro;

            if (d.DuneAmp > 0 && land > -0.05)
            {
                double u = (x * duneDir.x + y * duneDir.y + z * duneDir.z) * duneFreq
                           + nHill.Noise(x / 420.0, y / 420.0, z / 420.0) * 2.2;
                double crest = 1.0 - Math.Abs(Math.Sin(u * Math.PI));
                double duneMask = MathUtil.SmoothStep(-0.05, 0.25, land) * (1.0 - mask);
                h += Math.Pow(crest, 1.8) * d.DuneAmp * duneMask;
            }

            if (d.TerraceStep > 0)
            {
                double tm = MathUtil.SmoothStep(-0.1, 0.35, nTerr.Noise(x / 2600.0, y / 2600.0, z / 2600.0));
                if (tm > 0.001)
                {
                    double step = d.TerraceStep;
                    double k = h / step;
                    double fl = Math.Floor(k);
                    double terr = (fl + MathUtil.SmoothStep(0.55, 0.8, k - fl)) * step;
                    h = h + (terr - h) * tm;
                }
            }

            if (d.CraterAmount > 0) h += Craters(x, y, z, 900.0, 0.55) + Craters(x, y, z, 260.0, 0.35);
            if (d.SpireAmount > 0) h += Spires(x, y, z);
            return h;
        }

        double Craters(double x, double y, double z, double cell, double chanceScale)
        {
            long cx = (long)Math.Floor(x / cell), cy = (long)Math.Floor(y / cell), cz = (long)Math.Floor(z / cell);
            double total = 0;
            double chance = Data.CraterAmount * chanceScale;
            for (long i = cx - 1; i <= cx + 1; i++)
                for (long j = cy - 1; j <= cy + 1; j++)
                    for (long k = cz - 1; k <= cz + 1; k++)
                    {
                        ulong h = Hash.Mix(craterSeed ^ (ulong)(long)cell, i, j, k);
                        if ((h & 0xFFFF) / 65535.0 > chance) continue;
                        double ox = ((h >> 16) & 0xFFF) / 4095.0, oy = ((h >> 28) & 0xFFF) / 4095.0, oz = ((h >> 40) & 0xFFF) / 4095.0;
                        double rad = cell * (0.18 + 0.3 * ((h >> 52) & 0xFFF) / 4095.0);
                        double ddx = x - (i + ox) * cell, ddy = y - (j + oy) * cell, ddz = z - (k + oz) * cell;
                        double dist = Math.Sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
                        if (dist > rad * 1.6) continue;
                        double t = dist / rad;
                        double depth = rad * 0.22;
                        double bowl = t < 1 ? (t * t - 1) * depth : 0;
                        double rim = Math.Exp(-((t - 1) * (t - 1)) / 0.06) * depth * 0.35;
                        total += bowl + rim;
                    }
            return total;
        }

        double Spires(double x, double y, double z)
        {
            const double cell = 260.0;
            long cx = (long)Math.Floor(x / cell), cy = (long)Math.Floor(y / cell), cz = (long)Math.Floor(z / cell);
            double total = 0;
            for (long i = cx - 1; i <= cx + 1; i++)
                for (long j = cy - 1; j <= cy + 1; j++)
                    for (long k = cz - 1; k <= cz + 1; k++)
                    {
                        ulong h = Hash.Mix(spireSeed, i, j, k);
                        if ((h & 0xFFFF) / 65535.0 > Data.SpireAmount * 0.5) continue;
                        double ox = ((h >> 16) & 0xFFF) / 4095.0, oy = ((h >> 28) & 0xFFF) / 4095.0, oz = ((h >> 40) & 0xFFF) / 4095.0;
                        double rad = 18 + 30 * ((h >> 52) & 0xFFF) / 4095.0;
                        double ddx = x - (i + ox) * cell, ddy = y - (j + oy) * cell, ddz = z - (k + oz) * cell;
                        double dist = Math.Sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
                        if (dist > rad) continue;
                        double t = 1 - dist / rad;
                        total += t * t * (3 - 2 * t) * t * rad * 5.5;
                    }
            return total;
        }

        /// <summary>Moisture, temperature and small-scale variation, each 0..1.</summary>
        public void Climate(double dx, double dy, double dz, double h, out double moisture, out double temperature, out double variation)
        {
            double x = dx * R, y = dy * R, z = dz * R;
            double cf = Data.ContinentFreq * 3.0;
            moisture = MathUtil.Clamp01(0.5 + 0.75 * nClim.Fbm(x * cf, y * cf, z * cf, 3));
            if (Data.HasSea) moisture = MathUtil.Clamp01(moisture + 0.25 * (1 - MathUtil.SmoothStep(0, 120, h - Data.SeaLevel)));
            double lat = Math.Abs(dy);
            temperature = MathUtil.Clamp01(1.0 - 0.85 * Math.Pow(lat, 1.6) - Math.Max(h, 0) / 2600.0
                                           + 0.18 * nClim.Noise(x * cf * 0.7 + 40, y * cf * 0.7, z * cf * 0.7));
            variation = MathUtil.Clamp01(0.5 + 0.6 * nClim.Noise(x / 85.0, y / 85.0, z / 85.0));
        }

        /// <summary>Surface point (planet-local metres) for a direction.</summary>
        public Vector3d SurfacePoint(Vector3d dir)
        {
            dir = dir.normalized;
            return dir * (R + Height(dir));
        }

        /// <summary>Ground normal by finite differences over ~0.6 m.</summary>
        public Vector3d Normal(Vector3d dir)
        {
            dir = dir.normalized;
            Vector3d t1 = Vector3d.Cross(dir, Math.Abs(dir.y) < 0.9 ? Vector3d.up : Vector3d.right).normalized;
            Vector3d t2 = Vector3d.Cross(dir, t1);
            double e = 0.6 / R;
            Vector3d p0 = SurfacePoint(dir);
            Vector3d p1 = SurfacePoint(dir + t1 * e);
            Vector3d p2 = SurfacePoint(dir + t2 * e);
            Vector3d n = Vector3d.Cross(p1 - p0, p2 - p0).normalized;
            if (Vector3d.Dot(n, dir) < 0) n = -n;
            return n;
        }

        public bool IsUnderwater(double height) => Data.HasSea && height < Data.SeaLevel;
    }
}

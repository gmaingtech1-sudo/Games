using System;

namespace Wayfarer
{
    /// <summary>3D simplex noise (after Stefan Gustavson's public-domain
    /// reference), seeded and thread-safe once built. Output is roughly -1..1.</summary>
    public sealed class Simplex
    {
        static readonly double[] Grad = {
            1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
            1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
            0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1 };

        readonly int[] perm = new int[512];
        readonly int[] permMod12 = new int[512];

        const double F3 = 1.0 / 3.0;
        const double G3 = 1.0 / 6.0;

        public Simplex(ulong seed)
        {
            var p = new int[256];
            for (int i = 0; i < 256; i++) p[i] = i;
            var rng = new Rng(seed);
            for (int i = 255; i > 0; i--)
            {
                int j = (int)(rng.Next() * (i + 1));
                int t = p[i]; p[i] = p[j]; p[j] = t;
            }
            for (int i = 0; i < 512; i++)
            {
                perm[i] = p[i & 255];
                permMod12[i] = perm[i] % 12;
            }
        }

        static int FastFloor(double x) { int xi = (int)x; return x < xi ? xi - 1 : xi; }

        public double Noise(double xin, double yin, double zin)
        {
            double s = (xin + yin + zin) * F3;
            int i = FastFloor(xin + s), j = FastFloor(yin + s), k = FastFloor(zin + s);
            double t = (i + j + k) * G3;
            double x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
            int i1, j1, k1, i2, j2, k2;
            if (x0 >= y0)
            {
                if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
                else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
                else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
            }
            else
            {
                if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
                else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
                else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
            }
            double x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
            double x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
            double x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
            int ii = i & 255, jj = j & 255, kk = k & 255;
            double n = 0;
            double t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
            if (t0 > 0)
            {
                int g = permMod12[ii + perm[jj + perm[kk]]] * 3;
                t0 *= t0; n += t0 * t0 * (Grad[g] * x0 + Grad[g + 1] * y0 + Grad[g + 2] * z0);
            }
            double t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
            if (t1 > 0)
            {
                int g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
                t1 *= t1; n += t1 * t1 * (Grad[g] * x1 + Grad[g + 1] * y1 + Grad[g + 2] * z1);
            }
            double t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
            if (t2 > 0)
            {
                int g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
                t2 *= t2; n += t2 * t2 * (Grad[g] * x2 + Grad[g + 1] * y2 + Grad[g + 2] * z2);
            }
            double t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
            if (t3 > 0)
            {
                int g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
                t3 *= t3; n += t3 * t3 * (Grad[g] * x3 + Grad[g + 1] * y3 + Grad[g + 2] * z3);
            }
            return 32.0 * n;
        }

        public double Noise(Vector3d p) => Noise(p.x, p.y, p.z);

        /// <summary>Fractal sum, normalised to roughly -1..1.</summary>
        public double Fbm(double x, double y, double z, int octaves, double lacunarity = 2.0, double gain = 0.5)
        {
            double sum = 0, amp = 1, norm = 0;
            for (int o = 0; o < octaves; o++)
            {
                sum += Noise(x, y, z) * amp;
                norm += amp;
                amp *= gain;
                x *= lacunarity; y *= lacunarity; z *= lacunarity;
                // decorrelate octaves a little
                x += 17.13; y -= 9.71; z += 3.37;
            }
            return sum / norm;
        }

        /// <summary>Ridged multifractal, roughly 0..1 with sharp crests.</summary>
        public double Ridged(double x, double y, double z, int octaves, double lacunarity = 2.1, double gain = 0.5)
        {
            double sum = 0, amp = 0.5, weight = 1, norm = 0;
            for (int o = 0; o < octaves; o++)
            {
                double n = 1.0 - Math.Abs(Noise(x, y, z));
                n *= n;
                n *= weight;
                weight = MathUtil.Clamp01(n * 2.0);
                sum += n * amp;
                norm += amp;
                amp *= gain;
                x *= lacunarity; y *= lacunarity; z *= lacunarity;
                x += 5.31; y += 11.7; z -= 7.9;
            }
            return sum / norm;
        }
    }
}

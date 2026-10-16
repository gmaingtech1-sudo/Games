using System;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>Double-precision vector. Unity's floats run out of precision a few
    /// kilometres from the origin, so every position in the universe is stored in
    /// doubles and converted to floats only relative to the floating origin.</summary>
    [Serializable]
    public struct Vector3d
    {
        public double x, y, z;

        public Vector3d(double x, double y, double z) { this.x = x; this.y = y; this.z = z; }

        public static readonly Vector3d zero = new Vector3d(0, 0, 0);
        public static readonly Vector3d one = new Vector3d(1, 1, 1);
        public static readonly Vector3d up = new Vector3d(0, 1, 0);
        public static readonly Vector3d right = new Vector3d(1, 0, 0);
        public static readonly Vector3d forward = new Vector3d(0, 0, 1);

        public static Vector3d operator +(Vector3d a, Vector3d b) => new Vector3d(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3d operator -(Vector3d a, Vector3d b) => new Vector3d(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3d operator -(Vector3d a) => new Vector3d(-a.x, -a.y, -a.z);
        public static Vector3d operator *(Vector3d a, double s) => new Vector3d(a.x * s, a.y * s, a.z * s);
        public static Vector3d operator *(double s, Vector3d a) => new Vector3d(a.x * s, a.y * s, a.z * s);
        public static Vector3d operator /(Vector3d a, double s) => new Vector3d(a.x / s, a.y / s, a.z / s);

        public double sqrMagnitude => x * x + y * y + z * z;
        public double magnitude => Math.Sqrt(x * x + y * y + z * z);

        public Vector3d normalized
        {
            get
            {
                double m = magnitude;
                return m > 1e-300 ? new Vector3d(x / m, y / m, z / m) : zero;
            }
        }

        public static double Dot(Vector3d a, Vector3d b) => a.x * b.x + a.y * b.y + a.z * b.z;

        public static Vector3d Cross(Vector3d a, Vector3d b) =>
            new Vector3d(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

        public static double Distance(Vector3d a, Vector3d b) => (a - b).magnitude;

        public static Vector3d Lerp(Vector3d a, Vector3d b, double t) => a + (b - a) * t;

        public static Vector3d ProjectOnPlane(Vector3d v, Vector3d n) => v - n * Dot(v, n);

        public Vector3 ToVector3() => new Vector3((float)x, (float)y, (float)z);

        public static implicit operator Vector3d(Vector3 v) => new Vector3d(v.x, v.y, v.z);
        public static explicit operator Vector3(Vector3d v) => new Vector3((float)v.x, (float)v.y, (float)v.z);

        public override string ToString() => $"({x:F2}, {y:F2}, {z:F2})";
    }

    /// <summary>Double-precision rotation, used for planet spin so frame changes
    /// between a spinning planet and the star system stay exact.</summary>
    public struct QuatD
    {
        public double x, y, z, w;

        public QuatD(double x, double y, double z, double w) { this.x = x; this.y = y; this.z = z; this.w = w; }

        public static readonly QuatD identity = new QuatD(0, 0, 0, 1);

        public static QuatD AngleAxis(double radians, Vector3d axis)
        {
            axis = axis.normalized;
            double h = radians * 0.5, s = Math.Sin(h);
            return new QuatD(axis.x * s, axis.y * s, axis.z * s, Math.Cos(h));
        }

        public static QuatD FromTo(Vector3d from, Vector3d to)
        {
            from = from.normalized; to = to.normalized;
            double d = Vector3d.Dot(from, to);
            if (d > 0.9999999) return identity;
            if (d < -0.9999999)
            {
                Vector3d ax = Vector3d.Cross(Vector3d.right, from);
                if (ax.sqrMagnitude < 1e-6) ax = Vector3d.Cross(Vector3d.up, from);
                return AngleAxis(Math.PI, ax);
            }
            Vector3d c = Vector3d.Cross(from, to);
            var q = new QuatD(c.x, c.y, c.z, 1 + d);
            return q.Normalized();
        }

        public QuatD Normalized()
        {
            double m = Math.Sqrt(x * x + y * y + z * z + w * w);
            return new QuatD(x / m, y / m, z / m, w / m);
        }

        public QuatD Inverse() => new QuatD(-x, -y, -z, w);

        public static QuatD operator *(QuatD a, QuatD b) => new QuatD(
            a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
            a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z);

        public static Vector3d operator *(QuatD q, Vector3d v)
        {
            // v' = v + 2w(q×v) + 2 q×(q×v)
            double tx = 2 * (q.y * v.z - q.z * v.y);
            double ty = 2 * (q.z * v.x - q.x * v.z);
            double tz = 2 * (q.x * v.y - q.y * v.x);
            return new Vector3d(
                v.x + q.w * tx + (q.y * tz - q.z * ty),
                v.y + q.w * ty + (q.z * tx - q.x * tz),
                v.z + q.w * tz + (q.x * ty - q.y * tx));
        }

        public Quaternion ToQuaternion() => new Quaternion((float)x, (float)y, (float)z, (float)w);

        public static QuatD FromQuaternion(Quaternion q) => new QuatD(q.x, q.y, q.z, q.w);
    }

    public static class MathUtil
    {
        public static double Clamp(double v, double a, double b) => v < a ? a : (v > b ? b : v);
        public static double Clamp01(double v) => v < 0 ? 0 : (v > 1 ? 1 : v);
        public static double Lerp(double a, double b, double t) => a + (b - a) * t;

        public static double SmoothStep(double a, double b, double x)
        {
            double t = Clamp01((x - a) / (b - a));
            return t * t * (3 - 2 * t);
        }

        public static float Damp(float current, float target, float lambda, float dt) =>
            Mathf.Lerp(current, target, 1f - Mathf.Exp(-lambda * dt));

        public static Vector3 Damp(Vector3 current, Vector3 target, float lambda, float dt) =>
            Vector3.Lerp(current, target, 1f - Mathf.Exp(-lambda * dt));

        public static Quaternion Damp(Quaternion current, Quaternion target, float lambda, float dt) =>
            Quaternion.Slerp(current, target, 1f - Mathf.Exp(-lambda * dt));

        /// <summary>Ray (origin o, unit dir d) against sphere (centre c, radius r).
        /// Returns false on a miss; t0 &lt;= t1 and either may be negative.</summary>
        public static bool RaySphere(Vector3d o, Vector3d d, Vector3d c, double r, out double t0, out double t1)
        {
            Vector3d oc = o - c;
            double b = Vector3d.Dot(oc, d);
            double cc = oc.sqrMagnitude - r * r;
            double disc = b * b - cc;
            if (disc < 0) { t0 = t1 = 0; return false; }
            double s = Math.Sqrt(disc);
            t0 = -b - s; t1 = -b + s;
            return true;
        }

        /// <summary>Parses "#rrggbb" (pure C#, safe on any thread).</summary>
        public static Color Hex(string hex)
        {
            hex = hex.TrimStart('#');
            if (hex.Length < 6) return Color.magenta;
            int v = Convert.ToInt32(hex.Substring(0, 6), 16);
            return new Color(((v >> 16) & 255) / 255f, ((v >> 8) & 255) / 255f, (v & 255) / 255f, 1f);
        }

        /// <summary>Approximate colour of a black body (1000 K – 40000 K), in linear-ish RGB.</summary>
        public static Color BlackBody(double kelvin)
        {
            double t = Clamp(kelvin, 1000, 40000) / 100.0;
            double r, g, b;
            if (t <= 66) r = 255;
            else r = 329.698727446 * Math.Pow(t - 60, -0.1332047592);
            if (t <= 66) g = 99.4708025861 * Math.Log(t) - 161.1195681661;
            else g = 288.1221695283 * Math.Pow(t - 60, -0.0755148492);
            if (t >= 66) b = 255;
            else if (t <= 19) b = 0;
            else b = 138.5177312231 * Math.Log(t - 10) - 305.0447927307;
            return new Color((float)Clamp01(r / 255), (float)Clamp01(g / 255), (float)Clamp01(b / 255));
        }

        public static string FormatDistance(double metres)
        {
            if (metres < 1000) return $"{metres:F0} m";
            if (metres < 100000) return $"{metres / 1000:F1} km";
            return $"{metres / 1000:N0} km";
        }

        public static string FormatSpeed(double ms)
        {
            if (ms < 1000) return $"{ms:F0} m/s";
            return $"{ms / 1000:F1} km/s";
        }
    }
}

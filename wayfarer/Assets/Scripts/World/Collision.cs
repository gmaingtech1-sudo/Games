using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>An oriented box in planet-local space (buildings, crates...).</summary>
    public struct BoxObstacle
    {
        public Vector3d Center;
        public Quaternion Rot;
        public Vector3 Half;
        public bool Walkable;   // you can stand on top of it
    }

    /// <summary>Simple collision for a vertical capsule (the player) against
    /// cylinders (trees, rocks) and boxes (buildings). Positions are planet-local.</summary>
    public static class Collision
    {
        /// <summary>Pushes a point `pos` (feet) with radius r and height h out of cylinders.</summary>
        public static bool ResolveCylinders(ref Vector3d pos, Vector3d up, double r, double h, List<Obstacle> obstacles)
        {
            bool hit = false;
            foreach (var o in obstacles)
            {
                // height overlap along the obstacle's axis
                double along = Vector3d.Dot(pos - o.Base, o.Up);
                if (along > o.Height || along + h < 0) continue;
                Vector3d axisPoint = o.Base + o.Up * MathUtil.Clamp(along, 0, o.Height);
                Vector3d d = Vector3d.ProjectOnPlane(pos - axisPoint, up);
                double m = d.magnitude;
                double min = o.Radius + r;
                if (m >= min) continue;
                Vector3d n = m > 1e-6 ? d / m : Vector3d.Cross(up, Vector3d.right).normalized;
                pos += n * (min - m);
                hit = true;
            }
            return hit;
        }

        /// <summary>Pushes the capsule out of boxes. Returns a floor height (distance along up
        /// from the planet centre) if standing on a walkable box, else -1.</summary>
        public static double ResolveBoxes(ref Vector3d pos, Vector3d up, double r, double h, List<BoxObstacle> boxes, out bool hit)
        {
            hit = false;
            double floor = -1;
            foreach (var b in boxes)
            {
                var inv = Quaternion.Inverse(b.Rot);
                Vector3 local = inv * (Vector3)(pos - b.Center);
                Vector3 half = b.Half;
                // feet above the top: maybe standing on it
                if (b.Walkable && local.y > half.y - 0.6f && local.y < half.y + 0.35f &&
                    Mathf.Abs(local.x) < half.x && Mathf.Abs(local.z) < half.z)
                {
                    Vector3d top = b.Center + (Vector3d)(b.Rot * new Vector3(local.x, half.y, local.z));
                    floor = System.Math.Max(floor, top.magnitude);
                    continue;
                }
                float ex = half.x + (float)r, ez = half.z + (float)r;
                if (local.y + (float)h < -half.y || local.y > half.y) continue;
                if (Mathf.Abs(local.x) >= ex || Mathf.Abs(local.z) >= ez) continue;
                // push out along the shallower horizontal axis
                float px = ex - Mathf.Abs(local.x), pz = ez - Mathf.Abs(local.z);
                if (px < pz) local.x += Mathf.Sign(local.x) * px;
                else local.z += Mathf.Sign(local.z) * pz;
                pos = b.Center + (Vector3d)(b.Rot * local);
                hit = true;
            }
            return floor;
        }

        /// <summary>Ray against an oriented box, returns distance or -1.</summary>
        public static double RayBox(Vector3d origin, Vector3d dir, BoxObstacle b)
        {
            var inv = Quaternion.Inverse(b.Rot);
            Vector3 o = inv * (Vector3)(origin - b.Center);
            Vector3 d = inv * (Vector3)dir;
            float tmin = -1e9f, tmax = 1e9f;
            for (int i = 0; i < 3; i++)
            {
                float oi = o[i], di = d[i], hi = b.Half[i];
                if (Mathf.Abs(di) < 1e-7f)
                {
                    if (oi < -hi || oi > hi) return -1;
                    continue;
                }
                float t1 = (-hi - oi) / di, t2 = (hi - oi) / di;
                if (t1 > t2) { float t = t1; t1 = t2; t2 = t; }
                tmin = Mathf.Max(tmin, t1);
                tmax = Mathf.Min(tmax, t2);
                if (tmin > tmax) return -1;
            }
            if (tmax < 0) return -1;
            return tmin >= 0 ? tmin : 0;
        }
    }
}

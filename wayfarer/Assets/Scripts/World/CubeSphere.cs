using System;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>Maps the six faces of a cube onto a sphere (equal-angle mapping)
    /// and builds the shared triangle layout for terrain chunks.</summary>
    public static class CubeSphere
    {
        public const int Segments = 32;              // quads per chunk side
        public const int Side = Segments + 1;        // vertices per side
        public const int GridVerts = Side * Side;
        public const int SkirtVerts = Side * 4;
        public const int TotalVerts = GridVerts + SkirtVerts;

        // For each face: normal N, U and V with U × V = N.
        public static readonly Vector3d[] N = {
            new Vector3d(1, 0, 0), new Vector3d(-1, 0, 0), new Vector3d(0, 1, 0),
            new Vector3d(0, -1, 0), new Vector3d(0, 0, 1), new Vector3d(0, 0, -1) };
        public static readonly Vector3d[] U = {
            new Vector3d(0, 0, -1), new Vector3d(0, 0, 1), new Vector3d(1, 0, 0),
            new Vector3d(1, 0, 0), new Vector3d(1, 0, 0), new Vector3d(-1, 0, 0) };
        public static readonly Vector3d[] V = {
            new Vector3d(0, 1, 0), new Vector3d(0, 1, 0), new Vector3d(0, 0, -1),
            new Vector3d(0, 0, 1), new Vector3d(0, 1, 0), new Vector3d(0, 1, 0) };

        const double QuarterPi = Math.PI / 4.0;

        /// <summary>Unit direction for face coordinates a, b in [-1, 1].</summary>
        public static Vector3d Direction(int face, double a, double b)
        {
            double ta = Math.Tan(a * QuarterPi), tb = Math.Tan(b * QuarterPi);
            var n = N[face]; var u = U[face]; var v = V[face];
            double x = n.x + u.x * ta + v.x * tb;
            double y = n.y + u.y * ta + v.y * tb;
            double z = n.z + u.z * ta + v.z * tb;
            double m = 1.0 / Math.Sqrt(x * x + y * y + z * z);
            return new Vector3d(x * m, y * m, z * m);
        }

        /// <summary>The face and face coordinates of a direction.</summary>
        public static void FaceCoords(Vector3d d, out int face, out double a, out double b)
        {
            double ax = Math.Abs(d.x), ay = Math.Abs(d.y), az = Math.Abs(d.z);
            if (ax >= ay && ax >= az) face = d.x > 0 ? 0 : 1;
            else if (ay >= az) face = d.y > 0 ? 2 : 3;
            else face = d.z > 0 ? 4 : 5;
            double dn = Vector3d.Dot(d, N[face]);
            double pu = Vector3d.Dot(d, U[face]) / dn, pv = Vector3d.Dot(d, V[face]) / dn;
            a = Math.Atan(pu) / QuarterPi;
            b = Math.Atan(pv) / QuarterPi;
        }

        static int[] triangles;

        /// <summary>Triangle list shared by every chunk: the grid plus a skirt
        /// hanging from each edge that hides cracks between detail levels.</summary>
        public static int[] Triangles
        {
            get
            {
                if (triangles != null) return triangles;
                int S = Segments;
                var t = new int[S * S * 6 + 4 * S * 6];
                int k = 0;
                for (int j = 0; j < S; j++)
                    for (int i = 0; i < S; i++)
                    {
                        int a = j * Side + i, b = a + 1, c = a + Side + 1, d = a + Side;
                        // clockwise seen from outside in Unity (normal = cross(b-a, c-a) points out)
                        t[k++] = a; t[k++] = b; t[k++] = c;
                        t[k++] = a; t[k++] = c; t[k++] = d;
                    }
                // skirt vertex blocks: bottom (j=0), top (j=S), left (i=0), right (i=S)
                int sb = GridVerts, st = GridVerts + Side, sl = GridVerts + Side * 2, sr = GridVerts + Side * 3;
                for (int i = 0; i < S; i++)
                {
                    // bottom edge, outward -V
                    int e0 = i, e1 = i + 1;
                    t[k++] = e0; t[k++] = sb + i; t[k++] = sb + i + 1;
                    t[k++] = e0; t[k++] = sb + i + 1; t[k++] = e1;
                    // top edge, outward +V
                    e0 = S * Side + i; e1 = e0 + 1;
                    t[k++] = e0; t[k++] = st + i + 1; t[k++] = st + i;
                    t[k++] = e0; t[k++] = e1; t[k++] = st + i + 1;
                }
                for (int j = 0; j < S; j++)
                {
                    // left edge, outward -U
                    int e0 = j * Side, e1 = (j + 1) * Side;
                    t[k++] = e0; t[k++] = sl + j + 1; t[k++] = sl + j;
                    t[k++] = e0; t[k++] = e1; t[k++] = sl + j + 1;
                    // right edge, outward +U
                    e0 = j * Side + S; e1 = (j + 1) * Side + S;
                    t[k++] = e0; t[k++] = sr + j; t[k++] = sr + j + 1;
                    t[k++] = e0; t[k++] = sr + j + 1; t[k++] = e1;
                }
                triangles = t;
                return t;
            }
        }

        /// <summary>Arc length in metres of a node's side.</summary>
        public static double NodeArc(double faceSize, double radius) => faceSize * 0.5 * (Math.PI * 0.5) * radius;
    }
}

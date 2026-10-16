using System;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>Mesh data for one terrain chunk, built on a worker thread.</summary>
    public sealed class ChunkData
    {
        public Vector3[] Vertices;
        public Vector3[] Normals;
        public Vector4[] Tangents;
        public Color32[] Colors;
        public Vector3d Center;      // planet-local
        public Bounds Bounds;        // relative to Center
        public double MinHeight, MaxHeight;
    }

    public static class ChunkBuilder
    {
        [ThreadStatic] static Vector3d[] scratchPos;
        [ThreadStatic] static Vector3d[] scratchDir;
        [ThreadStatic] static double[] scratchH;

        public static ChunkData Build(PlanetField field, int face, double a0, double b0, double size)
        {
            const int S = CubeSphere.Segments;
            const int Side = CubeSphere.Side;
            const int E = S + 3; // one extra ring all round for normals
            double R = field.Data.Radius;
            if (scratchPos == null)
            {
                scratchPos = new Vector3d[E * E];
                scratchDir = new Vector3d[E * E];
                scratchH = new double[E * E];
            }
            var pos = scratchPos; var dirs = scratchDir; var hts = scratchH;
            double step = size / S;
            double minH = double.MaxValue, maxH = double.MinValue;
            for (int j = 0; j < E; j++)
            {
                double b = b0 + (j - 1) * step;
                for (int i = 0; i < E; i++)
                {
                    double a = a0 + (i - 1) * step;
                    var d = CubeSphere.Direction(face, a, b);
                    double h = field.Height(d.x, d.y, d.z);
                    int e = j * E + i;
                    dirs[e] = d;
                    hts[e] = h;
                    pos[e] = d * (R + h);
                    if (i >= 1 && j >= 1 && i <= S + 1 && j <= S + 1)
                    {
                        if (h < minH) minH = h;
                        if (h > maxH) maxH = h;
                    }
                }
            }

            int mid = (S / 2 + 1) * E + (S / 2 + 1);
            Vector3d center = pos[mid];
            var data = new ChunkData
            {
                Vertices = new Vector3[CubeSphere.TotalVerts],
                Normals = new Vector3[CubeSphere.TotalVerts],
                Tangents = new Vector4[CubeSphere.TotalVerts],
                Colors = new Color32[CubeSphere.TotalVerts],
                Center = center,
                MinHeight = minH,
                MaxHeight = maxH,
            };
            var verts = data.Vertices; var norms = data.Normals; var tans = data.Tangents; var cols = data.Colors;
            Vector3 lo = new Vector3(float.MaxValue, float.MaxValue, float.MaxValue);
            Vector3 hi = -lo;

            for (int j = 0; j <= S; j++)
            {
                for (int i = 0; i <= S; i++)
                {
                    int e = (j + 1) * E + (i + 1);
                    int k = j * Side + i;
                    Vector3d p = pos[e];
                    Vector3d du = pos[e + 1] - pos[e - 1];
                    Vector3d dv = pos[e + E] - pos[e - E];
                    Vector3d n = Vector3d.Cross(du, dv).normalized;
                    Vector3d t = (du - n * Vector3d.Dot(du, n)).normalized;
                    Vector3 v = (Vector3)(p - center);
                    verts[k] = v;
                    norms[k] = (Vector3)n;
                    tans[k] = new Vector4((float)t.x, (float)t.y, (float)t.z, 1f);
                    lo = Vector3.Min(lo, v); hi = Vector3.Max(hi, v);

                    var d = dirs[e];
                    field.Climate(d.x, d.y, d.z, hts[e], out double m, out double temp, out double var);
                    cols[k] = new Color32((byte)(m * 255), (byte)(temp * 255), (byte)(var * 255), 255);
                }
            }

            // skirts
            double arc = CubeSphere.NodeArc(size, R);
            double depth = arc * 0.035 + 4.0;
            int[] edgeStart = { CubeSphere.GridVerts, CubeSphere.GridVerts + Side, CubeSphere.GridVerts + Side * 2, CubeSphere.GridVerts + Side * 3 };
            for (int q = 0; q < Side; q++)
            {
                SkirtVertex(data, edgeStart[0] + q, q, center, depth, dirs[(0 + 1) * E + (q + 1)]);                     // bottom j=0
                SkirtVertex(data, edgeStart[1] + q, S * Side + q, center, depth, dirs[(S + 1) * E + (q + 1)]);          // top j=S
                SkirtVertex(data, edgeStart[2] + q, q * Side, center, depth, dirs[(q + 1) * E + 1]);                    // left i=0
                SkirtVertex(data, edgeStart[3] + q, q * Side + S, center, depth, dirs[(q + 1) * E + (S + 1)]);          // right i=S
            }
            for (int k = CubeSphere.GridVerts; k < CubeSphere.TotalVerts; k++)
            {
                lo = Vector3.Min(lo, verts[k]); hi = Vector3.Max(hi, verts[k]);
            }
            var bounds = new Bounds();
            bounds.SetMinMax(lo, hi);
            data.Bounds = bounds;
            return data;
        }

        static void SkirtVertex(ChunkData data, int k, int src, Vector3d center, double depth, Vector3d dir)
        {
            data.Vertices[k] = data.Vertices[src] - (Vector3)(dir * depth);
            data.Normals[k] = data.Normals[src];
            data.Tangents[k] = data.Tangents[src];
            data.Colors[k] = data.Colors[src];
        }
    }
}

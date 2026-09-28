// Riftborn — 3D creatures, ported from the web game's js/beasts.js. Every
// species is modelled in code: a skinned mesh swept along a bone rig
// (tail, spine, neck, head, legs, arms or wings) wrapped in generated scaly
// skin, with rigid parts (eyes, teeth, claws, horns, frills, plates, sails)
// riding on the bones. BeastInstance animates it: legs walk with inverse
// kinematics, tails sway, heads look around, jaws roar, wings flap.
//
// Model space: y up, the creature faces +z and is about one unit tall; the
// instance's root is scaled by the species' size in meters.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Riftborn
{
    public class LegDef { public bool hip, knee, hoof, dangle; public float x, ph0, ph1; public float[][] pts; public float[] r; public int toes; }
    public class ArmDef { public float x; public float[][] pts; public float[] r; }
    public class WingDef { public float[][] pts; public float[] r, root; }
    public class PlanDef
    {
        public float[][] spine, jaw; public int hip; public int[] tail, front; public float[] jawAt, eye; public float teeth; public bool beak;
        public LegDef[] legs; public ArmDef arms; public WingDef wing; public float stride, lift;
    }

    // The built model of one species, shared by all its instances.
    public class BeastAsset
    {
        public Species sp; public PlanDef plan;
        public Mesh mesh; public Material[] skinMats;
        public List<(string name, int parent, Vector3 pos)> bones = new List<(string, int, Vector3)>();
        public Dictionary<string, int> bi = new Dictionary<string, int>();
        public List<Part> parts = new List<Part>();
        public List<LegInfo> legs = new List<LegInfo>();
        public List<(string[] bones, int side)> arms = new List<(string[], int)>(), wings = new List<(string[], int)>();
        public string headName; public int tailCount, frontCount; public bool glow; public Bounds bounds;
    }

    public class Part { public int bone; public Mesh mesh; public Material mat; public Vector3 pos; public Quaternion rot = Quaternion.identity; public Vector3 scale = Vector3.one; public bool shadow = true; }
    public class LegInfo { public string[] bones; public Vector3[] rest; public bool knee, dangle; public float phase; public int side; public int parent; }

    public static class Beasts
    {
        static readonly Dictionary<Plan, PlanDef> PLANS = new Dictionary<Plan, PlanDef>
        {
            { Plan.Raptor, new PlanDef{spine=new[]{new[]{-1.05f,0.72f,0.006f,0.006f},new[]{-0.88f,0.71f,0.025f,0.03f},new[]{-0.66f,0.68f,0.045f,0.055f},new[]{-0.44f,0.65f,0.07f,0.085f},new[]{-0.22f,0.62f,0.1f,0.12f},new[]{0f,0.6f,0.125f,0.15f},new[]{0.14f,0.6f,0.13f,0.155f},new[]{0.27f,0.64f,0.11f,0.13f},new[]{0.36f,0.73f,0.065f,0.07f},new[]{0.42f,0.84f,0.055f,0.058f},new[]{0.48f,0.92f,0.062f,0.07f},new[]{0.58f,0.925f,0.05f,0.054f},new[]{0.68f,0.905f,0.034f,0.037f},new[]{0.75f,0.885f,0.01f,0.012f}},hip=5,tail=new[]{4,3,2,1},front=new[]{7,8,9,10},jawAt=new[]{0.46f,0.862f},jaw=new[]{new[]{0f,0f,0.05f,0.028f},new[]{0.1f,-0.012f,0.043f,0.024f},new[]{0.19f,-0.022f,0.03f,0.018f},new[]{0.275f,-0.032f,0.008f,0.007f}},eye=new[]{0.53f,0.945f,0.05f,0.019f},teeth=0.02f,beak=false,legs=new LegDef[]{new LegDef{hip=true,x=0.09f,pts=new[]{new[]{0.02f,0.56f},new[]{0.1f,0.34f},new[]{-0.02f,0.13f},new[]{0.06f,0.02f},new[]{0.13f,0.01f}},r=new[]{0.085f,0.048f,0.03f,0.022f,0.012f},knee=true,ph0=0f,ph1=3.14159f,toes=3,hoof=false,dangle=false}},arms=new ArmDef{x=0.075f,pts=new[]{new[]{0.27f,0.6f},new[]{0.3f,0.5f},new[]{0.39f,0.47f},new[]{0.45f,0.445f}},r=new[]{0.034f,0.024f,0.017f,0.008f}},stride=0.2f,lift=0.08f} },
            { Plan.Rex, new PlanDef{spine=new[]{new[]{-1.1f,0.62f,0.008f,0.008f},new[]{-0.9f,0.63f,0.05f,0.055f},new[]{-0.66f,0.62f,0.09f,0.1f},new[]{-0.42f,0.6f,0.14f,0.16f},new[]{-0.2f,0.58f,0.19f,0.22f},new[]{0f,0.57f,0.22f,0.25f},new[]{0.16f,0.59f,0.22f,0.26f},new[]{0.3f,0.64f,0.18f,0.22f},new[]{0.38f,0.74f,0.125f,0.135f},new[]{0.44f,0.82f,0.115f,0.125f},new[]{0.51f,0.87f,0.11f,0.14f},new[]{0.64f,0.86f,0.095f,0.11f},new[]{0.78f,0.83f,0.072f,0.08f},new[]{0.88f,0.8f,0.045f,0.05f},new[]{0.93f,0.78f,0.012f,0.012f}},hip=5,tail=new[]{4,3,2,1},front=new[]{7,8,9,10},jawAt=new[]{0.49f,0.79f},jaw=new[]{new[]{0f,0f,0.1f,0.05f},new[]{0.15f,-0.012f,0.085f,0.045f},new[]{0.29f,-0.03f,0.06f,0.034f},new[]{0.41f,-0.042f,0.015f,0.012f}},eye=new[]{0.58f,0.93f,0.09f,0.024f},teeth=0.035f,beak=false,legs=new LegDef[]{new LegDef{hip=true,x=0.15f,pts=new[]{new[]{0.02f,0.55f},new[]{0.12f,0.33f},new[]{-0.02f,0.13f},new[]{0.07f,0.02f},new[]{0.17f,0.01f}},r=new[]{0.13f,0.085f,0.065f,0.05f,0.03f},knee=true,ph0=0f,ph1=3.14159f,toes=3,hoof=false,dangle=false}},arms=new ArmDef{x=0.12f,pts=new[]{new[]{0.3f,0.56f},new[]{0.33f,0.5f},new[]{0.38f,0.49f},new[]{0.41f,0.47f}},r=new[]{0.04f,0.03f,0.02f,0.009f}},stride=0.2f,lift=0.07f} },
            { Plan.Horned, new PlanDef{spine=new[]{new[]{-0.92f,0.36f,0.006f,0.006f},new[]{-0.76f,0.41f,0.04f,0.045f},new[]{-0.58f,0.47f,0.08f,0.09f},new[]{-0.42f,0.52f,0.14f,0.15f},new[]{-0.26f,0.56f,0.24f,0.24f},new[]{-0.02f,0.58f,0.3f,0.28f},new[]{0.24f,0.55f,0.26f,0.25f},new[]{0.4f,0.5f,0.15f,0.16f},new[]{0.53f,0.47f,0.14f,0.16f},new[]{0.67f,0.42f,0.1f,0.11f},new[]{0.78f,0.35f,0.06f,0.07f},new[]{0.84f,0.3f,0.012f,0.012f}},hip=4,tail=new[]{3,2,1},front=new[]{6,7,8},jawAt=new[]{0.56f,0.37f},jaw=new[]{new[]{0f,0f,0.09f,0.05f},new[]{0.12f,-0.03f,0.065f,0.04f},new[]{0.25f,-0.075f,0.015f,0.012f}},eye=new[]{0.61f,0.52f,0.12f,0.022f},teeth=0f,beak=true,legs=new LegDef[]{new LegDef{hip=true,x=0.2f,pts=new[]{new[]{-0.28f,0.5f},new[]{-0.22f,0.3f},new[]{-0.3f,0.12f},new[]{-0.26f,0.02f},new[]{-0.2f,0f}},r=new[]{0.13f,0.09f,0.075f,0.07f,0.05f},knee=true,ph0=0f,ph1=3.14159f,toes=4,hoof=true,dangle=false},new LegDef{hip=false,x=0.19f,pts=new[]{new[]{0.26f,0.45f},new[]{0.22f,0.27f},new[]{0.27f,0.1f},new[]{0.29f,0.02f},new[]{0.34f,0f}},r=new[]{0.11f,0.08f,0.07f,0.065f,0.045f},knee=false,ph0=1.5708f,ph1=4.71239f,toes=4,hoof=true,dangle=false}},stride=0.13f,lift=0.06f} },
            { Plan.Plated, new PlanDef{spine=new[]{new[]{-1.05f,0.5f,0.008f,0.008f},new[]{-0.86f,0.56f,0.04f,0.045f},new[]{-0.64f,0.62f,0.08f,0.09f},new[]{-0.42f,0.66f,0.14f,0.16f},new[]{-0.2f,0.66f,0.24f,0.26f},new[]{0.06f,0.6f,0.27f,0.27f},new[]{0.3f,0.48f,0.2f,0.2f},new[]{0.46f,0.38f,0.1f,0.1f},new[]{0.58f,0.32f,0.07f,0.075f},new[]{0.68f,0.28f,0.05f,0.05f},new[]{0.75f,0.25f,0.012f,0.012f}},hip=4,tail=new[]{3,2,1},front=new[]{6,7,8},jawAt=new[]{0.58f,0.285f},jaw=new[]{new[]{0f,0f,0.05f,0.03f},new[]{0.1f,-0.02f,0.04f,0.025f},new[]{0.17f,-0.035f,0.012f,0.01f}},eye=new[]{0.62f,0.335f,0.058f,0.014f},teeth=0f,beak=true,legs=new LegDef[]{new LegDef{hip=true,x=0.18f,pts=new[]{new[]{-0.2f,0.58f},new[]{-0.14f,0.34f},new[]{-0.22f,0.13f},new[]{-0.18f,0.02f},new[]{-0.12f,0f}},r=new[]{0.13f,0.085f,0.07f,0.065f,0.045f},knee=true,ph0=0f,ph1=3.14159f,toes=4,hoof=true,dangle=false},new LegDef{hip=false,x=0.16f,pts=new[]{new[]{0.3f,0.4f},new[]{0.27f,0.24f},new[]{0.31f,0.09f},new[]{0.32f,0.02f},new[]{0.36f,0f}},r=new[]{0.09f,0.07f,0.06f,0.055f,0.04f},knee=false,ph0=1.5708f,ph1=4.71239f,toes=4,hoof=true,dangle=false}},stride=0.12f,lift=0.06f} },
            { Plan.Longneck, new PlanDef{spine=new[]{new[]{-1.18f,0.28f,0.006f,0.006f},new[]{-0.98f,0.33f,0.03f,0.035f},new[]{-0.76f,0.38f,0.06f,0.07f},new[]{-0.52f,0.43f,0.1f,0.11f},new[]{-0.3f,0.47f,0.17f,0.19f},new[]{-0.16f,0.5f,0.22f,0.23f},new[]{0.05f,0.52f,0.25f,0.25f},new[]{0.26f,0.53f,0.2f,0.21f},new[]{0.4f,0.62f,0.11f,0.11f},new[]{0.47f,0.76f,0.085f,0.085f},new[]{0.51f,0.9f,0.07f,0.07f},new[]{0.57f,1.04f,0.058f,0.062f},new[]{0.66f,1.05f,0.04f,0.042f},new[]{0.72f,1.03f,0.01f,0.01f}},hip=5,tail=new[]{4,3,2,1},front=new[]{7,8,9,10,11},jawAt=new[]{0.57f,1.015f},jaw=new[]{new[]{0f,0f,0.04f,0.025f},new[]{0.08f,0f,0.032f,0.02f},new[]{0.145f,-0.005f,0.01f,0.008f}},eye=new[]{0.6f,1.07f,0.048f,0.014f},teeth=0f,beak=true,legs=new LegDef[]{new LegDef{hip=true,x=0.17f,pts=new[]{new[]{-0.18f,0.45f},new[]{-0.15f,0.27f},new[]{-0.18f,0.1f},new[]{-0.17f,0.02f},new[]{-0.13f,0f}},r=new[]{0.12f,0.09f,0.08f,0.075f,0.05f},knee=true,ph0=0f,ph1=3.14159f,toes=4,hoof=true,dangle=false},new LegDef{hip=false,x=0.16f,pts=new[]{new[]{0.26f,0.45f},new[]{0.26f,0.27f},new[]{0.26f,0.1f},new[]{0.27f,0.02f},new[]{0.31f,0f}},r=new[]{0.1f,0.08f,0.075f,0.07f,0.05f},knee=false,ph0=1.5708f,ph1=4.71239f,toes=4,hoof=true,dangle=false}},stride=0.11f,lift=0.05f} },
            { Plan.Flyer, new PlanDef{spine=new[]{new[]{-0.42f,0.6f,0.005f,0.005f},new[]{-0.3f,0.6f,0.02f,0.02f},new[]{-0.16f,0.6f,0.06f,0.065f},new[]{0f,0.62f,0.085f,0.09f},new[]{0.1f,0.64f,0.07f,0.075f},new[]{0.18f,0.7f,0.04f,0.042f},new[]{0.25f,0.76f,0.035f,0.036f},new[]{0.3f,0.79f,0.042f,0.05f},new[]{0.42f,0.77f,0.028f,0.03f},new[]{0.56f,0.745f,0.014f,0.014f},new[]{0.68f,0.725f,0.004f,0.004f}},hip=2,tail=new[]{1},front=new[]{4,5,6,7},jawAt=new[]{0.3f,0.772f},jaw=new[]{new[]{0f,0f,0.034f,0.018f},new[]{0.14f,-0.024f,0.02f,0.011f},new[]{0.37f,-0.05f,0.004f,0.004f}},eye=new[]{0.325f,0.81f,0.036f,0.012f},teeth=0f,beak=true,legs=new LegDef[]{new LegDef{hip=true,x=0.05f,pts=new[]{new[]{-0.15f,0.58f},new[]{-0.2f,0.5f},new[]{-0.28f,0.46f},new[]{-0.31f,0.45f},new[]{-0.34f,0.445f}},r=new[]{0.03f,0.02f,0.013f,0.01f,0.006f},knee=false,ph0=0f,ph1=0f,toes=3,hoof=false,dangle=true}},wing=new WingDef{pts=new[]{new[]{0.06f,0.665f,0.08f},new[]{0.3f,0.68f,0.14f},new[]{0.55f,0.68f,0.12f},new[]{1.05f,0.66f,-0.12f}},r=new[]{0.03f,0.022f,0.016f,0.004f},root=new[]{0.05f,0.6f,-0.16f}},stride=0.15f,lift=0.06f} },
        };

        /* ======================= Geometry builder ======================= */

        class Joint { public Vector3 p; public float hw, hh; public Joint(Vector3 p, float hw, float hh) { this.p = p; this.hw = hw; this.hh = hh; } }
        class Sample { public Vector3 p; public float hw, hh, param; }
        public class Ring { public int b; public Vector3 p, nrm, sd, tan; public float hw, hh, param; }

        class Acc
        {
            public readonly bool skinned;
            public readonly List<Vector3> pos = new List<Vector3>();
            public readonly List<Vector2> uv = new List<Vector2>();
            public readonly List<BoneWeight> w = new List<BoneWeight>();
            public readonly List<int>[] subs = { new List<int>(), new List<int>(), new List<int>() };
            public readonly List<(int, int)> seams = new List<(int, int)>();
            public Acc(bool skinned) { this.skinned = skinned; }
            public int Vert(Vector3 p, float u, float v, List<(int bone, float w)> ws)
            {
                pos.Add(p); uv.Add(new Vector2(u, v));
                if (skinned)
                {
                    var top = ws.GroupBy((x) => x.bone).Select((g) => (bone: g.Key, w: g.Sum((x) => x.w))).OrderByDescending((x) => x.w).Take(4).ToList();
                    float sum = top.Sum((x) => x.w); if (sum <= 0) sum = 1;
                    var bw = new BoneWeight();
                    if (top.Count > 0) { bw.boneIndex0 = top[0].bone; bw.weight0 = top[0].w / sum; }
                    if (top.Count > 1) { bw.boneIndex1 = top[1].bone; bw.weight1 = top[1].w / sum; }
                    if (top.Count > 2) { bw.boneIndex2 = top[2].bone; bw.weight2 = top[2].w / sum; }
                    if (top.Count > 3) { bw.boneIndex3 = top[3].bone; bw.weight3 = top[3].w / sum; }
                    w.Add(bw);
                }
                return pos.Count - 1;
            }
            public Mesh Mesh(string name)
            {
                var m = new Mesh { name = name };
                if (pos.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
                m.SetVertices(pos);
                m.SetUVs(0, uv);
                int used = subs.Count((s) => s.Count > 0);
                m.subMeshCount = skinned ? 3 : 1;
                if (skinned) for (int k = 0; k < 3; k++) m.SetTriangles(subs[k], k);
                else m.SetTriangles(subs[0], 0);
                if (skinned) m.boneWeights = w.ToArray();
                m.RecalculateNormals();
                // Weld normals across the texture seam of each ring.
                var n = m.normals;
                foreach (var (i, j) in seams) { var a = (n[i] + n[j]).normalized; n[i] = a; n[j] = a; }
                m.normals = n;
                m.RecalculateBounds();
                return m;
            }
        }

        static float Cat(float p0, float p1, float p2, float p3, float t)
        {
            float t2 = t * t, t3 = t2 * t;
            return 0.5f * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        }

        // A smooth tube through joints, sampled every `step` units.
        static List<Sample> SampleJ(List<Joint> J, float step)
        {
            var o = new List<Sample>();
            for (int i = 0; i < J.Count - 1; i++)
            {
                Joint a = J[Math.Max(0, i - 1)], b = J[i], c = J[i + 1], d = J[Math.Min(J.Count - 1, i + 2)];
                int n = Math.Max(1, Mathf.CeilToInt(Vector3.Distance(b.p, c.p) / step));
                for (int s = 0; s < n; s++)
                {
                    float t = s / (float)n;
                    float lo = Mathf.Min(Mathf.Min(b.hw, c.hw), Mathf.Min(b.hh, c.hh)) * 0.6f;
                    o.Add(new Sample
                    {
                        p = new Vector3(Cat(a.p.x, b.p.x, c.p.x, d.p.x, t), Cat(a.p.y, b.p.y, c.p.y, d.p.y, t), Cat(a.p.z, b.p.z, c.p.z, d.p.z, t)),
                        hw = Mathf.Max(lo, Cat(a.hw, b.hw, c.hw, d.hw, t), 0.002f),
                        hh = Mathf.Max(lo, Cat(a.hh, b.hh, c.hh, d.hh, t), 0.002f),
                        param = i + t,
                    });
                }
            }
            var e = J[J.Count - 1];
            o.Add(new Sample { p = e.p, hw = e.hw, hh = e.hh, param = J.Count - 1 });
            return o;
        }

        // Sweep an elliptical cross-section along joints.
        static List<Ring> Sweep(Acc acc, List<Joint> J, int segs, float step, Vector3 side, float u0, float u1, Func<float, List<(int, float)>> weight, int mat, float ridge = 0)
        {
            var S = SampleJ(J, step);
            float len = 0; var arc = new List<float> { 0 };
            for (int k = 1; k < S.Count; k++) { len += Vector3.Distance(S[k].p, S[k - 1].p); arc.Add(len); }
            var lastN = Vector3.up;
            var rings = new List<Ring>();
            var tris = acc.subs[mat];
            for (int k = 0; k < S.Count; k++)
            {
                var tan = (S[Math.Min(S.Count - 1, k + 1)].p - S[Math.Max(0, k - 1)].p).normalized;
                var nrm = Vector3.Cross(tan, side);
                if (nrm.sqrMagnitude < 1e-6f) nrm = lastN; else nrm.Normalize();
                lastN = nrm;
                var sd = Vector3.Cross(nrm, tan).normalized;
                var w = weight?.Invoke(S[k].param);
                float u = u0 + (u1 - u0) * (arc[k] / (len > 0 ? len : 1));
                int b = acc.pos.Count;
                for (int j = 0; j <= segs; j++)
                {
                    float al = j / (float)segs * Mathf.PI * 2, sa = Mathf.Sin(al), ca = Mathf.Cos(al);
                    float up = -ca * S[k].hh;
                    if (ridge > 0 && ca < 0) up -= Mathf.Pow(-ca, 12) * S[k].hh * ridge;
                    acc.Vert(S[k].p + sd * (sa * S[k].hw) + nrm * up, u, j / (float)segs, w);
                }
                acc.seams.Add((b, b + segs));
                rings.Add(new Ring { b = b, p = S[k].p, hw = S[k].hw, hh = S[k].hh, nrm = nrm, sd = sd, tan = tan, param = S[k].param });
                if (k > 0)
                {
                    int pb = rings[k - 1].b;
                    for (int j = 0; j < segs; j++)
                    {
                        int A = pb + j, D = pb + j + 1, B = b + j, C = b + j + 1;
                        tris.Add(A); tris.Add(D); tris.Add(B);
                        tris.Add(B); tris.Add(D); tris.Add(C);
                    }
                }
            }
            void Cap(Ring rg, float dir, bool end)
            {
                int c = acc.Vert(rg.p + rg.tan * (dir * Mathf.Min(rg.hw, rg.hh) * 0.6f), end ? u1 : u0, 0.5f, weight?.Invoke(end ? S[S.Count - 1].param : 0));
                for (int j = 0; j < segs; j++)
                {
                    if (end) { tris.Add(rg.b + j); tris.Add(rg.b + j + 1); tris.Add(c); }
                    else { tris.Add(rg.b + j); tris.Add(c); tris.Add(rg.b + j + 1); }
                }
            }
            Cap(rings[0], -1, false);
            Cap(rings[rings.Count - 1], 1, true);
            return rings;
        }

        // Skin weights along a chain of bones placed at `pos` (in the chain's
        // parameter units). Neighbouring bones blend across each joint.
        static List<(int, float)> ChainWeights(float[] pos, int[] bones, float d)
        {
            int n = pos.Length, k = 0;
            while (k < n - 1 && d >= pos[k + 1]) k++;
            float L = k < n - 1 ? pos[k + 1] - pos[k] : (k > 0 ? pos[k] - pos[k - 1] : 1);
            float f = Mathf.Max(0, (d - pos[k]) / L);
            float wp = k > 0 ? Mathf.Max(0, 0.35f - f) / 0.7f : 0;
            float wn = k < n - 1 ? Mathf.Max(0, f - 0.65f) / 0.7f : 0;
            var o = new List<(int, float)> { (bones[k], 1 - wp - wn) };
            if (wp > 0) o.Add((bones[k - 1], wp));
            if (wn > 0) o.Add((bones[k + 1], wn));
            return o;
        }

        /* ======================= Assets ======================= */

        static readonly Dictionary<string, BeastAsset> assets = new Dictionary<string, BeastAsset>();
        static Vector3 V(float x, float y, float z) => new Vector3(x, y, z);

        public static BeastAsset Asset(string id)
        {
            if (assets.TryGetValue(id, out var cached)) return cached;
            var sp = Species.ById(id);
            var P = PLANS[sp.plan];
            var r = new Seeded("beast:" + id);
            var A = new BeastAsset { sp = sp, plan = P };
            var acc = new Acc(true);
            var parts = A.parts;
            void AddBone(string name, string parent, Vector3 pos) { A.bi[name] = A.bones.Count; A.bones.Add((name, parent == null ? -1 : A.bi[parent], pos)); }
            var J = P.spine.Select((s) => new Joint(V(0, s[1], s[0]), s[2], s[3])).ToList();

            // Spine bones: the hip is the root; tail bones go back, front bones forward.
            AddBone("hip", null, J[P.hip].p);
            string prev = "hip";
            for (int k = 0; k < P.tail.Length; k++) { AddBone("t" + k, prev, J[P.tail[k]].p); prev = "t" + k; }
            prev = "hip";
            for (int k = 0; k < P.front.Length; k++) { AddBone("f" + k, prev, J[P.front[k]].p); prev = "f" + k; }
            string headName = "f" + (P.front.Length - 1), chestName = "f0";
            float[] tailPos = new[] { 0f }.Concat(P.tail.Select((j) => (float)(P.hip - j))).ToArray();
            int[] tailBones = new[] { "hip" }.Concat(P.tail.Select((_, k) => "t" + k)).Select((nm) => A.bi[nm]).ToArray();
            float[] frontPos = new[] { 0f }.Concat(P.front.Select((j) => (float)(j - P.hip))).ToArray();
            int[] frontBones = new[] { "hip" }.Concat(P.front.Select((_, k) => "f" + k)).Select((nm) => A.bi[nm]).ToArray();
            List<(int, float)> SpineW(float p) => p >= P.hip ? ChainWeights(frontPos, frontBones, p - P.hip) : ChainWeights(tailPos, tailBones, P.hip - p);
            var spine = Sweep(acc, J, 20, 0.018f, Vector3.right, 0, 1, SpineW, 0, sp.plan == Plan.Horned || sp.plan == Plan.Plated ? 0 : 0.18f);

            Ring RingAt(float param) { var best = spine[0]; foreach (var rg in spine) if (Mathf.Abs(rg.param - param) < Mathf.Abs(best.param - param)) best = rg; return best; }
            int BoneAt(float param) => SpineW(param).OrderByDescending((x) => x.Item2).First().Item1;
            Ring RingAtZ(float z, float from) { Ring best = null; foreach (var rg in spine) if (rg.param >= from && (best == null || Mathf.Abs(rg.p.z - z) < Mathf.Abs(best.p.z - z))) best = rg; return best; }

            var nat = Tex.Natural(sp);
            // Materials: 0 body, 1 limbs, 2 wing membrane.
            var skinTex = Tex.Skin(sp, nat, r);
            var skin = Mats.Skin(skinTex.skin, new Vector2(18, 6), skinTex.glow);
            var limb = Mats.Skin(Tex.Limb(nat, (int)(Rng.Hash(id) & 0xFFF)), new Vector2(7, 4));
            var membrane = Mats.Skin(Tex.Membrane(nat, (int)(Rng.Hash(id) & 0xFFF)), new Vector2(10, 4), null, 0.25f);
            A.skinMats = new[] { skin, limb, membrane };
            A.glow = skinTex.glow != null;
            var elc = Species.Elements[sp.el].color;
            bool glows = sp.Has("glow"), fantasy = glows || sp.el == El.Void;
            var M = new Dictionary<string, Material>
            {
                { "skin", skin }, { "skinlimb", limb },
                { "horn", sp.Has("crown") ? Mats.Emissive(nat[2], nat[2] * 0.8f, 0.6f) : Mats.Solid(Color.Lerp(Species.Hex("#EDE3CC"), nat[2], 0.15f), 0.55f) },
                { "claw", Mats.Solid(Species.Hex("#2A2420"), 0.6f) },
                { "nail", Mats.Solid(Species.Hex("#5E5446"), 0.55f) },
                { "eye", Mats.Skin(Tex.Eye(sp.eye, (int)(Rng.Hash(id) & 0xFF)), Vector2.one, null, 0.92f) },
                { "nostril", Mats.Solid(Species.Hex("#140C08"), 0.1f) },
                { "mouth", Mats.Solid(Species.Hex("#6A2A2A"), 0.6f) },
                { "teeth", Mats.Solid(Species.Hex("#E6DCC2"), 0.7f) },
                { "frill", Mats.Skin(Tex.Frill(nat), new Vector2(4, 4)) },
                { "accent", glows ? Mats.Emissive(Color.Lerp(nat[0], nat[2], fantasy ? 0.8f : 0.55f), elc * 0.5f, 0.3f) : Mats.Solid(Color.Lerp(nat[0], nat[2], fantasy ? 0.8f : 0.55f), 0.3f) },
                { "osteo", Mats.Solid(Color.Lerp(nat[0], Species.Hex("#CFC2A0"), 0.3f), 0.4f) },
                { "sail", Mats.Skin(Tex.Sail(nat, (int)(Rng.Hash(id) & 0xFFF)), new Vector2(6, 3), glows ? Tex.Grey : null) },
            };
            if (sp.rar >= 2) { M["eye"].SetTexture("_EmissionMap", M["eye"].mainTexture); M["eye"].SetColor("_EmissionColor", Color.white * 0.45f); }

            void Add(string kind, string bone, Mesh mesh, Vector3 pos, Quaternion rot, Vector3 scale, bool shadow = true) =>
                parts.Add(new Part { bone = A.bi[bone], mesh = mesh, mat = M[kind], pos = pos, rot = rot, scale = scale, shadow = shadow });
            void AddAt(string kind, int bone, Mesh mesh, Vector3 pos, Quaternion rot, Vector3 scale) =>
                parts.Add(new Part { bone = bone, mesh = mesh, mat = M[kind], pos = pos, rot = rot, scale = scale });
            Quaternion Dir(Vector3 d) => Quaternion.FromToRotation(Vector3.up, d.normalized);
            void Cone(string kind, string bone, Vector3 pos, Vector3 dir, float len, float rad, int segs = 8) => Add(kind, bone, Shapes.Cone(segs), pos, Dir(dir), V(rad, len, rad));
            void Blob(string kind, string bone, Vector3 pos, Vector3 scale, bool shadow = true) => Add(kind, bone, Shapes.Sphere(), pos, Quaternion.identity, scale, shadow);

            // Legs
            foreach (var L in P.legs)
            {
                foreach (int side in new[] { 1, -1 })
                {
                    string tag = (L.hip ? "b" : "f") + (side > 0 ? "L" : "R");
                    var bulk = L.dangle ? new[] { 1f, 1, 1, 1, 1 } : L.hoof ? new[] { 1.22f, 1.0f, 0.88f, 1.22f, 1.3f } : new[] { 1.25f, 1.0f, 0.8f, 0.88f, 1 };
                    var lj = L.pts.Select((pt, i) => new Joint(V(side * L.x, pt[1], pt[0]), L.r[i] * bulk[i] * (i == 0 ? 0.9f : 0.88f), L.r[i] * bulk[i] * (i == 0 ? 1.35f : 1.08f))).ToList();
                    string parentName = L.hip ? "hip" : chestName;
                    var names = new string[4];
                    for (int i = 0; i < 4; i++) { names[i] = tag + i; AddBone(names[i], i == 0 ? parentName : names[i - 1], lj[i].p); }
                    int[] ids = names.Select((nm) => A.bi[nm]).ToArray();
                    // Start the skin up inside the body so the thigh blends in.
                    var top = new Joint(lj[0].p + V(-side * L.x * 0.6f, L.r[0] * 1.2f, 0), L.r[0] * (L.dangle ? 0.8f : 0.95f), L.r[0] * (L.dangle ? 1.1f : 1.45f));
                    Sweep(acc, new[] { top }.Concat(lj).ToList(), 14, 0.015f, Vector3.right, 0, 1, (p) => ChainWeights(new[] { 0f, 1, 2, 3 }, ids, Mathf.Max(0, p - 1)), 1);
                    // Toes, with claws, or nails on the big four-legged ones.
                    Vector3 ball = lj[3].p, tip = lj[4].p;
                    float toeLen = Vector3.Distance(ball, tip) * (L.hoof ? 0.6f : 1.1f);
                    for (int k = 0; k < L.toes; k++)
                    {
                        float spread = (k - (L.toes - 1) / 2f) * (L.hoof ? 0.5f : 0.45f);
                        var dir = V(Mathf.Sin(spread) * side, L.dangle ? -0.4f : -0.08f, Mathf.Cos(spread)).normalized;
                        if (L.dangle) dir = V(Mathf.Sin(spread) * 0.5f, -0.6f, -0.6f).normalized;
                        var b = ball + V(0, L.hoof ? -L.r[3] * 0.45f : 0, 0);
                        float rad = L.r[4] * (L.hoof ? 1.15f : 1.1f);
                        Add("skinlimb", names[3], Shapes.Toe(), b, Dir(dir), V(rad, toeLen, rad));
                        if (L.hoof) Blob("nail", names[3], b + dir * (toeLen * 1.02f) + V(0, L.r[4] * 0.1f, 0), V(L.r[4] * 0.95f, L.r[4] * 0.7f, L.r[4] * 0.75f));
                        else Cone("claw", names[3], b + dir * (toeLen * 0.95f), (dir + V(0, -0.5f, 0)).normalized, toeLen * 0.45f, L.r[4] * 0.7f, 6);
                    }
                    A.legs.Add(new LegInfo { bones = names, rest = lj.Select((j) => j.p).ToArray(), knee = L.knee, dangle = L.dangle, phase = side > 0 ? L.ph0 : L.ph1, side = side, parent = A.bi[parentName] });
                }
            }

            // Arms (theropods)
            if (P.arms != null)
            {
                foreach (int side in new[] { 1, -1 })
                {
                    var Ar = P.arms;
                    var aj = Ar.pts.Select((pt, i) => new Joint(V(side * Ar.x, pt[1], pt[0]), Ar.r[i], Ar.r[i])).ToList();
                    var names = new string[3];
                    for (int i = 0; i < 3; i++) { names[i] = "a" + (side > 0 ? "L" : "R") + i; AddBone(names[i], i == 0 ? chestName : names[i - 1], aj[i].p); }
                    int[] ids = names.Select((nm) => A.bi[nm]).ToArray();
                    var top = new Joint(aj[0].p + V(-side * Ar.x * 0.4f, Ar.r[0] * 0.5f, -Ar.r[0] * 0.3f), Ar.r[0] * 0.9f, Ar.r[0]);
                    Sweep(acc, new[] { top }.Concat(aj).ToList(), 10, 0.012f, Vector3.right, 0, 1, (p) => ChainWeights(new[] { 0f, 1, 2 }, ids, Mathf.Max(0, p - 1)), 1);
                    for (int k = 0; k < 3; k++) Cone("claw", names[2], aj[3].p, V(side * (k - 1) * 0.3f, -0.6f, 0.8f), Ar.r[0] * 1.2f, Ar.r[3] * 0.9f, 6);
                    if (sp.Has("feathers"))
                        for (int k = 0; k < 4; k++)
                            Add("accent", names[k < 2 ? 1 : 2], Shapes.Cone(4, 0.25f), Vector3.Lerp(aj[1].p, aj[2].p, k / 3f), Dir(V(side * 0.3f, -0.35f, -1)), V(0.01f, 0.07f + k * 0.01f, 0.01f));
                    A.arms.Add((names, side));
                }
            }

            // Wings (flyers): arm bones with a skinned membrane to the body.
            if (P.wing != null)
            {
                foreach (int side in new[] { 1, -1 })
                {
                    var Wd = P.wing;
                    var wj = Wd.pts.Select((pt, i) => new Joint(V(side * pt[0], pt[1], pt[2]), Wd.r[i], Wd.r[i])).ToList();
                    var names = new string[3];
                    for (int i = 0; i < 3; i++) { names[i] = "w" + (side > 0 ? "L" : "R") + i; AddBone(names[i], i == 0 ? chestName : names[i - 1], wj[i].p); }
                    int[] ids = names.Select((nm) => A.bi[nm]).ToArray();
                    Sweep(acc, wj, 8, 0.03f, Vector3.forward, 0, 1, (p) => ChainWeights(new[] { 0f, 1, 2 }, ids, p), 1);
                    var rootP = V(side * Wd.root[0], Wd.root[1], Wd.root[2]);
                    var tipP = wj[3].p;
                    var lead = SampleJ(wj, 0.05f);
                    int NU = lead.Count - 1, NV = 6, hipB = A.bi["hip"];
                    var grid = new int[NU + 1, NV + 1];
                    for (int iu = 0; iu <= NU; iu++)
                    {
                        float u = iu / (float)NU;
                        var trail = Vector3.Lerp(rootP, tipP, Mathf.Pow(u, 0.8f));
                        trail.z += Mathf.Sin(u * Mathf.PI) * 0.05f * u;   // the trailing edge curves in
                        trail.y -= Mathf.Sin(u * Mathf.PI) * 0.015f;
                        var lw = ChainWeights(new[] { 0f, 1, 2 }, ids, lead[iu].param);
                        for (int iv = 0; iv <= NV; iv++)
                        {
                            float v = iv / (float)NV;
                            var ws = lw.Select((x) => (x.Item1, x.Item2 * (1 - v))).ToList();
                            ws.Add((hipB, v * (1 - u)));
                            ws.Add((ids[2], v * u));
                            grid[iu, iv] = acc.Vert(Vector3.Lerp(lead[iu].p, trail, v), u, v, ws);
                        }
                    }
                    var tris = acc.subs[2];
                    for (int iu = 0; iu < NU; iu++)
                        for (int iv = 0; iv < NV; iv++)
                        {
                            int a = grid[iu, iv], b = grid[iu + 1, iv], c = grid[iu + 1, iv + 1], d = grid[iu, iv + 1];
                            // Both faces, so the thin membrane shows from above and below.
                            tris.AddRange(new[] { a, b, d, b, c, d, a, d, b, b, d, c });
                        }
                    A.wings.Add((names, side));
                }
            }

            // Head: jaw bone, eyes, teeth, mouth, nostrils.
            var head = J[P.front[P.front.Length - 1]];
            var jawAt = V(0, P.jawAt[1], P.jawAt[0]);
            AddBone("jaw", headName, jawAt);
            var jawAcc = new Acc(false);
            Sweep(jawAcc, P.jaw.Select((j) => new Joint(V(0, jawAt.y + j[1], jawAt.z + j[0]), j[2], j[3])).ToList(), 14, 0.012f, Vector3.right, 0.86f, 1, null, 0);
            parts.Add(new Part { bone = A.bi["jaw"], mesh = jawAcc.Mesh("jaw"), mat = skin, pos = Vector3.zero });
            float jawLen = P.jaw[P.jaw.Length - 1][0];
            Blob("mouth", headName, jawAt + V(0, 0.012f, jawLen * 0.45f), V(P.jaw[0][2] * 0.75f, P.jaw[0][3] * 0.5f, jawLen * 0.48f), false);
            Blob("mouth", "jaw", jawAt + V(0, P.jaw[0][3] * 0.55f, jawLen * 0.4f), V(P.jaw[0][2] * 0.6f, P.jaw[0][3] * 0.35f, jawLen * 0.42f), false);
            if (P.teeth > 0)
            {
                int n = Mathf.RoundToInt(jawLen / 0.022f);
                for (int k = 0; k < n; k++)
                {
                    float z = jawAt.z + 0.03f + (jawLen - 0.05f) * k / (n - 1);
                    var rg = RingAtZ(z, P.front[P.front.Length - 1] - 0.5f);
                    if (rg == null) continue;
                    foreach (int s in new[] { 1, -1 })
                    {
                        float len = P.teeth * (0.7f + 0.5f * Mathf.Pow(Mathf.Sin(k * 2.3f), 2));
                        Cone("teeth", headName, V(s * rg.hw * 0.72f, rg.p.y - rg.hh * 0.78f, z), V(0, -1, 0.1f), len, len * 0.28f, 6);
                        float f = Mathf.Clamp01((z - jawAt.z) / jawLen);
                        float jy = jawAt.y + P.jaw[0][1] + P.jaw[P.jaw.Length - 1][1] * f;
                        float jw = P.jaw[0][2] * (1 - f * 0.8f);
                        if (f < 0.9f) Cone("teeth", "jaw", V(s * jw * 0.7f, jy + P.jaw[0][3] * 0.6f, z), V(0, 1, 0.1f), len * 0.8f, len * 0.25f, 6);
                    }
                }
            }
            float ez = P.eye[0], ey = P.eye[1], ex = P.eye[2], er = P.eye[3];
            foreach (int s in new[] { 1, -1 })
            {
                // The eye looks out and a little forward, set in an eyelid.
                var look = V(s * 0.94f, 0.05f, 0.34f).normalized;
                Add("eye", headName, Shapes.Sphere(24, 16), V(s * ex * 0.97f, ey, ez), Quaternion.FromToRotation(Vector3.right, look), Vector3.one * er, false);
                Add("skin", headName, Shapes.Torus(), V(s * ex * 0.97f, ey, ez) + look * (er * 0.42f), Quaternion.FromToRotation(Vector3.forward, look), Vector3.one * er);
                Blob("skin", headName, V(s * ex * 0.92f, ey + er * 0.95f, ez - er * 0.1f), V(er * 0.85f, er * 0.5f, er * 1.8f));
            }
            {
                var tipJ = J[J.Count - 1]; var preJ = J[J.Count - 3];
                var at = Vector3.Lerp(preJ.p, tipJ.p, 0.55f);
                float hw = preJ.hw * 0.55f + tipJ.hw * 0.45f, hh = preJ.hh * 0.55f + tipJ.hh * 0.45f;
                foreach (int s in new[] { 1, -1 }) Blob("nostril", headName, at + V(s * hw * 0.62f, hh * 0.45f, 0), V(hw * 0.2f, hh * 0.16f, hw * 0.34f), false);
            }

            /* ------------------ Species features ------------------ */
            if (sp.plan == Plan.Horned)
            {
                if (sp.Has("frill"))
                {
                    var fm = Shapes.Frill(0.4f, out var knobs);
                    var fq = Quaternion.Euler(-0.75f * Mathf.Rad2Deg, 0, 0);
                    var fp = V(0, head.p.y + 0.1f, head.p.z - 0.05f);
                    Add("frill", headName, fm, fp, fq, Vector3.one);
                    foreach (var (kp, kd) in knobs) Add("horn", headName, Shapes.Cone(8), fq * kp + fp, Dir(fq * kd), V(0.016f, 0.05f, 0.016f));
                }
                if (sp.Has("horns3"))
                {
                    Cone("horn", headName, V(0.075f, head.p.y + 0.1f, head.p.z + 0.07f), V(0.12f, 0.55f, 1), 0.3f, 0.032f, 12);
                    Cone("horn", headName, V(-0.075f, head.p.y + 0.1f, head.p.z + 0.07f), V(-0.12f, 0.55f, 1), 0.3f, 0.032f, 12);
                    Cone("horn", headName, V(0, 0.45f, 0.74f), V(0, 1, 0.5f), 0.1f, 0.025f, 12);
                }
                else if (sp.Has("horns1")) Cone("horn", headName, V(0, 0.44f, 0.73f), V(0, 1, 0.35f), 0.2f, 0.036f, 12);
            }
            if (sp.plan == Plan.Plated && sp.Has("plates"))
            {
                int side = 1;
                for (float p = 1.3f; p <= P.front[0] + 0.4f; p += 0.32f)
                {
                    var rg = RingAt(p);
                    float h = 0.2f * Mathf.Exp(-Mathf.Pow(p - (P.hip + 0.4f), 2) / 3.5f) + 0.04f;
                    var q = Quaternion.AngleAxis(side * 0.14f * Mathf.Rad2Deg, Vector3.forward) * Quaternion.AngleAxis(-90, Vector3.up);
                    AddAt("accent", BoneAt(p), Shapes.Plate(h), rg.p + rg.nrm * (rg.hh * 0.85f) + V(side * 0.025f, 0, 0), q, Vector3.one);
                    side = -side;
                }
                foreach (int s in new[] { 1, -1 })
                    for (int k = 0; k < 2; k++)
                    {
                        var rg = RingAt(1.2f + k * 0.5f);
                        AddAt("horn", BoneAt(1.2f + k * 0.5f), Shapes.Cone(12), rg.p + V(s * rg.hw * 0.6f, rg.hh * 0.6f, 0), Dir(V(s * 0.7f, 0.55f, -0.6f)), V(0.022f, 0.16f, 0.022f));
                    }
            }
            if (sp.Has("spikes") && sp.plan != Plan.Plated && !sp.Has("sail"))
            {
                for (float p = 1.2f; p < P.hip + 1.6f; p += 0.28f)
                {
                    var rg = RingAt(p);
                    float s = 0.025f + 0.035f * Mathf.Exp(-Mathf.Pow(p - P.hip, 2) / 4);
                    AddAt("horn", BoneAt(p), Shapes.Cone(12), rg.p + rg.nrm * (rg.hh * 0.85f), Dir(rg.nrm - rg.tan * 0.6f), V(s * 0.55f, s * 2.2f, s * 0.55f));
                }
            }
            if (sp.Has("crest"))
            {
                if (sp.plan == Plan.Flyer)
                    Add("accent", headName, Shapes.Flat(new List<Vector2> { new Vector2(0.02f, 0), new Vector2(-0.24f, 0.2f), new Vector2(-0.12f, 0.02f) }, 0.008f, "crest"), V(0, head.p.y + 0.02f, head.p.z - 0.01f), Quaternion.Euler(0, -90, 0), Vector3.one);
                else if (sp.plan == Plan.Longneck)
                    for (float p = P.front[0] + 0.2f; p < P.front[P.front.Length - 1]; p += 0.22f)
                    {
                        var rg = RingAt(p);
                        AddAt("accent", BoneAt(p), Shapes.Cone(12), rg.p + rg.nrm * (rg.hh * 0.8f), Dir(rg.nrm - rg.tan * 0.5f), V(0.018f, 0.05f, 0.018f));
                    }
                else
                    Add("accent", headName, Shapes.Flat(new List<Vector2> { new Vector2(0.1f, 0), new Vector2(0, 0.07f), new Vector2(-0.08f, 0.05f), new Vector2(-0.06f, 0) }, 0.008f, "crest"), V(0, head.p.y + head.hh * 0.8f, head.p.z + 0.03f), Quaternion.Euler(0, -90, 0), Vector3.one);
            }
            if (sp.Has("crown"))
                for (int k = 0; k < 5; k++)
                {
                    float a = (k - 2) * 0.35f;
                    Cone("horn", headName, V(Mathf.Sin(a) * head.hw * 0.8f, head.p.y + head.hh * 0.75f, head.p.z - 0.02f + Mathf.Cos(a) * 0.02f), V(Mathf.Sin(a) * 0.6f, 1, -0.5f), 0.13f - Mathf.Abs(k - 2) * 0.02f, 0.022f, 12);
                }
            // A tall sail on long spines down the back (like Spinosaurus), in
            // panels that ride the spine bones.
            if (sp.Has("sail"))
            {
                float p0 = P.hip - 2.2f, p1 = P.front[0] + 1.1f, mid = P.hip + 0.6f;
                float Height(float p) => Mathf.Max(0.015f, 0.27f * Mathf.Exp(-Mathf.Pow(p - mid, 2) / 5.5f) - 0.02f);
                Vector3 Top(float p) { var rg = RingAt(p); return rg.p + rg.nrm * (rg.hh * 0.8f); }
                float z0 = Mathf.Min(Top(p0).z, Top(p1).z), z1 = Mathf.Max(Top(p0).z, Top(p1).z);
                for (float p = p0; p < p1 - 0.01f; p += 0.25f)
                {
                    float q = Mathf.Min(p1, p + 0.27f);
                    Vector3 a = Top(p), b = Top(q);
                    var pos = new List<Vector3>(); var uv = new List<Vector2>(); var tris = new List<int>();
                    for (int k = 0; k <= 4; k++)
                    {
                        float f2 = k / 4f;
                        var bse = Vector3.Lerp(a, b, f2);
                        float h = Height(p) + (Height(q) - Height(p)) * f2 - Mathf.Sin(f2 * Mathf.PI) * 0.012f;
                        float u = (bse.z - z0) / Mathf.Max(1e-4f, z1 - z0);
                        pos.Add(bse + V(0, -0.01f, 0)); pos.Add(bse + V(0, h, 0));
                        uv.Add(new Vector2(u, 0)); uv.Add(new Vector2(u, 1));
                        if (k > 0) { int qq = (k - 1) * 2; tris.AddRange(new[] { qq, qq + 2, qq + 1, qq + 1, qq + 2, qq + 3 }); }
                    }
                    AddAt("sail", BoneAt(p + 0.12f), Shapes.Build(pos, uv, tris, "sail", true), Vector3.zero, Quaternion.identity, Vector3.one);
                }
            }
            // Rows of bony studs along the back and flanks (like Ankylosaurus).
            if (sp.Has("armor"))
                for (float p = P.hip - 1.6f; p <= P.front[0] + 0.3f; p += 0.2f)
                {
                    var rg = RingAt(p);
                    foreach (float a in new[] { -1.2f, -0.6f, 0, 0.6f, 1.2f })
                    {
                        var at = rg.p + rg.nrm * (Mathf.Cos(a) * rg.hh * 0.95f) + rg.sd * (Mathf.Sin(a) * rg.hw * 0.95f);
                        float sz = (0.01f + rg.hh * 0.06f) * (a == 0 ? 1.1f : Mathf.Abs(a) > 1 ? 0.8f : 1);
                        AddAt("osteo", BoneAt(p), Shapes.Cone(8), at, Dir(at - rg.p), V(sz, sz * 1.3f, sz));
                    }
                }
            // A heavy bone club at the end of the tail.
            if (sp.Has("club"))
            {
                string tb = "t" + (P.tail.Length - 1);
                var at = Vector3.Lerp(J[P.tail[P.tail.Length - 1]].p, J[0].p, 0.35f);
                Blob("osteo", tb, at, V(0.1f, 0.06f, 0.1f));
                foreach (int s in new[] { 1, -1 }) Blob("osteo", tb, at + V(s * 0.075f, -0.008f, 0.01f), V(0.065f, 0.048f, 0.075f));
            }
            // A thick domed skull ringed with knobs (like Pachycephalosaurus).
            if (sp.Has("dome"))
            {
                Blob("skin", headName, V(0, head.p.y + head.hh * 0.6f, head.p.z - head.hw * 0.25f), V(head.hw * 1.05f, head.hh * 0.9f, head.hw * 1.3f));
                for (int k = 0; k < 7; k++)
                {
                    float a = (k / 6f - 0.5f) * 2.6f;
                    Cone("horn", headName, V(Mathf.Sin(a) * head.hw * 0.95f, head.p.y + head.hh * 0.35f, head.p.z - head.hw * 0.25f - Mathf.Cos(a) * head.hw * 1.1f), V(Mathf.Sin(a), 0.4f, -Mathf.Cos(a)), 0.03f, 0.014f, 12);
                }
            }
            // A long hollow crest sweeping back from the head (like
            // Parasaurolophus). It hoots through it.
            if (sp.Has("tubecrest"))
            {
                float y = head.p.y + head.hh * 0.55f, z = head.p.z + head.hw * 0.4f, rad = head.hw * 0.32f;
                var tube = new Acc(false);
                Sweep(tube, new List<Joint> { new Joint(V(0, y, z), rad, rad), new Joint(V(0, y + 0.06f, z - 0.1f), rad, rad), new Joint(V(0, y + 0.1f, z - 0.24f), rad, rad), new Joint(V(0, y + 0.1f, z - 0.34f), rad * 0.8f, rad * 0.8f) }, 8, 0.02f, Vector3.right, 0, 1, null, 0);
                Add("accent", headName, tube.Mesh("tubecrest"), Vector3.zero, Quaternion.identity, Vector3.one);
            }

            A.mesh = acc.Mesh(id);
            var bindposes = new Matrix4x4[A.bones.Count];
            for (int i = 0; i < A.bones.Count; i++) bindposes[i] = Matrix4x4.Translate(-A.bones[i].pos);
            A.mesh.bindposes = bindposes;
            A.bounds = A.mesh.bounds;
            A.headName = headName;
            A.tailCount = P.tail.Length;
            A.frontCount = P.front.Length;
            assets[id] = A;
            return A;
        }
    }
}

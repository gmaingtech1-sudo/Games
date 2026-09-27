using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    /// <summary>The system's star: a blazing sphere plus a soft glow billboard.</summary>
    public sealed class StarBody
    {
        public readonly GameObject Root;
        public readonly Transform Glow;
        public readonly Material Mat, GlowMat;
        public readonly double Radius;

        public StarBody(StarSystemData sys, Transform parent)
        {
            Radius = sys.StarRadius;
            Root = new GameObject("Star " + sys.Star.Name);
            Root.transform.SetParent(parent, false);
            var sphere = new GameObject("Photosphere");
            sphere.transform.SetParent(Root.transform, false);
            sphere.AddComponent<MeshFilter>().sharedMesh = MeshGen.Sphere;
            var mr = sphere.AddComponent<MeshRenderer>();
            Mat = Materials.New("Wayfarer/Star");
            Color c = sys.StarColor;
            Mat.SetVector("_Color", (Vector4)c.linear);
            Mat.SetFloat("_Intensity", 140f);
            mr.sharedMaterial = Mat;
            mr.shadowCastingMode = ShadowCastingMode.Off;
            mr.receiveShadows = false;

            var g = new GameObject("Glow");
            g.transform.SetParent(Root.transform, false);
            g.AddComponent<MeshFilter>().sharedMesh = MeshGen.Quad;
            var gr = g.AddComponent<MeshRenderer>();
            GlowMat = Materials.New("Wayfarer/StarGlow");
            GlowMat.SetVector("_Color", (Vector4)c.linear);
            GlowMat.SetFloat("_Intensity", 3.5f);
            GlowMat.SetFloat("_Core", 0.1f);
            gr.sharedMaterial = GlowMat;
            gr.shadowCastingMode = ShadowCastingMode.Off;
            gr.receiveShadows = false;
            Glow = g.transform;
            Glow.localScale = Vector3.one * 16f;
        }
    }

    /// <summary>A gas giant you can admire but not land on.</summary>
    public sealed class GasGiantBody
    {
        public readonly GasGiantData Data;
        public readonly GameObject Root;
        public readonly Material Mat, RingMat;
        public QuatD Rotation = QuatD.identity;

        public GasGiantBody(GasGiantData data, Transform parent)
        {
            Data = data;
            Root = new GameObject("Gas giant " + data.Name);
            Root.transform.SetParent(parent, false);
            var s = new GameObject("Body");
            s.transform.SetParent(Root.transform, false);
            s.AddComponent<MeshFilter>().sharedMesh = MeshGen.Sphere;
            var mr = s.AddComponent<MeshRenderer>();
            Mat = Materials.New("Wayfarer/GasGiant");
            Mat.SetColor("_BandA", data.BandA);
            Mat.SetColor("_BandB", data.BandB);
            Mat.SetColor("_BandC", data.BandC);
            Mat.SetFloat("_Seed", (float)(data.Seed % 1000));
            mr.sharedMaterial = Mat;
            mr.shadowCastingMode = ShadowCastingMode.Off;
            if (data.HasRings)
            {
                var r = new GameObject("Rings");
                r.transform.SetParent(Root.transform, false);
                r.AddComponent<MeshFilter>().sharedMesh = MeshGen.Ring;
                var rr = r.AddComponent<MeshRenderer>();
                RingMat = Materials.New("Wayfarer/Ring");
                RingMat.SetColor("_Color", data.RingColor);
                RingMat.SetFloat("_Inner", (float)(data.RingInner / data.Radius));
                RingMat.SetFloat("_Outer", (float)(data.RingOuter / data.Radius));
                RingMat.SetFloat("_Seed", (float)(data.Seed % 97));
                rr.sharedMaterial = RingMat;
                rr.shadowCastingMode = ShadowCastingMode.Off;
            }
        }

        public void UpdateSpin(double t)
        {
            double a = t * System.Math.PI * 2.0 / Data.DayLength;
            Rotation = QuatD.FromTo(Vector3d.up, Data.Axis) * QuatD.AngleAxis(a, Vector3d.up);
        }
    }

    /// <summary>The system's trading station. Its habitat ring turns slowly.</summary>
    public sealed class StationBody
    {
        public readonly StationData Data;
        public readonly GameObject Root;
        public readonly Transform Ring, DockPoint, DockEntry;
        readonly Quaternion ringBase;
        public readonly Livery Livery;

        public StationBody(StationData data, Transform parent)
        {
            Data = data;
            Root = new GameObject("Station " + data.Name);
            Root.transform.SetParent(parent, false);
            var r = new Rng(data.Seed);
            Livery = new Livery
            {
                Hull = r.Hsv(0f, 1f, 0.02f, 0.12f, 0.7f, 0.85f),
                Accent = r.Hsv(0f, 1f, 0.5f, 0.8f, 0.6f, 0.9f),
                Dark = new Color(0.14f, 0.15f, 0.17f),
                Glow = r.Hsv(0.45f, 0.62f, 0.4f, 0.8f, 1f, 1f),
                GlowAlt = new Color(1f, 0.85f, 0.6f),
                GlowIntensity = 6f,
            };
            var model = Models.Spawn("station", Root.transform, Livery.Pick);
            Ring = Models.Find(model.transform, "Ring");
            DockPoint = Models.Find(model.transform, "DockPoint");
            DockEntry = Models.Find(model.transform, "DockEntry");
            if (Ring != null) ringBase = Quaternion.Inverse(Root.transform.rotation) * Ring.rotation;

            // lights in the hangar bay
            if (DockPoint != null)
            {
                for (int i = 0; i < 2; i++)
                {
                    var l = new GameObject("Bay light").AddComponent<Light>();
                    l.type = LightType.Point;
                    l.range = 90f;
                    l.intensity = 2.5f;
                    l.color = new Color(1f, 0.92f, 0.8f);
                    l.shadows = LightShadows.None;
                    l.transform.SetParent(DockPoint, false);
                    l.transform.localPosition = new Vector3(0, 10f, i == 0 ? -12f : 18f);
                }
            }
        }

        public void Animate(double time)
        {
            if (Ring == null) return;
            float a = (float)((time * 2.2) % 360.0);
            Ring.rotation = Root.transform.rotation * Quaternion.AngleAxis(a, Vector3.forward) * ringBase;
        }

        /// <summary>Station-local collision: the hub and the ring. Returns push-out in local space.</summary>
        public static bool Collide(Vector3 local, float radius, out Vector3 push)
        {
            push = Vector3.zero;
            // hub: a capsule along Z from the solar arrays (-125) to the bay mouth (+72);
            // the docking bay itself (z > 0, 50 x 26 m) is open
            var core = new Vector3(0, 0, Mathf.Clamp(local.z, -125f, 72f));
            var d = local - core;
            float hubR = 58f;
            if (local.z > 0f && Mathf.Abs(local.x) < 26f && Mathf.Abs(local.y) < 14f) hubR = 0f;
            float m = d.magnitude;
            if (hubR > 0 && m < hubR + radius)
            {
                push = (m > 1e-3f ? d / m : Vector3.up) * (hubR + radius - m);
                return true;
            }
            // ring (torus of radius 190 around Z, tube ~16)
            var flat = new Vector3(local.x, local.y, 0);
            float fm = flat.magnitude;
            if (fm > 1f)
            {
                var onRing = flat / fm * 190f + new Vector3(0, 0, -30f);
                var dr = local - onRing;
                float rm = dr.magnitude;
                if (rm < 16f + radius)
                {
                    push = (rm > 1e-3f ? dr / rm : Vector3.forward) * (16f + radius - rm);
                    return true;
                }
            }
            return false;
        }
    }

    /// <summary>A drifting cluster of asteroids you can mine with ship guns.</summary>
    public sealed class AsteroidField
    {
        public sealed class Rock
        {
            public Vector3 Pos;       // relative to field centre
            public float Radius;
            public Quaternion Rot;
            public Vector3 Spin;
            public int Type;
            public float Health;
            public bool Alive = true;
        }

        public readonly AsteroidFieldData Data;
        public readonly List<Rock> Rocks = new List<Rock>();
        public readonly GameObject Root;
        readonly Models.MeshPart[] parts = new Models.MeshPart[3];
        readonly Material mat;
        readonly List<Matrix4x4>[] batches = { new List<Matrix4x4>(), new List<Matrix4x4>(), new List<Matrix4x4>() };
        readonly Matrix4x4[] buffer = new Matrix4x4[1023];
        public bool Visible;

        public AsteroidField(AsteroidFieldData data, Transform parent)
        {
            Data = data;
            Root = new GameObject("Asteroid field");
            Root.transform.SetParent(parent, false);
            var r = new Rng(data.Seed);
            for (int i = 0; i < data.Count; i++)
            {
                var dir = r.OnSphere();
                double dist = System.Math.Pow(r.Next(), 0.6) * data.Radius;
                var p = new Vector3((float)(dir.x * dist), (float)(dir.y * dist * 0.35), (float)(dir.z * dist));
                float rad = (float)(6 + System.Math.Pow(r.Next(), 5) * 180);
                Rocks.Add(new Rock
                {
                    Pos = p, Radius = rad, Type = r.Int(0, 2),
                    Rot = Random3(r), Spin = new Vector3(r.Range(-1f, 1f), r.Range(-1f, 1f), r.Range(-1f, 1f)) * (4f / Mathf.Sqrt(rad)),
                    Health = rad * 3f,
                });
            }
            parts[0] = Models.Part("asteroid_a");
            parts[1] = Models.Part("asteroid_b");
            parts[2] = Models.Part("asteroid_c");
            mat = Materials.Prop(r.Hsv(0.05f, 0.1f, 0.08f, 0.25f, 0.3f, 0.45f), 0.05f, 0.12f, 0.6f);
            mat.SetFloat("_NoiseScale", 0.8f);
        }

        static Quaternion Random3(Rng r) => Quaternion.Euler(r.Range(0f, 360f), r.Range(0f, 360f), r.Range(0f, 360f));

        public void Draw(float dt, Camera cam)
        {
            if (!Visible) return;
            foreach (var b in batches) b.Clear();
            var root = Root.transform.localToWorldMatrix;
            foreach (var k in Rocks)
            {
                if (!k.Alive) continue;
                k.Rot = Quaternion.Euler(k.Spin * dt) * k.Rot;
                var part = parts[k.Type];
                if (part == null) continue;
                batches[k.Type].Add(root * Matrix4x4.TRS(k.Pos, k.Rot, Vector3.one * k.Radius) * part.Local);
            }
            for (int t = 0; t < 3; t++)
            {
                var part = parts[t];
                if (part == null) continue;
                var list = batches[t];
                for (int i = 0; i < list.Count; i += 1023)
                {
                    int n = Mathf.Min(1023, list.Count - i);
                    list.CopyTo(i, buffer, 0, n);
                    Graphics.DrawMeshInstanced(part.Mesh, 0, mat, buffer, n, null, ShadowCastingMode.Off, true, 0, cam);
                }
            }
        }
    }
}

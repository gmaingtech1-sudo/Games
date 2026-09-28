// Riftborn — a live, animated creature (see Beasts.cs for how it's built).
// Update() walks it with inverse kinematics so its feet plant, sways the
// tail, turns the head, opens the jaw to roar and flaps wings.
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Riftborn
{
    public class BeastInstance
    {
        public readonly GameObject root;      // scaled to the species' size in meters
        public readonly Species sp;
        public readonly BeastAsset asset;
        public readonly Dictionary<string, Transform> bones = new Dictionary<string, Transform>();
        public readonly List<Renderer> renderers = new List<Renderer>();
        public Transform Head => bones[asset.headName];

        class LegRig { public LegInfo L; public Vector3[] pts; public float l1, l2; public float[] a0; public Transform[] b; }
        readonly List<LegRig> legs = new List<LegRig>();
        readonly Material[] ownMats;
        readonly Vector3 hipRest;
        float t = Random.value * 10, ph, look, lookT, lookTo, tint;

        public BeastInstance(string id)
        {
            asset = Beasts.Asset(id);
            sp = asset.sp;
            root = new GameObject(sp.name);
            var body = new GameObject("body");
            body.transform.SetParent(root.transform, false);
            var tr = new Transform[asset.bones.Count];
            for (int i = 0; i < asset.bones.Count; i++)
            {
                var (name, parent, pos) = asset.bones[i];
                var go = new GameObject(name);
                tr[i] = go.transform;
                tr[i].SetParent(parent >= 0 ? tr[parent] : body.transform, false);
                tr[i].localPosition = parent >= 0 ? pos - asset.bones[parent].pos : pos;
                bones[name] = tr[i];
            }
            // Own materials, so hits can flash just this creature.
            ownMats = asset.skinMats.Select((m) => new Material(m)).ToArray();
            var smr = body.AddComponent<SkinnedMeshRenderer>();
            smr.sharedMesh = asset.mesh;
            smr.bones = tr;
            smr.rootBone = tr[0];
            smr.sharedMaterials = ownMats;
            smr.updateWhenOffscreen = true;
            renderers.Add(smr);
            var matMap = new Dictionary<Material, Material>();
            for (int k = 0; k < 3; k++) matMap[asset.skinMats[k]] = ownMats[k];
            foreach (var p in asset.parts)
            {
                var go = new GameObject("part");
                go.transform.SetParent(tr[p.bone], false);
                go.transform.localPosition = p.pos - asset.bones[p.bone].pos;
                go.transform.localRotation = p.rot;
                go.transform.localScale = p.scale;
                go.AddComponent<MeshFilter>().sharedMesh = p.mesh;
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = matMap.TryGetValue(p.mat, out var own) ? own : p.mat;
                mr.shadowCastingMode = p.shadow ? UnityEngine.Rendering.ShadowCastingMode.On : UnityEngine.Rendering.ShadowCastingMode.Off;
                renderers.Add(mr);
            }
            root.transform.localScale = Vector3.one * sp.size;
            hipRest = tr[0].localPosition;

            foreach (var L in asset.legs)
            {
                var parentPos = asset.bones[L.parent].pos;
                var pts = L.rest.Select((q) => q - parentPos).ToArray();
                float Ang(Vector3 a, Vector3 b) => Mathf.Atan2(b.y - a.y, b.z - a.z);
                legs.Add(new LegRig
                {
                    L = L, pts = pts, l1 = Vector3.Distance(pts[0], pts[1]), l2 = Vector3.Distance(pts[1], pts[2]),
                    a0 = new[] { Ang(pts[0], pts[1]), Ang(pts[1], pts[2]), Ang(pts[2], pts[3]) },
                    b = L.bones.Select((n) => bones[n]).ToArray(),
                });
            }
            Update(0, 0, 0, null);
        }

        // Model-space height (for placing things above it).
        public float Height => asset.bounds.max.y * root.transform.localScale.y;

        static void RotX(Transform b, float rad) => b.localRotation = Quaternion.Euler(rad * Mathf.Rad2Deg, 0, 0);

        void SolveLeg(LegRig R, float dz, float lift, float bob)
        {
            Vector3 H = R.pts[0], A0 = R.pts[2], B0 = R.pts[3];
            float btz = B0.z + dz, bty = B0.y - bob + lift;
            float atz = btz + (A0.z - B0.z), aty = bty + (A0.y - B0.y);
            float vz = atz - H.z, vy = aty - H.y;
            float d = Mathf.Sqrt(vz * vz + vy * vy);
            float max = (R.l1 + R.l2) * 0.999f;
            if (d > max) { vz *= max / d; vy *= max / d; d = max; }
            d = Mathf.Max(d, Mathf.Abs(R.l1 - R.l2) + 1e-4f);
            float a = Mathf.Acos(Mathf.Clamp((R.l1 * R.l1 + d * d - R.l2 * R.l2) / (2 * R.l1 * d), -1, 1));
            float th = Mathf.Atan2(vy, vz);
            Vector2 k1 = new Vector2(H.z + R.l1 * Mathf.Cos(th - a), H.y + R.l1 * Mathf.Sin(th - a));
            Vector2 k2 = new Vector2(H.z + R.l1 * Mathf.Cos(th + a), H.y + R.l1 * Mathf.Sin(th + a));
            var K = (k1.x > k2.x) == R.L.knee ? k1 : k2;   // (z, y)
            float A2z = H.z + vz, A2y = H.y + vy;
            float phiT = Mathf.Atan2(K.y - H.y, K.x - H.z);
            float phiS = Mathf.Atan2(A2y - K.y, A2z - K.x);
            float thT = R.a0[0] - phiT;
            float thS = R.a0[1] - thT - phiS;
            RotX(R.b[0], thT);
            RotX(R.b[1], thS);
            RotX(R.b[2], -(thT + thS));
            RotX(R.b[3], -lift * 2.5f);
        }

        // speed in m/s, mouth 0..1 (roar), look in radians (null: looks around).
        public void Update(float dt, float speed, float mouth, float? lookAt, float flap = 0)
        {
            t += dt;
            var P = asset.plan;
            float speedU = speed / Mathf.Max(0.01f, root.transform.localScale.x);
            float stride = P.stride;
            float wk = Mathf.Clamp01(speedU / 0.25f);
            ph += dt * Mathf.PI * speedU / (2 * stride);
            var b = bones;
            if (sp.plan == Plan.Flyer)
            {
                float w = 6 + flap * 4, f = Mathf.Sin(t * w);
                b["hip"].localPosition = hipRest + new Vector3(0, -f * 0.02f, 0);
                foreach (var (names, side) in asset.wings)
                {
                    b[names[0]].localRotation = Quaternion.Euler(0, side * 0.05f * Mathf.Sin(t * w + 0.5f) * Mathf.Rad2Deg, side * (f * 0.75f + 0.12f) * Mathf.Rad2Deg);
                    b[names[1]].localRotation = Quaternion.Euler(0, 0, -side * Mathf.Sin(t * w - 0.8f) * 0.25f * Mathf.Rad2Deg);
                    b[names[2]].localRotation = Quaternion.Euler(0, 0, -side * Mathf.Sin(t * w - 1.4f) * 0.2f * Mathf.Rad2Deg);
                }
                foreach (var R in legs) { RotX(R.b[0], 0.2f + Mathf.Sin(t * 2) * 0.1f); RotX(R.b[1], Mathf.Sin(t * 2 + 1) * 0.15f); }
            }
            else
            {
                float bob = -Mathf.Abs(Mathf.Cos(ph)) * 0.02f * wk + Mathf.Sin(t * 1.8f) * 0.004f;
                b["hip"].localPosition = hipRest + new Vector3(0, bob, 0);
                b["hip"].localRotation = Quaternion.Euler(0, 0, Mathf.Sin(ph) * 0.03f * wk * Mathf.Rad2Deg);
                foreach (var R in legs)
                {
                    float p2 = ph + R.L.phase;
                    SolveLeg(R, Mathf.Sin(p2) * stride * wk, Mathf.Max(0, Mathf.Cos(p2)) * P.lift * wk, bob);
                }
                foreach (var (names, side) in asset.arms)
                {
                    RotX(b[names[0]], Mathf.Sin(ph + (side > 0 ? Mathf.PI : 0)) * 0.25f * wk + Mathf.Sin(t * 1.4f) * 0.06f);
                    RotX(b[names[1]], -0.2f + Mathf.Sin(t * 1.4f + 0.5f) * 0.08f);
                }
            }
            // Tail sway
            for (int k = 0; k < asset.tailCount; k++)
            {
                float ry = Mathf.Sin(t * 1.3f - k * 0.7f) * 0.07f * (1 + k * 0.3f) + Mathf.Sin(ph) * 0.06f * wk;
                float rx = Mathf.Sin(t * 0.9f - k * 0.5f) * 0.025f + (sp.plan == Plan.Flyer ? 0 : -0.01f * wk);
                b["t" + k].localRotation = Quaternion.Euler(rx * Mathf.Rad2Deg, ry * Mathf.Rad2Deg, 0);
            }
            // Looking around
            lookT -= dt;
            if (lookT <= 0) { lookT = 2 + Random.value * 4; lookTo = (Random.value - 0.5f) * 0.9f; }
            float target = lookAt ?? lookTo * (1 - wk * 0.7f);
            look += (target - look) * (1 - Mathf.Exp(-dt * 2));
            int nf = asset.frontCount - 1;
            for (int k = 1; k <= nf; k++)
            {
                float ry = look / nf + Mathf.Sin(t * 0.8f + k) * 0.015f;
                float rx = k == nf ? -mouth * 0.35f + Mathf.Sin(t * 1.1f) * 0.03f : -mouth * 0.08f;
                b["f" + k].localRotation = Quaternion.Euler(rx * Mathf.Rad2Deg, ry * Mathf.Rad2Deg, 0);
            }
            RotX(b["jaw"], mouth * 0.6f + (Mathf.Sin(t * 1.8f) + 1) * 0.01f);
            // Glowing markings pulse.
            if (asset.glow && tint <= 0) ownMats[0].SetColor("_EmissionColor", Color.white * (0.7f + Mathf.Sin(t * 3) * 0.35f));
        }

        // Flash a colour over the creature (hits, capture); k = 0 turns it off.
        public void SetTint(Color c, float k)
        {
            if (k <= 0 && tint <= 0) return;
            foreach (var m in ownMats)
            {
                if (k > 0) { m.SetColor("_EmissionColor", c * k); m.SetTexture("_EmissionMap", null); }
                else
                {
                    bool glowMap = m == ownMats[0] && asset.glow;
                    m.SetTexture("_EmissionMap", glowMap ? asset.skinMats[0].GetTexture("_EmissionMap") : null);
                    m.SetColor("_EmissionColor", glowMap ? Color.white : Color.black);
                }
            }
            tint = k;
        }

        public void SetLayer(int layer) { foreach (var t2 in root.GetComponentsInChildren<Transform>(true)) t2.gameObject.layer = layer; }

        public void Destroy() { foreach (var m in ownMats) Object.Destroy(m); Object.Destroy(root); }
    }
}

using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    /// <summary>Particle bursts (sparks, explosions, dust, splashes) and beams.</summary>
    public sealed class Effects
    {
        readonly ParticleSystem glow;
        readonly ParticleSystem sparks;
        readonly Material beamMat;
        readonly Material pulseMat;
        readonly Transform root;
        float pulseT = -1f;
        Vector3 pulseCenter;
        float pulseRadius;
        Color pulseColor;

        public Effects(Transform parent)
        {
            root = new GameObject("Effects").transform;
            root.SetParent(parent, false);
            glow = Make("Glow bursts", Materials.Additive(Color.white, 1f, 1f), 3000, false);
            sparks = Make("Sparks", Materials.Additive(Color.white, 1.5f, 1f), 3000, true);
            beamMat = Materials.Additive(Color.white, 1f, 0f, 1f);
            pulseMat = Materials.Additive(new Color(0.4f, 0.9f, 1f), 0.25f, 0f);
        }

        ParticleSystem Make(string name, Material mat, int max, bool stretch)
        {
            var go = new GameObject(name);
            go.transform.SetParent(root, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = false;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = max;
            main.startSpeed = 0f;
            main.gravityModifier = stretch ? 0.4f : 0f;
            var em = ps.emission;
            em.enabled = false;
            var sh = ps.shape;
            sh.enabled = false;
            var col = ps.colorOverLifetime;
            col.enabled = true;
            var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                         new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.6f, 0.4f), new GradientAlphaKey(0f, 1f) });
            col.color = grad;
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, stretch ? AnimationCurve.Linear(0, 1, 1, 0.3f) : AnimationCurve.EaseInOut(0, 0.6f, 1, 1.6f));
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = mat;
            r.renderMode = stretch ? ParticleSystemRenderMode.Stretch : ParticleSystemRenderMode.Billboard;
            r.velocityScale = 0.04f;
            r.lengthScale = 1.5f;
            r.shadowCastingMode = ShadowCastingMode.Off;
            r.receiveShadows = false;
            ps.Play();
            return ps;
        }

        public void Sparks(Vector3 pos, Vector3 normal, Color color, int count, float speed = 6f)
        {
            var ep = new ParticleSystem.EmitParams();
            for (int i = 0; i < count; i++)
            {
                ep.position = pos;
                ep.velocity = (normal + Random.insideUnitSphere * 0.9f).normalized * speed * Random.Range(0.4f, 1.2f);
                ep.startSize = Random.Range(0.04f, 0.12f);
                ep.startLifetime = Random.Range(0.25f, 0.7f);
                ep.startColor = color;
                sparks.Emit(ep, 1);
            }
        }

        public void Burst(Vector3 pos, Color color, float size, int count, float speed, float life = 0.8f)
        {
            var ep = new ParticleSystem.EmitParams();
            for (int i = 0; i < count; i++)
            {
                ep.position = pos + Random.insideUnitSphere * size * 0.3f;
                ep.velocity = Random.insideUnitSphere * speed;
                ep.startSize = size * Random.Range(0.5f, 1.3f);
                ep.startLifetime = life * Random.Range(0.6f, 1.2f);
                ep.startColor = color;
                glow.Emit(ep, 1);
            }
        }

        public void Explosion(Vector3 pos, float scale)
        {
            Burst(pos, new Color(1f, 0.55f, 0.2f), 3f * scale, 18, 8f * scale, 1.0f);
            Burst(pos, new Color(1f, 0.9f, 0.6f), 1.5f * scale, 8, 3f * scale, 0.4f);
            Sparks(pos, Vector3.up, new Color(1f, 0.7f, 0.3f), 30, 25f * scale);
        }

        public void Dust(Vector3 pos, Vector3 up, Color color, float size)
        {
            var ep = new ParticleSystem.EmitParams();
            for (int i = 0; i < 24; i++)
            {
                Vector3 d = Vector3.ProjectOnPlane(Random.onUnitSphere, up).normalized;
                ep.position = pos + d * size * 0.3f;
                ep.velocity = d * size * Random.Range(0.8f, 2f) + up * Random.Range(0f, 1f);
                ep.startSize = size * Random.Range(0.4f, 0.9f);
                ep.startLifetime = Random.Range(0.8f, 1.6f);
                ep.startColor = color * 0.25f;
                glow.Emit(ep, 1);
            }
        }

        /// <summary>A beam from a to b (world), drawn this frame.</summary>
        public void Beam(Vector3 a, Vector3 b, Color color, float width, Camera cam)
        {
            Vector3 d = b - a;
            float len = d.magnitude;
            if (len < 0.01f) return;
            var rot = Quaternion.LookRotation(d / len, Mathf.Abs(Vector3.Dot(d / len, Vector3.up)) < 0.99f ? Vector3.up : Vector3.forward);
            var m = Matrix4x4.TRS(a, rot, new Vector3(width, width, len));
            var mpb = BeamBlock(color);
            Graphics.DrawMesh(MeshGen.Beam, m, beamMat, 0, cam, 0, mpb, ShadowCastingMode.Off, false);
        }

        MaterialPropertyBlock beamBlock;
        MaterialPropertyBlock BeamBlock(Color c)
        {
            if (beamBlock == null) beamBlock = new MaterialPropertyBlock();
            beamBlock.SetVector("_Color", (Vector4)c.linear);
            return beamBlock;
        }

        /// <summary>Starts the expanding ring of a scanner pulse.</summary>
        public void ScannerPulse(Vector3 center, float radius, Color color)
        {
            pulseT = 0f;
            pulseCenter = center;
            pulseRadius = radius;
            pulseColor = color;
        }

        public void Tick(float dt, Camera cam, Vector3 up)
        {
            if (pulseT < 0f) return;
            pulseT += dt;
            float t = pulseT / 1.6f;
            if (t >= 1f) { pulseT = -1f; return; }
            float r = Mathf.Lerp(2f, pulseRadius, 1f - (1f - t) * (1f - t));
            var mpb = BeamBlock(pulseColor * (1f - t) * 0.6f);
            var m = Matrix4x4.TRS(pulseCenter, Quaternion.FromToRotation(Vector3.up, up), new Vector3(r, 1f, r) * 0.385f);
            Graphics.DrawMesh(MeshGen.Ring, m, pulseMat, 0, cam, 0, mpb, ShadowCastingMode.Off, false);
        }

        /// <summary>Keeps particles in place when the floating origin moves.</summary>
        public void Shift(Vector3 delta)
        {
            foreach (var ps in new[] { glow, sparks })
            {
                var parts = new ParticleSystem.Particle[ps.particleCount];
                int n = ps.GetParticles(parts);
                for (int i = 0; i < n; i++) parts[i].position -= delta;
                ps.SetParticles(parts, n);
            }
        }
    }
}

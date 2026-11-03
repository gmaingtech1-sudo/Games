using UnityEngine;

namespace BodyOS
{
    /// <summary>Pooled expanding shockwave shown when a reality ability activates.</summary>
    public sealed class RealityPulse : MonoBehaviour
    {
        static ObjectPool<RealityPulse> pool;
        Material mat;
        Color color;
        float t, radius;
        const float Duration = 0.9f;

        public static void Spawn(Vector3 pos, Color c, float radius)
        {
            if (pool == null)
                pool = new ObjectPool<RealityPulse>(Create, p => p.gameObject.SetActive(true), p => { if (p != null) p.gameObject.SetActive(false); });
            var pulse = pool.Get();
            if (pulse == null) { pool = null; return; } // destroyed with a scene; rebuild next time
            pulse.transform.position = pos;
            pulse.color = c;
            pulse.radius = Mathf.Max(3f, radius);
            pulse.t = 0f;
            pulse.Step();
        }

        static RealityPulse Create()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = "RealityPulse";
            Object.Destroy(go.GetComponent<Collider>());
            var p = go.AddComponent<RealityPulse>();
            p.mat = new Material(Art.Glow("pulse_template", Color.white));
            go.GetComponent<Renderer>().sharedMaterial = p.mat;
            go.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return p;
        }

        void OnDestroy() { if (mat != null) Destroy(mat); pool = null; }

        void Update()
        {
            t += Time.deltaTime;
            Step();
            if (t >= Duration) pool?.Release(this);
        }

        void Step()
        {
            float k = Mathf.Clamp01(t / Duration);
            transform.localScale = Vector3.one * Mathf.Lerp(0.5f, radius * 2f, 1f - (1f - k) * (1f - k));
            var c = color; c.a = (1f - k) * 0.6f;
            Art.SetColor(mat, c * (1f - k));
        }
    }
}

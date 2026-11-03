using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// A rapidly pulsing energy barrier. Its "off" window is too short to cross at normal time flow, but
    /// Time Distortion stretches it. Touching it while active damages and repels the player.
    /// </summary>
    public sealed class PulseBarrier : MonoBehaviour, ITimeScalable
    {
        public Vector3 size = new Vector3(3f, 3f, 2f);
        public float onTime = 1.0f, offTime = 0.16f, damage = 8f;
        float t, hitCooldown;
        bool on = true;
        Material mat;
        Renderer[] renders;

        public Vector3 Position => transform.position;
        public float LocalTimeScale { get; set; } = 1f;

        public static PulseBarrier Create(Transform parent, Vector3 pos, Vector3 size)
        {
            var root = new GameObject("PulseBarrier");
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            var b = root.AddComponent<PulseBarrier>();
            b.size = size;
            b.mat = new Material(Art.Glow("barrier", new Color(1f, 0.85f, 0.3f, 0.5f)));
            for (int i = 0; i < 3; i++)
            {
                float z = Mathf.Lerp(-size.z * 0.5f, size.z * 0.5f, i / 2f);
                var plane = LevelKit.Box(root.transform, "Field", new Vector3(0f, size.y * 0.5f, z), new Vector3(size.x, size.y, 0.02f), b.mat, false, false);
                plane.GetComponent<Renderer>().sharedMaterial = b.mat;
            }
            LevelKit.PointLight(root.transform, new Vector3(0f, size.y * 0.8f, 0f), Art.Warning, 6f, 1.4f);
            b.renders = root.GetComponentsInChildren<Renderer>();
            return b;
        }

        void OnEnable() { Registry<ITimeScalable>.Add(this); }
        void OnDisable() { Registry<ITimeScalable>.Remove(this); }

        void Update()
        {
            var g = Game.I;
            if (g == null || !g.InGame) return;
            float dt = Time.deltaTime;
            if (dt <= 0f) return;
            t += dt * LocalTimeScale;
            float period = on ? onTime : offTime;
            if (t >= period) { t = 0f; on = !on; for (int i = 0; i < renders.Length; i++) renders[i].enabled = on; }
            Art.SetColor(mat, LocalTimeScale < 1f ? new Color(0.5f, 0.6f, 1f, 0.5f) : new Color(1f, 0.85f, 0.3f, 0.5f));

            if (hitCooldown > 0f) { hitCooldown -= dt; return; }
            if (!on || g.Player == null) return;
            Vector3 p = g.Player.transform.position + Vector3.up * 0.9f;
            var bounds = new Bounds(transform.position + Vector3.up * size.y * 0.5f, size + new Vector3(0f, 0f, 0.6f));
            if (!bounds.Contains(p)) return;
            hitCooldown = 0.6f;
            float side = Mathf.Sign(Vector3.Dot(p - transform.position, transform.forward));
            if (side == 0f) side = -1f;
            g.Player.Knockback(transform.forward * side * 9f + Vector3.up * 3f);
            AudioManager.I?.Play(Sfx.Damage);
            g.Vitals.Damage(damage, "pulse barrier");
            GameEvents.Notify("The barrier pulses too fast to cross. Can you make it slower?", NoticeType.Warning);
        }

        void OnDestroy() { if (mat != null) Destroy(mat); }
    }
}

// Riftborn — plays imported particle effects (see AssetLinks): scaled,
// optionally tinted towards an element's colour, and cleaned up when done.
// Returns null when there's no effect for that slot, so callers can fall
// back to the game's own glows.
using UnityEngine;

namespace Riftborn
{
    public static class Fx
    {
        public static GameObject Play(GameObject prefab, Vector3 pos, float scale = 1, Color? tint = null, Transform parent = null, float life = -1, int layer = -1)
        {
            if (prefab == null || !AssetLinks.Effects) return null;
            var go = Object.Instantiate(prefab, pos, Quaternion.identity, parent);
            go.transform.position = pos;
            go.transform.localScale = prefab.transform.localScale * scale;
            float longest = 0;
            foreach (var ps in go.GetComponentsInChildren<ParticleSystem>(true))
            {
                var main = ps.main;
                // Scale every part of the effect with the object.
                main.scalingMode = ParticleSystemScalingMode.Hierarchy;
                main.loop = main.loop && life > 0;
                if (tint.HasValue) main.startColor = Tint(main.startColor, tint.Value);
                longest = Mathf.Max(longest, main.duration + main.startLifetime.constantMax);
            }
            foreach (var a in go.GetComponentsInChildren<AudioSource>(true)) a.mute = GameState.save != null && !GameState.save.settings.sound;
            if (layer >= 0) foreach (var t in go.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = layer;
            Object.Destroy(go, life > 0 ? life : Mathf.Clamp(longest + 0.5f, 1, 8));
            return go;
        }

        // Pull an effect's colours halfway towards an element colour, keeping
        // its brightness and transparency.
        static ParticleSystem.MinMaxGradient Tint(ParticleSystem.MinMaxGradient g, Color c)
        {
            Color T(Color o)
            {
                float k = Mathf.Max(o.maxColorComponent, 0.05f) / Mathf.Max(c.maxColorComponent, 0.05f);
                var target = new Color(c.r * k, c.g * k, c.b * k, o.a);
                var m = Color.Lerp(o, target, 0.55f);
                m.a = o.a;
                return m;
            }
            switch (g.mode)
            {
                case ParticleSystemGradientMode.Color: return new ParticleSystem.MinMaxGradient(T(g.color));
                case ParticleSystemGradientMode.TwoColors: return new ParticleSystem.MinMaxGradient(T(g.colorMin), T(g.colorMax));
                default: return g;
            }
        }

        static AssetLinks L => AssetLinks.I;

        // The element's own blast effect if there is one.
        public static GameObject ElementHit(El el) { var e = L?.elements.Find((x) => x.element == el); return e?.hit != null ? e.hit : L?.blastHit; }
        public static GameObject ElementProjectile(El el) { var e = L?.elements.Find((x) => x.element == el); return e?.projectile != null ? e.projectile : L?.projectile; }
        public static bool HasOwnColour(El el) => L?.elements.Find((x) => x.element == el)?.hit != null;
    }
}

using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>
    /// Full-screen visual treatments rendered as a UI layer below the HUD: vision mode tints and scanlines,
    /// damage and reality flashes, interference glitches and a hazard/low-energy vignette.
    /// Much cheaper than a post-processing stack and identical on every Android GPU.
    /// </summary>
    public sealed class ScreenFX : MonoBehaviour
    {
        Image tint, flash, vignette;
        RawImage scan;
        Color tintColor, flashColor;
        float flashTime, flashDuration = 0.3f, glitchTime, scanSpeed;
        VisionModeId mode;

        public void Build(RectTransform root)
        {
            tint = UIFactory.Image(root, "VisionTint", new Color(0, 0, 0, 0));
            UIFactory.Stretch(tint.rectTransform);
            scan = UIFactory.Rect("Scanlines", root).gameObject.AddComponent<RawImage>();
            scan.texture = Art.NoiseTexture;
            scan.raycastTarget = false;
            UIFactory.Stretch(scan.rectTransform);
            scan.color = new Color(1, 1, 1, 0);
            vignette = UIFactory.Image(root, "Vignette", new Color(1, 0, 0, 0));
            vignette.sprite = MakeVignette();
            UIFactory.Stretch(vignette.rectTransform);
            flash = UIFactory.Image(root, "Flash", new Color(0, 0, 0, 0));
            UIFactory.Stretch(flash.rectTransform);
        }

        static Sprite MakeVignette()
        {
            const int n = 128;
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float dx = (x + 0.5f) / n * 2f - 1f, dy = (y + 0.5f) / n * 2f - 1f;
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    float a = Mathf.Clamp01((d - 0.65f) / 0.75f);
                    px[y * n + x] = new Color32(255, 255, 255, (byte)(a * a * 255));
                }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f));
        }

        public void SetVision(VisionModeId m)
        {
            mode = m;
            var info = VisionSystem.Info(m);
            tintColor = info.tint;
            tint.color = tintColor;
            switch (m)
            {
                case VisionModeId.Night: scan.color = new Color(0.6f, 1f, 0.6f, 0.22f); scanSpeed = 0.6f; break;
                case VisionModeId.Scanner: scan.color = new Color(0.4f, 0.9f, 1f, 0.12f); scanSpeed = 0.25f; break;
                case VisionModeId.Thermal: scan.color = new Color(1f, 0.6f, 0.3f, 0.08f); scanSpeed = 0.1f; break;
                case VisionModeId.Dimensional: scan.color = new Color(0.8f, 0.5f, 1f, 0.22f); scanSpeed = -0.4f; break;
                default: scan.color = new Color(1, 1, 1, 0); scanSpeed = 0f; break;
            }
            scan.enabled = m != VisionModeId.Normal;
            tint.enabled = m != VisionModeId.Normal;
        }

        public void DamageFlash() { Flash(new Color(1f, 0.1f, 0.15f), 0.35f); Glitch(); }
        public void RealityFlash(Color c) { Flash(c, 0.6f); }

        public void Flash(Color c, float duration)
        {
            flashColor = c;
            flashDuration = duration;
            flashTime = duration;
        }

        public void Glitch() { glitchTime = 0.25f; }

        void OnEnable() { GameEvents.VisionChanged += OnVision; }
        void OnDisable() { GameEvents.VisionChanged -= OnVision; }
        void OnVision() { if (Game.I != null && Game.I.Vision != null) SetVision(Game.I.Vision.Current); }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            if (scan.enabled)
            {
                var r = scan.uvRect;
                r.y += scanSpeed * dt;
                if (r.y > 10f || r.y < -10f) r.y = 0f;
                float aspect = Screen.height > 0 ? (float)Screen.width / Screen.height : 1.7f;
                r.width = 4f * aspect; r.height = 4f;
                if (glitchTime > 0f) r.x = Random.value;
                scan.uvRect = r;
            }

            if (flashTime > 0f)
            {
                flashTime -= dt;
                var c = flashColor; c.a = Mathf.Clamp01(flashTime / flashDuration) * 0.45f;
                flash.color = c;
            }
            else if (flash.color.a > 0f) flash.color = new Color(0, 0, 0, 0);

            if (glitchTime > 0f)
            {
                glitchTime -= dt;
                tint.color = Color.Lerp(tintColor, new Color(0.3f, 0.9f, 1f, 0.2f), Random.value);
                tint.enabled = true;
                if (glitchTime <= 0f) { tint.color = tintColor; tint.enabled = mode != VisionModeId.Normal; }
            }

            // Hazard / low-energy vignette.
            var g = Game.I;
            float target = 0f;
            Color vc = Theme.Danger;
            if (g != null && g.InGame && g.Vitals != null)
            {
                if (g.Environment.IsDamaging || g.Vitals.HealthFraction < 0.25f) { target = 0.55f + 0.25f * Mathf.Sin(Time.unscaledTime * 6f); vc = Theme.Danger; }
                else if (g.Environment.HasDeficit) { target = 0.35f + 0.15f * Mathf.Sin(Time.unscaledTime * 4f); vc = Theme.Warning; }
                else if (g.Vitals.IsLowEnergy) { target = 0.25f + 0.1f * Mathf.Sin(Time.unscaledTime * 3f); vc = Theme.Warning; }
                else if (g.Environment.Current.ColdSeverity > 0) { target = 0.3f; vc = new Color(0.6f, 0.85f, 1f); }
            }
            var v = vignette.color;
            float a = Mathf.MoveTowards(v.a, target, dt * 2f);
            vignette.color = new Color(vc.r, vc.g, vc.b, a);
            vignette.enabled = a > 0.01f;
        }
    }
}

using System.Collections.Generic;
using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Procedural art library: shared materials, generated textures and the UI font.
    /// Everything has a fallback so the game never depends on a missing asset.
    ///
    /// Template materials (created by BODY.OS > Setup Project in the editor) live in
    /// Resources/BodyOS/Materials so their shaders and keyword variants are guaranteed to be
    /// included in Android builds. If they are missing we fall back to Shader.Find.
    /// </summary>
    public static class Art
    {
        public static readonly Color Cyan = new Color(0.10f, 0.90f, 1.00f);
        public static readonly Color ElectricBlue = new Color(0.20f, 0.45f, 1.00f);
        public static readonly Color Hull = new Color(0.16f, 0.18f, 0.22f);
        public static readonly Color HullDark = new Color(0.09f, 0.10f, 0.13f);
        public static readonly Color HullLight = new Color(0.30f, 0.33f, 0.38f);
        public static readonly Color Warning = new Color(1.00f, 0.70f, 0.15f);
        public static readonly Color Danger = new Color(1.00f, 0.25f, 0.30f);
        public static readonly Color Violet = new Color(0.70f, 0.35f, 1.00f);
        public static readonly Color Success = new Color(0.30f, 1.00f, 0.60f);

        static readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        static Font font;
        static Texture2D panelTexture, gridTexture, noiseTexture, starTexture;

        static readonly int ColorId = Shader.PropertyToID("_Color");
        static readonly int TintColorId = Shader.PropertyToID("_TintColor");
        static readonly int EmissionId = Shader.PropertyToID("_EmissionColor");
        static readonly int GlossId = Shader.PropertyToID("_Glossiness");
        static readonly int MetallicId = Shader.PropertyToID("_Metallic");

        public static Shader FindShader(params string[] names)
        {
            for (int i = 0; i < names.Length; i++)
            {
                var s = Shader.Find(names[i]);
                if (s != null) return s;
            }
            return null;
        }

        static Material FromTemplate(string template, params string[] shaderFallbacks)
        {
            var t = Resources.Load<Material>("BodyOS/Materials/" + template);
            if (t != null) return new Material(t);
            var shader = FindShader(shaderFallbacks);
            if (shader == null) shader = FindShader("Sprites/Default", "UI/Default");
            return new Material(shader);
        }

        /// <summary>Lit, optionally emissive surface material (Standard shader).</summary>
        public static Material Lit(string key, Color color, float smoothness = 0.35f, float metallic = 0.3f, Color? emission = null, Texture tex = null)
        {
            if (materials.TryGetValue(key, out var m) && m != null) return m;
            m = emission.HasValue ? FromTemplate("LitEmissive", "Standard", "Mobile/Diffuse", "Legacy Shaders/Diffuse")
                                  : FromTemplate("Lit", "Standard", "Mobile/Diffuse", "Legacy Shaders/Diffuse");
            m.name = key;
            if (m.HasProperty(ColorId)) m.SetColor(ColorId, color);
            if (m.HasProperty(GlossId)) m.SetFloat(GlossId, smoothness);
            if (m.HasProperty(MetallicId)) m.SetFloat(MetallicId, metallic);
            if (tex != null) m.mainTexture = tex;
            if (emission.HasValue && m.HasProperty(EmissionId))
            {
                m.EnableKeyword("_EMISSION");
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
                m.SetColor(EmissionId, emission.Value);
            }
            materials[key] = m;
            return m;
        }

        /// <summary>Flat unlit colour. Cheap, used for holograms, thermal and screens.</summary>
        public static Material Unlit(string key, Color color)
        {
            if (materials.TryGetValue(key, out var m) && m != null) return m;
            m = FromTemplate("Unlit", "Unlit/Color", "Sprites/Default");
            m.name = key;
            SetColor(m, color);
            materials[key] = m;
            return m;
        }

        /// <summary>Unlit textured surface (screens, star fields).</summary>
        public static Material UnlitTextured(string key, Texture tex)
        {
            if (materials.TryGetValue(key, out var m) && m != null) return m;
            m = FromTemplate("UnlitTexture", "Unlit/Texture", "Sprites/Default");
            m.name = key;
            m.mainTexture = tex;
            materials[key] = m;
            return m;
        }

        /// <summary>Additive/transparent glow used for force fields, portals and effect spheres.</summary>
        public static Material Glow(string key, Color color)
        {
            if (materials.TryGetValue(key, out var m) && m != null) return m;
            m = FromTemplate("Glow", "Legacy Shaders/Particles/Additive", "Particles/Standard Unlit", "Sprites/Default");
            m.name = key;
            SetColor(m, color);
            materials[key] = m;
            return m;
        }

        public static void SetColor(Material m, Color c)
        {
            if (m == null) return;
            if (m.HasProperty(ColorId)) m.SetColor(ColorId, c);
            if (m.HasProperty(TintColorId)) m.SetColor(TintColorId, c);
        }

        public static void SetEmission(Material m, Color c)
        {
            if (m != null && m.HasProperty(EmissionId)) m.SetColor(EmissionId, c);
        }

        public static Font UIFont
        {
            get
            {
                if (font != null) return font;
                // Unity 2022.2+ ships LegacyRuntime.ttf; older versions ship Arial.ttf.
                try { font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); } catch { font = null; }
                if (font == null) { try { font = Resources.GetBuiltinResource<Font>("Arial.ttf"); } catch { font = null; } }
                if (font == null) font = Font.CreateDynamicFontFromOSFont(new[] { "Roboto", "Arial", "Noto Sans", "DejaVu Sans" }, 32);
                return font;
            }
        }

        /// <summary>Subtle panel texture for hull surfaces (seams and rivets).</summary>
        public static Texture2D PanelTexture
        {
            get
            {
                if (panelTexture != null) return panelTexture;
                const int n = 64;
                panelTexture = new Texture2D(n, n, TextureFormat.RGB24, true) { name = "HullPanel", wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Bilinear };
                var px = new Color[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float v = 0.82f + Hash(x, y) * 0.06f;
                        if (x < 2 || y < 2) v = 0.45f;                       // panel seams
                        else if (x < 4 || y < 4) v = 0.95f;                  // seam highlight
                        if ((x == 8 || x == n - 8) && (y == 8 || y == n - 8)) v = 0.55f; // rivets
                        px[y * n + x] = new Color(v, v, v);
                    }
                panelTexture.SetPixels(px);
                panelTexture.Apply(true, true);
                return panelTexture;
            }
        }

        /// <summary>Glowing grid used on floors and holographic surfaces.</summary>
        public static Texture2D GridTexture
        {
            get
            {
                if (gridTexture != null) return gridTexture;
                const int n = 64;
                gridTexture = new Texture2D(n, n, TextureFormat.RGB24, true) { name = "Grid", wrapMode = TextureWrapMode.Repeat };
                var px = new Color[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float v = 0.55f + Hash(x, y) * 0.05f;
                        if (x == 0 || y == 0) v = 1.0f;
                        else if (x == 32 || y == 32) v = 0.8f;
                        px[y * n + x] = new Color(v, v, v);
                    }
                gridTexture.SetPixels(px);
                gridTexture.Apply(true, true);
                return gridTexture;
            }
        }

        /// <summary>Scanline/noise overlay used by the night-vision and dimensional screen effects.</summary>
        public static Texture2D NoiseTexture
        {
            get
            {
                if (noiseTexture != null) return noiseTexture;
                const int n = 128;
                noiseTexture = new Texture2D(n, n, TextureFormat.RGBA32, false) { name = "Noise", wrapMode = TextureWrapMode.Repeat };
                var px = new Color[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float a = Hash(x * 3, y * 7) * 0.35f + ((y % 4) < 2 ? 0.25f : 0f);
                        px[y * n + x] = new Color(1, 1, 1, a);
                    }
                noiseTexture.SetPixels(px);
                noiseTexture.Apply(false, true);
                return noiseTexture;
            }
        }

        /// <summary>Star field for windows looking out into space.</summary>
        public static Texture2D StarTexture
        {
            get
            {
                if (starTexture != null) return starTexture;
                const int n = 256;
                starTexture = new Texture2D(n, n, TextureFormat.RGB24, true) { name = "Stars", wrapMode = TextureWrapMode.Repeat };
                var px = new Color[n * n];
                for (int y = 0; y < n; y++)
                    for (int x = 0; x < n; x++)
                    {
                        float h = Hash(x, y);
                        float neb = 0.04f + 0.05f * Mathf.PerlinNoise(x * 0.02f, y * 0.02f);
                        Color c = new Color(neb * 0.4f, neb * 0.5f, neb * 1.2f);
                        if (h > 0.994f) c = Color.white * (0.6f + (h - 0.994f) * 60f);
                        px[y * n + x] = c;
                    }
                starTexture.SetPixels(px);
                starTexture.Apply(true, true);
                return starTexture;
            }
        }

        static float Hash(int x, int y)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263);
                h = (h ^ (h >> 13)) * 1274126177u;
                return ((h ^ (h >> 16)) & 0xFFFF) / 65535f;
            }
        }
    }
}

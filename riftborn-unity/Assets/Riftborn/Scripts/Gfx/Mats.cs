// Riftborn — materials. They're copied from template materials in
// Resources/Materials (so the shader variants they need are included in
// builds) and then given their colours and generated textures.
using System.Collections.Generic;
using UnityEngine;

namespace Riftborn
{
    public static class Mats
    {
        static readonly Dictionary<string, Material> templates = new Dictionary<string, Material>();

        static Material Template(string name, string fallbackShader)
        {
            if (templates.TryGetValue(name, out var m)) return m;
            m = Resources.Load<Material>("Materials/" + name);
            if (m == null) m = new Material(Shader.Find(fallbackShader));
            templates[name] = m;
            return m;
        }

        // Standard lit surface.
        public static Material Solid(Color color, float smooth = 0.3f, float metal = 0f)
        {
            var m = new Material(Template("RB_Solid", "Standard"));
            m.color = color;
            m.SetFloat("_Glossiness", smooth);
            m.SetFloat("_Metallic", metal);
            return m;
        }

        // The Standard shader with normal, detail and emission maps switched on.
        static Material SkinBase()
        {
            var m = new Material(Template("RB_Skin", "Standard"));
            m.EnableKeyword("_NORMALMAP");
            m.EnableKeyword("_DETAIL_MULX2");
            m.EnableKeyword("_EMISSION");
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            return m;
        }

        // Lit with emission (glowing crystals, eyes, markings).
        public static Material Emissive(Color color, Color glow, float smooth = 0.5f)
        {
            var m = SkinBase();
            m.color = color;
            m.SetFloat("_Glossiness", smooth);
            m.SetTexture("_DetailAlbedoMap", Tex.Grey);
            m.SetTexture("_DetailNormalMap", Tex.FlatNormal);
            m.SetTexture("_BumpMap", Tex.FlatNormal);
            m.SetColor("_EmissionColor", glow);
            return m;
        }

        // Scaly creature skin: a colour map, raised scales from the shared
        // detail normal map, and darker grooves from the detail albedo.
        public static Material Skin(Texture2D map, Vector2 scaleTiling, Texture2D glowMap = null, float smooth = 0.32f)
        {
            var m = SkinBase();
            m.mainTexture = map;
            m.color = Color.white;
            m.SetFloat("_Glossiness", smooth);
            m.SetTexture("_BumpMap", Tex.FlatNormal);
            m.SetTexture("_DetailNormalMap", Tex.ScaleNormal);
            m.SetFloat("_DetailNormalMapScale", 0.8f);
            m.SetTexture("_DetailAlbedoMap", Tex.ScaleGrooves);
            m.SetTextureScale("_DetailAlbedoMap", scaleTiling);
            m.SetTexture("_EmissionMap", glowMap);
            m.SetColor("_EmissionColor", glowMap != null ? Color.white : Color.black);
            return m;
        }

        // Unlit texture (map tiles).
        public static Material Unlit(Texture tex, Color tint)
        {
            var m = new Material(Template("RB_Unlit", "Riftborn/Unlit"));
            m.mainTexture = tex;
            m.color = tint;
            return m;
        }

        // Additive glow (beams, rings, sparks, auras).
        public static Material Glow(Color color, Texture tex = null)
        {
            var m = new Material(Template("RB_Glow", "Riftborn/Additive"));
            m.mainTexture = tex != null ? tex : Tex.Glow;
            m.color = color;
            return m;
        }

        // Invisible, but shows shadows (the AR floor).
        public static Material ShadowCatcher(float strength = 0.45f)
        {
            var m = new Material(Template("RB_Shadow", "Riftborn/ShadowCatcher"));
            m.SetFloat("_Strength", strength);
            return m;
        }
    }
}

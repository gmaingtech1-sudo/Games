using UnityEngine;

namespace Wayfarer
{
    /// <summary>HDR post-processing for the main camera: bloom, eye adaptation,
    /// ACES tone mapping, grading, vignette, grain and screen effects
    /// (hyperspace, damage, fades).</summary>
    [RequireComponent(typeof(Camera))]
    public sealed class PostFX : MonoBehaviour
    {
        public float BloomIntensity = 0.07f;
        public float Threshold = 1.1f;
        public float Knee = 0.6f;
        public float Exposure = 1f;
        public bool AutoExposure = true;
        public float Key = 0.2f;
        public float MinExposure = 0.3f;
        public float MaxExposure = 3.5f;
        public float AdaptSpeed = 1.6f;
        public float Vignette = 0.45f;
        public float Grain = 0.018f;
        public float Saturation = 1.08f;
        public float Contrast = 1.04f;
        public Color Lift = new Color(0f, 0f, 0f, 0f);

        [HideInInspector] public float Warp;
        [HideInInspector] public float WarpTime;
        [HideInInspector] public Color WarpColor = new Color(0.55f, 0.75f, 1f);
        [HideInInspector] public float Fade;
        [HideInInspector] public float Flash;
        [HideInInspector] public float Damage;

        Material mat;
        RenderTexture lum, expA, expB;
        bool flip;
        const int Levels = 6;
        readonly RenderTexture[] down = new RenderTexture[Levels];

        static readonly int IdBloom = Shader.PropertyToID("_BloomTex");
        static readonly int IdExposureTex = Shader.PropertyToID("_ExposureTex");
        static readonly int IdPrev = Shader.PropertyToID("_PrevTex");

        void OnDestroy()
        {
            if (mat != null) Destroy(mat);
            if (lum != null) lum.Release();
            if (expA != null) expA.Release();
            if (expB != null) expB.Release();
        }

        RenderTexture Tiny()
        {
            var fmt = SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.RFloat) ? RenderTextureFormat.RFloat : RenderTextureFormat.ARGBHalf;
            var rt = new RenderTexture(1, 1, 0, fmt) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp };
            rt.Create();
            return rt;
        }

        void OnRenderImage(RenderTexture src, RenderTexture dst)
        {
            if (mat == null)
            {
                var shader = Shader.Find("Hidden/Wayfarer/PostFX");
                if (shader == null) { Graphics.Blit(src, dst); return; }
                mat = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
                lum = Tiny(); expA = Tiny(); expB = Tiny();
            }

            mat.SetFloat("_Threshold", Threshold);
            mat.SetFloat("_Knee", Knee);
            mat.SetFloat("_BloomIntensity", BloomIntensity);
            mat.SetFloat("_Exposure", Exposure);
            mat.SetFloat("_AutoExposure", AutoExposure ? 1f : 0f);
            mat.SetFloat("_Key", Key);
            mat.SetFloat("_MinExposure", MinExposure);
            mat.SetFloat("_MaxExposure", MaxExposure);
            mat.SetFloat("_AdaptSpeed", AdaptSpeed);
            mat.SetFloat("_DeltaTime", Mathf.Min(Time.unscaledDeltaTime, 0.1f));
            mat.SetFloat("_Vignette", Vignette);
            mat.SetFloat("_Grain", Grain);
            mat.SetFloat("_Saturation", Saturation);
            mat.SetFloat("_Contrast", Contrast);
            mat.SetVector("_Lift", (Vector4)Lift);
            mat.SetFloat("_Warp", Warp);
            mat.SetFloat("_WarpTime", WarpTime);
            mat.SetVector("_WarpColor", (Vector4)WarpColor.linear);
            mat.SetFloat("_Fade", Fade);
            mat.SetFloat("_Flash", Flash);
            mat.SetFloat("_Damage", Damage);

            var fmt = src.format == RenderTextureFormat.ARGBHalf || src.format == RenderTextureFormat.DefaultHDR
                ? src.format : RenderTextureFormat.DefaultHDR;
            int w = Mathf.Max(2, src.width / 2), h = Mathf.Max(2, src.height / 2);
            down[0] = RenderTexture.GetTemporary(w, h, 0, fmt);
            down[0].filterMode = FilterMode.Bilinear;
            Graphics.Blit(src, down[0], mat, 0);
            for (int i = 1; i < Levels; i++)
            {
                w = Mathf.Max(2, w / 2); h = Mathf.Max(2, h / 2);
                down[i] = RenderTexture.GetTemporary(w, h, 0, fmt);
                down[i].filterMode = FilterMode.Bilinear;
                Graphics.Blit(down[i - 1], down[i], mat, 1);
            }

            if (AutoExposure)
            {
                Graphics.Blit(down[Levels - 1], lum, mat, 4);
                var prev = flip ? expA : expB;
                var next = flip ? expB : expA;
                mat.SetTexture(IdPrev, prev);
                Graphics.Blit(lum, next, mat, 5);
                mat.SetTexture(IdExposureTex, next);
                flip = !flip;
            }

            RenderTexture up = down[Levels - 1];
            for (int i = Levels - 2; i >= 0; i--)
            {
                var t = RenderTexture.GetTemporary(down[i].width, down[i].height, 0, fmt);
                t.filterMode = FilterMode.Bilinear;
                mat.SetTexture(IdBloom, down[i]);
                Graphics.Blit(up, t, mat, 2);
                if (up != down[Levels - 1]) RenderTexture.ReleaseTemporary(up);
                up = t;
            }

            mat.SetTexture(IdBloom, up);
            Graphics.Blit(src, dst, mat, 3);

            RenderTexture.ReleaseTemporary(up);
            for (int i = 0; i < Levels; i++) RenderTexture.ReleaseTemporary(down[i]);
        }
    }
}

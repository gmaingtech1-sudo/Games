using UnityEngine;

namespace Wayfarer
{
    /// <summary>Everything the graphics quality preset controls.</summary>
    public sealed class GraphicsQuality
    {
        public string Name;
        public double TerrainSpacing;   // metres between terrain vertices up close
        public double TerrainSplit;     // how eagerly terrain chunks split
        public int Shadows;             // 0 off, 1..3
        public float ShadowDistance;
        public int AtmosphereSteps;
        public float DetailDistance;    // terrain micro-detail fade distance
        public float FloraDistance;     // trees drawn out to here
        public float SmallFloraDistance;
        public float GrassDistance;
        public float FloraDensity;
        public int Msaa;
        public int SkyResolution;
        public float RenderScale;

        public static readonly GraphicsQuality[] Presets =
        {
            new GraphicsQuality { Name = "Low", TerrainSpacing = 1.6, TerrainSplit = 1.6, Shadows = 0, ShadowDistance = 0, AtmosphereSteps = 8,
                DetailDistance = 150, FloraDistance = 700, SmallFloraDistance = 120, GrassDistance = 0, FloraDensity = 0.5f, Msaa = 0, SkyResolution = 512, RenderScale = 0.85f },
            new GraphicsQuality { Name = "Medium", TerrainSpacing = 1.1, TerrainSplit = 2.1, Shadows = 1, ShadowDistance = 160, AtmosphereSteps = 10,
                DetailDistance = 300, FloraDistance = 1100, SmallFloraDistance = 180, GrassDistance = 45, FloraDensity = 0.75f, Msaa = 2, SkyResolution = 1024, RenderScale = 1f },
            new GraphicsQuality { Name = "High", TerrainSpacing = 0.85, TerrainSplit = 2.6, Shadows = 2, ShadowDistance = 260, AtmosphereSteps = 14,
                DetailDistance = 450, FloraDistance = 1600, SmallFloraDistance = 260, GrassDistance = 70, FloraDensity = 1f, Msaa = 4, SkyResolution = 1024, RenderScale = 1f },
            new GraphicsQuality { Name = "Ultra", TerrainSpacing = 0.65, TerrainSplit = 3.2, Shadows = 3, ShadowDistance = 400, AtmosphereSteps = 18,
                DetailDistance = 650, FloraDistance = 2400, SmallFloraDistance = 360, GrassDistance = 100, FloraDensity = 1.3f, Msaa = 8, SkyResolution = 2048, RenderScale = 1f },
        };
    }

    /// <summary>Player preferences, stored with PlayerPrefs.</summary>
    public static class Settings
    {
        public static int Quality = 2;
        public static float MouseSensitivity = 1f;
        public static bool InvertY;
        public static float Fov = 75f;
        public static float MasterVolume = 0.8f;
        public static float MusicVolume = 0.6f;
        public static float EffectsVolume = 0.9f;
        public static bool ShowFps;
        public static bool Vsync = true;
        public static bool HeadBob = true;
        public static int ResolutionIndex = -1;
        public static bool Fullscreen = true;

        public static GraphicsQuality Graphics => GraphicsQuality.Presets[Mathf.Clamp(Quality, 0, GraphicsQuality.Presets.Length - 1)];

        public static void Load()
        {
            Quality = PlayerPrefs.GetInt("wf.quality", DefaultQuality());
            MouseSensitivity = PlayerPrefs.GetFloat("wf.mouse", 1f);
            InvertY = PlayerPrefs.GetInt("wf.invert", 0) == 1;
            Fov = PlayerPrefs.GetFloat("wf.fov", 75f);
            MasterVolume = PlayerPrefs.GetFloat("wf.vol", 0.8f);
            MusicVolume = PlayerPrefs.GetFloat("wf.music", 0.6f);
            EffectsVolume = PlayerPrefs.GetFloat("wf.sfx", 0.9f);
            ShowFps = PlayerPrefs.GetInt("wf.fps", 0) == 1;
            Vsync = PlayerPrefs.GetInt("wf.vsync", 1) == 1;
            HeadBob = PlayerPrefs.GetInt("wf.bob", 1) == 1;
            Fullscreen = PlayerPrefs.GetInt("wf.full", 1) == 1;
        }

        public static void Save()
        {
            PlayerPrefs.SetInt("wf.quality", Quality);
            PlayerPrefs.SetFloat("wf.mouse", MouseSensitivity);
            PlayerPrefs.SetInt("wf.invert", InvertY ? 1 : 0);
            PlayerPrefs.SetFloat("wf.fov", Fov);
            PlayerPrefs.SetFloat("wf.vol", MasterVolume);
            PlayerPrefs.SetFloat("wf.music", MusicVolume);
            PlayerPrefs.SetFloat("wf.sfx", EffectsVolume);
            PlayerPrefs.SetInt("wf.fps", ShowFps ? 1 : 0);
            PlayerPrefs.SetInt("wf.vsync", Vsync ? 1 : 0);
            PlayerPrefs.SetInt("wf.bob", HeadBob ? 1 : 0);
            PlayerPrefs.SetInt("wf.full", Fullscreen ? 1 : 0);
            PlayerPrefs.Save();
        }

        static int DefaultQuality()
        {
            int vram = SystemInfo.graphicsMemorySize;
            if (vram >= 7000) return 3;
            if (vram >= 3500) return 2;
            if (vram >= 1800) return 1;
            return 0;
        }

        /// <summary>Pushes the preset into Unity's quality settings.</summary>
        public static void ApplyEngine()
        {
            var q = Graphics;
            QualitySettings.vSyncCount = Vsync ? 1 : 0;
            Application.targetFrameRate = Vsync ? -1 : 240;
            QualitySettings.antiAliasing = q.Msaa;
            QualitySettings.shadows = q.Shadows > 0 ? ShadowQuality.All : ShadowQuality.Disable;
            QualitySettings.shadowDistance = q.ShadowDistance;
            QualitySettings.shadowCascades = q.Shadows >= 2 ? 4 : 2;
            QualitySettings.shadowResolution = q.Shadows >= 3 ? ShadowResolution.VeryHigh : q.Shadows == 2 ? ShadowResolution.High : ShadowResolution.Medium;
            QualitySettings.shadowProjection = ShadowProjection.StableFit;
            QualitySettings.shadowCascade4Split = new Vector3(0.06f, 0.18f, 0.45f);
            QualitySettings.shadowCascade2Split = 0.25f;
            QualitySettings.pixelLightCount = 4;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.Enable;
            QualitySettings.lodBias = 1.5f;
        }
    }
}

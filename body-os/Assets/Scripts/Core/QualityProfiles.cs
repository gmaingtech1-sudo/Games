using UnityEngine;

namespace BodyOS
{
    /// <summary>Graphics quality presets applied directly to QualitySettings (independent of the project's quality levels).</summary>
    public static class QualityProfiles
    {
        public static readonly string[] Names = { "LOW", "MEDIUM", "HIGH" };

        public static void Apply(int level)
        {
            level = Mathf.Clamp(level, 0, 2);
            switch (level)
            {
                case 0:
                    QualitySettings.pixelLightCount = 1;
                    QualitySettings.shadows = ShadowQuality.Disable;
                    QualitySettings.antiAliasing = 0;
                    QualitySettings.lodBias = 0.6f;
                    break;
                case 1:
                    QualitySettings.pixelLightCount = 2;
                    QualitySettings.shadows = ShadowQuality.Disable;
                    QualitySettings.antiAliasing = 2;
                    QualitySettings.lodBias = 1f;
                    break;
                default:
                    QualitySettings.pixelLightCount = 4;
                    QualitySettings.shadows = ShadowQuality.HardOnly;
                    QualitySettings.shadowDistance = 25f;
                    QualitySettings.antiAliasing = 4;
                    QualitySettings.lodBias = 1.5f;
                    break;
            }
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = level == 0 ? 30 : 60;
        }
    }
}

using UnityEngine;

namespace BodyOS
{
    /// <summary>Wall-mounted survey device that reports a hazard zone's conditions against your protection.</summary>
    public sealed class EnvironmentalScanner : Interactable
    {
        public HazardZone zone;
        public override string Prompt => "SURVEY";

        public static EnvironmentalScanner Create(Transform parent, string id, Vector3 pos, float yaw, HazardZone zone)
        {
            var root = new GameObject("EnvScanner_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            LevelKit.Box(root.transform, "Body", new Vector3(0f, 1.4f, 0f), new Vector3(0.6f, 0.8f, 0.2f), LevelKit.HullLight, true, false);
            LevelKit.Box(root.transform, "Display", new Vector3(0f, 1.45f, 0.11f), new Vector3(0.45f, 0.4f, 0.02f), LevelKit.GlowAmber, false, false);
            var s = root.AddComponent<EnvironmentalScanner>();
            s.id = "survey_" + id; s.displayName = "Environmental Scanner"; s.zone = zone;
            s.focusOffset = new Vector3(0f, 1.4f, 0.1f);
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false; vt.heat = 0.3f; vt.scan = ScanCategory.Interactable;
            return s;
        }

        protected override void OnInteract()
        {
            var g = Game.I;
            var env = g.Environment;
            var c = zone != null ? zone.conditions : ZoneConditions.ShipStandard;
            var sb = new System.Text.StringBuilder();
            sb.Append("AREA: ").Append(c.name).Append('\n');
            sb.Append("Temperature: ").Append(c.temperature.ToString("0")).Append("°C  (cold severity ").Append(c.ColdSeverity).Append(", your protection ").Append(env.ProtectionCold).Append(")\n");
            sb.Append("Atmosphere: ").Append(EnvironmentSystem.AtmosphereName(c.atmosphere)).Append("  (severity ").Append(c.ToxicSeverity).Append(", your protection ").Append(env.ProtectionToxic).Append(")\n");
            sb.Append("Radiation: ").Append(c.radiation).Append("  (your protection ").Append(env.ProtectionRadiation).Append(")\n");
            sb.Append("Gravity: ").Append(c.gravity.ToString("0.00")).Append(" g\n\n");
            bool safe = c.ColdSeverity <= env.ProtectionCold && c.ToxicSeverity <= env.ProtectionToxic && c.radiation <= env.ProtectionRadiation;
            sb.Append(safe ? "ASSESSMENT: Your protection is sufficient." :
                "ASSESSMENT: Protection insufficient. Your suit reserve will drain, then you will take damage. Environmental Weave upgrades raise protection.");
            string flag = "surveyed." + id;
            if (!g.HasFlag(flag)) { g.SetFlag(flag); g.Progression.AddXp(20, "survey"); }
            UIRoot.I.ShowDialog("ENVIRONMENTAL SURVEY", sb.ToString(), "CLOSE", null);
        }
    }
}

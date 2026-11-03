using UnityEngine;

namespace BodyOS
{
    /// <summary>Vision modes, scanner and threat detection.</summary>
    public sealed class SensesPanel : OSPanel
    {
        public override string Title => "SENSES";
        public override string Subtitle => "Select a vision mode. Modes cost energy per second (reduced by Endurance). Expensive modes shut off below 20% energy.";

        protected override void BuildContent(RectTransform c)
        {
            var g = G;
            foreach (var m in VisionSystem.Modes)
            {
                bool unlocked = g.Vision.IsUnlocked(m.id);
                bool active = g.Vision.Current == m.id;
                var card = Card(c, active ? new Color(0.05f, 0.16f, 0.24f, 0.96f) : (Color?)null);
                var head = Row(card, 44);
                var name = UIFactory.Text(head, m.name, Theme.Body, unlocked ? Theme.Text : Theme.TextMuted, TextAnchor.MiddleLeft, FontStyle.Bold);
                UIFactory.Layout(name, 44, -1, 1);
                Chip(head, active ? "ACTIVE" : unlocked ? "AVAILABLE" : "LOCKED", active ? Theme.Success : unlocked ? Theme.Accent : Theme.TextMuted);
                Para(card, m.description);
                float drain = m.drainPerSecond * (1f - Mathf.Clamp(g.Upgrades.Total(UpgradeEffectType.VisionDrainMultiplier), 0f, 0.6f));
                Para(card, "Energy: " + (drain <= 0f ? "none" : drain.ToString("0.0") + "/s base, " + (drain * g.Body.EnduranceMultiplier * g.Body.ConsumptionMultiplier).ToString("0.00") + "/s with your configuration") +
                           (!unlocked ? "\nRequires a technology upgrade (" + (m.id == VisionModeId.Thermal ? "Thermal Optics" : "Reality Kernel") + ")." : ""), Theme.TextMuted, Theme.Tiny + 1);
                if (unlocked && !active)
                {
                    var id = m.id;
                    var r = Row(card, 60);
                    SmallButton(r, "ACTIVATE", () => g.Vision.SetMode(id), ButtonStyle.Primary, 220);
                }
            }

            var sc = Card(c);
            Heading(sc, "SCANNER");
            KeyValue(sc, "Highlight range", g.Vision.ScannerRange.ToString("0") + " m");
            KeyValue(sc, "Analysis time / energy", "x" + g.Body.AnalysisTime.ToString("0.00") + "  (Analysis " + g.Body.Get(StatId.Analysis) + ")");
            KeyValue(sc, "Interference disruption", Mathf.RoundToInt(g.Body.InterferenceChance * 100) + "%  (Concentration " + g.Body.Get(StatId.Concentration) + ")");
            Para(sc, "In SCANNER vision the INTERACT button becomes SCAN on objects with data. Analysis costs a little energy and grants XP the first time.");

            var th = Card(c);
            Heading(th, "THREAT DETECTION");
            KeyValue(th, "Detection radius", g.Body.ThreatRadius.ToString("0") + " m");
            KeyValue(th, "Direction tracking", g.Body.ThreatDirection ? "ONLINE" : "OFFLINE (needs 7+)", g.Body.ThreatDirection ? Theme.Success : Theme.Warning);
            KeyValue(th, "Current contact", g.Threats.Detected ? g.Threats.Nearest.ThreatName + " (" + Mathf.RoundToInt(g.Threats.Distance) + " m)" : "None", g.Threats.Detected ? Theme.Danger : Theme.Text);
        }
    }
}

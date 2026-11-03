using UnityEngine;

namespace BodyOS
{
    /// <summary>Current environmental conditions versus your protection.</summary>
    public sealed class EnvironmentPanel : OSPanel
    {
        public override string Title => "ENVIRONMENT";
        public override string Subtitle => "Conditions where you stand, compared with your protection. Values and effects are fictional game mechanics.";

        protected override void BuildContent(RectTransform c)
        {
            var g = G;
            var env = g.Environment;
            var cond = env.Current;

            var area = Card(c);
            Heading(area, "AREA: " + (env.CurrentZone != null ? cond.name.ToUpperInvariant() : "SHIP STANDARD"));
            Severity(area, "Temperature", cond.temperature.ToString("0") + "°C", cond.ColdSeverity, env.ProtectionCold, "cold");
            Severity(area, "Atmosphere", EnvironmentSystem.AtmosphereName(cond.atmosphere), cond.ToxicSeverity, env.ProtectionToxic, "toxic");
            Severity(area, "Radiation", cond.radiation == 0 ? "None" : "Level " + cond.radiation, cond.radiation, env.ProtectionRadiation, "radiation");
            KeyValue(area, "Gravity", cond.gravity.ToString("0.00") + " g" + (Mathf.Abs(cond.gravity - 1f) > 0.05f ? "  (jumps reach " + (g.Body.BaseJumpHeight / Mathf.Max(0.05f, cond.gravity)).ToString("0.0") + " m)" : ""),
                Mathf.Abs(cond.gravity - 1f) > 0.05f ? Theme.Warning : Theme.Text);

            var suit = Card(c);
            Heading(suit, "SUIT RESERVE");
            KeyValue(suit, "Reserve", Mathf.RoundToInt(g.Vitals.Suit) + " / " + Mathf.RoundToInt(g.Vitals.MaxSuit), Theme.Suit);
            new UIBar(suit, Theme.Suit, 14).Set(g.Vitals.SuitFraction);
            string effects = "";
            if (env.ExtraEnergyDrain > 0f) effects += "Heating drain " + env.ExtraEnergyDrain.ToString("0.00") + " energy/s. ";
            if (env.SpeedMultiplier < 1f) effects += "Cold stiffens movement (-20% speed). ";
            if (env.HasDeficit) effects += "Protection shortfall: the suit reserve is draining" + (env.IsDamaging ? " and you are taking damage!" : ", then you will take damage.");
            if (effects.Length == 0) effects = "No environmental effects. The suit reserve recharges outside hazards.";
            Para(suit, effects, env.HasDeficit ? Theme.Warning : Theme.TextDim);

            var prot = Card(c);
            Heading(prot, "PROTECTION RATINGS");
            KeyValue(prot, "Cold", env.ProtectionCold.ToString());
            KeyValue(prot, "Toxic atmosphere", env.ProtectionToxic.ToString());
            KeyValue(prot, "Radiation", env.ProtectionRadiation.ToString());
            Para(prot, "A hazard is neutralised when your protection meets its severity. ENVIRONMENTAL WEAVE (Technology) adds +1 to every rating per tier. Environmental scanners on the walls survey nearby hazards.");
        }

        static void Severity(RectTransform parent, string key, string value, int severity, int protection, string kind)
        {
            Color col = severity == 0 ? Theme.Text : severity <= protection ? Theme.Success : Theme.Danger;
            string suffix = severity == 0 ? "" : "   severity " + severity + " / protection " + protection + (severity <= protection ? "  OK" : "  INSUFFICIENT");
            KeyValue(parent, key, value + suffix, col);
        }
    }
}

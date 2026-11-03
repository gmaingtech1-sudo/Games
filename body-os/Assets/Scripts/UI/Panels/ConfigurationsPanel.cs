using System.Text;
using UnityEngine;

namespace BodyOS
{
    /// <summary>Save, load, customise and reset body configuration presets.</summary>
    public sealed class ConfigurationsPanel : OSPanel
    {
        public override string Title => "CONFIGURATIONS";
        public override string Subtitle => "Presets store all eleven attributes plus a vision mode. Loading is validated against your current caps, budgets and unlocks.";

        static readonly string[] Abbrev = { "STR", "SPD", "JMP", "END", "REC", "THR", "REA", "CON", "MEM", "THT", "ANA" };

        protected override void BuildContent(RectTransform c)
        {
            var g = G;
            var current = Card(c);
            Heading(current, "ACTIVE CONFIGURATION");
            Para(current, Summary(g.Body.Snapshot()) + "\nVision: " + g.Vision.CurrentInfo.name, Theme.Text);

            foreach (var p in g.Presets.All)
            {
                var card = Card(c);
                var head = Row(card, 44);
                var name = UIFactory.Text(head, p.name, Theme.Body, Theme.Text, TextAnchor.MiddleLeft, FontStyle.Bold);
                UIFactory.Layout(name, 44, -1, 1);
                if (p.customised) Chip(head, "CUSTOMISED", Theme.Warning);
                Para(card, p.description);
                Para(card, Summary(p.stats) + "\nVision: " + p.vision, Theme.TextMuted, Theme.Tiny + 1);
                var row = Row(card, 60);
                string id = p.id;
                SmallButton(row, "LOAD", () => g.Presets.Load(id), ButtonStyle.Primary, 170);
                SmallButton(row, "SAVE CURRENT", () => UIRoot.I.ShowConfirm("OVERWRITE PRESET", "Store your current configuration in " + p.name + "?", "SAVE", () => g.Presets.SaveCurrent(id)), ButtonStyle.Secondary, 240);
                if (p.customised) SmallButton(row, "RESET", () => g.Presets.ResetPreset(id), ButtonStyle.Ghost, 150);
            }
        }

        static string Summary(int[] v)
        {
            var sb = new StringBuilder();
            for (int i = 0; i < StatRules.Count && i < v.Length; i++)
            {
                sb.Append(Abbrev[i]).Append(' ').Append(v[i]);
                if (i == 5) sb.Append("\n"); else if (i < StatRules.Count - 1) sb.Append("   ");
            }
            return sb.ToString();
        }
    }
}

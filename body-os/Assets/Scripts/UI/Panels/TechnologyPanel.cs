using UnityEngine;

namespace BodyOS
{
    /// <summary>Data-driven technology upgrade list grouped by category.</summary>
    public sealed class TechnologyPanel : OSPanel
    {
        public override string Title => "TECHNOLOGY";
        public override string Subtitle => "Install upgrades with upgrade points (from levels and missions) and nanite shards. Some need schematics from upgrade terminals.";

        protected override void BuildContent(RectTransform c)
        {
            var g = G;
            var head = Card(c);
            KeyValue(head, "Upgrade points", g.Progression.Points.ToString(), Theme.Accent);
            KeyValue(head, "Nanite shards", g.Inventory.Count("nanites").ToString(), Theme.Accent);
            var r0 = Row(head, 60);
            SmallButton(r0, "SYSTEM RESTORE", () => UIRoot.I.ShowConfirm("SYSTEM RESTORE",
                "Uninstall all upgrades and refund every point and nanite? Use this to try a different build.", "RESTORE", () => g.Upgrades.RefundAll(), true), ButtonStyle.Ghost, 300);

            foreach (UpgradeCategory cat in System.Enum.GetValues(typeof(UpgradeCategory)))
            {
                bool any = false;
                foreach (var def in g.Content.Upgrades) if (def.category == cat) { any = true; break; }
                if (!any) continue;
                UIFactory.Text(c, cat.ToString().ToUpperInvariant() + " SYSTEMS", Theme.Small, Theme.TextMuted, TextAnchor.MiddleLeft, FontStyle.Bold);
                foreach (var def in g.Content.Upgrades)
                {
                    if (def.category != cat) continue;
                    var state = g.Upgrades.Evaluate(def, out string reason);
                    int tier = g.Upgrades.Tier(def.id);
                    var card = Card(c, state == UpgradeSystem.State.Installed ? new Color(0.04f, 0.14f, 0.12f, 0.95f) : (Color?)null);
                    var title = Row(card, 44);
                    var name = UIFactory.Text(title, def.displayName.ToUpperInvariant(), Theme.Body, state == UpgradeSystem.State.Locked ? Theme.TextMuted : Theme.Text, TextAnchor.MiddleLeft, FontStyle.Bold);
                    UIFactory.Layout(name, 44, -1, 1);
                    string chip; Color chipColor;
                    switch (state)
                    {
                        case UpgradeSystem.State.Installed: chip = "INSTALLED"; chipColor = Theme.Success; break;
                        case UpgradeSystem.State.Locked: chip = "LOCKED"; chipColor = Theme.TextMuted; break;
                        case UpgradeSystem.State.CannotAfford: chip = tier > 0 ? "TIER " + tier + "/" + def.maxTier : "AVAILABLE"; chipColor = Theme.Warning; break;
                        default: chip = tier > 0 ? "TIER " + tier + "/" + def.maxTier : "AVAILABLE"; chipColor = Theme.Accent; break;
                    }
                    Chip(title, chip, chipColor);
                    Para(card, def.description, Theme.TextDim);
                    if (state != UpgradeSystem.State.Installed)
                    {
                        int pts = def.PointCost(tier + 1), nan = def.NaniteCost(tier + 1);
                        string cost = "Next tier " + (tier + 1) + "/" + def.maxTier + ": " + pts + " point" + (pts == 1 ? "" : "s") + (nan > 0 ? " + " + nan + " nanites" : "");
                        if (def.requiredLevel > 1) cost += "   Requires level " + def.requiredLevel;
                        Para(card, cost, Theme.Text, Theme.Tiny + 1);
                        if (!string.IsNullOrEmpty(reason)) Para(card, reason, state == UpgradeSystem.State.Locked ? Theme.TextMuted : Theme.Warning, Theme.Tiny + 1);
                        var row = Row(card, 60);
                        string id = def.id;
                        var b = SmallButton(row, tier > 0 ? "UPGRADE" : "INSTALL", () => g.Upgrades.Install(id), ButtonStyle.Primary, 220);
                        b.interactable = state == UpgradeSystem.State.Available;
                    }
                    else Para(card, "Tier " + tier + "/" + def.maxTier + " installed.", Theme.Success, Theme.Tiny + 1);
                }
            }
        }
    }
}

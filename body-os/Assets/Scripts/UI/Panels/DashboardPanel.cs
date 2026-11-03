using UnityEngine;

namespace BodyOS
{
    /// <summary>Overview: vitals, energy flow, vision, mission, consumables and navigation destinations.</summary>
    public sealed class DashboardPanel : OSPanel
    {
        public override string Title => "DASHBOARD";
        public override string Subtitle => "System overview. Every BODY.OS setting has a real effect on your body and the world.";

        protected override void BuildContent(RectTransform c)
        {
            var g = G;
            var v = g.Vitals;

            var vit = Card(c);
            Heading(vit, "VITALS");
            KeyValue(vit, "Health", Mathf.CeilToInt(v.Health) + " / " + Mathf.RoundToInt(v.MaxHealth), Theme.Health);
            new UIBar(vit, Theme.Health, 12).Set(v.HealthFraction);
            KeyValue(vit, "Energy", Mathf.FloorToInt(v.Energy) + " / " + Mathf.RoundToInt(v.MaxEnergy), Theme.Energy);
            new UIBar(vit, Theme.Energy, 12).Set(v.EnergyFraction);
            KeyValue(vit, "Suit reserve", Mathf.RoundToInt(v.Suit) + " / " + Mathf.RoundToInt(v.MaxSuit), Theme.Suit);
            new UIBar(vit, Theme.Suit, 12).Set(v.SuitFraction);
            var b = v.Breakdown;
            KeyValue(vit, "Energy flow", Signed(b.Net) + " /s  (regen " + b.regen.ToString("0.00") + ", drain " + b.Drain.ToString("0.00") + ")", b.Net >= 0 ? Theme.Success : Theme.Warning);

            var vis = Card(c);
            Heading(vis, "VISION");
            var row = Row(vis);
            var modes = VisionSystem.Modes;
            var names = new string[modes.Length];
            int cur = 0;
            for (int i = 0; i < modes.Length; i++)
            {
                names[i] = modes[i].name + (g.Vision.IsUnlocked(modes[i].id) ? "" : " (LOCKED)");
                if (modes[i].id == g.Vision.Current) cur = i;
            }
            var dd = new UIDropdown(row, "VISION MODE", names, i => g.Vision.SetMode(modes[i].id));
            dd.Set(cur);
            UIFactory.Layout(dd.Button, 64, 360);
            Para(vis, g.Vision.CurrentInfo.description + "  Drain " + g.Vision.CurrentDrain.ToString("0.0") + "/s.");

            var mis = Card(c);
            Heading(mis, "CURRENT MISSION");
            var m = g.Missions.Active;
            var o = g.Missions.CurrentObjective;
            if (m != null && o != null)
            {
                UIFactory.Text(mis, m.title, Theme.Body, Theme.Text, TextAnchor.MiddleLeft, FontStyle.Bold);
                Para(mis, o.text, Theme.Text);
                if (g.Missions.ShowHint && !string.IsNullOrEmpty(o.hint)) Para(mis, "Hint: " + o.hint);
            }
            else Para(mis, "No active mission. Explore the ship.");

            var inv = Card(c);
            Heading(inv, "SUPPLIES");
            KeyValue(inv, "Nanite shards", g.Inventory.Count("nanites").ToString());
            KeyValue(inv, "Upgrade points", g.Progression.Points.ToString());
            foreach (var id in new[] { "energy_capsule", "medigel" })
            {
                int n = g.Inventory.Count(id);
                var r = Row(inv, 64);
                var t = UIFactory.Text(r, g.Content.ItemName(id) + "  x" + n, Theme.Small, n > 0 ? Theme.Text : Theme.TextMuted);
                UIFactory.Layout(t, 60, -1, 1);
                string itemId = id;
                var btn = SmallButton(r, "USE", () => g.Inventory.Use(itemId), ButtonStyle.Secondary, 140);
                btn.interactable = n > 0;
            }
            foreach (var id in new[] { "power_cell", "phase_core" })
                if (g.Inventory.Count(id) > 0) KeyValue(inv, g.Content.ItemName(id), "x" + g.Inventory.Count(id), Theme.Warning);

            var nav = Card(c);
            Heading(nav, "NAVIGATION");
            foreach (var loc in g.Content.Locations)
            {
                if (!loc.isDestination) continue;
                bool current = g.Data.story.location == loc.id;
                bool playable = !string.IsNullOrEmpty(loc.playableKey);
                var r = Row(nav, 44);
                var name = UIFactory.Text(r, loc.displayName, Theme.Small, playable ? Theme.Text : Theme.TextMuted, TextAnchor.MiddleLeft, FontStyle.Bold);
                UIFactory.Layout(name, 44, -1, 1);
                Chip(r, current ? "CURRENT LOCATION" : playable ? "AVAILABLE" : "LOCKED", current ? Theme.Success : playable ? Theme.Accent : Theme.TextMuted);
                Para(nav, loc.description + (playable ? "" : "  " + loc.lockedReason), Theme.TextMuted, Theme.Tiny + 1);
            }
        }
    }
}

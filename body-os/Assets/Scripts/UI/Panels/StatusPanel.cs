using System.Text;
using UnityEngine;

namespace BodyOS
{
    /// <summary>Character sheet: progression, configuration, active systems, upgrades, discoveries and mission.</summary>
    public sealed class StatusPanel : OSPanel
    {
        public override string Title => "CHARACTER STATUS";
        public override string Subtitle => "Subject 7. All values are read live from BODY.OS systems.";

        protected override void BuildContent(RectTransform c)
        {
            var g = G;
            var p = g.Progression;

            var prog = Card(c);
            Heading(prog, "PROGRESSION");
            KeyValue(prog, "Level", p.Level.ToString(), Theme.Accent);
            KeyValue(prog, "Experience", p.Xp + " / " + p.XpToNext);
            new UIBar(prog, Theme.Accent, 12).Set((float)p.Xp / Mathf.Max(1, p.XpToNext));
            KeyValue(prog, "Upgrade points", p.Points.ToString());
            KeyValue(prog, "Play time", Mathf.FloorToInt(g.Data.playTimeSeconds / 60f) + " min");

            var vit = Card(c);
            Heading(vit, "CONDITION");
            KeyValue(vit, "Health", Mathf.CeilToInt(g.Vitals.Health) + " / " + Mathf.RoundToInt(g.Vitals.MaxHealth), Theme.Health);
            KeyValue(vit, "Energy", Mathf.FloorToInt(g.Vitals.Energy) + " / " + Mathf.RoundToInt(g.Vitals.MaxEnergy), Theme.Energy);
            KeyValue(vit, "Active vision", g.Vision.CurrentInfo.name);
            var active = new StringBuilder();
            foreach (var r in g.Reality.Abilities) if (r.IsActive) active.Append(r.def.displayName).Append(' ');
            KeyValue(vit, "Active abilities", active.Length > 0 ? active.ToString() : "None");
            KeyValue(vit, "Protection (cold/toxic/rad)", g.Environment.ProtectionCold + " / " + g.Environment.ProtectionToxic + " / " + g.Environment.ProtectionRadiation);

            var cfg = Card(c);
            Heading(cfg, "BODY CONFIGURATION");
            foreach (var info in StatRules.Info)
                KeyValue(cfg, info.Name, g.Body.Get(info.Id) + "  (cap " + g.Body.Cap(info.Id) + ")");

            var up = Card(c);
            Heading(up, "INSTALLED UPGRADES");
            if (g.Data.upgrades.Count == 0) Para(up, "None installed.");
            foreach (var s in g.Data.upgrades)
            {
                var def = g.Content.Upgrade(s.id);
                if (def != null) KeyValue(up, def.displayName, "Tier " + s.tier + "/" + def.maxTier, Theme.Success);
            }

            var inv = Card(c);
            Heading(inv, "INVENTORY");
            if (g.Data.inventory.items.Count == 0) Para(inv, "Empty.");
            foreach (var it in g.Data.inventory.items) KeyValue(inv, g.Content.ItemName(it.id), "x" + it.amount);

            var mis = Card(c);
            Heading(mis, "MISSIONS");
            foreach (var m in g.Content.Missions)
            {
                var st = g.Data.story.missions.Find(x => x.id == m.id);
                string state = st == null ? (string.IsNullOrEmpty(m.startFlag) || g.HasFlag(m.startFlag) ? "Available" : "Unknown") :
                    st.completed ? "Complete" : "Objective " + (st.objective + 1) + "/" + m.objectives.Length;
                KeyValue(mis, m.title, state, st != null && st.completed ? Theme.Success : Theme.Text);
            }
            var o = g.Missions.CurrentObjective;
            if (o != null) Para(mis, "Current: " + o.text, Theme.Text);

            var loc = Card(c);
            Heading(loc, "DISCOVERED LOCATIONS & MEMORY");
            int memory = g.Body.Get(StatId.Memory);
            foreach (var id in g.Data.progress.discoveredLocations)
            {
                var l = g.Content.Location(id);
                if (l == null) continue;
                UIFactory.Text(loc, l.displayName, Theme.Small, Theme.Text, TextAnchor.MiddleLeft, FontStyle.Bold);
                Para(loc, l.description, Theme.TextMuted, Theme.Tiny + 1);
                foreach (var f in l.fragments)
                {
                    if (g.Progression.IsFragmentRevealed(f.id)) Para(loc, "MEMORY: " + f.text, Theme.Violet, Theme.Tiny + 1);
                    else Para(loc, "Fragment locked (Memory " + f.memoryRequired + " required, current " + memory + ").", Theme.TextMuted, Theme.Tiny + 1);
                }
            }
            if (g.Data.progress.discoveredLocations.Count == 0) Para(loc, "None yet.");
        }
    }
}

using UnityEngine;

namespace BodyOS
{
    /// <summary>Reality manipulation abilities: status, costs, activation and HUD quick-slot assignment.</summary>
    public sealed class RealityPanel : OSPanel
    {
        public override string Title => "REALITY";
        public override string Subtitle => "Controlled reality manipulation. Each ability has an energy cost, duration and cooldown, and needs at least 20% energy.";

        protected override void BuildContent(RectTransform c)
        {
            var g = G;
            if (!g.Reality.AnyUnlocked)
            {
                var lockCard = Card(c, new Color(0.08f, 0.04f, 0.12f, 0.95f));
                Heading(lockCard, "REALITY KERNEL: DORMANT", Theme.Violet);
                Para(lockCard, "BODY.OS contains a dormant kernel that does not belong to any human specification. Complete WAKE PROTOCOL, then install the REALITY KERNEL in Technology to bring it online.");
            }

            foreach (var r in g.Reality.Abilities)
            {
                var def = r.def;
                bool unlocked = g.Reality.IsUnlocked(def.id);
                var card = Card(c, r.IsActive ? new Color(0.12f, 0.05f, 0.2f, 0.96f) : (Color?)null);
                var head = Row(card, 44);
                var name = UIFactory.Text(head, def.displayName.ToUpperInvariant(), Theme.Body, unlocked ? Theme.Text : Theme.TextMuted, TextAnchor.MiddleLeft, FontStyle.Bold);
                UIFactory.Layout(name, 44, -1, 1);
                string status = !unlocked ? "LOCKED" : r.IsActive ? "ACTIVE " + Mathf.CeilToInt(r.active) + "s" : r.cooldown > 0 ? "RECHARGING " + Mathf.CeilToInt(r.cooldown) + "s" : "READY";
                Chip(head, status, !unlocked ? Theme.TextMuted : r.IsActive ? Theme.Violet : r.cooldown > 0 ? Theme.Warning : Theme.Success);
                Para(card, def.description);
                Para(card, "Cost " + def.energyCost.ToString("0") + " energy   Duration " + def.duration.ToString("0") + "s   Cooldown " + def.cooldown.ToString("0") + "s", Theme.TextMuted, Theme.Tiny + 1);
                if (!unlocked)
                {
                    string by = "";
                    foreach (var u in g.Content.Upgrades)
                        foreach (var fx in u.effects)
                            if (fx != null && fx.type == UpgradeEffectType.UnlockAbility && fx.key == def.id) by = u.displayName;
                    Para(card, "Unlock: install " + (by.Length > 0 ? by : "its reality module") + ".", Theme.TextMuted, Theme.Tiny + 1);
                    continue;
                }
                var row = Row(card, 60);
                string id = def.id;
                SmallButton(row, "ACTIVATE", () => { UIRoot.I.BodyOS.Close(); g.Reality.TryActivate(id); }, ButtonStyle.Primary, 210);
                for (int s = 0; s < 2; s++)
                {
                    int slot = s;
                    bool assigned = g.Data.abilitySlots[slot] == id;
                    SmallButton(row, assigned ? "SLOT " + (slot + 1) + " *" : "SLOT " + (slot + 1), () =>
                    {
                        g.Data.abilitySlots[slot] = assigned ? "" : id;
                        GameEvents.RaiseAbilities();
                    }, assigned ? ButtonStyle.Primary : ButtonStyle.Secondary, 150);
                }
            }
            Para(c, "Quick slots appear as buttons above JUMP on the HUD.", Theme.TextMuted, Theme.Tiny + 1);
        }
    }
}

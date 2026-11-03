using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>
    /// BODY or BRAIN section: one slider card per attribute, an allocation budget meter and live
    /// consequences. Updates in place (never rebuilt) so sliders keep working while dragged.
    /// </summary>
    public sealed class StatPanel : OSPanel
    {
        readonly StatPool pool;
        readonly List<StatRow> rows = new List<StatRow>();
        UIBar budgetBar;
        Text budgetText, footer;
        float lastDenied = -10f;

        sealed class StatRow
        {
            public StatId id;
            public UISlider slider;
            public Text value, effect;
        }

        public StatPanel(StatPool pool) { this.pool = pool; }

        public override string Title => pool == StatPool.Body ? "BODY" : "BRAIN";
        public override string Subtitle => pool == StatPool.Body
            ? "Reconfigure musculature and actuators. Attributes share a bio-allocation budget; values above 5 add overclock energy drain."
            : "Tune cognitive subsystems (fictional game mechanics). Attributes share a neural-allocation budget.";

        protected override void BuildStatic(RectTransform c)
        {
            var head = Card(c);
            budgetText = Heading(head, "");
            budgetBar = new UIBar(head, pool == StatPool.Body ? Theme.Accent : Theme.Violet, 16);
            Para(head, pool == StatPool.Body
                ? "Raising one attribute uses free allocation. When full, lower another attribute first. Technology upgrades raise caps and the budget."
                : "Brain attributes unlock and improve mechanics: calibrations, scanning, memory recovery, threat detection and analysis.");

            foreach (var info in StatRules.Info)
            {
                bool include = info.Pool == pool || (pool == StatPool.Body && info.Pool == StatPool.None);
                if (!include) continue;
                var card = Card(c);
                var title = Row(card, 40);
                var name = UIFactory.Text(title, info.Name.ToUpperInvariant(), Theme.Body, Theme.Text, TextAnchor.MiddleLeft, FontStyle.Bold);
                UIFactory.Layout(name, 40, -1, 1);
                var row = new StatRow { id = info.Id };
                row.value = UIFactory.Text(title, "", Theme.Small, Theme.Accent, TextAnchor.MiddleRight, FontStyle.Bold);
                UIFactory.Layout(row.value, 40, 260);
                var id = info.Id;
                row.slider = new UISlider(card, StatRules.Min, StatRules.AbsoluteMax, v => OnSlider(id, v), info.Pool == StatPool.None ? Theme.Warning : (pool == StatPool.Body ? Theme.Accent : Theme.Violet));
                row.effect = UIFactory.Text(card, "", Theme.Small, Theme.Accent, TextAnchor.UpperLeft);
                Para(card, info.Description, Theme.TextMuted, Theme.Tiny + 1);
                rows.Add(row);
            }

            var foot = Card(c);
            footer = Para(foot, "");
            var buttons = Row(foot);
            SmallButton(buttons, "RESET TO BALANCED", () => UIRoot.I.ShowConfirm("RECALIBRATE", "Reset all body and brain attributes to the balanced default (5)?", "RESET", () => G.Body.ResetToBalanced()), ButtonStyle.Secondary, 320);
            SmallButton(buttons, "PRESETS", () => UIRoot.I.BodyOS.Select(BodyOSMenu.Configurations), ButtonStyle.Ghost, 200);
        }

        void OnSlider(StatId id, int value)
        {
            var body = G.Body;
            int old = body.Get(id);
            if (value == old) return;
            if (body.TrySet(id, value, out string reason))
            {
                AudioManager.I?.Play(Sfx.UiClick, 0.6f, 0.9f + 0.03f * value);
            }
            else
            {
                // Clamp to the highest legal value in the requested direction, if that still changes something.
                int legal = Mathf.Clamp(value, StatRules.Min, body.MaxSettable(id));
                if (legal != old && body.TrySet(id, legal, out _)) AudioManager.I?.Play(Sfx.UiClick, 0.6f);
                else if (Time.unscaledTime - lastDenied > 1.2f)
                {
                    lastDenied = Time.unscaledTime;
                    AudioManager.I?.Play(Sfx.Denied);
                    GameEvents.Notify(reason, NoticeType.Warning);
                }
            }
            Refresh();
        }

        public override void Refresh()
        {
            var body = G.Body;
            if (pool != StatPool.None)
            {
                int used = body.Used(pool), budget = body.BudgetFor(pool);
                budgetText.text = (pool == StatPool.Body ? "BIO-ALLOCATION  " : "NEURAL ALLOCATION  ") + used + " / " + budget + "   (" + Mathf.Max(0, budget - used) + " free)";
                budgetBar.Set(budget > 0 ? (float)used / budget : 0f);
            }
            foreach (var r in rows)
            {
                int v = body.Get(r.id);
                int cap = body.Cap(r.id);
                r.slider.Set(v);
                r.value.text = v + "   cap " + cap + (cap < StatRules.AbsoluteMax ? "" : " (max)");
                r.effect.text = body.DescribeEffect(r.id, v);
            }
            if (pool == StatPool.Body)
                footer.text = "Live: move speed " + body.BaseMoveSpeed.ToString("0.0") + " m/s, jump " + body.BaseJumpHeight.ToString("0.00") + " m, push class " + body.Strength +
                              ".\nOverclock drain " + (StatRules.OverclockDrain(G.Data.stats) * body.ConsumptionMultiplier).ToString("0.00") + " energy/s. Changes apply as soon as you close BODY.OS.";
            else
                footer.text = "Threat radius " + body.ThreatRadius.ToString("0") + " m, calibration window " + Mathf.RoundToInt(body.CalibrationWindow * 100) + "%, scan time x" + body.AnalysisTime.ToString("0.00") +
                              ". Memory " + body.Get(StatId.Memory) + " recovers fragments for discovered locations.";
        }
    }
}

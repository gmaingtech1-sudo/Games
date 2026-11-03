using UnityEngine;

namespace BodyOS
{
    /// <summary>Energy accounting, performance, save state and maintenance actions.</summary>
    public sealed class DiagnosticsPanel : OSPanel
    {
        public override string Title => "SYSTEM DIAGNOSTICS";
        public override string Subtitle => "Where your energy goes, how the device is performing, and save-data status.";

        protected override void BuildContent(RectTransform c)
        {
            var g = G;
            var b = g.Vitals.Breakdown;

            var en = Card(c);
            Heading(en, "ENERGY ACCOUNTING (per second)");
            KeyValue(en, "Regeneration (Recovery " + g.Body.Get(StatId.Recovery) + ")", "+" + b.regen.ToString("0.00"), Theme.Success);
            KeyValue(en, "Passive systems", "-" + b.passive.ToString("0.00"));
            KeyValue(en, "Overclock (attributes > 5)", "-" + b.overclock.ToString("0.00"));
            KeyValue(en, "Movement", "-" + b.movement.ToString("0.00"));
            KeyValue(en, "Vision: " + g.Vision.CurrentInfo.name, "-" + b.vision.ToString("0.00"));
            KeyValue(en, "Environment", "-" + b.environment.ToString("0.00"));
            KeyValue(en, "NET", Signed(b.Net), b.Net >= 0 ? Theme.Success : Theme.Warning);
            Para(en, "Multipliers: throttle consumption x" + g.Body.ConsumptionMultiplier.ToString("0.00") + ", endurance x" + g.Body.EnduranceMultiplier.ToString("0.00") +
                     ". Movement and vision values update after you close BODY.OS (the game is paused while it is open).", Theme.TextMuted, Theme.Tiny + 1);

            var perf = Card(c);
            Heading(perf, "PERFORMANCE");
            float fps = Time.unscaledDeltaTime > 0 ? 1f / Time.unscaledDeltaTime : 0f;
            KeyValue(perf, "Menu frame rate", Mathf.RoundToInt(fps) + " FPS");
            KeyValue(perf, "Graphics quality", QualityProfiles.Names[g.Settings.graphicsQuality]);
            KeyValue(perf, "Resolution", Screen.width + " x " + Screen.height);

            var sv = Card(c);
            Heading(sv, "SAVE DATA");
            KeyValue(sv, "Format version", SaveData.CurrentVersion.ToString());
            KeyValue(sv, "Last save", SaveSystem.LastSaveTime);
            if (!string.IsNullOrEmpty(SaveSystem.LastError)) Para(sv, "Last error: " + SaveSystem.LastError, Theme.Warning, Theme.Tiny + 1);
            var row = Row(sv, 60);
            SmallButton(row, "SAVE NOW", () => g.SaveGame(true), ButtonStyle.Primary, 200);
            SmallButton(row, "RECALIBRATE", () => UIRoot.I.ShowConfirm("RECALIBRATE", "Reset all attributes to balanced defaults?", "RESET", () => g.Body.ResetToBalanced()), ButtonStyle.Secondary, 230);
            SmallButton(row, "SYSTEM RESTORE", () => UIRoot.I.ShowConfirm("SYSTEM RESTORE", "Uninstall all upgrades and refund every point and nanite?", "RESTORE", () => g.Upgrades.RefundAll(), true), ButtonStyle.Ghost, 260);

            var log = Card(c);
            Heading(log, "EVENT LOG");
            var entries = g.Data.story.log;
            for (int i = entries.Count - 1; i >= 0 && i >= entries.Count - 12; i--) Para(log, entries[i], Theme.TextDim, Theme.Tiny + 1);
            Heading(log, "RECENT NOTIFICATIONS", Theme.TextMuted);
            var h = NotificationFeed.History;
            for (int i = h.Count - 1; i >= 0 && i >= h.Count - 10; i--) Para(log, h[i], Theme.TextMuted, Theme.Tiny);
        }
    }
}

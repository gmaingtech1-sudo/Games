using System.Text;
using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Body configuration presets. Built-in presets can be customised and reset; all presets are stored in
    /// the save. Loading a preset is validated against current caps, budgets and unlocks, so a preset can
    /// never bypass upgrade restrictions.
    /// </summary>
    public sealed class PresetSystem
    {
        readonly Game game;

        public PresetSystem(Game game)
        {
            this.game = game;
            // Make sure every built-in preset exists (e.g. older saves or newly added presets).
            foreach (var p in DefaultContent.Presets())
                if (game.Data.presets.Find(x => x.id == p.id) == null) game.Data.presets.Add(p);
            foreach (var p in game.Data.presets)
            {
                var v = p.stats;
                StatRules.Sanitize(ref v, _ => StatRules.AbsoluteMax, 999, 999);
                p.stats = v;
                if (string.IsNullOrEmpty(p.name)) p.name = p.id.ToUpperInvariant();
            }
        }

        public System.Collections.Generic.List<ConfigPreset> All => game.Data.presets;

        public string Load(string id)
        {
            var p = All.Find(x => x.id == id);
            if (p == null) return "Preset not found.";
            var before = game.Body.Snapshot();
            var wanted = (int[])p.stats.Clone();
            bool adapted = game.Body.ApplyAll(wanted);
            var report = new StringBuilder();
            if (adapted)
            {
                var now = game.Body.Snapshot();
                for (int i = 0; i < StatRules.Count; i++)
                    if (now[i] < p.stats[i])
                        report.Append(StatRules.Info[i].Name).Append(' ').Append(p.stats[i]).Append("→").Append(now[i]).Append("  ");
            }
            if (System.Enum.TryParse(p.vision, out VisionModeId mode))
            {
                if (game.Vision.IsUnlocked(mode)) game.Vision.SetMode(mode, false);
                else report.Append(VisionSystem.Info(mode).name).Append(" locked  ");
            }
            AudioManager.I?.Play(Sfx.Upgrade);
            game.Log("Loaded preset " + p.name + ".");
            string msg = "Preset " + p.name + " loaded.";
            if (report.Length > 0) msg += " Restricted by current hardware: " + report.ToString().Trim();
            GameEvents.Notify(msg, report.Length > 0 ? NoticeType.Warning : NoticeType.Success);
            return msg;
        }

        public void SaveCurrent(string id)
        {
            var p = All.Find(x => x.id == id);
            if (p == null) return;
            p.stats = game.Body.Snapshot();
            p.vision = game.Vision.Current.ToString();
            p.customised = true;
            AudioManager.I?.Play(Sfx.Confirm);
            GameEvents.Notify("Current configuration saved to " + p.name + ".", NoticeType.Success);
            game.SaveGame(false);
        }

        public void ResetPreset(string id)
        {
            int i = All.FindIndex(x => x.id == id);
            if (i < 0) return;
            var def = System.Array.Find(DefaultContent.Presets(), x => x.id == id);
            if (def == null) return;
            All[i] = def;
            GameEvents.Notify(def.name + " restored to factory values.", NoticeType.Info);
            game.SaveGame(false);
        }
    }
}

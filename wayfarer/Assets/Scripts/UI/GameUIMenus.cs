using UnityEngine;

namespace Wayfarer
{
    public sealed partial class GameUI
    {
        // ───────────────────────────── title ──────────────────────────────
        void DrawTitle()
        {
            titleFade = Mathf.MoveTowards(titleFade, 1f, Time.unscaledDeltaTime * 0.7f);
            var old = GUI.color;
            GUI.color = new Color(1, 1, 1, titleFade);
            UIKit.Rect(new Rect(0, 0, W * 0.42f, H), new Color(0, 0, 0, 0.35f));
            UIKit.Text(new Rect(80, 150, 900, 120), "WAYFARER", new GUIStyle(UIKit.Title) { alignment = TextAnchor.MiddleLeft }, Color.white);
            UIKit.Text(new Rect(86, 262, 700, 30), "An endless galaxy of worlds to explore", UIKit.LabelBig, UIKit.Accent);

            if (menuPage == 1) DrawSettings(new Rect(80, 340, 620, 600));
            else if (menuPage == 2) DrawControls(new Rect(80, 340, 700, 640));
            else
            {
                float y = 360;
                bool hasSave = Profile.HasSave;
                if (hasSave && UIKit.Btn(new Rect(80, y, 320, 50), "Continue", true)) { g.ContinueGame(); }
                if (hasSave) y += 62;
                if (UIKit.Btn(new Rect(80, y, 320, 50), hasSave ? "New journey" : "Begin", !hasSave))
                {
                    if (hasSave && !confirmNew) confirmNew = true;
                    else { confirmNew = false; g.NewGame(); }
                }
                if (confirmNew) UIKit.Text(new Rect(412, y + 12, 500, 30), "This replaces your saved journey. Click again to confirm.", UIKit.LabelSmall, UIKit.Warm);
                y += 62;
                if (UIKit.Btn(new Rect(80, y, 320, 50), "Settings")) menuPage = 1;
                y += 62;
                if (UIKit.Btn(new Rect(80, y, 320, 50), "Controls")) menuPage = 2;
                y += 62;
                if (UIKit.Btn(new Rect(80, y, 320, 50), "Quit")) Application.Quit();
                if (hasSave)
                {
                    var d = Profile.Data;
                    UIKit.Text(new Rect(80, y + 90, 600, 60),
                        $"Saved journey: {d.Discoveries.Count} discoveries · {d.Jumps} jumps · {d.Inv.Units:N0} units · {System.TimeSpan.FromSeconds(d.PlayTime):h\\:mm} played",
                        UIKit.LabelSmall);
                }
            }
            UIKit.Text(new Rect(80, H - 50, 900, 24), "Made with Unity and Blender · every world, creature and sound is procedurally generated", UIKit.LabelTiny);
            GUI.color = old;
        }

        bool confirmNew;

        void DrawLoading()
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0.01f, 0.015f, 0.03f, Mathf.Clamp01(1.2f - g.LoadProgress)));
            UIKit.Text(new Rect(0, H / 2 - 60, W, 40), g.LoadText, UIKit.LabelCenter, UIKit.Ink);
            UIKit.Bar(new Rect(W / 2 - 200, H / 2, 400, 4), g.LoadProgress, UIKit.Accent);
            UIKit.Text(new Rect(0, H / 2 + 16, W, 30), "Generating terrain", UIKit.LabelCenter, UIKit.Dim);
        }

        void DrawWarp()
        {
            float a = Mathf.Clamp01(g.WarpT / 1.5f) * Mathf.Clamp01((7.2f - g.WarpT) / 1.2f);
            if (g.WarpTarget != null)
                UIKit.Text(new Rect(0, H * 0.78f, W, 40), "Hyperspace → " + g.WarpTarget.Name, UIKit.LabelCenter, new Color(1, 1, 1, a));
        }

        // ───────────────────────────── pause ──────────────────────────────
        void DrawPause()
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.55f));
            var r = new Rect(W / 2 - 300, 170, 600, 720);
            UIKit.PanelBox(r);
            UIKit.Text(new Rect(r.x + 30, r.y + 24, 540, 40), "PAUSED", UIKit.LabelHuge);
            if (menuPage == 1) { DrawSettings(new Rect(r.x + 30, r.y + 90, 540, 600)); return; }
            if (menuPage == 2) { DrawControls(new Rect(r.x + 30, r.y + 90, 560, 620)); return; }
            float y = r.y + 100;
            if (UIKit.Btn(new Rect(r.x + 30, y, 540, 50), "Resume", true)) g.State = GameState.Playing;
            y += 62;
            if (UIKit.Btn(new Rect(r.x + 30, y, 540, 50), "Settings")) menuPage = 1;
            y += 62;
            if (UIKit.Btn(new Rect(r.x + 30, y, 540, 50), "Controls")) menuPage = 2;
            y += 62;
            if (UIKit.Btn(new Rect(r.x + 30, y, 540, 50), "Save game")) { g.SaveGame(); g.Toast("Game saved"); }
            y += 62;
            if (UIKit.Btn(new Rect(r.x + 30, y, 540, 50), "Save and quit to title"))
            {
                g.SaveGame();
                g.State = GameState.Title;
                g.Mode = PlayerMode.OnFoot;
                titleFade = 0f;
            }
            y += 62;
            if (UIKit.Btn(new Rect(r.x + 30, y, 540, 50), "Save and quit to desktop")) { g.SaveGame(); Application.Quit(); }
            var d = Profile.Data;
            UIKit.Text(new Rect(r.x + 30, y + 80, 540, 120),
                $"Played {System.TimeSpan.FromSeconds(d.PlayTime):h\\:mm\\:ss}  ·  walked {d.DistanceWalked / 1000:F1} km  ·  flew {d.DistanceFlown / 1000:N0} km\n" +
                $"{d.Jumps} hyperspace jumps  ·  {d.Discoveries.Count} discoveries  ·  {d.Kills} pirates destroyed",
                UIKit.LabelSmall);
        }

        void DrawSettings(Rect r)
        {
            float y = r.y;
            UIKit.Text(new Rect(r.x, y, r.width, 30), "GRAPHICS", UIKit.LabelSmall, UIKit.Warm);
            y += 30;
            var presets = GraphicsQuality.Presets;
            float bw = (r.width - 30) / presets.Length;
            for (int i = 0; i < presets.Length; i++)
            {
                if (UIKit.Btn(new Rect(r.x + i * (bw + 10), y, bw, 40), presets[i].Name, Settings.Quality == i))
                {
                    Settings.Quality = i;
                    Settings.Save();
                    g.ApplyGraphics();
                }
            }
            y += 56;
            Settings.Fov = Slider(r.x, ref y, r.width, "Field of view", Settings.Fov, 60f, 100f, "{0:F0}°");
            Settings.MouseSensitivity = Slider(r.x, ref y, r.width, "Mouse sensitivity", Settings.MouseSensitivity, 0.2f, 3f, "{0:F2}");
            float mv = Settings.MasterVolume, mu = Settings.MusicVolume, fx = Settings.EffectsVolume;
            Settings.MasterVolume = Slider(r.x, ref y, r.width, "Master volume", Settings.MasterVolume, 0f, 1f, "{0:P0}");
            Settings.MusicVolume = Slider(r.x, ref y, r.width, "Music", Settings.MusicVolume, 0f, 1f, "{0:P0}");
            Settings.EffectsVolume = Slider(r.x, ref y, r.width, "Effects", Settings.EffectsVolume, 0f, 1f, "{0:P0}");
            if (mv != Settings.MasterVolume || mu != Settings.MusicVolume || fx != Settings.EffectsVolume) g.ApplyAudioSettings();
            y += 6;
            Toggle(r.x, ref y, "Invert mouse Y", ref Settings.InvertY);
            Toggle(r.x, ref y, "Head bob", ref Settings.HeadBob);
            bool vs = Settings.Vsync;
            Toggle(r.x, ref y, "V-sync", ref Settings.Vsync);
            if (vs != Settings.Vsync) Settings.ApplyEngine();
            Toggle(r.x, ref y, "Show frame rate", ref Settings.ShowFps);
            bool fs = Settings.Fullscreen;
            Toggle(r.x, ref y, "Full screen", ref Settings.Fullscreen);
            if (fs != Settings.Fullscreen) Screen.fullScreen = Settings.Fullscreen;
            y += 12;
            if (UIKit.Btn(new Rect(r.x, y, 200, 44), "Back", true)) { Settings.Save(); menuPage = 0; }
        }

        float Slider(float x, ref float y, float w, string label, float v, float min, float max, string fmt)
        {
            UIKit.Text(new Rect(x, y, 240, 24), label, UIKit.LabelSmall, UIKit.Ink);
            float nv = GUI.HorizontalSlider(new Rect(x + 250, y + 8, w - 340, 20), v, min, max);
            UIKit.Text(new Rect(x + w - 80, y, 80, 24), string.Format(fmt, nv), UIKit.LabelSmall);
            y += 36;
            return nv;
        }

        void Toggle(float x, ref float y, string label, ref bool v)
        {
            if (UIKit.Btn(new Rect(x, y, 44, 30), v ? "✓" : "", v, true)) v = !v;
            UIKit.Text(new Rect(x + 56, y + 4, 400, 24), label, UIKit.LabelSmall, UIKit.Ink);
            y += 38;
        }

        void DrawControls(Rect r)
        {
            string[,] rows =
            {
                { "ON FOOT", "" },
                { "W A S D", "Walk" }, { "Shift", "Sprint" }, { "Space", "Jump · hold for jetpack · swim up" },
                { "Mouse", "Look" }, { "Left mouse", "Mine / fire / scan" }, { "Q", "Switch mining beam and blaster" },
                { "F", "Analysis visor (scan animals, plants and minerals)" }, { "C", "Scanner pulse: find resources and places" },
                { "E", "Interact · board your ship" }, { "T", "Torch" },
                { "STARSHIP", "" },
                { "W / S", "Throttle up / down" }, { "Mouse", "Steer" }, { "A / D", "Roll" }, { "Shift", "Boost" },
                { "Left mouse", "Photon cannons" }, { "J", "Pulse drive (in space)" }, { "E", "Land · leave ship · dock" },
                { "Space", "Take off" }, { "V", "Cockpit / chase view" },
                { "ANYWHERE", "" },
                { "Tab / I", "Inventory, technology and crafting" }, { "M", "Galaxy map (hyperspace jumps)" }, { "L", "Discoveries log" }, { "Esc", "Pause" },
            };
            float y = r.y;
            for (int i = 0; i < rows.GetLength(0); i++)
            {
                if (rows[i, 1] == "")
                {
                    y += 6;
                    UIKit.Text(new Rect(r.x, y, r.width, 22), rows[i, 0], UIKit.LabelSmall, UIKit.Warm);
                    y += 24;
                    continue;
                }
                UIKit.Text(new Rect(r.x, y, 170, 22), rows[i, 0], UIKit.LabelSmall, UIKit.Ink);
                UIKit.Text(new Rect(r.x + 170, y, r.width - 170, 22), rows[i, 1], UIKit.LabelSmall);
                y += 22;
            }
            if (UIKit.Btn(new Rect(r.x, y + 14, 200, 44), "Back", true)) menuPage = 0;
        }

        // ───────────────────────────── death ──────────────────────────────
        void DrawDeath()
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0.15f, 0f, 0f, Mathf.Clamp01(g.DeathTimer * 0.5f) * 0.6f));
            if (g.DeathTimer < 1.2f) return;
            UIKit.Text(new Rect(0, H / 2 - 90, W, 70), g.DeathCause.ToUpperInvariant(), new GUIStyle(UIKit.Title) { fontSize = 60 }, UIKit.Danger);
            UIKit.Text(new Rect(0, H / 2 - 10, W, 30), "Your exosuit's emergency systems can bring you back.", UIKit.LabelCenter, UIKit.Ink);
            if (UIKit.Btn(new Rect(W / 2 - 150, H / 2 + 40, 300, 54), "Respawn", true)) g.Respawn();
        }

        // ───────────────────────────── lore ───────────────────────────────
        void DrawLore()
        {
            var r = new Rect(W / 2 - 360, H / 2 - 220, 720, 440);
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.4f));
            UIKit.PanelBox(r);
            UIKit.Text(new Rect(r.x + 30, r.y + 24, 660, 36), loreTitle, UIKit.LabelBig, UIKit.Warm);
            UIKit.Text(new Rect(r.x + 30, r.y + 76, 660, 280), loreText, UIKit.Label, UIKit.Ink);
            if (loreUnits > 0) UIKit.Text(new Rect(r.x + 30, r.y + 350, 660, 26), $"+{loreUnits:N0} units", UIKit.Label, UIKit.Good);
            if (UIKit.Btn(new Rect(r.x + r.width - 190, r.y + r.height - 70, 160, 46), "Close", true)) loreOpen = false;
            if (Event.current.type == EventType.KeyDown && (Event.current.keyCode == KeyCode.E || Event.current.keyCode == KeyCode.Return)) loreOpen = false;
        }
    }
}

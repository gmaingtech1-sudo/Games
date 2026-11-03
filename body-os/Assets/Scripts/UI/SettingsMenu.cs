using UnityEngine;

namespace BodyOS
{
    /// <summary>Game settings (separate from BODY.OS). Applied live and saved when closed.</summary>
    public sealed class SettingsMenu
    {
        readonly RectTransform root;
        const string LayerId = "settings";
        bool open;
        UISlider master, music, sfx, camSens, ctrlSens, uiScale;
        UIDropdown quality;
        UISwitch vibration, invert, fps;
        UnityEngine.UI.Text masterV, musicV, sfxV, camV, ctrlV, uiV;

        GameSettings S => Game.I.Settings;

        public SettingsMenu(Transform canvas)
        {
            var bg = UIFactory.Image(canvas, "Settings", new Color(0, 0.01f, 0.03f, 0.85f), null, true);
            root = bg.rectTransform;
            UIFactory.Stretch(root);
            var win = UIFactory.Panel(root, "Window", Theme.Panel, true, true);
            UIFactory.Place(win.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(900, 660));

            var t = UIFactory.Text(win.transform, "SETTINGS", Theme.H2, Theme.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            UIFactory.Place(t.rectTransform, new Vector2(0, 1), new Vector2(0, 1), new Vector2(30, -18), new Vector2(400, 56));
            var close = UIFactory.Button(win.transform, "DONE", Close, ButtonStyle.Primary, 64);
            UIFactory.Place((RectTransform)close.transform, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-20, -14), new Vector2(180, 64));

            var sr = UIFactory.Scroll(win.transform, out var c, 10, 8);
            UIFactory.Stretch((RectTransform)sr.transform, 24, 90, 24, 20);

            Section(c, "AUDIO");
            master = PercentRow(c, "Master volume", v => { S.masterVolume = v / 20f; Apply(); }, out masterV);
            music = PercentRow(c, "Music volume", v => { S.musicVolume = v / 20f; Apply(); }, out musicV);
            sfx = PercentRow(c, "Sound effects volume", v => { S.sfxVolume = v / 20f; Apply(); AudioManager.I?.Play(Sfx.UiClick); }, out sfxV);

            Section(c, "CONTROLS");
            camSens = Row(c, "Camera sensitivity", 2, 30, v => { S.cameraSensitivity = v / 10f; Apply(); }, out camV);
            ctrlSens = Row(c, "Joystick response", 5, 20, v => { S.controlSensitivity = v / 10f; Apply(); }, out ctrlV);
            invert = Switch(c, "Invert camera (vertical)", b => { S.invertCamera = b; Apply(); });
            vibration = Switch(c, "Vibration", b => { S.vibration = b; Apply(); if (b) Game.Vibrate(); });

            Section(c, "DISPLAY");
            var qRow = UIFactory.Rect("Quality", c);
            UIFactory.HStack(qRow, 12);
            UIFactory.Layout(qRow, 68);
            var ql = UIFactory.Text(qRow, "Graphics quality", Theme.Body, Theme.Text);
            UIFactory.Layout(ql, 64, -1, 1);
            quality = new UIDropdown(qRow, "GRAPHICS QUALITY", QualityProfiles.Names, i => { S.graphicsQuality = i; Apply(); });
            uiScale = Row(c, "Interface scale", 8, 13, v => { S.uiScale = v / 10f; Apply(); }, out uiV);
            fps = Switch(c, "Show frame rate", b => { S.showFps = b; Apply(); });

            var resetRow = UIFactory.Rect("Reset", c);
            UIFactory.HStack(resetRow, 12);
            UIFactory.Layout(resetRow, 68);
            UIFactory.Layout(UIFactory.Button(resetRow, "RESTORE DEFAULTS", ResetDefaults, ButtonStyle.Ghost, 64), 64, 320);

            root.gameObject.SetActive(false);
        }

        static void Section(RectTransform c, string name)
        {
            UIFactory.Text(c, name, Theme.Small, Theme.TextMuted, TextAnchor.MiddleLeft, FontStyle.Bold);
        }

        UISlider PercentRow(RectTransform c, string label, System.Action<int> onChange, out UnityEngine.UI.Text valueText)
        {
            return Row(c, label, 0, 20, onChange, out valueText);
        }

        UISlider Row(RectTransform c, string label, int min, int max, System.Action<int> onChange, out UnityEngine.UI.Text valueText)
        {
            var row = UIFactory.Rect("Row", c);
            UIFactory.HStack(row, 12);
            UIFactory.Layout(row, 68);
            var l = UIFactory.Text(row, label, Theme.Body, Theme.Text);
            UIFactory.Layout(l, 64, 300);
            UISlider slider = null;
            slider = new UISlider(row, min, max, v =>
            {
                v = Mathf.Clamp(v, min, max);
                slider.Set(v);
                onChange(v);
                Refresh();
            }, Theme.Accent);
            UIFactory.Layout(slider.Root, 64, -1, 1);
            valueText = UIFactory.Text(row, "", Theme.Small, Theme.Accent, TextAnchor.MiddleRight, FontStyle.Bold);
            UIFactory.Layout(valueText, 64, 90);
            return slider;
        }

        UISwitch Switch(RectTransform c, string label, System.Action<bool> onChange)
        {
            var row = UIFactory.Rect("Row", c);
            UIFactory.HStack(row, 12);
            UIFactory.Layout(row, 64);
            var l = UIFactory.Text(row, label, Theme.Body, Theme.Text);
            UIFactory.Layout(l, 60, -1, 1);
            return new UISwitch(row, onChange);
        }

        void Apply() { Game.I.ApplySettings(); }

        void ResetDefaults()
        {
            var fresh = new GameSettings();
            var s = S;
            s.masterVolume = fresh.masterVolume; s.musicVolume = fresh.musicVolume; s.sfxVolume = fresh.sfxVolume;
            s.cameraSensitivity = fresh.cameraSensitivity; s.controlSensitivity = fresh.controlSensitivity;
            s.graphicsQuality = fresh.graphicsQuality; s.uiScale = fresh.uiScale; s.vibration = fresh.vibration;
            s.invertCamera = fresh.invertCamera; s.showFps = fresh.showFps;
            Apply();
            Refresh();
        }

        void Refresh()
        {
            var s = S;
            master.Set(Mathf.RoundToInt(s.masterVolume * 20)); masterV.text = Mathf.RoundToInt(s.masterVolume * 100) + "%";
            music.Set(Mathf.RoundToInt(s.musicVolume * 20)); musicV.text = Mathf.RoundToInt(s.musicVolume * 100) + "%";
            sfx.Set(Mathf.RoundToInt(s.sfxVolume * 20)); sfxV.text = Mathf.RoundToInt(s.sfxVolume * 100) + "%";
            camSens.Set(Mathf.RoundToInt(s.cameraSensitivity * 10)); camV.text = s.cameraSensitivity.ToString("0.0") + "x";
            ctrlSens.Set(Mathf.RoundToInt(s.controlSensitivity * 10)); ctrlV.text = s.controlSensitivity.ToString("0.0") + "x";
            uiScale.Set(Mathf.RoundToInt(s.uiScale * 10)); uiV.text = Mathf.RoundToInt(s.uiScale * 100) + "%";
            quality.Set(s.graphicsQuality);
            vibration.Set(s.vibration);
            invert.Set(s.invertCamera);
            fps.Set(s.showFps);
        }

        public void Open()
        {
            if (open) return;
            open = true;
            root.gameObject.SetActive(true);
            root.SetAsLastSibling();
            Refresh();
            UIAnim.PopIn(root);
            UIRoot.I.PushLayer(LayerId, Close);
        }

        public void Close()
        {
            if (!open) return;
            open = false;
            Game.I.SaveSettings();
            root.gameObject.SetActive(false);
            UIRoot.I.PopLayer(LayerId);
        }
    }
}

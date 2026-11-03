using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>
    /// Owns every canvas and screen. Canvases (back to front): FX (vision tints), HUD, Menus, Overlay
    /// (dialogs, notifications, fade). Every modal layer blocks raycasts to whatever is beneath it and
    /// pauses gameplay through Game.PushModal, so a touch on a menu can never trigger gameplay controls.
    /// </summary>
    public sealed class UIRoot : MonoBehaviour
    {
        public static UIRoot I { get; private set; }
        public static readonly Vector2 ReferenceResolution = new Vector2(1280, 720);

        public Canvas FxCanvas { get; private set; }
        public Canvas HudCanvas { get; private set; }
        public Canvas MenuCanvas { get; private set; }
        public Canvas OverlayCanvas { get; private set; }
        public ScreenFX Fx { get; private set; }
        public Hud Hud { get; private set; }
        public BodyOSMenu BodyOS { get; private set; }
        public NotificationFeed Feed { get; private set; }

        readonly List<CanvasScaler> scalers = new List<CanvasScaler>();
        readonly List<KeyValuePair<string, Action>> layers = new List<KeyValuePair<string, Action>>();
        MainMenuScreen mainMenu;
        PauseMenu pause;
        SettingsMenu settings;
        Image fade;
        float fadeTarget;
        int modalCounter;

        public static UIRoot Create(Transform parent)
        {
            var go = new GameObject("UI");
            go.transform.SetParent(parent, false);
            var ui = go.AddComponent<UIRoot>();
            ui.Init();
            return ui;
        }

        void Init()
        {
            I = this;
            if (EventSystem.current == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
                es.transform.SetParent(transform, false);
                es.GetComponent<EventSystem>().pixelDragThreshold = Mathf.Max(8, (int)(Screen.dpi > 0 ? Screen.dpi * 0.04f : 10));
            }
            FxCanvas = MakeCanvas("FX", 5, false);
            HudCanvas = MakeCanvas("HUD", 10, true);
            MenuCanvas = MakeCanvas("Menus", 20, true);
            OverlayCanvas = MakeCanvas("Overlay", 30, true);

            Fx = FxCanvas.gameObject.AddComponent<ScreenFX>();
            Fx.Build((RectTransform)FxCanvas.transform);

            Hud = Hud.Create(SafeRoot(HudCanvas));
            Hud.gameObject.SetActive(false);

            BodyOS = BodyOSMenu.Create((RectTransform)MenuCanvas.transform);
            BodyOS.gameObject.SetActive(false);

            Feed = NotificationFeed.Create(SafeRoot(OverlayCanvas));

            fade = UIFactory.Image(OverlayCanvas.transform, "Fade", Color.black, null, false);
            UIFactory.Stretch(fade.rectTransform);
            fade.color = new Color(0, 0, 0, 0);
            fade.gameObject.SetActive(false);
        }

        Canvas MakeCanvas(string name, int order, bool interactive)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            go.transform.SetParent(transform, false);
            var c = go.AddComponent<Canvas>();
            c.renderMode = RenderMode.ScreenSpaceOverlay;
            c.sortingOrder = order;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = ReferenceResolution;
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 1f; // landscape: scale by height so text stays readable on wide phones
            scalers.Add(scaler);
            if (interactive) go.AddComponent<GraphicRaycaster>();
            if (interactive)
            {
                var safe = UIFactory.Rect("Safe", go.transform);
                UIFactory.Stretch(safe);
                safe.gameObject.AddComponent<SafeArea>();
            }
            return c;
        }

        public static RectTransform SafeRoot(Canvas c) { return (RectTransform)c.transform.Find("Safe"); }

        public void ApplyScale(float scale)
        {
            scale = Mathf.Clamp(scale, 0.8f, 1.3f);
            foreach (var s in scalers) s.referenceResolution = ReferenceResolution / scale;
        }

        void Update()
        {
            if (fade != null && fade.gameObject.activeSelf)
            {
                var c = fade.color;
                c.a = Mathf.MoveTowards(c.a, fadeTarget, Time.unscaledDeltaTime * 4f);
                fade.color = c;
                if (c.a <= 0f && fadeTarget <= 0f) fade.gameObject.SetActive(false);
            }
        }

        public void Fade(bool toBlack)
        {
            fadeTarget = toBlack ? 1f : 0f;
            fade.gameObject.SetActive(true);
            fade.raycastTarget = toBlack;
            fade.transform.SetAsLastSibling();
        }

        // ------------------------------------------------------------------ Layers (modal stack)

        /// <summary>Registers a modal layer: pauses gameplay and makes it closable with Back.</summary>
        public void PushLayer(string id, Action close)
        {
            layers.Add(new KeyValuePair<string, Action>(id, close));
            Game.I?.PushModal(id);
        }

        public void PopLayer(string id)
        {
            layers.RemoveAll(l => l.Key == id);
            Game.I?.PopModal(id);
        }

        public bool AnyLayerOpen => layers.Count > 0;

        /// <summary>Android back button / Escape: closes the top-most layer, or opens the pause menu.</summary>
        public void HandleBack()
        {
            if (layers.Count > 0) { layers[layers.Count - 1].Value?.Invoke(); return; }
            var g = Game.I;
            if (g != null && g.InGame && !g.Loading) OpenPause();
        }

        public void HideAllMenus()
        {
            int guard = 20;
            while (layers.Count > 0 && guard-- > 0) layers[layers.Count - 1].Value?.Invoke();
            layers.Clear();
            Hud.gameObject.SetActive(false);
        }

        // ------------------------------------------------------------------ Screens

        public void ShowMainMenu()
        {
            Hud.gameObject.SetActive(false);
            Fx.SetVision(VisionModeId.Normal);
            if (mainMenu == null) mainMenu = new MainMenuScreen(SafeRoot(MenuCanvas));
            mainMenu.Show();
        }

        public void HideMainMenu() { mainMenu?.Hide(); }

        public void ShowHud()
        {
            Hud.gameObject.SetActive(true);
            Hud.RefreshAll();
            Fx.SetVision(Game.I.Vision.Current);
        }

        public void ToggleBodyOS()
        {
            if (BodyOS.gameObject.activeSelf) BodyOS.Close();
            else OpenBodyOS(-1);
        }

        public void OpenBodyOS(int section)
        {
            var g = Game.I;
            if (g == null || !g.InGame || g.Loading) return;
            if (!BodyOS.gameObject.activeSelf) BodyOS.Open(section);
            else if (section >= 0) BodyOS.Select(section);
        }

        public void OpenPause()
        {
            if (pause == null) pause = new PauseMenu(MenuCanvas.transform);
            pause.Open();
        }

        public void OpenSettings()
        {
            if (settings == null) settings = new SettingsMenu(OverlayCanvas.transform);
            settings.Open();
        }

        // ------------------------------------------------------------------ Dialogs

        /// <summary>Creates a centred modal window with a full-screen touch blocker.</summary>
        public RectTransform Modal(string idPrefix, float width, float height, out string id, out Action close, Action onClose = null)
        {
            string layerId = idPrefix + "#" + (++modalCounter);
            id = layerId;
            var blocker = UIFactory.Image(OverlayCanvas.transform, "Modal_" + layerId, new Color(0, 0.01f, 0.03f, 0.72f), null, true);
            UIFactory.Stretch(blocker.rectTransform);
            if (fade != null) fade.transform.SetAsLastSibling();
            var win = UIFactory.Panel(blocker.transform, "Window", Theme.Panel, true, true);
            UIFactory.Place(win.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(width, height));
            UIAnim.PopIn(win.rectTransform);
            var go = blocker.gameObject;
            bool closed = false;
            close = () =>
            {
                if (closed) return;
                closed = true;
                PopLayer(layerId);
                Destroy(go);
                onClose?.Invoke();
            };
            PushLayer(layerId, close);
            return win.rectTransform;
        }

        public void ShowDialog(string title, string body, string okLabel, Action onOk)
        {
            ShowDialog(title, body, okLabel, onOk, null, null);
        }

        public void ShowDialog(string title, string body, string aLabel, Action aAction, string bLabel, Action bAction)
        {
            var win = Modal("dialog", 860, 560, out _, out var close);
            BuildTextWindow(win, title, body);
            var row = ButtonRow(win);
            if (!string.IsNullOrEmpty(bLabel))
                UIFactory.Layout(UIFactory.Button(row, bLabel, () => { close(); bAction?.Invoke(); }, ButtonStyle.Ghost), Theme.ButtonHeight, 260);
            UIFactory.Layout(UIFactory.Button(row, aLabel, () => { close(); aAction?.Invoke(); }, ButtonStyle.Primary), Theme.ButtonHeight, 300);
        }

        public void ShowConfirm(string title, string body, string confirmLabel, Action onConfirm, bool danger = false)
        {
            var win = Modal("confirm", 760, 420, out _, out var close);
            BuildTextWindow(win, title, body);
            var row = ButtonRow(win);
            UIFactory.Layout(UIFactory.Button(row, "CANCEL", close, ButtonStyle.Ghost), Theme.ButtonHeight, 240);
            UIFactory.Layout(UIFactory.Button(row, confirmLabel, () => { close(); onConfirm?.Invoke(); }, danger ? ButtonStyle.Danger : ButtonStyle.Primary), Theme.ButtonHeight, 300);
        }

        public void ShowOptions(string title, string[] options, int current, Action<int> onPick)
        {
            float h = Mathf.Min(620, 150 + options.Length * 80);
            var win = Modal("options", 560, h, out _, out var close);
            var t = UIFactory.Text(win, title, Theme.H2, Theme.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            UIFactory.Place(t.rectTransform, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -20), new Vector2(500, 50));
            var sr = UIFactory.Scroll(win, out var content, 10);
            UIFactory.Stretch((RectTransform)sr.transform, 24, 80, 24, 24);
            for (int i = 0; i < options.Length; i++)
            {
                int idx = i;
                UIFactory.Button(content, options[i], () => { close(); onPick?.Invoke(idx); }, i == current ? ButtonStyle.Primary : ButtonStyle.Secondary, 66);
            }
        }

        public void ShowMissionComplete(MissionDefinition m)
        {
            string body = m.summary + "\n\nREWARDS\n+" + m.rewardXp + " XP" +
                (m.rewardPoints > 0 ? "\n+" + m.rewardPoints + " upgrade points" : "") +
                (m.rewardNanites > 0 ? "\n+" + m.rewardNanites + " nanite shards" : "");
            ShowDialog("MISSION COMPLETE: " + m.title, body, "CONTINUE", null);
        }

        public void ShowTransmission(string title, string body, Action onClose)
        {
            var win = Modal("transmission", 980, 600, out _, out var close, onClose);
            TransmissionView.Build(win, title, body, close);
            AudioManager.I?.Play(Sfx.Transmission);
        }

        public void ShowCalibration(string title, Action onSuccess, Action onFail)
        {
            var win = Modal("calibration", 860, 520, out _, out var close);
            CalibrationGame.Build(win, title, close, onSuccess, onFail);
        }

        void BuildTextWindow(RectTransform win, string title, string body)
        {
            var t = UIFactory.Text(win, title, Theme.H2, Theme.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            t.rectTransform.anchorMin = new Vector2(0, 1); t.rectTransform.anchorMax = new Vector2(1, 1);
            t.rectTransform.pivot = new Vector2(0.5f, 1); t.rectTransform.offsetMin = new Vector2(32, -86); t.rectTransform.offsetMax = new Vector2(-32, -20);
            var sr = UIFactory.Scroll(win, out var content, 8);
            UIFactory.Stretch((RectTransform)sr.transform, 32, 96, 32, 120);
            UIFactory.Text(content, body, Theme.Body, Theme.Text, TextAnchor.UpperLeft);
        }

        RectTransform ButtonRow(RectTransform win)
        {
            var row = UIFactory.Rect("Buttons", win);
            row.anchorMin = new Vector2(0, 0); row.anchorMax = new Vector2(1, 0); row.pivot = new Vector2(0.5f, 0);
            row.offsetMin = new Vector2(32, 26); row.offsetMax = new Vector2(-32, 26 + Theme.ButtonHeight);
            var h = UIFactory.HStack(row, 16);
            h.childAlignment = TextAnchor.MiddleRight;
            return row;
        }
    }
}

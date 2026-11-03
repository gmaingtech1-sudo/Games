using UnityEngine;

namespace BodyOS
{
    /// <summary>Pause menu. Gameplay is frozen while it is open.</summary>
    public sealed class PauseMenu
    {
        readonly RectTransform root;
        const string LayerId = "pause";
        bool open;

        public PauseMenu(Transform canvas)
        {
            var bg = UIFactory.Image(canvas, "Pause", new Color(0, 0.01f, 0.03f, 0.8f), null, true);
            root = bg.rectTransform;
            UIFactory.Stretch(root);
            var win = UIFactory.Panel(root, "Window", Theme.Panel, true, true);
            UIFactory.Place(win.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(520, 620));
            var v = UIFactory.VStack(win.rectTransform, 14, 30);
            v.childAlignment = TextAnchor.MiddleCenter;
            UIFactory.Text(win.transform, "PAUSED", Theme.H1, Theme.Accent, TextAnchor.MiddleCenter, FontStyle.Bold);
            UIFactory.Button(win.transform, "RESUME", Close, ButtonStyle.Primary);
            UIFactory.Button(win.transform, "SAVE GAME", () => Game.I.SaveGame(true));
            UIFactory.Button(win.transform, "BODY.OS", () => { Close(); UIRoot.I.OpenBodyOS(-1); });
            UIFactory.Button(win.transform, "SETTINGS", () => UIRoot.I.OpenSettings());
            UIFactory.Button(win.transform, "MAIN MENU", () => UIRoot.I.ShowConfirm("RETURN TO MAIN MENU", "Your progress will be saved first.", "MAIN MENU", () => { Close(); Game.I.ReturnToMainMenu(); }), ButtonStyle.Ghost);
            root.gameObject.SetActive(false);
        }

        public void Open()
        {
            if (open) return;
            open = true;
            root.gameObject.SetActive(true);
            root.SetAsLastSibling();
            UIAnim.PopIn(root);
            UIRoot.I.PushLayer(LayerId, Close);
            AudioManager.I?.Play(Sfx.OsOpen, 0.6f);
        }

        public void Close()
        {
            if (!open) return;
            open = false;
            root.gameObject.SetActive(false);
            UIRoot.I.PopLayer(LayerId);
        }
    }
}

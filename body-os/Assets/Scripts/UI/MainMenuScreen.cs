using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>Title screen: continue, new game (with confirmation), settings and quit.</summary>
    public sealed class MainMenuScreen
    {
        readonly RectTransform root;
        readonly Button continueButton;
        readonly Text continueInfo;

        public MainMenuScreen(RectTransform parent)
        {
            root = UIFactory.Rect("MainMenu", parent);
            UIFactory.Stretch(root);

            var title = UIFactory.Text(root, "BODY.OS", 96, Theme.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            UIFactory.Place(title.rectTransform, new Vector2(0, 1), new Vector2(0, 1), new Vector2(70, -60), new Vector2(700, 120));
            var sub = UIFactory.Text(root, "BEYOND EXISTENCE", 34, Color.white, TextAnchor.MiddleLeft, FontStyle.Bold);
            UIFactory.Place(sub.rectTransform, new Vector2(0, 1), new Vector2(0, 1), new Vector2(76, -170), new Vector2(700, 50));
            var tag = UIFactory.Text(root, "You woke up on a derelict ship. Your body runs an operating system that was never meant for a human.", Theme.Small, Theme.TextDim, TextAnchor.UpperLeft);
            UIFactory.Place(tag.rectTransform, new Vector2(0, 1), new Vector2(0, 1), new Vector2(76, -228), new Vector2(560, 70));

            var col = UIFactory.Rect("Buttons", root);
            UIFactory.Place(col, new Vector2(0, 0), new Vector2(0, 0), new Vector2(76, 40), new Vector2(440, 360));
            var v = UIFactory.VStack(col, 14);
            v.childAlignment = TextAnchor.LowerLeft;

            continueButton = UIFactory.Button(col, "CONTINUE", () => Game.I.ContinueOrNew(), ButtonStyle.Primary, 72, 28);
            continueInfo = UIFactory.Text(col, "", Theme.Tiny, Theme.TextDim);
            UIFactory.Button(col, "NEW GAME", NewGame, ButtonStyle.Secondary, 72, 28);
            UIFactory.Button(col, "SETTINGS", () => UIRoot.I.OpenSettings(), ButtonStyle.Secondary, 72, 28);
            UIFactory.Button(col, "QUIT", () => UIRoot.I.ShowConfirm("QUIT", "Close BODY.OS: BEYOND EXISTENCE?", "QUIT", Application.Quit), ButtonStyle.Ghost, 64, 24);

            var ver = UIFactory.Text(root, "v" + Application.version + "  //  offline  //  prototype build: THE DERELICT", Theme.Tiny, Theme.TextMuted, TextAnchor.LowerRight);
            UIFactory.Place(ver.rectTransform, new Vector2(1, 0), new Vector2(1, 0), new Vector2(-16, 10), new Vector2(700, 30));
            root.gameObject.SetActive(false);
        }

        void NewGame()
        {
            if (SaveSystem.HasSave)
                UIRoot.I.ShowConfirm("START A NEW GAME?", "This replaces your current progress (your settings are kept). This cannot be undone.", "START NEW GAME", () => Game.I.NewGame(), true);
            else Game.I.NewGame();
        }

        public void Show()
        {
            root.gameObject.SetActive(true);
            bool has = SaveSystem.HasSave;
            continueButton.gameObject.SetActive(has);
            continueInfo.gameObject.SetActive(has);
            if (has)
            {
                var peek = SaveSystem.Load();
                continueInfo.text = peek != null ? "Level " + peek.progress.level + "  //  " + Mathf.FloorToInt(peek.playTimeSeconds / 60f) + " min played" : "Save data unreadable: a new game will start.";
            }
            UIAnim.PopIn(root, 0.4f);
        }

        public void Hide() { root.gameObject.SetActive(false); }
    }
}

using System;
using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>Typewriter-style story transmission with signal flicker. Tap to reveal everything, then continue.</summary>
    public sealed class TransmissionView : MonoBehaviour
    {
        Text body, button;
        string full;
        float shown;
        Action close;
        Image signal;
        const float CharsPerSecond = 42f;

        public static void Build(RectTransform win, string title, string text, Action close)
        {
            var v = win.gameObject.AddComponent<TransmissionView>();
            v.full = text;
            v.close = close;
            var t = UIFactory.Text(win, title, Theme.Body, Theme.Violet, TextAnchor.MiddleLeft, FontStyle.Bold);
            t.rectTransform.anchorMin = new Vector2(0, 1); t.rectTransform.anchorMax = new Vector2(1, 1); t.rectTransform.pivot = new Vector2(0.5f, 1);
            t.rectTransform.offsetMin = new Vector2(32, -80); t.rectTransform.offsetMax = new Vector2(-32, -20);
            v.signal = UIFactory.Image(win, "Signal", Theme.Violet, UIFactory.Rounded);
            v.signal.rectTransform.anchorMin = new Vector2(0, 1); v.signal.rectTransform.anchorMax = new Vector2(1, 1);
            v.signal.rectTransform.offsetMin = new Vector2(32, -88); v.signal.rectTransform.offsetMax = new Vector2(-32, -84);
            v.body = UIFactory.Text(win, "", Theme.Body, Theme.Text, TextAnchor.UpperLeft);
            UIFactory.Stretch(v.body.rectTransform, 32, 104, 32, 110);
            var b = UIFactory.Button(win, "SKIP", v.OnButton, ButtonStyle.Primary);
            var rt = (RectTransform)b.transform;
            UIFactory.Place(rt, new Vector2(1, 0), new Vector2(1, 0), new Vector2(-32, 26), new Vector2(280, Theme.ButtonHeight));
            v.button = UIFactory.ButtonLabel(b);
        }

        void OnButton()
        {
            if (shown < full.Length) { shown = full.Length; body.text = full; button.text = "CONTINUE"; return; }
            close?.Invoke();
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            if (shown < full.Length)
            {
                int before = (int)shown;
                shown = Mathf.Min(full.Length, shown + dt * CharsPerSecond);
                if ((int)shown != before) body.text = full.Substring(0, (int)shown);
                if (shown >= full.Length) button.text = "CONTINUE";
            }
            var c = signal.color;
            c.a = 0.4f + 0.6f * Mathf.PerlinNoise(Time.unscaledTime * 6f, 0f);
            signal.color = c;
        }
    }
}

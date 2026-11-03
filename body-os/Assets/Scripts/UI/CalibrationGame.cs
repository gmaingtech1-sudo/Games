using System;
using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>
    /// Timed calibration mini-game (Reaction Speed): stop a sweeping marker inside the target window twice.
    /// Reaction widens the window and slows the marker.
    /// </summary>
    public sealed class CalibrationGame : MonoBehaviour
    {
        RectTransform track, window, marker;
        Text status;
        Action close, onSuccess, onFail;
        float pos, dir = 1f, windowStart, windowSize, speed;
        int stage;
        const int Stages = 2;
        const float TrackWidth = 680f;
        bool finished, succeeded;
        float resultTimer = -1f;

        public static void Build(RectTransform win, string title, Action close, Action onSuccess, Action onFail)
        {
            var g = win.gameObject.AddComponent<CalibrationGame>();
            g.close = close; g.onSuccess = onSuccess; g.onFail = onFail;
            var body = Game.I.Body;
            g.windowSize = body.CalibrationWindow;
            g.speed = body.CalibrationSpeed;

            var t = UIFactory.Text(win, title, Theme.H2, Theme.Accent, TextAnchor.MiddleCenter, FontStyle.Bold);
            UIFactory.Place(t.rectTransform, new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -24), new Vector2(800, 50));
            var info = UIFactory.Text(win, "Tap LOCK while the marker is inside the bright window. Two phases.\nReaction Speed " + body.Get(StatId.Reaction) +
                ": window " + Mathf.RoundToInt(g.windowSize * 100) + "%, marker " + g.speed.ToString("0.00") + " sweeps/s.", Theme.Small, Theme.TextDim, TextAnchor.MiddleCenter);
            UIFactory.Place(info.rectTransform, new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(0, -84), new Vector2(780, 70));

            var trackImg = UIFactory.Image(win, "Track", new Color(1, 1, 1, 0.08f), UIFactory.Rounded);
            g.track = trackImg.rectTransform;
            UIFactory.Place(g.track, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 10), new Vector2(TrackWidth, 70));
            var w = UIFactory.Image(g.track, "Window", new Color(0.3f, 1f, 0.6f, 0.55f), UIFactory.Rounded);
            g.window = w.rectTransform;
            g.window.anchorMin = g.window.anchorMax = new Vector2(0, 0.5f);
            g.window.pivot = new Vector2(0, 0.5f);
            var m = UIFactory.Image(g.track, "Marker", Color.white, UIFactory.Rounded);
            g.marker = m.rectTransform;
            g.marker.anchorMin = g.marker.anchorMax = new Vector2(0, 0.5f);
            g.marker.sizeDelta = new Vector2(10, 96);

            g.status = UIFactory.Text(win, "", Theme.Body, Theme.Text, TextAnchor.MiddleCenter, FontStyle.Bold);
            UIFactory.Place(g.status.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, -70), new Vector2(700, 40));

            var lockBtn = UIFactory.Button(win, "LOCK", g.Lock, ButtonStyle.Primary, 84, 32);
            UIFactory.Place((RectTransform)lockBtn.transform, new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(90, 26), new Vector2(340, 84));
            var abort = UIFactory.Button(win, "ABORT", g.Abort, ButtonStyle.Ghost, 84, 26);
            UIFactory.Place((RectTransform)abort.transform, new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-190, 26), new Vector2(200, 84));
            g.NewWindow();
        }

        void NewWindow()
        {
            windowStart = UnityEngine.Random.Range(0.1f, 0.9f - windowSize);
            window.anchoredPosition = new Vector2(windowStart * TrackWidth, 0);
            window.sizeDelta = new Vector2(windowSize * TrackWidth, 70);
            status.text = "PHASE " + (stage + 1) + " / " + Stages;
            status.color = Theme.Text;
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            if (resultTimer >= 0f)
            {
                // Show the result briefly. Unscaled time: gameplay is paused while this is open.
                resultTimer -= dt;
                if (resultTimer < 0f) { close?.Invoke(); if (succeeded) onSuccess?.Invoke(); else onFail?.Invoke(); }
                return;
            }
            if (finished) return;
            pos += dir * speed * 2f * dt; // a sweep is one pass across the bar
            if (pos > 1f) { pos = 1f; dir = -1f; }
            if (pos < 0f) { pos = 0f; dir = 1f; }
            marker.anchoredPosition = new Vector2(pos * TrackWidth, 0);
        }

        void Lock()
        {
            if (finished) return;
            bool hit = pos >= windowStart && pos <= windowStart + windowSize;
            if (hit)
            {
                AudioManager.I?.Play(Sfx.Calibrate);
                stage++;
                if (stage >= Stages) { Finish(true); return; }
                speed *= 1.15f;
                NewWindow();
            }
            else Finish(false);
        }

        void Abort()
        {
            if (finished) return;
            finished = true;
            close?.Invoke();
        }

        void Finish(bool success)
        {
            finished = true;
            status.text = success ? "CALIBRATION LOCKED" : "CALIBRATION FAILED";
            status.color = success ? Theme.Success : Theme.Danger;
            succeeded = success;
            resultTimer = 0.6f;
        }
    }
}

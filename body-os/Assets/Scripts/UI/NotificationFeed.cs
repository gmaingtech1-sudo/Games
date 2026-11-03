using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>Pooled toast notifications. Shows a few at once and keeps a short history for Diagnostics.</summary>
    public sealed class NotificationFeed : MonoBehaviour
    {
        sealed class Toast
        {
            public RectTransform rt;
            public Image bg, bar;
            public Text text;
            public CanvasGroup group;
            public float time, duration;
        }

        const int MaxVisible = 4;
        readonly List<Toast> active = new List<Toast>();
        readonly Queue<KeyValuePair<string, NoticeType>> pending = new Queue<KeyValuePair<string, NoticeType>>();
        ObjectPool<Toast> pool;
        RectTransform column;
        public static readonly List<string> History = new List<string>();

        public static NotificationFeed Create(RectTransform safe)
        {
            var col = UIFactory.Rect("Notifications", safe);
            col.anchorMin = new Vector2(1, 1); col.anchorMax = new Vector2(1, 1); col.pivot = new Vector2(1, 1);
            col.anchoredPosition = new Vector2(-8, -110);
            col.sizeDelta = new Vector2(420, 600);
            var v = UIFactory.VStack(col, 8);
            v.childAlignment = TextAnchor.UpperRight;
            var f = col.gameObject.AddComponent<NotificationFeed>();
            f.column = col;
            f.pool = new ObjectPool<Toast>(f.CreateToast, t => t.rt.gameObject.SetActive(true), t => t.rt.gameObject.SetActive(false), MaxVisible);
            return f;
        }

        Toast CreateToast()
        {
            var t = new Toast();
            t.bg = UIFactory.Panel(column, "Toast", Theme.PanelHud, false);
            t.rt = t.bg.rectTransform;
            var v = UIFactory.VStack(t.rt, 0, 0);
            v.padding = new RectOffset(22, 14, 10, 10);
            t.group = t.rt.gameObject.AddComponent<CanvasGroup>();
            t.group.blocksRaycasts = false;
            t.bar = UIFactory.Image(t.rt, "Accent", Theme.Accent, UIFactory.Rounded);
            t.bar.rectTransform.anchorMin = new Vector2(0, 0); t.bar.rectTransform.anchorMax = new Vector2(0, 1);
            t.bar.rectTransform.offsetMin = new Vector2(6, 8); t.bar.rectTransform.offsetMax = new Vector2(12, -8);
            t.bar.gameObject.AddComponent<LayoutElement>().ignoreLayout = true;
            t.text = UIFactory.Text(t.rt, "", Theme.Small, Theme.Text, TextAnchor.MiddleLeft);
            return t;
        }

        void OnEnable() { GameEvents.Notice += OnNotice; }
        void OnDisable() { GameEvents.Notice -= OnNotice; }

        void OnNotice(string msg, NoticeType type)
        {
            History.Add(System.DateTime.Now.ToString("HH:mm:ss") + "  " + msg);
            while (History.Count > 30) History.RemoveAt(0);
            pending.Enqueue(new KeyValuePair<string, NoticeType>(msg, type));
            // Keep the queue short: old routine notices are less useful than new ones.
            while (pending.Count > 6) pending.Dequeue();
        }

        void Update()
        {
            float dt = Time.unscaledDeltaTime;
            while (pending.Count > 0 && active.Count < MaxVisible) Show(pending.Dequeue());
            for (int i = active.Count - 1; i >= 0; i--)
            {
                var t = active[i];
                t.time += dt;
                float a = Mathf.Min(1f, t.time * 6f) * Mathf.Clamp01((t.duration - t.time) * 3f);
                t.group.alpha = a;
                if (t.time >= t.duration)
                {
                    active.RemoveAt(i);
                    pool.Release(t);
                }
            }
        }

        void Show(KeyValuePair<string, NoticeType> n)
        {
            var t = pool.Get();
            t.text.text = n.Key;
            t.time = 0f;
            t.duration = n.Value == NoticeType.Story ? 9f : n.Value == NoticeType.Danger ? 5f : 3.8f;
            Color c;
            switch (n.Value)
            {
                case NoticeType.Success: c = Theme.Success; break;
                case NoticeType.Warning: c = Theme.Warning; break;
                case NoticeType.Danger: c = Theme.Danger; break;
                case NoticeType.Reward: c = new Color(1f, 0.85f, 0.35f); break;
                case NoticeType.Story: c = Theme.Violet; break;
                default: c = Theme.Accent; break;
            }
            t.bar.color = c;
            t.text.color = n.Value == NoticeType.Reward ? c : Theme.Text;
            t.rt.SetAsLastSibling();
            active.Add(t);
        }
    }
}

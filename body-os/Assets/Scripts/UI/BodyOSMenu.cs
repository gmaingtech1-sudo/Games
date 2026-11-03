using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>
    /// The BODY.OS interface: a tab column of ten sections and a content area. Sections are built lazily
    /// and refreshed from the gameplay systems whenever relevant events fire. Gameplay pauses while open.
    /// </summary>
    public sealed class BodyOSMenu : MonoBehaviour
    {
        public const int Dashboard = 0, Body = 1, Brain = 2, Senses = 3, Environment = 4, Technology = 5, Reality = 6, Configurations = 7, Status = 8, Diagnostics = 9;

        OSPanel[] panels;
        Button[] tabs;
        RectTransform contentArea;
        Text headerStatus;
        int current = -1;
        bool dirty;
        float liveTimer;
        const string LayerId = "bodyos";

        public static BodyOSMenu Create(RectTransform canvasRoot)
        {
            var bg = UIFactory.Image(canvasRoot, "BODY.OS", Theme.Backdrop, null, true);
            UIFactory.Stretch(bg.rectTransform);
            var m = bg.gameObject.AddComponent<BodyOSMenu>();
            m.Build(bg.rectTransform);
            return m;
        }

        void Build(RectTransform bg)
        {
            // Subtle animated scanline texture behind everything.
            var lines = UIFactory.Rect("Lines", bg).gameObject.AddComponent<RawImage>();
            lines.texture = Art.NoiseTexture; lines.color = new Color(0.2f, 0.8f, 1f, 0.04f); lines.raycastTarget = false;
            UIFactory.Stretch(lines.rectTransform);
            lines.uvRect = new Rect(0, 0, 12, 7);

            var safe = UIFactory.Rect("Safe", bg);
            UIFactory.Stretch(safe);
            safe.gameObject.AddComponent<SafeArea>();

            // Header.
            var header = UIFactory.Rect("Header", safe);
            header.anchorMin = new Vector2(0, 1); header.anchorMax = new Vector2(1, 1); header.pivot = new Vector2(0.5f, 1);
            header.offsetMin = new Vector2(8, -88); header.offsetMax = new Vector2(-8, -8);
            var logo = UIFactory.Text(header, "BODY.OS", Theme.H1, Theme.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            UIFactory.Place(logo.rectTransform, new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(8, 0), new Vector2(220, 70));
            var ver = UIFactory.Text(header, "v7.3  //  SUBJECT 7  //  INTEGRATION 100%", Theme.Tiny, Theme.TextMuted);
            UIFactory.Place(ver.rectTransform, new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(230, 0), new Vector2(420, 40));
            headerStatus = UIFactory.Text(header, "", Theme.Small, Theme.Text, TextAnchor.MiddleRight);
            UIFactory.Place(headerStatus.rectTransform, new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-100, 0), new Vector2(520, 60));
            var close = UIFactory.Button(header, "×", Close, ButtonStyle.Secondary, 76, 44);
            UIFactory.Place((RectTransform)close.transform, new Vector2(1, 0.5f), new Vector2(1, 0.5f), Vector2.zero, new Vector2(80, 76));

            // Tabs.
            panels = new OSPanel[]
            {
                new DashboardPanel(), new StatPanel(StatPool.Body), new StatPanel(StatPool.Brain), new SensesPanel(),
                new EnvironmentPanel(), new TechnologyPanel(), new RealityPanel(), new ConfigurationsPanel(),
                new StatusPanel(), new DiagnosticsPanel(),
            };
            string[] names = { "DASHBOARD", "BODY", "BRAIN", "SENSES", "ENVIRONMENT", "TECHNOLOGY", "REALITY", "CONFIGURATIONS", "CHARACTER STATUS", "DIAGNOSTICS" };

            var tabScroll = UIFactory.Scroll(safe, out var tabContent, 8, 4);
            var tabRt = (RectTransform)tabScroll.transform;
            tabRt.anchorMin = new Vector2(0, 0); tabRt.anchorMax = new Vector2(0, 1); tabRt.pivot = new Vector2(0, 0.5f);
            tabRt.offsetMin = new Vector2(8, 8); tabRt.offsetMax = new Vector2(268, -96);
            tabs = new Button[names.Length];
            for (int i = 0; i < names.Length; i++)
            {
                int idx = i;
                tabs[i] = UIFactory.Button(tabContent, names[i], () => Select(idx), ButtonStyle.Tab, 62, Theme.Small);
                var label = UIFactory.ButtonLabel(tabs[i]);
                label.alignment = TextAnchor.MiddleLeft;
            }

            contentArea = UIFactory.Rect("Content", safe);
            contentArea.anchorMin = Vector2.zero; contentArea.anchorMax = Vector2.one;
            contentArea.offsetMin = new Vector2(280, 8); contentArea.offsetMax = new Vector2(-8, -96);
        }

        void OnEnable()
        {
            GameEvents.StatsChanged += MarkDirty;
            GameEvents.ProgressionChanged += MarkDirty;
            GameEvents.InventoryChanged += MarkDirty;
            GameEvents.MissionChanged += MarkDirty;
            GameEvents.VisionChanged += MarkDirty;
            GameEvents.AbilitiesChanged += MarkDirty;
            GameEvents.EnvironmentChanged += MarkDirty;
        }

        void OnDisable()
        {
            GameEvents.StatsChanged -= MarkDirty;
            GameEvents.ProgressionChanged -= MarkDirty;
            GameEvents.InventoryChanged -= MarkDirty;
            GameEvents.MissionChanged -= MarkDirty;
            GameEvents.VisionChanged -= MarkDirty;
            GameEvents.AbilitiesChanged -= MarkDirty;
            GameEvents.EnvironmentChanged -= MarkDirty;
        }

        void MarkDirty() { dirty = true; }

        public void Open(int section)
        {
            gameObject.SetActive(true);
            transform.SetAsLastSibling();
            UIAnim.PopIn((RectTransform)transform, 0.15f);
            UIRoot.I.PushLayer(LayerId, Close);
            AudioManager.I?.Play(Sfx.OsOpen);
            Game.I.SetFlag("os.opened");
            Select(section >= 0 ? section : (current >= 0 ? current : Dashboard));
            RefreshHeader();
        }

        public void Close()
        {
            if (!gameObject.activeSelf) return;
            gameObject.SetActive(false);
            UIRoot.I.PopLayer(LayerId);
            AudioManager.I?.Play(Sfx.OsClose);
            Game.I?.SaveGame(false);
        }

        public void Select(int index)
        {
            index = Mathf.Clamp(index, 0, panels.Length - 1);
            if (current >= 0 && panels[current].Root != null) panels[current].Root.gameObject.SetActive(false);
            current = index;
            var p = panels[index];
            if (p.Root == null) p.Build(contentArea);
            p.Root.gameObject.SetActive(true);
            p.Refresh();
            UIAnim.PopIn(p.Root, 0.12f);
            for (int i = 0; i < tabs.Length; i++)
            {
                bool sel = i == index;
                UIFactory.SetButtonColor(tabs[i], sel ? new Color(0.08f, 0.4f, 0.55f, 0.95f) : new Color(0.05f, 0.1f, 0.16f, 0.9f));
                UIFactory.ButtonLabel(tabs[i]).color = sel ? Color.white : Theme.TextDim;
            }
            Game.I.SetFlag("os.section." + index);
        }

        void RefreshHeader()
        {
            var g = Game.I;
            if (g == null || g.Vitals == null) return;
            headerStatus.text = "HP " + Mathf.CeilToInt(g.Vitals.Health) + "   EN " + Mathf.FloorToInt(g.Vitals.Energy) + "/" + Mathf.RoundToInt(g.Vitals.MaxEnergy) +
                                "   LV " + g.Progression.Level + "   PTS " + g.Progression.Points;
        }

        void Update()
        {
            if (dirty)
            {
                dirty = false;
                if (current >= 0) panels[current].Refresh();
                RefreshHeader();
            }
            liveTimer -= Time.unscaledDeltaTime;
            if (liveTimer <= 0f)
            {
                liveTimer = 0.5f;
                if (current >= 0 && panels[current].LiveRefresh) panels[current].Refresh();
            }
        }
    }

    /// <summary>Base class for a BODY.OS section. By default Refresh rebuilds the content from current state.</summary>
    public abstract class OSPanel
    {
        public RectTransform Root { get; private set; }
        protected RectTransform Content { get; private set; }
        public abstract string Title { get; }
        public abstract string Subtitle { get; }
        public virtual bool LiveRefresh => false;
        protected Game G => Game.I;

        public void Build(RectTransform parent)
        {
            Root = UIFactory.Rect(Title, parent);
            UIFactory.Stretch(Root);
            var head = UIFactory.Panel(Root, "Head", Theme.Panel, true);
            head.rectTransform.anchorMin = new Vector2(0, 1); head.rectTransform.anchorMax = new Vector2(1, 1); head.rectTransform.pivot = new Vector2(0.5f, 1);
            head.rectTransform.offsetMin = new Vector2(0, -96); head.rectTransform.offsetMax = Vector2.zero;
            var t = UIFactory.Text(head.transform, Title, Theme.H2, Theme.Accent, TextAnchor.UpperLeft, FontStyle.Bold);
            UIFactory.Stretch(t.rectTransform, 22, 10, 22, 50);
            var s = UIFactory.Text(head.transform, Subtitle, Theme.Tiny + 1, Theme.TextDim, TextAnchor.LowerLeft);
            UIFactory.Stretch(s.rectTransform, 22, 46, 22, 10);
            s.resizeTextForBestFit = true; s.resizeTextMinSize = 12; s.resizeTextMaxSize = Theme.Tiny + 1;

            var sr = UIFactory.Scroll(Root, out var content, 12, 4);
            UIFactory.Stretch((RectTransform)sr.transform, 0, 104, 0, 0);
            Content = content;
            BuildStatic(content);
        }

        /// <summary>Optional one-time construction (for panels that update in place).</summary>
        protected virtual void BuildStatic(RectTransform content) { }

        public virtual void Refresh()
        {
            Clear(Content);
            BuildContent(Content);
        }

        protected virtual void BuildContent(RectTransform c) { }

        protected static void Clear(RectTransform rt)
        {
            for (int i = rt.childCount - 1; i >= 0; i--)
            {
                var child = rt.GetChild(i);
                child.SetParent(null, false);
                Object.Destroy(child.gameObject);
            }
        }

        // ---- Shared building blocks

        protected static RectTransform Card(RectTransform parent, Color? fill = null)
        {
            var p = UIFactory.Panel(parent, "Card", fill ?? Theme.Panel, true);
            var v = UIFactory.VStack(p.rectTransform, 8, 18);
            v.padding = new RectOffset(20, 20, 16, 16);
            return p.rectTransform;
        }

        protected static Text Heading(RectTransform parent, string text, Color? color = null)
        {
            return UIFactory.Text(parent, text, Theme.Body, color ?? Theme.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
        }

        protected static Text Para(RectTransform parent, string text, Color? color = null, int size = Theme.Small)
        {
            return UIFactory.Text(parent, text, size, color ?? Theme.TextDim, TextAnchor.UpperLeft);
        }

        /// <summary>A label on the left and a value on the right.</summary>
        protected static Text KeyValue(RectTransform parent, string key, string value, Color? valueColor = null)
        {
            var row = UIFactory.Rect("KV", parent);
            UIFactory.HStack(row, 12);
            UIFactory.Layout(row, 34);
            var k = UIFactory.Text(row, key, Theme.Small, Theme.TextDim);
            UIFactory.Layout(k, 34, -1, 1);
            var v = UIFactory.Text(row, value, Theme.Small, valueColor ?? Theme.Text, TextAnchor.MiddleRight, FontStyle.Bold);
            UIFactory.Layout(v, 34, 340);
            return v;
        }

        protected static RectTransform Row(RectTransform parent, float height = Theme.ButtonHeight)
        {
            var row = UIFactory.Rect("Row", parent);
            var h = UIFactory.HStack(row, 12);
            h.childAlignment = TextAnchor.MiddleLeft;
            UIFactory.Layout(row, height);
            return row;
        }

        protected static Text Chip(RectTransform parent, string text, Color color)
        {
            var img = UIFactory.Panel(parent, "Chip", new Color(color.r * 0.25f, color.g * 0.25f, color.b * 0.25f, 0.9f), false);
            UIFactory.Layout(img, 40, 200);
            var t = UIFactory.Text(img.transform, text, Theme.Tiny, color, TextAnchor.MiddleCenter, FontStyle.Bold);
            UIFactory.Stretch(t.rectTransform, 8, 2, 8, 2);
            t.resizeTextForBestFit = true; t.resizeTextMinSize = 10; t.resizeTextMaxSize = Theme.Tiny;
            return t;
        }

        protected static Button SmallButton(RectTransform parent, string label, System.Action onClick, ButtonStyle style = ButtonStyle.Secondary, float width = 220)
        {
            var b = UIFactory.Button(parent, label, onClick, style, 60, Theme.Small);
            UIFactory.Layout(b, 60, width);
            return b;
        }

        protected static string Signed(float v) { return (v >= 0 ? "+" : "") + v.ToString("0.00"); }
    }
}

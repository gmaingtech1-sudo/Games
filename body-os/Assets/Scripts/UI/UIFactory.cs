using System;
using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>Design tokens for the BODY.OS interface (reference resolution 1280x720, landscape).</summary>
    public static class Theme
    {
        public static readonly Color Backdrop = new Color(0.01f, 0.025f, 0.05f, 0.94f);
        public static readonly Color Panel = new Color(0.04f, 0.08f, 0.13f, 0.94f);
        public static readonly Color PanelLight = new Color(0.07f, 0.13f, 0.2f, 0.96f);
        public static readonly Color PanelHud = new Color(0.02f, 0.05f, 0.09f, 0.72f);
        public static readonly Color Line = new Color(0.1f, 0.9f, 1f, 0.45f);
        public static readonly Color Accent = new Color(0.1f, 0.9f, 1f);
        public static readonly Color Accent2 = new Color(0.25f, 0.5f, 1f);
        public static readonly Color Text = Color.white;
        public static readonly Color TextDim = new Color(0.68f, 0.8f, 0.88f);
        public static readonly Color TextMuted = new Color(0.45f, 0.56f, 0.64f);
        public static readonly Color Warning = new Color(1f, 0.72f, 0.2f);
        public static readonly Color Danger = new Color(1f, 0.3f, 0.35f);
        public static readonly Color Success = new Color(0.35f, 1f, 0.6f);
        public static readonly Color Violet = new Color(0.75f, 0.45f, 1f);
        public static readonly Color Health = new Color(1f, 0.35f, 0.4f);
        public static readonly Color Energy = new Color(0.1f, 0.9f, 1f);
        public static readonly Color Suit = new Color(1f, 0.75f, 0.25f);

        public const int H1 = 38, H2 = 29, Body = 24, Small = 20, Tiny = 17, ButtonSize = 25;
        public const float ButtonHeight = 68f, RowHeight = 60f, Touch = 64f;
    }

    public enum ButtonStyle { Primary, Secondary, Ghost, Danger, Tab }

    /// <summary>
    /// Builds every UI element from code using uGUI, so the whole interface shares one design system and
    /// needs no prefabs. All widgets are sized for touch (minimum ~64 reference pixels).
    /// </summary>
    public static class UIFactory
    {
        static Sprite rounded, roundedOutline, circle, ring;

        public static Sprite Rounded { get { EnsureSprites(); return rounded; } }
        public static Sprite RoundedOutline { get { EnsureSprites(); return roundedOutline; } }
        public static Sprite Circle { get { EnsureSprites(); return circle; } }
        public static Sprite Ring { get { EnsureSprites(); return ring; } }

        static void EnsureSprites()
        {
            if (rounded != null) return;
            rounded = MakeRounded(64, 16, 0f, "Rounded");
            roundedOutline = MakeRounded(64, 16, 2.5f, "RoundedOutline");
            circle = MakeCircle(128, 0f, "Circle");
            ring = MakeCircle(128, 6f, "Ring");
        }

        static Sprite MakeRounded(int n, float radius, float stroke, string name)
        {
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { name = name, wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            var px = new Color32[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float dx = Mathf.Max(0f, Mathf.Max(radius - (x + 0.5f), (x + 0.5f) - (n - radius)));
                    float dy = Mathf.Max(0f, Mathf.Max(radius - (y + 0.5f), (y + 0.5f) - (n - radius)));
                    float d = Mathf.Sqrt(dx * dx + dy * dy); // distance into the corner
                    float edge = radius - d;                  // distance to the outer edge (positive inside)
                    if (dx == 0f && dy == 0f) edge = Mathf.Min(Mathf.Min(x + 0.5f, n - x - 0.5f), Mathf.Min(y + 0.5f, n - y - 0.5f));
                    float a = Mathf.Clamp01(edge);
                    if (stroke > 0f) a *= Mathf.Clamp01(stroke - edge + 1f);
                    px[y * n + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            float b = radius + 2f;
            return Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect, new Vector4(b, b, b, b));
        }

        static Sprite MakeCircle(int n, float stroke, string name)
        {
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { name = name, wrapMode = TextureWrapMode.Clamp };
            var px = new Color32[n * n];
            float r = n * 0.5f;
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float d = Mathf.Sqrt((x + 0.5f - r) * (x + 0.5f - r) + (y + 0.5f - r) * (y + 0.5f - r));
                    float a = Mathf.Clamp01(r - d);
                    if (stroke > 0f) a *= Mathf.Clamp01(stroke - (r - d) + 1f);
                    px[y * n + x] = new Color32(255, 255, 255, (byte)(a * 255));
                }
            tex.SetPixels32(px);
            tex.Apply(false, true);
            return Sprite.Create(tex, new Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100f);
        }

        // ------------------------------------------------------------------ Layout helpers

        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            return rt;
        }

        public static RectTransform Stretch(RectTransform rt, float left = 0, float top = 0, float right = 0, float bottom = 0)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(left, bottom);
            rt.offsetMax = new Vector2(-right, -top);
            return rt;
        }

        public static RectTransform Place(RectTransform rt, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = pivot;
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
            return rt;
        }

        public static LayoutElement Layout(Component c, float prefHeight = -1, float prefWidth = -1, float flexWidth = -1, float minHeight = -1)
        {
            var le = c.GetComponent<LayoutElement>();
            if (le == null) le = c.gameObject.AddComponent<LayoutElement>();
            if (prefHeight >= 0) le.preferredHeight = prefHeight;
            if (prefWidth >= 0) le.preferredWidth = prefWidth;
            if (flexWidth >= 0) le.flexibleWidth = flexWidth;
            if (minHeight >= 0) le.minHeight = minHeight;
            return le;
        }

        public static VerticalLayoutGroup VStack(RectTransform rt, float spacing, int pad = 0, bool fitHeight = false)
        {
            var v = rt.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = spacing;
            v.padding = new RectOffset(pad, pad, pad, pad);
            v.childControlWidth = true; v.childControlHeight = true;
            v.childForceExpandWidth = true; v.childForceExpandHeight = false;
            if (fitHeight) rt.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            return v;
        }

        public static HorizontalLayoutGroup HStack(RectTransform rt, float spacing, int pad = 0)
        {
            var h = rt.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = spacing;
            h.padding = new RectOffset(pad, pad, pad, pad);
            h.childControlWidth = true; h.childControlHeight = true;
            h.childForceExpandWidth = false; h.childForceExpandHeight = true;
            h.childAlignment = TextAnchor.MiddleLeft;
            return h;
        }

        // ------------------------------------------------------------------ Elements

        public static Image Image(Transform parent, string name, Color color, Sprite sprite = null, bool raycast = false)
        {
            var rt = Rect(name, parent);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = color;
            img.raycastTarget = raycast;
            if (sprite != null) { img.sprite = sprite; img.type = sprite.border.sqrMagnitude > 0 ? UnityEngine.UI.Image.Type.Sliced : UnityEngine.UI.Image.Type.Simple; }
            return img;
        }

        /// <summary>Rounded panel with a thin holographic outline.</summary>
        public static Image Panel(Transform parent, string name, Color fill, bool outline = true, bool raycast = false)
        {
            var img = Image(parent, name, fill, Rounded, raycast);
            if (outline)
            {
                var o = Image(img.transform, "Outline", Theme.Line, RoundedOutline);
                Stretch(o.rectTransform);
                o.transform.SetAsFirstSibling();
                var le = o.gameObject.AddComponent<LayoutElement>();
                le.ignoreLayout = true;
            }
            return img;
        }

        public static Text Text(Transform parent, string text, int size, Color color, TextAnchor align = TextAnchor.MiddleLeft, FontStyle style = FontStyle.Normal)
        {
            var rt = Rect("Text", parent);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = Art.UIFont;
            t.text = text;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.fontStyle = style;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            t.lineSpacing = 1.05f;
            return t;
        }

        public static Button Button(Transform parent, string label, Action onClick, ButtonStyle style = ButtonStyle.Secondary, float height = Theme.ButtonHeight, int fontSize = Theme.ButtonSize)
        {
            Color fill, text;
            switch (style)
            {
                case ButtonStyle.Primary: fill = new Color(0.1f, 0.75f, 0.9f, 0.95f); text = new Color(0.01f, 0.05f, 0.08f); break;
                case ButtonStyle.Danger: fill = new Color(0.5f, 0.08f, 0.12f, 0.95f); text = Color.white; break;
                case ButtonStyle.Ghost: fill = new Color(1f, 1f, 1f, 0.04f); text = Theme.TextDim; break;
                case ButtonStyle.Tab: fill = new Color(0.05f, 0.1f, 0.16f, 0.9f); text = Theme.TextDim; break;
                default: fill = Theme.PanelLight; text = Theme.Accent; break;
            }
            var img = Panel(parent, "Button", fill, style != ButtonStyle.Primary && style != ButtonStyle.Ghost, true);
            var btn = img.gameObject.AddComponent<Button>();
            btn.targetGraphic = img;
            var colors = btn.colors;
            colors.normalColor = Color.white;
            colors.highlightedColor = new Color(1.1f, 1.1f, 1.1f);
            colors.pressedColor = new Color(0.7f, 0.85f, 0.9f);
            colors.selectedColor = Color.white;
            colors.disabledColor = new Color(0.5f, 0.5f, 0.5f, 0.6f);
            colors.fadeDuration = 0.08f;
            btn.colors = colors;
            var nav = btn.navigation; nav.mode = Navigation.Mode.None; btn.navigation = nav;
            var t = Text(img.transform, label, fontSize, text, TextAnchor.MiddleCenter, FontStyle.Bold);
            Stretch(t.rectTransform, 12, 4, 12, 4);
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.resizeTextForBestFit = true;
            t.resizeTextMinSize = 14;
            t.resizeTextMaxSize = fontSize;
            if (onClick != null)
                btn.onClick.AddListener(() =>
                {
                    AudioManager.I?.Play(style == ButtonStyle.Ghost ? Sfx.UiBack : Sfx.UiClick);
                    onClick();
                });
            Layout(btn, height, -1, -1, height);
            return btn;
        }

        public static Text ButtonLabel(Button b) { return b.GetComponentInChildren<Text>(); }

        public static void SetButtonColor(Button b, Color fill)
        {
            var img = b.targetGraphic as Image;
            if (img != null) img.color = fill;
        }

        public static RectTransform Spacer(Transform parent, float height)
        {
            var rt = Rect("Spacer", parent);
            Layout(rt, height, -1, -1, height);
            return rt;
        }

        public static RectTransform Divider(Transform parent)
        {
            var img = Image(parent, "Divider", new Color(0.1f, 0.9f, 1f, 0.18f));
            Layout(img, 2f, -1, -1, 2f);
            return img.rectTransform;
        }

        /// <summary>A vertical scroll view. Returns the ScrollRect; content is a fitted vertical stack.</summary>
        public static ScrollRect Scroll(Transform parent, out RectTransform content, float spacing = 12f, int pad = 6)
        {
            var root = Rect("Scroll", parent);
            var sr = root.gameObject.AddComponent<ScrollRect>();
            var vp = Rect("Viewport", root);
            Stretch(vp);
            vp.gameObject.AddComponent<RectMask2D>();
            var hit = vp.gameObject.AddComponent<Image>();
            hit.color = new Color(0, 0, 0, 0); // receives drags anywhere in the viewport
            content = Rect("Content", vp);
            content.anchorMin = new Vector2(0, 1); content.anchorMax = new Vector2(1, 1);
            content.pivot = new Vector2(0.5f, 1);
            content.offsetMin = Vector2.zero; content.offsetMax = Vector2.zero;
            VStack(content, spacing, pad, true);
            sr.viewport = vp;
            sr.content = content;
            sr.horizontal = false;
            sr.vertical = true;
            sr.movementType = ScrollRect.MovementType.Elastic;
            sr.scrollSensitivity = 30f;
            sr.inertia = true;
            sr.decelerationRate = 0.12f;
            return sr;
        }
    }

    // ---------------------------------------------------------------------- Widgets (plain classes)

    /// <summary>Horizontal value bar driven by anchors (no sprite fill required).</summary>
    public sealed class UIBar
    {
        public readonly RectTransform Root;
        readonly RectTransform fill;
        readonly Image fillImage;
        float last = -1f;

        public UIBar(Transform parent, Color color, float height)
        {
            var bg = UIFactory.Image(parent, "Bar", new Color(1f, 1f, 1f, 0.08f), UIFactory.Rounded);
            Root = bg.rectTransform;
            UIFactory.Layout(bg, height, -1, -1, height);
            fillImage = UIFactory.Image(Root, "Fill", color, UIFactory.Rounded);
            fill = fillImage.rectTransform;
            fill.anchorMin = Vector2.zero; fill.anchorMax = new Vector2(1, 1);
            fill.offsetMin = Vector2.zero; fill.offsetMax = Vector2.zero;
        }

        public void Set(float fraction)
        {
            fraction = Mathf.Clamp01(fraction);
            if (Mathf.Abs(fraction - last) < 0.002f) return;
            last = fraction;
            fill.anchorMax = new Vector2(Mathf.Max(0.001f, fraction), 1f);
        }

        public void SetColor(Color c) { fillImage.color = c; }
    }

    /// <summary>Integer slider with large handle and -/+ step buttons for precise touch input.</summary>
    public sealed class UISlider
    {
        public readonly RectTransform Root;
        public readonly Slider Slider;
        readonly Action<int> onChange;
        readonly Image fill;

        public UISlider(Transform parent, int min, int max, Action<int> onChange, Color color)
        {
            this.onChange = onChange;
            Root = UIFactory.Rect("SliderRow", parent);
            UIFactory.HStack(Root, 10);
            UIFactory.Layout(Root, Theme.Touch, -1, -1, Theme.Touch);

            UIFactory.Layout(UIFactory.Button(Root, "-", () => Step(-1), ButtonStyle.Secondary, Theme.Touch, 32), Theme.Touch, Theme.Touch);

            var area = UIFactory.Rect("Slider", Root);
            UIFactory.Layout(area, Theme.Touch, -1, 1);
            var bg = UIFactory.Image(area, "Track", new Color(1f, 1f, 1f, 0.1f), UIFactory.Rounded, true);
            bg.rectTransform.anchorMin = new Vector2(0, 0.38f); bg.rectTransform.anchorMax = new Vector2(1, 0.62f);
            bg.rectTransform.offsetMin = Vector2.zero; bg.rectTransform.offsetMax = Vector2.zero;

            var fillArea = UIFactory.Rect("FillArea", area);
            fillArea.anchorMin = new Vector2(0, 0.38f); fillArea.anchorMax = new Vector2(1, 0.62f);
            fillArea.offsetMin = Vector2.zero; fillArea.offsetMax = Vector2.zero;
            fill = UIFactory.Image(fillArea, "Fill", color, UIFactory.Rounded);
            fill.rectTransform.offsetMin = Vector2.zero; fill.rectTransform.offsetMax = Vector2.zero;
            fill.rectTransform.anchorMin = Vector2.zero; fill.rectTransform.anchorMax = new Vector2(0, 1);

            var handleArea = UIFactory.Rect("HandleArea", area);
            UIFactory.Stretch(handleArea, 24, 0, 24, 0);
            var handle = UIFactory.Image(handleArea, "Handle", Color.white, UIFactory.Circle, true);
            handle.preserveAspect = true;
            handle.rectTransform.sizeDelta = new Vector2(48, 0);
            handle.rectTransform.anchorMin = new Vector2(0, 0); handle.rectTransform.anchorMax = new Vector2(0, 1);
            var glow = UIFactory.Image(handle.transform, "Ring", color, UIFactory.Ring);
            UIFactory.Stretch(glow.rectTransform, -4, -4, -4, -4);
            glow.preserveAspect = true;

            Slider = area.gameObject.AddComponent<Slider>();
            Slider.fillRect = fill.rectTransform;
            Slider.handleRect = handle.rectTransform;
            Slider.targetGraphic = handle;
            Slider.direction = UnityEngine.UI.Slider.Direction.LeftToRight;
            Slider.minValue = min; Slider.maxValue = max;
            Slider.wholeNumbers = true;
            var nav = Slider.navigation; nav.mode = Navigation.Mode.None; Slider.navigation = nav;
            Slider.onValueChanged.AddListener(v => this.onChange?.Invoke(Mathf.RoundToInt(v)));

            UIFactory.Layout(UIFactory.Button(Root, "+", () => Step(1), ButtonStyle.Secondary, Theme.Touch, 32), Theme.Touch, Theme.Touch);
        }

        void Step(int d) { onChange?.Invoke(Mathf.RoundToInt(Slider.value) + d); }

        public void Set(int v) { Slider.SetValueWithoutNotify(v); }
        public void SetColor(Color c) { fill.color = c; }
    }

    /// <summary>Toggle switch with a sliding knob.</summary>
    public sealed class UISwitch
    {
        public readonly Button Button;
        readonly Image track;
        readonly RectTransform knob;
        bool value;
        readonly Action<bool> onChange;

        public UISwitch(Transform parent, Action<bool> onChange)
        {
            this.onChange = onChange;
            track = UIFactory.Image(parent, "Switch", new Color(1, 1, 1, 0.12f), UIFactory.Rounded, true);
            UIFactory.Layout(track, 52, 104);
            Button = track.gameObject.AddComponent<Button>();
            Button.targetGraphic = track;
            var nav = Button.navigation; nav.mode = Navigation.Mode.None; Button.navigation = nav;
            var k = UIFactory.Image(track.transform, "Knob", Color.white, UIFactory.Circle);
            knob = k.rectTransform;
            knob.anchorMin = knob.anchorMax = new Vector2(0, 0.5f);
            knob.sizeDelta = new Vector2(44, 44);
            Button.onClick.AddListener(() => { AudioManager.I?.Play(Sfx.UiClick); Set(!value); this.onChange?.Invoke(value); });
            Set(false);
        }

        public void Set(bool v)
        {
            value = v;
            track.color = v ? new Color(0.1f, 0.75f, 0.9f, 0.95f) : new Color(1, 1, 1, 0.12f);
            knob.anchoredPosition = new Vector2(v ? 78 : 26, 0);
        }
    }

    /// <summary>Dropdown selector: shows the current option and opens a touch-friendly option list.</summary>
    public sealed class UIDropdown
    {
        public readonly Button Button;
        readonly Text label;
        readonly string title;
        string[] options;
        int index;
        readonly Action<int> onChange;

        public UIDropdown(Transform parent, string title, string[] options, Action<int> onChange)
        {
            this.title = title; this.options = options; this.onChange = onChange;
            Button = UIFactory.Button(parent, "", Open, ButtonStyle.Secondary, Theme.Touch, Theme.Small + 2);
            label = UIFactory.ButtonLabel(Button);
            UIFactory.Layout(Button, Theme.Touch, 260);
        }

        void Open()
        {
            UIRoot.I.ShowOptions(title, options, index, i => { Set(i); onChange?.Invoke(i); });
        }

        public void SetOptions(string[] newOptions) { options = newOptions; Set(index); }

        public void Set(int i)
        {
            index = Mathf.Clamp(i, 0, options.Length - 1);
            label.text = options.Length > 0 ? options[index] + "  ▼" : "";
        }
    }
}

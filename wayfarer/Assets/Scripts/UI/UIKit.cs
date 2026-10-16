using UnityEngine;

namespace Wayfarer
{
    /// <summary>Colours, fonts, textures and drawing helpers for the IMGUI interface.</summary>
    public static class UIKit
    {
        public static readonly Color Accent = new Color(0.43f, 0.83f, 1f);
        public static readonly Color Warm = new Color(1f, 0.7f, 0.28f);
        public static readonly Color Danger = new Color(1f, 0.35f, 0.3f);
        public static readonly Color Good = new Color(0.45f, 1f, 0.6f);
        public static readonly Color Ink = new Color(0.92f, 0.95f, 1f);
        public static readonly Color Dim = new Color(0.62f, 0.7f, 0.8f);
        public static readonly Color PanelBg = new Color(0.03f, 0.05f, 0.08f, 0.82f);
        public static readonly Color PanelLine = new Color(0.43f, 0.83f, 1f, 0.35f);

        public static Font Font;
        public static Texture2D White, Round, RoundLine, Dot, Ring, Diamond, Glow;
        public static GUIStyle Label, LabelSmall, LabelTiny, LabelBig, LabelHuge, LabelCenter, LabelRight, Title, Button, ButtonSmall, ButtonAccent, Panel, Slot, TextField;
        static bool ready;

        public static void Init()
        {
            if (ready) return;
            ready = true;
            Font = Font.CreateDynamicFontFromOSFont(new[] { "Bahnschrift", "Segoe UI", "Helvetica Neue", "Helvetica", "Arial", "Liberation Sans", "DejaVu Sans" }, 18);
            White = Solid(Color.white);
            Round = RoundRect(32, 7, 0f);
            RoundLine = RoundRect(32, 7, 1.6f);
            Dot = Circle(32, 0f);
            Ring = Circle(64, 3f);
            Diamond = MakeDiamond(32);
            Glow = MakeGlow(64);

            Label = MakeLabel(18, TextAnchor.UpperLeft, Ink);
            LabelSmall = MakeLabel(15, TextAnchor.UpperLeft, Dim);
            LabelTiny = MakeLabel(12, TextAnchor.UpperLeft, Dim);
            LabelBig = MakeLabel(24, TextAnchor.UpperLeft, Ink);
            LabelHuge = MakeLabel(34, TextAnchor.UpperLeft, Ink);
            LabelCenter = MakeLabel(18, TextAnchor.MiddleCenter, Ink);
            LabelRight = MakeLabel(18, TextAnchor.UpperRight, Ink);
            Title = MakeLabel(96, TextAnchor.MiddleCenter, Ink);
            Title.fontStyle = FontStyle.Bold;
            LabelBig.fontStyle = FontStyle.Bold;
            LabelHuge.fontStyle = FontStyle.Bold;
            foreach (var s in new[] { Label, LabelSmall, LabelTiny, LabelBig, LabelHuge, LabelCenter, LabelRight })
            {
                s.wordWrap = true;
                s.richText = true;
            }

            Button = new GUIStyle
            {
                font = Font, fontSize = 18, alignment = TextAnchor.MiddleCenter, border = new RectOffset(8, 8, 8, 8),
                padding = new RectOffset(14, 14, 8, 8), richText = true,
            };
            Button.normal.background = Tinted(Round, new Color(0.1f, 0.16f, 0.22f, 0.92f));
            Button.hover.background = Tinted(Round, new Color(0.16f, 0.28f, 0.38f, 0.95f));
            Button.active.background = Tinted(Round, new Color(0.3f, 0.55f, 0.7f, 1f));
            Button.normal.textColor = Ink;
            Button.hover.textColor = Color.white;
            Button.active.textColor = Color.white;
            ButtonSmall = new GUIStyle(Button) { fontSize = 15, padding = new RectOffset(8, 8, 4, 4) };
            ButtonAccent = new GUIStyle(Button);
            ButtonAccent.normal.background = Tinted(Round, new Color(0.18f, 0.5f, 0.68f, 0.95f));
            ButtonAccent.hover.background = Tinted(Round, new Color(0.26f, 0.64f, 0.85f, 1f));
            ButtonAccent.active.background = Tinted(Round, new Color(0.4f, 0.8f, 1f, 1f));

            Panel = new GUIStyle { border = new RectOffset(8, 8, 8, 8) };
            Panel.normal.background = Tinted(Round, PanelBg);
            Slot = new GUIStyle(Button) { fontSize = 13, alignment = TextAnchor.LowerCenter, padding = new RectOffset(4, 4, 4, 6), wordWrap = true };
            Slot.normal.background = Tinted(Round, new Color(0.08f, 0.12f, 0.17f, 0.95f));
            TextField = new GUIStyle(Button) { alignment = TextAnchor.MiddleLeft };
            TextField.normal.background = Tinted(Round, new Color(0.02f, 0.03f, 0.05f, 0.95f));
            TextField.focused.background = Tinted(Round, new Color(0.05f, 0.1f, 0.15f, 1f));
            TextField.focused.textColor = Color.white;
        }

        static GUIStyle MakeLabel(int size, TextAnchor anchor, Color c)
        {
            var s = new GUIStyle { font = Font, fontSize = size, alignment = anchor };
            s.normal.textColor = c;
            return s;
        }

        static Texture2D Solid(Color c)
        {
            var t = new Texture2D(2, 2, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
            t.SetPixels(new[] { c, c, c, c });
            t.Apply();
            return t;
        }

        static Texture2D RoundRect(int size, float radius, float line)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave, filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            float half = size * 0.5f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    // signed distance to a rounded square
                    float qx = Mathf.Abs(x + 0.5f - half) - (half - radius);
                    float qy = Mathf.Abs(y + 0.5f - half) - (half - radius);
                    float outside = new Vector2(Mathf.Max(qx, 0f), Mathf.Max(qy, 0f)).magnitude;
                    float d = outside + Mathf.Min(Mathf.Max(qx, qy), 0f) - radius;
                    float a = Mathf.Clamp01(0.5f - d);
                    if (line > 0f) a *= Mathf.Clamp01(d + line + 0.5f);
                    t.SetPixel(x, y, new Color(1, 1, 1, a));
                }
            t.Apply();
            return t;
        }

        static Texture2D Circle(int size, float line)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave, filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            float r = size * 0.5f - 1f;
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(size * 0.5f, size * 0.5f));
                    float a = Mathf.Clamp01(r - d + 0.5f);
                    if (line > 0) a *= Mathf.Clamp01(d - (r - line) + 0.5f);
                    t.SetPixel(x, y, new Color(1, 1, 1, a));
                }
            t.Apply();
            return t;
        }

        static Texture2D MakeDiamond(int size)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave, filterMode = FilterMode.Bilinear };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d = Mathf.Abs(x + 0.5f - size * 0.5f) + Mathf.Abs(y + 0.5f - size * 0.5f);
                    float a = Mathf.Clamp01(size * 0.5f - 1f - d);
                    t.SetPixel(x, y, new Color(1, 1, 1, a));
                }
            t.Apply();
            return t;
        }

        static Texture2D MakeGlow(int size)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave, filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(size * 0.5f, size * 0.5f)) / (size * 0.5f);
                    float a = Mathf.Clamp01(Mathf.Exp(-d * d * 5f) * 1.2f - 0.02f);
                    t.SetPixel(x, y, new Color(1, 1, 1, a));
                }
            t.Apply();
            return t;
        }

        static Texture2D Tinted(Texture2D src, Color c)
        {
            var t = new Texture2D(src.width, src.height, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave, filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            var px = src.GetPixels();
            for (int i = 0; i < px.Length; i++) px[i] = new Color(c.r, c.g, c.b, c.a * px[i].a);
            t.SetPixels(px);
            t.Apply();
            return t;
        }

        // ───────────────────────────── drawing ────────────────────────────
        public static void Rect(Rect r, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, White);
            GUI.color = old;
        }

        public static void PanelBox(Rect r, float alpha = 1f)
        {
            var old = GUI.color;
            GUI.color = new Color(1, 1, 1, alpha);
            GUI.Box(r, GUIContent.none, Panel);
            GUI.color = new Color(PanelLine.r, PanelLine.g, PanelLine.b, PanelLine.a * alpha);
            GUI.DrawTexture(r, RoundLine, ScaleMode.StretchToFill);
            GUI.color = old;
        }

        public static void Tex(Rect r, Texture2D t, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, t);
            GUI.color = old;
        }

        public static void Text(Rect r, string s, GUIStyle style, Color? color = null, bool shadow = true)
        {
            var old = style.normal.textColor;
            if (shadow)
            {
                style.normal.textColor = new Color(0, 0, 0, 0.7f);
                GUI.Label(new Rect(r.x + 1.5f, r.y + 1.5f, r.width, r.height), s, style);
            }
            style.normal.textColor = color ?? old;
            GUI.Label(r, s, style);
            style.normal.textColor = old;
        }

        public static void Bar(Rect r, float value, Color fill, Color? back = null)
        {
            Rect(r, back ?? new Color(1, 1, 1, 0.12f));
            Rect(new Rect(r.x, r.y, r.width * Mathf.Clamp01(value), r.height), fill);
        }

        public static bool Btn(Rect r, string label, bool accent = false, bool small = false)
        {
            bool clicked = GUI.Button(r, label, accent ? ButtonAccent : small ? ButtonSmall : Button);
            if (clicked && Game.I != null) Game.I.Audio.Play(Sfx.Click, 0.6f);
            return clicked;
        }

        public static string Hex(Color c) => ColorUtility.ToHtmlStringRGB(c);
    }
}

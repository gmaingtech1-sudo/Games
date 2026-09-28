// Riftborn — all the 2D interface, drawn with Unity's immediate-mode GUI:
// the HUD on the map, the sheets for Rifts, caches, creatures and teams,
// sign-up, pop-ups and toasts. Layout is in "virtual" points (a phone is
// about 390 wide) and scaled to real pixels so text stays sharp.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Riftborn
{
    public class UI : MonoBehaviour
    {
        public static UI I;
        public static float Scale = 1;
        public static float W = 390, H = 800;
        public static Rect Safe;

        // True when the pointer is on the interface (so the map ignores it).
        public static bool Blocking => I != null && I.IsBlocking();

        /* ------------------ Styles ------------------ */

        static float builtFor;
        static Texture2D round, white;
        public static GUIStyle Box, Btn0, Title, Big, H2, Body, Small, Mid, Field, Tiny;
        public static readonly Color Ink = new Color(0.03f, 0.07f, 0.085f, 0.95f);
        public static readonly Color Teal = new Color(0.18f, 0.9f, 0.77f);
        public static readonly Color Dim = new Color(0.6f, 0.7f, 0.72f);

        static Texture2D RoundTex(int size, float r)
        {
            return Tex.Make(size, size, (x, y) =>
            {
                float cx = Mathf.Clamp(x + 0.5f, r, size - r), cy = Mathf.Clamp(y + 0.5f, r, size - r);
                float d = Vector2.Distance(new Vector2(x + 0.5f, y + 0.5f), new Vector2(cx, cy));
                return new Color(1, 1, 1, Mathf.Clamp01(r - d + 0.5f));
            }, false, TextureWrapMode.Clamp);
        }

        static GUIStyle Text(int size, FontStyle fs, Color c, TextAnchor a = TextAnchor.UpperLeft, bool wrap = true)
        {
            var s = new GUIStyle(GUI.skin.label) { fontSize = Mathf.RoundToInt(size * Scale), fontStyle = fs, alignment = a, wordWrap = wrap, richText = true, clipping = TextClipping.Clip };
            s.normal.textColor = c;
            s.padding = new RectOffset(0, 0, 0, 0);
            s.margin = new RectOffset(0, 0, 0, 0);
            return s;
        }

        static void Styles()
        {
            if (Box != null && builtFor == Scale) return;
            builtFor = Scale;
            int r = Mathf.RoundToInt(12 * Scale);
            if (round) Destroy(round);
            round = RoundTex(r * 2 + 4, r);
            white = Texture2D.whiteTexture;
            Box = new GUIStyle { border = new RectOffset(r + 1, r + 1, r + 1, r + 1) };
            Box.normal.background = round;
            Btn0 = new GUIStyle(Box) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold, fontSize = Mathf.RoundToInt(15 * Scale), richText = true, wordWrap = true };
            Btn0.normal.textColor = Color.white;
            Btn0.hover.background = round; Btn0.hover.textColor = Color.white;
            Btn0.active.background = round; Btn0.active.textColor = new Color(1, 1, 1, 0.7f);
            Title = Text(30, FontStyle.Bold, Color.white, TextAnchor.MiddleCenter);
            Big = Text(21, FontStyle.Bold, Color.white);
            H2 = Text(16, FontStyle.Bold, Color.white);
            Body = Text(14, FontStyle.Normal, new Color(0.86f, 0.92f, 0.93f));
            Mid = Text(14, FontStyle.Normal, new Color(0.86f, 0.92f, 0.93f), TextAnchor.MiddleCenter);
            Small = Text(12, FontStyle.Normal, Dim);
            Tiny = Text(11, FontStyle.Normal, Dim, TextAnchor.UpperLeft, false);
            Field = new GUIStyle(GUI.skin.textField) { fontSize = Mathf.RoundToInt(18 * Scale), alignment = TextAnchor.MiddleLeft };
            Field.padding = new RectOffset(r, r, 0, 0);
        }

        /* ------------------ Drawing helpers (virtual units) ------------------ */

        public static Rect P(Rect r) => new Rect(r.x * Scale, r.y * Scale, r.width * Scale, r.height * Scale);

        public static void Panel(Rect r, Color c)
        {
            var old = GUI.backgroundColor;
            GUI.backgroundColor = c;
            GUI.Box(P(r), GUIContent.none, Box);
            GUI.backgroundColor = old;
            if (Event.current.type == EventType.Repaint && I) I.building.Add(r);
        }
        public static void Fill(Rect r, Color c)
        {
            var old = GUI.color; GUI.color = c;
            GUI.DrawTexture(P(r), white);
            GUI.color = old;
        }
        public static void Label(Rect r, string text, GUIStyle s) => GUI.Label(P(r), text, s);
        public static float HeightOf(string text, GUIStyle s, float w) => s.CalcHeight(new GUIContent(text), w * Scale) / Scale;

        public static bool Button(Rect r, string text, Color? c = null, bool on = true)
        {
            var old = GUI.backgroundColor;
            GUI.backgroundColor = on ? (c ?? new Color(0.12f, 0.55f, 0.5f)) : new Color(0.25f, 0.28f, 0.3f, 0.9f);
            var oc = GUI.contentColor;
            if (!on) GUI.contentColor = new Color(1, 1, 1, 0.5f);
            bool hit = GUI.Button(P(r), text, Btn0);
            GUI.backgroundColor = old; GUI.contentColor = oc;
            if (Event.current.type == EventType.Repaint && I) I.building.Add(r);
            if (hit && (!on || (I != null && I.dragged))) return false;
            if (hit) Sfx.Play("tap", 0.6f);
            return hit;
        }

        public static void Bar(Rect r, float frac, Color c)
        {
            Fill(r, new Color(1, 1, 1, 0.12f));
            Fill(new Rect(r.x, r.y, r.width * Mathf.Clamp01(frac), r.height), c);
        }

        public static string Hex(Color c) => "#" + ColorUtility.ToHtmlStringRGB(c);
        public static string Col(string text, Color c) => $"<color={Hex(c)}>{text}</color>";
        public static string Clock(long ms) { long s = (ms + 999) / 1000; return $"{s / 60}:{s % 60:00}"; }
        public static string Dist(double m) => m < 1000 ? $"{Math.Round(m)} m" : $"{m / 1000:0.0} km";

        /* ------------------ State ------------------ */

        readonly List<Rect> building = new List<Rect>();
        List<Rect> hud = new List<Rect>();
        object sheet;                    // Rift, Cache, Spawn, Creature or a page name
        object back;                     // where "Back" goes from a creature
        Vector2 scroll;
        bool dragged; float dragTotal;
        class Popup { public string title, body, portrait; public Color color; public List<(string label, Action act)> buttons = new List<(string, Action)>(); }
        readonly List<Popup> popups = new List<Popup>();
        readonly List<(string text, Color color, float t)> toasts = new List<(string, Color, float)>();

        // Onboarding
        int step; string draftName = ""; string draftTeam, draftStarter = "cindertail";

        public bool SheetOpen => sheet != null || popups.Count > 0;

        void Awake() { I = this; }

        bool IsBlocking() => Game.I == null || Game.I.mode != Game.Mode.Map || SheetOpen || OverHud;

        // The pointer is on a panel or button drawn last frame.
        public static bool OverHud
        {
            get
            {
                if (I == null) return false;
                var p = Inp.Pos;
                var v = new Vector2(p.x / Scale, (Screen.height - p.y) / Scale);
                return I.hud.Any((r) => r.Contains(v)) || I.popups.Count > 0;
            }
        }

        public void Open(object what) { sheet = what; scroll = Vector2.zero; back = null; Sfx.Play("tap", 0.5f); }
        public void Close() { sheet = null; back = null; }

        public void Toast(string text, Color? c = null) { toasts.Add((text, c ?? Color.white, Time.time)); if (toasts.Count > 4) toasts.RemoveAt(0); }

        public void Message(string title, string body, Color? color = null, params (string, Action)[] buttons)
        {
            var p = new Popup { title = title, body = body, color = color ?? Teal };
            p.buttons.AddRange(buttons.Length > 0 ? buttons : new[] { ("OK", (Action)null) });
            popups.Add(p);
        }

        public void Confirm(string title, string body, string yes, Action act) => Message(title, body, Teal, (yes, act), ("Cancel", null));

        // Shows what an action did: an error toast, or a pop-up, plus level ups.
        public bool Show(Result res, string title = null, string body = null)
        {
            if (!res.ok) { if (!string.IsNullOrEmpty(res.why)) { Toast(res.why, new Color(1, 0.55f, 0.55f)); Sfx.Play("error"); } return false; }
            if (title != null) Message(title, body);
            if (res.levelUp > 0) LevelUp(res.levelUp);
            return true;
        }

        public void LevelUp(int L)
        {
            Sfx.Play("win");
            Message($"Level {L}!", $"You're now a {GameState.Title(L)}.\nBonus: {5 + L} orbs, {10 + L * 2} darts and {3 + L / 2} shards.", new Color(1, 0.85f, 0.3f));
        }

        /* ------------------ Eggs ------------------ */

        public static readonly Color ApexRed = new Color(1, 0.23f, 0.36f);
        static Texture2D eggTex;

        // A speckled egg shape, tinted with GUI.color when drawn.
        static Texture2D EggTex => eggTex ? eggTex : eggTex = Tex.Make(64, 80, (x, y) =>
        {
            float u = (x + 0.5f - 32) / 29f, v = (y + 0.5f - 36) / 38f;
            float wv = 1 - (v > 0 ? v * 0.28f : 0);                    // narrower at the top
            float d = Mathf.Sqrt(u * u / (wv * wv) + v * v);
            float a = Mathf.Clamp01((1 - d) * 30);
            float shade = 0.72f + 0.28f * Mathf.Clamp01(0.7f - u * 0.6f + v * 0.3f);
            bool speck = Tex.Noise(x / 5f, y / 5f, 77) > 0.72f;
            float c = speck ? shade * 0.55f : shade;
            return new Color(c, c, c, a);
        }, false, TextureWrapMode.Clamp);

        public static void EggIcon(Rect r, int km)
        {
            var old = GUI.color; GUI.color = GameState.Eggs[km].color;
            GUI.DrawTexture(P(r), EggTex, ScaleMode.ScaleToFit, true);
            GUI.color = old;
        }

        void FoundEgg(Egg e)
        {
            if (e == null) return;
            Toast($"You found a {GameState.Eggs[e.km].name}!{(e.inc ? " It's incubating — walk to hatch it." : "")}", GameState.Eggs[e.km].color);
        }

        public void Hatched(Result h)
        {
            var sp = h.creature.Species; var rar = Species.Rarities[sp.rar];
            Sfx.Play("caught");
            var p = new Popup
            {
                title = $"{sp.name} hatched!",
                body = $"Your {h.egg.km} km egg hatched.\n{Col(rar.name, rar.color)} · Level {h.creature.lvl} · Power {h.creature.Power}\n+{h.dnaN} {sp.name} DNA · +{GameState.Eggs[h.egg.km].xp} XP",
                color = GameState.Eggs[h.egg.km].color,
                portrait = sp.id,
            };
            p.buttons.Add(("Nice!", null));
            popups.Add(p);
            if (h.levelUp > 0) LevelUp(h.levelUp);
        }

        void EggsSheet()
        {
            var eggs = GameState.save.eggs;
            Line($"Eggs ({eggs.Count} / {GameState.MAX_EGGS})", Big, 2);
            Line($"{GameState.INCUBATORS} incubators. Eggs in them hatch as you walk. Longer eggs hold rarer creatures.", Small, 10);
            if (eggs.Count == 0) { Line("No eggs yet. You find them in supply caches, sometimes when hacking Rifts, and from Apex raids.", Body); return; }
            foreach (var e in eggs.OrderByDescending((x) => x.inc).ToList())
            {
                var k = GameState.Eggs[e.km];
                var row = new Rect(0, sy, sw, 64);
                Panel(row, new Color(1, 1, 1, 0.06f));
                EggIcon(new Rect(10, sy + 8, 38, 48), e.km);
                Label(new Rect(58, sy + 8, sw - 170, 20), Col(k.name, k.color), H2);
                if (e.inc)
                {
                    Label(new Rect(58, sy + 28, sw - 70, 16), $"Incubating · {Dist(e.walked)} of {e.km} km", Small);
                    Bar(new Rect(58, sy + 48, sw - 72, 6), (float)(e.walked / (e.km * 1000.0)), k.color);
                }
                else
                {
                    Label(new Rect(58, sy + 30, sw - 170, 16), "Waiting for an incubator", Small);
                    if (Button(new Rect(sw - 104, sy + 14, 94, 36), "Incubate", k.color * 0.6f, eggs.Count((x) => x.inc) < GameState.INCUBATORS))
                        Show(GameState.Incubate(e));
                }
                sy += 72;
            }
            Line("Odds: 2 km — mostly Common. 5 km — Common to Epic. 10 km — Rare, Epic and Legendary.", Small);
        }

        public void ResetOnboarding() { step = 0; draftName = ""; draftTeam = null; draftStarter = "cindertail"; sheet = null; popups.Clear(); }

        /* ------------------ Frame ------------------ */

        void OnGUI()
        {
            Scale = Mathf.Max(1, Mathf.Min(Screen.width, Screen.height) / 390f);
            W = Screen.width / Scale; H = Screen.height / Scale;
            var sa = Screen.safeArea;
            Safe = new Rect(sa.x / Scale, (Screen.height - sa.yMax) / Scale, sa.width / Scale, sa.height / Scale);
            Styles();
            var e = Event.current;
            if (e.type == EventType.Layout) building.Clear();
            TrackDrag(e);

            if (Game.I != null)
            {
                switch (Game.I.mode)
                {
                    case Game.Mode.Onboard: Onboarding(); break;
                    case Game.Mode.Map: Hud(); if (sheet != null) Sheet(); break;
                    case Game.Mode.Encounter: Game.I.encounter.DrawGUI(); break;
                    case Game.Mode.Battle: Game.I.battle.DrawGUI(); break;
                }
            }
            if (popups.Count > 0) DrawPopup(popups[0]);
            DrawToasts();
            if (e.type == EventType.Repaint) hud = new List<Rect>(building);
        }

        void TrackDrag(Event e)
        {
            if (e.type == EventType.MouseDown) { dragged = false; dragTotal = 0; }
            else if (e.type == EventType.MouseDrag)
            {
                dragTotal += e.delta.magnitude;
                if (dragTotal > 10 * Scale) dragged = true;
                scroll.y -= e.delta.y / Scale;
            }
            else if (e.type == EventType.ScrollWheel) scroll.y += e.delta.y * 12;
        }

        /* ------------------ HUD ------------------ */

        void Hud()
        {
            var s = GameState.save;
            var me = GameState.Me;
            float top = Safe.y + 8, left = Safe.x + 8, right = Safe.xMax - 8;
            var card = new Rect(left, top, 200, 62);
            Panel(card, Ink);
            Fill(new Rect(card.x + 8, card.y + 10, 4, card.height - 20), me.color);
            Label(new Rect(card.x + 20, card.y + 8, 172, 20), s.agent.name, H2);
            int L = GameState.Level;
            Label(new Rect(card.x + 20, card.y + 28, 172, 16), $"Lv {L} {GameState.Title(L)} · {Col(me.name, me.color)}", Small);
            Bar(new Rect(card.x + 20, card.y + 48, 168, 5), GameState.LevelFrac, me.color);

            var inv = new Rect(right - 118, top, 118, 62);
            Panel(inv, Ink);
            Label(new Rect(inv.x + 12, inv.y + 7, 100, 16), $"{Col("●", GameState.Me.color)} Orbs  <b>{s.items.orbs}</b>", Small);
            Label(new Rect(inv.x + 12, inv.y + 24, 100, 16), $"{Col("●", new Color(1, 0.88f, 0.3f))} Darts  <b>{s.items.darts}</b>", Small);
            Label(new Rect(inv.x + 12, inv.y + 41, 100, 16), $"{Col("●", new Color(0.7f, 0.5f, 1f))} Shards  <b>{s.items.shards}</b>", Small);

            // Eggs: the one closest to hatching; tap for the egg bag.
            if (s.eggs.Count > 0)
            {
                var er = new Rect(inv.x, inv.yMax + 6, inv.width, 44);
                if (Button(er, "", Ink)) Open("eggs");
                var next = s.eggs.Where((e) => e.inc).OrderBy((e) => e.km * 1000 - e.walked).FirstOrDefault();
                EggIcon(new Rect(er.x + 8, er.y + 6, 26, 32), next != null ? next.km : s.eggs[0].km);
                Label(new Rect(er.x + 40, er.y + 6, er.width - 46, 16), $"Eggs  <b>{s.eggs.Count}</b>", Small);
                if (next != null)
                {
                    Label(new Rect(er.x + 40, er.y + 20, er.width - 46, 14), $"{Math.Max(0, next.km - next.walked / 1000):0.0} km to hatch", Tiny);
                    Bar(new Rect(er.x + 40, er.y + 35, er.width - 50, 4), (float)(next.walked / (next.km * 1000.0)), GameState.Eggs[next.km].color);
                }
            }

            string gps = Game.I.GpsNote;
            if (!string.IsNullOrEmpty(gps))
            {
                float w = Mathf.Min(W - 16, 330), hh = HeightOf(gps, Small, w - 20) + 12;
                var g = new Rect((W - w) / 2, card.yMax + 8, w, hh);
                Panel(g, new Color(0, 0, 0, 0.6f));
                Label(new Rect(g.x + 10, g.y + 6, w - 20, hh), gps, Small);
            }

            // What's in reach, so you know to tap it.
            bool joy = Game.I.walkMode && Application.isMobilePlatform;
            if (joy)
            {
                var jr = Game.JoyRect;
                Panel(jr, new Color(0, 0, 0, 0.35f));
                var c = jr.center + new Vector2(Game.Joy.x, -Game.Joy.y) * jr.width * 0.3f;
                Panel(new Rect(c.x - 24, c.y - 24, 48, 48), new Color(1, 1, 1, 0.4f));
            }
            var near = Game.I.InReach();
            if (!string.IsNullOrEmpty(near))
            {
                float x0 = joy ? Game.JoyRect.xMax + 8 : 8;
                float w = Mathf.Min(W - 8 - x0, 330);
                var g = new Rect(joy ? x0 : (W - w) / 2, Safe.yMax - 118, w, 30);
                Panel(g, new Color(0, 0, 0, 0.55f));
                Label(g, near, Mid);
            }

            float bw = Mathf.Min(90, (Safe.width - 16 - 18) / 4), by = Safe.yMax - 64, bx = Safe.x + (Safe.width - bw * 4 - 18) / 2;
            if (Button(new Rect(bx, by, bw, 52), "Creatures", Ink)) Open("beasts");
            if (Button(new Rect(bx + (bw + 6), by, bw, 52), "Teams", Ink)) Open("teams");
            if (Button(new Rect(bx + (bw + 6) * 2, by, bw, 52), "Center", Ink)) { Game.I.map.Yaw = 0; Game.I.map.Zoom(140 / Mathf.Max(1, Game.I.map.CamDist)); }
            if (Button(new Rect(bx + (bw + 6) * 3, by, bw, 52), "Settings", Ink)) Open("settings");
        }

        /* ------------------ Sheets ------------------ */

        float sy, sw;   // cursor while laying out a sheet

        void Sheet()
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.3f));
            float w = Mathf.Min(W - 16, 440), h = Mathf.Min(Safe.height - 40, 600);
            var r = new Rect((W - w) / 2, Safe.yMax - h - 8, w, h);
            Panel(r, Ink);
            if (Button(new Rect(r.xMax - 44, r.y + 8, 36, 36), "×", new Color(1, 1, 1, 0.12f))) { Close(); return; }
            sw = w - 32;
            var view = new Rect(r.x + 16, r.y + 12, w - 32, h - 20);
            float contentH = Mathf.Max(view.height, lastContentH);
            scroll.y = Mathf.Clamp(scroll.y, 0, Mathf.Max(0, contentH - view.height));
            GUI.BeginScrollView(P(view), new Vector2(0, scroll.y * Scale), P(new Rect(0, 0, view.width - 1, contentH)), GUIStyle.none, GUIStyle.none);
            sy = 0;
            switch (sheet)
            {
                case Rift rift: RiftSheet(rift); break;
                case Cache c: CacheSheet(c); break;
                case Spawn sp: SpawnSheet(sp); break;
                case Creature cr: CreatureSheet(cr); break;
                case "beasts": BeastsSheet(); break;
                case "teams": TeamsSheet(); break;
                case "settings": SettingsSheet(); break;
                case "eggs": EggsSheet(); break;
            }
            lastContentH = sy + 12;
            GUI.EndScrollView();
            // Tap outside to close.
            var e = Event.current;
            if (e.type == EventType.MouseUp && !dragged && !P(r).Contains(e.mousePosition)) { Close(); e.Use(); }
        }
        float lastContentH;

        void Line(string text, GUIStyle s, float gap = 6)
        {
            float h = HeightOf(text, s, sw - 44);
            Label(new Rect(0, sy, sw - (sy < 40 ? 44 : 0), h + 2), text, s);
            sy += h + gap;
        }
        bool SheetButton(string text, Color? c = null, bool on = true, float h = 48)
        {
            bool hit = Button(new Rect(0, sy, sw, h), text, c, on);
            sy += h + 8;
            return hit;
        }
        void SheetBar(float frac, Color c) { Bar(new Rect(0, sy, sw, 8), frac, c); sy += 16; }
        void Portrait(string id, float size = 200)
        {
            var tex = Preview.Show(id);
            GUI.DrawTexture(P(new Rect((sw - size) / 2, sy, size, size)), tex, ScaleMode.ScaleToFit, true);
            sy += size + 4;
        }

        double DistTo(double la, double ln) => World.Dist(Game.I.map.lat, Game.I.map.lng, la, ln);

        void OutOfRange(double d) => Line($"You're {Dist(d)} away. Get within {GameState.RANGE} m to use it.", Small, 10);

        void RiftSheet(Rift r)
        {
            var st = GameState.State(r);
            double d = DistTo(r.lat, r.lng);
            bool reach = d <= GameState.RANGE;
            var mine = GameState.save.agent.faction;
            Line(r.name, Big, 2);
            var f = st.faction != null ? GameState.Factions[st.faction] : null;
            Line(f != null ? $"{Col(f.name, f.color)} · Level {st.level}{(st.mine ? " · yours" : "")}" : Col("Unclaimed", GameState.Neutral), Body, 8);
            if (f != null)
            {
                Line($"Charge {st.health}%", Small, 3);
                SheetBar(st.health / 100f, f.color);
                if (st.guard.Count > 0)
                {
                    Line(st.faction == mine ? "Guarded by" : "Guardians", H2, 4);
                    foreach (var g in st.guard)
                    {
                        var sp = g.Species;
                        Line($"{sp.name}  {Col($"Lv {g.lvl} · {Species.Elements[sp.el].name}", Species.Elements[sp.el].color)}  · Power {g.Power}", Body, 3);
                    }
                    sy += 6;
                }
                if (st.faction == "H") Line(Col("The Hollow hold this Rift. Beat their guardians to purge it (1.5× XP).", f.color), Small, 10);
            }
            else Line($"Claim it for the {GameState.Me.name} with {GameState.CLAIM_COST} Rift Shards. Your lead creature will guard it.", Small, 10);

            // An Apex has taken this Rift over today.
            var apex = GameState.ApexAt(r);
            if (apex != null)
            {
                var asp = apex.boss.Species; var ael = Species.Elements[asp.el];
                float top = sy;
                sy += 10;
                Line(Col($"<b>APEX {asp.name}</b>", ApexRed), H2, 2);
                Line($"Level {apex.boss.lvl} · {Col(ael.name, ael.color)} · 3× health", Small, 4);
                Portrait(asp.id, 150);
                Line(apex.beaten ? "You beat it today. A new Apex rises tomorrow."
                    : $"Beat it with your team for {apex.dna} {asp.name} DNA, supplies, big XP and maybe a 10 km egg. Today only.", Small, 8);
                Fill(new Rect(0, top, 3, sy - top), ApexRed);
                sy += 6;
            }

            if (!reach) { OutOfRange(d); return; }
            if (apex != null && !apex.beaten && SheetButton("Battle the Apex", ApexRed * 0.75f))
            {
                Close();
                Game.I.StartRaid(r);
                return;
            }
            long wait = GameState.HackWait(r);
            if (SheetButton(wait > 0 ? $"Hack again in {Clock(wait)}" : "Hack", null, wait == 0))
            {
                var res = GameState.Hack(r);
                if (res.ok) { Sfx.Play("hack"); Toast($"Hacked: {res.loot}", Teal); FoundEgg(res.egg); }
                Show(res);
                GameState.Save();
            }
            if (st.faction == null)
            {
                if (SheetButton($"Claim ({GameState.CLAIM_COST} shards)", GameState.Me.color * 0.8f))
                {
                    var res = GameState.Claim(r);
                    if (res.ok) { Sfx.Play("caught"); Toast($"{r.name} is now held by the {GameState.Me.name}!", GameState.Me.color); }
                    Show(res);
                    GameState.Save();
                    Game.I.Refresh();
                }
            }
            else if (st.faction == mine)
            {
                if (SheetButton("Recharge (2 shards)", null, st.health < 100))
                {
                    var res = GameState.Recharge(r);
                    if (res.ok) { Sfx.Play("loot"); Toast("Recharged to 100%", Teal); }
                    Show(res);
                    GameState.Save();
                    Game.I.Refresh();
                }
            }
            else if (SheetButton("Battle the guardians", new Color(0.75f, 0.2f, 0.25f)))
            {
                Close();
                Game.I.StartBattle(r);
            }
        }

        void CacheSheet(Cache c)
        {
            Line(c.name, Big, 2);
            Line("A supply cache left by field agents: orbs, darts, shards, and sometimes an egg.", Body, 10);
            double d = DistTo(c.lat, c.lng);
            if (d > GameState.RANGE) { OutOfRange(d); return; }
            long wait = GameState.CacheWait(c);
            if (SheetButton(wait > 0 ? $"Refills in {Clock(wait)}" : "Open", null, wait == 0))
            {
                var res = GameState.OpenCache(c);
                if (res.ok) { Sfx.Play("loot"); Toast($"Got {res.loot}", Teal); FoundEgg(res.egg); }
                Show(res);
                Game.I.Refresh();
            }
        }

        void SpawnSheet(Spawn s)
        {
            var sp = Species.ById(s.sp);
            var rar = Species.Rarities[sp.rar];
            var el = Species.Elements[sp.el];
            Line(Col(sp.name, rar.color), Big, 2);
            Line($"{Col(rar.name, rar.color)} · {Col(el.name, el.color)} · Level {GameState.SpawnLevel(s)}", Body, 4);
            Portrait(sp.id, 190);
            Line(sp.blurb, Body, 6);
            Line(GameState.CaughtCount(sp.id) > 0 ? $"You've caught {GameState.CaughtCount(sp.id)}. DNA: {GameState.Dna(sp.id)}" : "You haven't caught one yet.", Small, 10);
            double d = DistTo(s.lat, s.lng);
            if (d > GameState.RANGE) { OutOfRange(d); return; }
            if (GameState.save.items.orbs <= 0 && GameState.save.items.darts <= 0) { Line("You're out of orbs and darts. Hack Rifts or open caches.", Small); return; }
            if (SheetButton("Encounter in AR", el.color * 0.75f)) { Close(); Game.I.StartEncounter(s); }
        }

        void BeastsSheet()
        {
            var list = GameState.save.creatures.OrderByDescending((c) => c.Power).ToList();
            int dex = Species.All.Count((sp) => GameState.CaughtCount(sp.id) > 0);
            Line($"Creatures ({list.Count})", Big, 2);
            Line($"Dex: {dex} / {Species.All.Length} species caught · Team: tap a creature to add it", Small, 10);
            if (SheetButton($"Eggs ({GameState.save.eggs.Count})", new Color(1, 1, 1, 0.1f), true, 40)) { sheet = "eggs"; scroll = Vector2.zero; }
            var team = GameState.Team();
            foreach (var c in list)
            {
                var sp = c.Species; var el = Species.Elements[sp.el]; var rar = Species.Rarities[sp.rar];
                var row = new Rect(0, sy, sw, 54);
                if (Button(row, "", new Color(1, 1, 1, 0.07f))) { sheet = c; back = "beasts"; scroll = Vector2.zero; }
                Fill(new Rect(10, sy + 12, 4, 30), el.color);
                Label(new Rect(22, sy + 8, sw - 120, 20), $"{Col(sp.name, rar.color)}{(team.Contains(c) ? "  " + Col("TEAM", Teal) : "")}", H2);
                Label(new Rect(22, sy + 29, sw - 120, 18), $"Lv {c.lvl} · {el.name} · {rar.name}", Small);
                Label(new Rect(sw - 100, sy + 17, 90, 20), $"<b>{c.Power}</b> CP", new GUIStyle(Body) { alignment = TextAnchor.UpperRight });
                sy += 60;
            }
        }

        void CreatureSheet(Creature c)
        {
            var sp = c.Species; var el = Species.Elements[sp.el]; var rar = Species.Rarities[sp.rar];
            if (back != null && Button(new Rect(0, sy, 70, 30), "‹ Back", new Color(1, 1, 1, 0.1f))) { sheet = back; back = null; return; }
            sy += 36;
            Line(Col(sp.name, rar.color), Big, 2);
            Line($"Level {c.lvl} · {Col(el.name, el.color)} · {rar.name} · Power {c.Power}", Body, 4);
            Portrait(sp.id);
            Line($"HP {c.Hp}   Attack {c.Atk}   Speed {c.Spd}", H2, 4);
            Line($"Potential: {c.iv[0]}/{c.iv[1]}/{c.iv[2]} of 15 · Signature move: {el.move}", Small, 6);
            Line(sp.blurb, Body, 10);
            int dna = GameState.Dna(sp.id);
            bool max = c.lvl >= Species.MaxLevel;
            Line($"{sp.name} DNA: {dna}" + (max ? " · max level" : $" · next level costs {c.LevelCost}"), Small, 6);
            if (!max && SheetButton($"Level up ({c.LevelCost} DNA)", el.color * 0.7f, dna >= c.LevelCost))
            {
                var res = GameState.LevelUpCreature(c);
                if (res.ok) { Sfx.Play("loot"); Toast($"{sp.name} is now level {c.lvl}", el.color); }
                Show(res);
                GameState.Save();
            }
            bool on = GameState.save.team.Contains(c.id);
            if (SheetButton(on ? "Remove from battle team" : "Add to battle team", new Color(1, 1, 1, 0.12f))) GameState.ToggleTeam(c);
            Line("Your battle team is up to 3 creatures. It fights Rift guardians.", Small);
        }

        void TeamsSheet()
        {
            var me = GameState.Me;
            Line(Col(me.name, me.color), Big, 2);
            Line($"<i>\"{me.motto}\"</i>", Body, 4);
            Line(me.about, Small, 12);
            Line("Rifts near you", H2, 6);
            var n = GameState.Control(Game.I.ents.rifts);
            int total = Math.Max(1, n.Values.Sum());
            foreach (var id in new[] { "W", "B", "P", "H" })
            {
                var f = GameState.Factions[id];
                Label(new Rect(0, sy, 110, 18), Col(f.name, f.color), Body);
                Bar(new Rect(110, sy + 5, sw - 150, 8), n[id] / (float)total, f.color);
                Label(new Rect(sw - 34, sy, 34, 18), n[id].ToString(), new GUIStyle(Body) { alignment = TextAnchor.UpperRight });
                sy += 24;
            }
            Label(new Rect(0, sy, 200, 18), $"Unclaimed: {n["none"]}", Small);
            sy += 28;
            var hollow = GameState.Factions["H"];
            Line($"{Col("The Hollow", hollow.color)} — {hollow.about}", Small, 14);
            Line("Switch team", H2, 4);
            int wait = GameState.SwitchWait;
            Line(wait > 0 ? $"You can switch again in {wait} days." : $"Your Rifts stay with your old team. You can only switch once every {GameState.SWITCH_DAYS} days.", Small, 8);
            foreach (var id in GameState.Playable)
            {
                if (id == me.id) continue;
                var f = GameState.Factions[id];
                if (SheetButton($"Join the {f.name}", f.color * 0.7f, wait == 0))
                    Confirm($"Join the {f.name}?", $"\"{f.motto}\"\n\nYour Rifts will stay with the {me.name}.", "Switch", () =>
                    {
                        if (Show(GameState.SwitchTeam(id))) { Game.I.map.Recolor(); Toast($"Welcome to the {f.name}.", f.color); Game.I.Refresh(); }
                    });
            }
        }

        void SettingsSheet()
        {
            var s = GameState.save;
            Line("Settings", Big, 10);
            if (SheetButton(s.satellite ? "Map: satellite photos" : "Map: dark scanner", new Color(1, 1, 1, 0.12f)))
            {
                s.satellite = !s.satellite; GameState.Save();
                Game.I.map.satellite = s.satellite; Game.I.map.ChangedStyle();
            }
            if (SheetButton(s.sound ? "Sound: on" : "Sound: off", new Color(1, 1, 1, 0.12f))) { s.sound = !s.sound; GameState.Save(); }
            if (SheetButton(Game.I.walkMode ? "Movement: keys / joystick (demo)" : "Movement: GPS", new Color(1, 1, 1, 0.12f))) Game.I.ToggleWalk();
            sy += 6;
            var st = s.stats;
            Line("Your record", H2, 4);
            Line($"Caught {st.caught} · Hacks {st.hacks} · Rifts claimed {st.claimed}\nBattles won {st.wins} · Hollow purged {st.purged} · Caches {st.drops}\nApex raids won {st.apex} · Eggs hatched {st.hatched}\nWalked {Dist(st.meters)}", Small, 12);
            if (SheetButton("Start over", new Color(0.6f, 0.15f, 0.2f)))
                Confirm("Start over?", "This deletes your agent, creatures and Rifts on this device.", "Delete", () => Game.I.Restart());
            Line("Riftborn for Unity. Map tiles © Esri. Creatures are generated in code.", Tiny);
        }

        /* ------------------ Onboarding ------------------ */

        static readonly string[] Starters = { "cindertail", "ripplehorn", "zephyrix" };

        void Onboarding()
        {
            Fill(new Rect(0, 0, W, H), new Color(0.01f, 0.03f, 0.04f, step == 0 ? 0.55f : 0.8f));
            float w = Mathf.Min(W - 24, 420), x = (W - w) / 2;
            float y = Safe.y + 24;
            switch (step)
            {
                case 0:
                    Label(new Rect(0, H * 0.28f, W, 50), "RIFTBORN", Title);
                    Label(new Rect(x, H * 0.28f + 56, w, 80), "Rifts are tearing open all over the real world. Creatures are coming through. Pick a side, catch them in AR, and take the Rifts.", Mid);
                    if (Button(new Rect(x, Safe.yMax - 90, w, 56), "Begin")) step = 1;
                    break;
                case 1:
                    Label(new Rect(x, y, w, 30), "Your agent name", Big);
                    GUI.SetNextControlName("name");
                    draftName = GUI.TextField(P(new Rect(x, y + 44, w, 50)), draftName, 16, Field);
                    GUI.FocusControl("name");
                    Label(new Rect(x, y + 102, w, 40), "2 to 16 letters. Other agents will see it on your Rifts.", Small);
                    string clean = draftName.Trim();
                    if (Button(new Rect(x, Safe.yMax - 90, w, 56), "Next", null, clean.Length >= 2)) { draftName = clean; step = 2; }
                    break;
                case 2:
                    Label(new Rect(x, y, w, 30), "Choose your team", Big);
                    y += 40;
                    float ch = Mathf.Min(150, (Safe.yMax - 110 - y) / 3 - 8);
                    foreach (var id in GameState.Playable)
                    {
                        var f = GameState.Factions[id];
                        bool on = draftTeam == id;
                        var r = new Rect(x, y, w, ch);
                        if (Button(r, "", on ? f.color * 0.45f : new Color(1, 1, 1, 0.07f))) draftTeam = id;
                        Label(new Rect(x + 14, y + 10, w - 28, 22), Col(f.name, f.color), H2);
                        Label(new Rect(x + 14, y + 32, w - 28, ch - 36), $"<i>\"{f.motto}\"</i>\n{f.about}", Small);
                        y += ch + 8;
                    }
                    if (Button(new Rect(x, Safe.yMax - 90, w, 56), "Next", draftTeam != null ? GameState.Factions[draftTeam].color * 0.7f : (Color?)null, draftTeam != null)) step = 3;
                    break;
                case 3:
                    Label(new Rect(x, y, w, 30), "Choose your first creature", Big);
                    var sp = Species.ById(draftStarter);
                    float ps = Mathf.Min(w, Safe.yMax - y - 250);
                    GUI.DrawTexture(P(new Rect(x + (w - ps) / 2, y + 36, ps, ps)), Preview.Show(sp.id), ScaleMode.ScaleToFit, true);
                    y += 40 + ps;
                    Label(new Rect(x, y, w, 40), sp.blurb, Small);
                    y += 44;
                    float bw = (w - 16) / 3;
                    for (int i = 0; i < 3; i++)
                    {
                        var s2 = Species.ById(Starters[i]);
                        var el = Species.Elements[s2.el];
                        if (Button(new Rect(x + i * (bw + 8), y, bw, 56), $"{s2.name}\n<size={Mathf.RoundToInt(11 * Scale)}>{el.name}</size>", draftStarter == s2.id ? el.color * 0.7f : new Color(1, 1, 1, 0.08f))) draftStarter = s2.id;
                    }
                    if (Button(new Rect(x, Safe.yMax - 90, w, 56), "Start", GameState.Factions[draftTeam].color * 0.7f))
                    {
                        GameState.NewGame(draftName, draftTeam, draftStarter);
                        Game.I.OnStarted();
                    }
                    break;
            }
        }

        /* ------------------ Pop-ups & toasts ------------------ */

        void DrawPopup(Popup p)
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.5f));
            building.Add(new Rect(0, 0, W, H));
            float w = Mathf.Min(W - 32, 380);
            float bh = HeightOf(p.body ?? "", Body, w - 40);
            float ph = p.portrait != null ? 180 : 0;
            float h = 70 + ph + bh + p.buttons.Count * 56 + 10;
            var r = new Rect((W - w) / 2, (H - h) / 2, w, h);
            Panel(r, Ink);
            Fill(new Rect(r.x + 20, r.y + 14, 40, 4), p.color);
            Label(new Rect(r.x + 20, r.y + 24, w - 40, 30), p.title, Big);
            if (p.portrait != null) GUI.DrawTexture(P(new Rect(r.x + (w - 170) / 2, r.y + 60, 170, 170)), Preview.Show(p.portrait), ScaleMode.ScaleToFit, true);
            Label(new Rect(r.x + 20, r.y + 60 + ph, w - 40, bh + 4), p.body ?? "", Body);
            float y = r.y + 70 + ph + bh;
            foreach (var (label, act) in p.buttons)
            {
                if (Button(new Rect(r.x + 20, y, w - 40, 48), label, label == "Cancel" ? new Color(1, 1, 1, 0.12f) : (Color?)null))
                {
                    popups.Remove(p);
                    act?.Invoke();
                    return;
                }
                y += 56;
            }
        }

        void DrawToasts()
        {
            toasts.RemoveAll((t) => Time.time - t.t > 3.5f);
            float y = Safe.y + 80;
            foreach (var (text, color, t) in toasts)
            {
                float a = Mathf.Clamp01((3.5f - (Time.time - t)) * 2);
                float w = Mathf.Min(W - 24, 360), h = HeightOf(text, Mid, w - 20) + 14;
                var old = GUI.color; GUI.color = new Color(1, 1, 1, a);
                var r = new Rect((W - w) / 2, y, w, h);
                var ob = GUI.backgroundColor; GUI.backgroundColor = new Color(0, 0, 0, 0.75f);
                GUI.Box(P(r), GUIContent.none, Box);
                GUI.backgroundColor = ob;
                Label(new Rect(r.x + 10, r.y + 7, w - 20, h - 10), Col(text, color), Mid);
                GUI.color = old;
                y += h + 6;
            }
        }
    }
}

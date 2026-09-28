// Riftborn — all the 2D interface, drawn with Unity's immediate-mode GUI (a
// port of the web game's js/ui.js and its title screens): accounts and
// sign-up, the map HUD, and the sheets for Rifts (with links, guardians and
// Apex raids), caches, creatures, the Lab (Riftdex and fusion), the bag and
// eggs, missions and the daily bonus, the arena, teams, weather, your
// profile with medals and the leaderboard, online accounts, Google Maps,
// the menu and the guide. Layout is in "virtual" points (a phone is about
// 390 wide) and scaled to real pixels so text stays sharp.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
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
        public static GUIStyle Box, Btn0, BtnS, Title, Big, H2, Body, Small, Mid, MidS, Field, Tiny, Right;
        public static readonly Color Ink = new Color(0.03f, 0.07f, 0.085f, 0.95f);
        public static readonly Color Teal = new Color(0.18f, 0.9f, 0.77f);
        public static readonly Color Dim = new Color(0.6f, 0.7f, 0.72f);
        public static readonly Color Good = new Color(0.55f, 1f, 0.75f);
        public static readonly Color Bad = new Color(1f, 0.55f, 0.55f);
        public static readonly Color Soft = new Color(1, 1, 1, 0.1f);
        public static readonly Color Danger = new Color(0.72f, 0.18f, 0.25f);
        public static readonly Color ApexRed = new Color(1, 0.23f, 0.36f);
        static readonly Color Gold = new Color(1f, 0.85f, 0.3f);

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
            Btn0.padding = new RectOffset(Mathf.RoundToInt(6 * Scale), Mathf.RoundToInt(6 * Scale), 0, 0);
            BtnS = new GUIStyle(Btn0) { fontSize = Mathf.RoundToInt(12 * Scale) };
            Title = Text(34, FontStyle.Bold, Color.white, TextAnchor.MiddleCenter);
            Big = Text(21, FontStyle.Bold, Color.white);
            H2 = Text(16, FontStyle.Bold, Color.white);
            Body = Text(14, FontStyle.Normal, new Color(0.86f, 0.92f, 0.93f));
            Mid = Text(14, FontStyle.Normal, new Color(0.86f, 0.92f, 0.93f), TextAnchor.MiddleCenter);
            MidS = Text(12, FontStyle.Normal, Dim, TextAnchor.MiddleCenter);
            Small = Text(12, FontStyle.Normal, Dim);
            Tiny = Text(10, FontStyle.Normal, Dim, TextAnchor.UpperLeft, false);
            Right = Text(14, FontStyle.Bold, Color.white, TextAnchor.MiddleRight);
            Field = new GUIStyle(GUI.skin.textField) { fontSize = Mathf.RoundToInt(17 * Scale), alignment = TextAnchor.MiddleLeft };
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
            if (Event.current.type == EventType.Repaint && I && !I.inSheet) I.building.Add(r);
        }
        public static void Fill(Rect r, Color c)
        {
            var old = GUI.color; GUI.color = c;
            GUI.DrawTexture(P(r), white);
            GUI.color = old;
        }
        public static void Label(Rect r, string text, GUIStyle s) => GUI.Label(P(r), text, s);
        public static float HeightOf(string text, GUIStyle s, float w) => s.CalcHeight(new GUIContent(text), w * Scale) / Scale;

        public static bool Button(Rect r, string text, Color? c = null, bool on = true, GUIStyle style = null)
        {
            var old = GUI.backgroundColor;
            GUI.backgroundColor = on ? (c ?? new Color(0.12f, 0.55f, 0.5f)) : new Color(0.25f, 0.28f, 0.3f, 0.9f);
            var oc = GUI.contentColor;
            if (!on) GUI.contentColor = new Color(1, 1, 1, 0.5f);
            bool hit = GUI.Button(P(r), text, style ?? Btn0);
            GUI.backgroundColor = old; GUI.contentColor = oc;
            if (Event.current.type == EventType.Repaint && I && !I.inSheet) I.building.Add(r);
            if (hit && (!on || (I != null && I.dragged))) return false;
            if (hit) Sfx.Play("tap", 0.6f);
            return hit;
        }

        public static void Bar(Rect r, float frac, Color c)
        {
            Fill(r, new Color(1, 1, 1, 0.12f));
            Fill(new Rect(r.x, r.y, r.width * Mathf.Clamp01(frac), r.height), c);
        }

        // A creature portrait (or a dark silhouette for species not seen yet).
        public static void Icon(Rect r, string id, bool silhouette = false)
        {
            var tex = Preview.Icon(id);
            if (tex == null) { Fill(new Rect(r.center.x - 3, r.center.y - 3, 6, 6), new Color(1, 1, 1, 0.2f)); return; }
            var old = GUI.color;
            if (silhouette) GUI.color = new Color(0, 0, 0, 0.85f);
            GUI.DrawTexture(P(r), tex, ScaleMode.ScaleToFit, true);
            GUI.color = old;
        }

        public static void Dot(Rect r, Color c) { var old = GUI.backgroundColor; GUI.backgroundColor = c; GUI.Box(P(r), GUIContent.none, Box); GUI.backgroundColor = old; }

        public static string Hex(Color c) => "#" + ColorUtility.ToHtmlStringRGB(c);
        public static string Col(string text, Color c) => $"<color={Hex(c)}>{text}</color>";
        public static string Clock(long ms) { long s = (ms + 999) / 1000; return s >= 3600 ? $"{s / 3600}h {s / 60 % 60}m" : $"{s / 60}:{s % 60:00}"; }
        public static string Dist(double m) => Rng.Dist(m);
        static int Sz(int n) => Mathf.RoundToInt(n * Scale);
        static string Small_(string t) => $"<size={Sz(11)}>{t}</size>";
        static string Pct(double f) => $"{Math.Round(Mathf.Clamp01((float)f) * 100)}%";

        /* ------------------ State ------------------ */

        readonly List<Rect> building = new List<Rect>();
        List<Rect> hud = new List<Rect>();
        bool inSheet;
        object sheet;                                  // what the sheet shows
        readonly Stack<object> history = new Stack<object>();
        Vector2 scroll;
        bool dragged; float dragTotal;
        string sure;                                   // "tap again" confirmations
        class Popup { public string title, body, portrait; public Color color; public List<(string label, Action act)> buttons = new List<(string, Action)>(); }
        readonly List<Popup> popups = new List<Popup>();
        readonly List<(string text, Color color, float t)> toasts = new List<(string, Color, float)>();
        readonly List<(int n, float t)> xpPops = new List<(int, float)>();

        // Pages that aren't objects.
        class GuardPick { public Rift rift; public List<string> picked; }
        class LinkPick { public Rift rift; }
        class LabPage { public string tab = "mine"; }

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

        // Open a sheet from the map (forgets where you were).
        public void Open(object what)
        {
            history.Clear();
            Show0(what);
        }
        // Go to another sheet from a sheet (Back returns).
        void Go(object what) { if (sheet != null) history.Push(sheet); Show0(what); }
        void Show0(object what)
        {
            if (what is string s && s == "lab") what = new LabPage();
            if (what is string b && b == "board") LoadBoard();
            sheet = what; scroll = Vector2.zero; sure = null;
            if (what is string l && l == "levels") scroll.y = Math.Max(0, (GameState.Level - 4) * 52 + 120);
        }
        public void Close() { sheet = null; history.Clear(); sure = null; }
        public void CloseAll() { Close(); popups.Clear(); }
        public void Back()
        {
            if (popups.Count > 0) { popups.RemoveAt(0); return; }
            if (history.Count > 0) { sheet = history.Pop(); scroll = Vector2.zero; sure = null; return; }
            Close();
        }

        public void Toast(string text, Color? c = null) { toasts.Add((text, c ?? Color.white, Time.time)); if (toasts.Count > 4) toasts.RemoveAt(0); }
        public void XpPop(int n) { xpPops.Add((n, Time.time)); if (xpPops.Count > 4) xpPops.RemoveAt(0); }

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
            if (!res.ok) { if (!string.IsNullOrEmpty(res.why)) { Toast(res.why, Bad); Sfx.Play("error"); } return false; }
            if (title != null) Message(title, body);
            if (res.levelUp > 0) LevelUp(res.levelUp);
            return true;
        }
        void Up(Result r) { if (r != null && r.levelUp > 0) LevelUp(r.levelUp); }

        public void LevelUp(int L)
        {
            Sfx.Play("win");
            var rw = GameState.LevelReward(L);
            string unlock = L % 2 == 0 && L <= 14 ? $"\nYou can now upgrade Rifts to level {GameState.MaxRiftLevel}." : "";
            Message($"Level {L}!", $"You're now a {GameState.Title(L)}.\nBonus supplies: {rw}.{unlock}", Gold);
        }

        static string EggNote(Egg e) => e != null ? $" · {e.km} km egg" : "";

        /* ------------------ Eggs ------------------ */

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

        public void Hatched(Result h)
        {
            var sp = h.creature.Species; var rar = Species.Rarities[sp.rar];
            Sfx.Play("caught");
            var p = new Popup
            {
                title = $"{sp.name} hatched!",
                body = $"From your {h.egg.km} km egg.\n{Col(rar.name, rar.color)} · Level {h.creature.lvl} · Power {h.creature.Power}\n+{h.dnaN} {sp.name} DNA · +{GameState.Eggs[h.egg.km].xp} XP\n\n{sp.blurb}",
                color = GameState.Eggs[h.egg.km].color,
                portrait = sp.id,
            };
            p.buttons.Add(("Nice!", null));
            popups.Add(p);
            if (h.levelUp > 0) LevelUp(h.levelUp);
        }

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
                    case Game.Mode.Onboard: Onboarding(); if (sheet != null) Sheet(); break;
                    case Game.Mode.Map: if (GameState.save != null) Hud(); if (sheet != null) Sheet(); break;
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

        /* ================== Title screens ================== */

        string obStep = "title";
        string fName = "", fEmail = "", fPass = "", fError = "";
        bool busy;
        string draftTeam, draftStarter = "cindertail";
        static readonly string[] Starters = { "cindertail", "ripplehorn", "zephyrix" };

        public void TitleScreen() { obStep = "title"; fError = ""; }
        public void SignUp()
        {
            obStep = "signup"; fError = "";
            string mv = Auth.Movable();
            if (mv != null && fName == "") fName = mv;
        }
        public void LogIn() { obStep = "login"; fError = ""; }
        public void ChooseFaction() { obStep = "faction"; draftTeam = null; }

        async void Submit(bool signup)
        {
            if (busy) return;
            busy = true; fError = "";
            try
            {
                var u = signup ? await Auth.SignUp(fName, fEmail, fPass) : await Auth.LogIn(fEmail, fPass);
                Sfx.Play("caught");
                fPass = "";
                await Game.I.AfterLogin(u);
            }
            catch (FriendlyError ex) { fError = ex.Message; Sfx.Play("error"); }
            catch (Exception ex) { fError = "Something went wrong. Try again."; Debug.LogWarning(ex); Sfx.Play("error"); }
            finally { busy = false; }
        }

        async void Forgot()
        {
            try { await Auth.ResetPassword(fEmail); fError = "Check your email for a link to set a new password."; }
            catch (FriendlyError ex) { fError = ex.Message; }
            catch (Exception) { fError = "Couldn't send the email. Try again."; }
        }

        float obT;
        void Swirl()
        {
            // The swirling Rift behind the title screens.
            obT += Time.deltaTime;
            Fill(new Rect(0, 0, W, H), new Color(0.03f, 0.02f, 0.08f, 0.93f));
            Color fc = draftTeam != null ? GameState.Factions[draftTeam].color : new Color(0.7f, 0.36f, 1f);
            float cx = W / 2, cy = H * 0.3f, R = Mathf.Max(W, H) * 0.55f;
            for (int i = 0; i < 90; i++)
            {
                float s = 0.2f + (i * 37 % 80) / 100f;
                float rr = Mathf.Repeat(1 - obT * 0.03f * s - i * 0.0111f, 1);
                float a = i * 2.39f + obT * s * (0.6f - rr * 0.4f);
                float x = cx + Mathf.Cos(a) * rr * R, y = cy + Mathf.Sin(a) * rr * R * 0.45f;
                float d = (1 - rr) * 3 + 0.8f;
                Fill(new Rect(x - d / 2, y - d / 2, d, d), new Color(fc.r, fc.g, fc.b, (1 - rr) * 0.9f));
            }
            var old = GUI.color; GUI.color = new Color(fc.r, fc.g, fc.b, 0.55f + Mathf.Sin(obT * 2) * 0.1f);
            GUI.DrawTexture(P(new Rect(cx - R * 0.14f, cy - R * 0.3f, R * 0.28f, R * 0.6f)), Tex.Glow);
            GUI.color = old;
        }

        void Onboarding()
        {
            Swirl();
            float w = Mathf.Min(W - 32, 420), x = (W - w) / 2, y = Safe.y + 24, bottom = Safe.yMax - 16;
            var u = Auth.user;
            switch (obStep)
            {
                case "title":
                    {
                        Label(new Rect(0, H * 0.3f - 30, W, 60), "RIFTBORN", Title);
                        Label(new Rect(x, H * 0.3f + 34, w, 70), "Rifts are tearing open all over the real world. Creatures are coming through. Pick a side, catch them in AR, and take the Rifts.", Mid);
                        string mode = u != null ? $"Logged in as {u.name}{(string.IsNullOrEmpty(u.email) ? "" : $" ({u.email})")} · {(u.mode == "cloud" ? "online account" : "account on this phone")}"
                            : Auth.Online ? "Online accounts: your progress follows you to any phone." : "Accounts are kept on this phone.";
                        var bts = new List<(string, Action, Color?)>();
                        if (u != null && GameState.save != null) bts.Add(($"Continue as {GameState.save.agent.name}", () => Game.I.EnterMap(null), (Color?)null));
                        if (u != null && GameState.save == null) bts.Add(("Begin", ChooseFaction, null));
                        if (u == null) { bts.Add(("Sign up", SignUp, null)); bts.Add(("Log in", LogIn, Soft)); }
                        if (u != null) bts.Add(("Log out", () => Game.I.LogOut(), Soft));
                        if (!Auth.IsBuiltIn) bts.Add((Auth.Online ? $"Online accounts: {Auth.ProjectId} · change" : "Play on any phone: set up online accounts", () => Go("online"), Soft));
                        float by = bottom - bts.Count * 58 - 24;
                        Label(new Rect(x, by - 4, w, 20), mode, MidS);
                        by += 22;
                        foreach (var (label, act, c) in bts) { if (Button(new Rect(x, by, w, 50), label, c)) act(); by += 58; }
                        break;
                    }
                case "signup":
                case "login":
                    {
                        bool su = obStep == "signup";
                        Label(new Rect(x, y, w, 30), su ? "Make your agent account" : "Log in", Big);
                        y += 40;
                        if (su && Auth.Online)
                        {
                            string mv = Auth.Movable();
                            string hint = mv != null ? $"Online accounts are on. {mv} moves to the account you make here, with all your progress." : "This makes an online account: your progress follows you to any phone.";
                            float hh = HeightOf(hint, Small, w);
                            Label(new Rect(x, y, w, hh), hint, Small); y += hh + 8;
                        }
                        if (su) { Label(new Rect(x, y, w, 18), "Codename", Small); fName = GUI.TextField(P(new Rect(x, y + 18, w, 44)), fName, 16, Field); y += 70; }
                        Label(new Rect(x, y, w, 18), su || Auth.Online ? "Email" : "Email or codename", Small);
                        fEmail = GUI.TextField(P(new Rect(x, y + 18, w, 44)), fEmail, 80, Field); y += 70;
                        Label(new Rect(x, y, w, 18), su ? "Password (at least 8 characters)" : "Password", Small);
                        fPass = GUI.PasswordField(P(new Rect(x, y + 18, w, 44)), fPass, '•', 64, Field); y += 72;
                        if (fError != "") { float eh = HeightOf(fError, Body, w); Label(new Rect(x, y, w, eh), Col(fError, Bad), Body); y += eh + 8; }
                        if (Button(new Rect(x, y, w, 50), busy ? "One moment…" : su ? "Sign up" : "Log in", null, !busy)) Submit(su);
                        y += 58;
                        if (!su && Auth.Online && Button(new Rect(x, y, w, 40), "Forgot password?", Soft)) Forgot();
                        if (!su && Auth.Online) y += 48;
                        if (Button(new Rect(x, y, w, 40), su ? "I have an account: log in" : "New here? Sign up", Soft)) { if (su) LogIn(); else SignUp(); }
                        y += 48;
                        if (Button(new Rect(x, y, w, 40), "Back", Soft)) TitleScreen();
                        break;
                    }
                case "faction":
                    {
                        Label(new Rect(x, y, w, 30), "Choose your team", Big);
                        y += 36;
                        Label(new Rect(x, y, w, 36), "Three teams fight over the Rifts. Watch out for the Hollow: Rift-eating machines that take Rifts from everyone.", Small);
                        y += 42;
                        float ch = Mathf.Min(140, (bottom - 70 - y) / 3 - 8);
                        foreach (var id in GameState.Playable)
                        {
                            var f = GameState.Factions[id];
                            bool on = draftTeam == id;
                            var r = new Rect(x, y, w, ch);
                            if (Button(r, "", on ? f.color * 0.45f : new Color(1, 1, 1, 0.07f))) draftTeam = id;
                            Dot(new Rect(x + 14, y + 14, 12, 12), f.color);
                            Label(new Rect(x + 34, y + 10, w - 48, 22), Col(f.name, f.color), H2);
                            Label(new Rect(x + 14, y + 34, w - 28, ch - 36), $"<i>\"{f.motto}\"</i>\n{f.about}", Small);
                            y += ch + 8;
                        }
                        if (Button(new Rect(x, bottom - 56, w, 50), "Next", draftTeam != null ? GameState.Factions[draftTeam].color * 0.7f : (Color?)null, draftTeam != null)) obStep = "starter";
                        break;
                    }
                case "starter":
                    {
                        Label(new Rect(x, y, w, 30), "Choose your first creature", Big);
                        var sp = Species.ById(draftStarter);
                        float ps = Mathf.Min(w, bottom - y - 250);
                        GUI.DrawTexture(P(new Rect(x + (w - ps) / 2, y + 36, ps, ps)), Preview.Show(sp.id), ScaleMode.ScaleToFit, true);
                        y += 40 + ps;
                        Label(new Rect(x, y, w, 40), sp.blurb, MidS);
                        y += 44;
                        float bw = (w - 16) / 3;
                        for (int i = 0; i < 3; i++)
                        {
                            var s2 = Species.ById(Starters[i]);
                            var el = Species.Elements[s2.el];
                            if (Button(new Rect(x + i * (bw + 8), y, bw, 56), $"{s2.name}\n{Small_(el.name)}", draftStarter == s2.id ? el.color * 0.7f : new Color(1, 1, 1, 0.08f))) draftStarter = s2.id;
                        }
                        if (Button(new Rect(x, bottom - 56, w, 50), "Start", GameState.Factions[draftTeam].color * 0.7f)) Game.I.NewAgent(draftTeam, draftStarter);
                        if (Button(new Rect(x, bottom - 100, w, 36), "Back", Soft)) obStep = "faction";
                        break;
                    }
            }
        }

        /* ================== The map HUD ================== */

        void Hud()
        {
            var s = GameState.save;
            var me = GameState.Me;
            float top = Safe.y + 8, left = Safe.x + 8, right = Safe.xMax - 8;

            // Agent card (profile)
            var card = new Rect(left, top, 196, 62);
            if (Button(card, "", Ink)) Open("profile");
            Fill(new Rect(card.x + 8, card.y + 10, 4, card.height - 20), me.color);
            Label(new Rect(card.x + 20, card.y + 8, 172, 20), s.agent.name, H2);
            int L = GameState.Level;
            Label(new Rect(card.x + 20, card.y + 28, 172, 16), $"Lv {L} {GameState.Title(L)} · {Col(me.name, me.color)}", Small);
            Bar(new Rect(card.x + 20, card.y + 48, 164, 5), GameState.LevelFrac, me.color);
            float py = card.yMax + 4;
            foreach (var (n, t) in xpPops)
            {
                float age = Time.time - t;
                if (age > 1.5f) continue;
                var old = GUI.color; GUI.color = new Color(1, 1, 1, Mathf.Clamp01((1.5f - age) * 2));
                Label(new Rect(card.x + 20, py + 10 - age * 14, 172, 18), Col($"+{n:N0} XP", Gold), H2);
                GUI.color = old;
            }
            xpPops.RemoveAll((x) => Time.time - x.t > 1.5f);

            // Supplies (bag)
            var inv = new Rect(right - 118, top, 118, 62);
            if (Button(inv, "", Ink)) Open("bag");
            Label(new Rect(inv.x + 12, inv.y + 7, 100, 16), $"{Col("●", GameState.Me.color)} Orbs  <b>{s.items.orbs}</b>", Small);
            Label(new Rect(inv.x + 12, inv.y + 24, 100, 16), $"{Col("●", Gold)} Darts  <b>{s.items.darts}</b>", Small);
            Label(new Rect(inv.x + 12, inv.y + 41, 100, 16), $"{Col("●", new Color(0.7f, 0.5f, 1f))} Shards  <b>{s.items.shards}</b>", Small);
            float cy = inv.yMax + 6;

            // Weather
            var w = Weather.Now;
            if (w != null)
            {
                var el = Species.Elements[Weather.Boost.Value];
                var wr = new Rect(inv.x, cy, inv.width, 36);
                if (Button(wr, "", Ink)) Open("weather");
                Label(new Rect(wr.x + 10, wr.y + 3, wr.width - 16, 16), $"{Weather.Name(w)} {w.temp}°", Small);
                Label(new Rect(wr.x + 10, wr.y + 18, wr.width - 16, 16), $"{Col("▲", el.color)} {el.name} boosted", Tiny);
                cy = wr.yMax + 6;
            }

            // Eggs: the one closest to hatching.
            if (s.eggs.Count > 0)
            {
                var er = new Rect(inv.x, cy, inv.width, 44);
                if (Button(er, "", Ink)) Open("bag");
                var next = s.eggs.Where((x) => x.inc).OrderBy((x) => x.km * 1000 - x.walked).FirstOrDefault();
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
                float gw = Mathf.Min(W - 16 - 126, 300);
                float hh = HeightOf(gps, Small, gw - 16) + 10;
                var g = new Rect(left, card.yMax + 28, gw, hh);
                Panel(g, new Color(0, 0, 0, 0.6f));
                Label(new Rect(g.x + 8, g.y + 5, gw - 16, hh), gps, Small);
            }

            // Bottom bar
            float barY = Safe.yMax - 58;
            var items = new List<(string label, Action act, bool dot)>
            {
                ("Lab", () => Open("lab"), false),
                ("Bag", () => Open("bag"), false),
                ("Scan", () => { Sfx.Play("hack"); Open("scan"); }, false),
                ("Missions", () => Open("missions"), GameState.MissionsReady || GameState.LoginPending() > 0),
                ("Arena", () => Open("arena"), GameState.Arena().dayWins >= 3 && !GameState.Arena().chest),
                ("Menu", () => Open("menu"), false),
            };
            float bw = (Safe.width - 16 - 5 * 4) / 6, bx = Safe.x + 8;
            foreach (var (label, act, dotOn) in items)
            {
                var r = new Rect(bx, barY, bw, 50);
                if (Button(r, label, Ink, true, BtnS)) act();
                if (dotOn) Dot(new Rect(r.xMax - 12, r.y + 4, 8, 8), Gold);
                bx += bw + 4;
            }

            // Zoom and recentre
            float zx = Safe.xMax - 48, zy = barY - 150;
            if (Button(new Rect(zx, zy, 40, 40), "+", Ink)) Game.I.map.Zoom(0.7f);
            if (Button(new Rect(zx, zy + 46, 40, 40), "−", Ink)) Game.I.map.Zoom(1.4f);
            if (Mathf.Abs(Mathf.DeltaAngle(Game.I.map.Yaw, 0)) > 5 && Button(new Rect(zx, zy + 92, 40, 40), "N", Ink)) Game.I.map.Yaw = 0;

            // What's in reach, and the nearest creatures.
            bool joy = Game.I.walkMode && Application.isMobilePlatform;
            if (joy)
            {
                var jr = Game.JoyRect;
                Panel(jr, new Color(0, 0, 0, 0.35f));
                var c = jr.center + new Vector2(Game.Joy.x, -Game.Joy.y) * jr.width * 0.3f;
                Panel(new Rect(c.x - 24, c.y - 24, 48, 48), new Color(1, 1, 1, 0.4f));
            }
            Nearby(joy ? Game.JoyRect.xMax + 8 : Safe.x + 8, barY - 74);
            var near = Game.I.InReach();
            if (!string.IsNullOrEmpty(near))
            {
                float nw = Mathf.Min(W - 16, 330);
                var g = new Rect((W - nw) / 2, barY - 110, nw, 28);
                Panel(g, new Color(0, 0, 0, 0.55f));
                Label(g, near, MidS);
            }
            string attr = Game.I.map.Attribution;
            if (attr != "") Label(new Rect(Safe.x + 8, barY - 16, W - 70, 14), attr, Tiny);
        }

        // The little tracker of the closest creatures.
        void Nearby(float x, float y)
        {
            var me = Game.I.map;
            var list = Game.I.ents.spawns.Where((s) => !GameState.IsGone(s)).Select((s) => (s, d: World.Dist(me.lat, me.lng, s.lat, s.lng)))
                .Where((t) => t.d < MapView.SIGHT).OrderBy((t) => t.d).Take(4).ToList();
            foreach (var (s, d) in list)
            {
                var r = new Rect(x, y, 52, 64);
                var sp = Species.ById(s.sp);
                if (Button(r, "", d <= GameState.RANGE ? Species.Rarities[sp.rar].color * 0.55f : Ink)) Open(s);
                Icon(new Rect(r.x + 4, r.y + 2, 44, 44), s.sp);
                Label(new Rect(r.x, r.y + 46, 52, 16), d <= GameState.RANGE ? "Here!" : Dist(d), MidS);
                x += 56;
            }
        }

        /* ================== Sheets ================== */

        float sy, sw;   // cursor while laying out a sheet

        void Sheet()
        {
            Fill(new Rect(0, 0, W, H), new Color(0, 0, 0, 0.3f));
            float w = Mathf.Min(W - 16, 460), h = Mathf.Min(Safe.height - 30, 680);
            var r = new Rect((W - w) / 2, Safe.yMax - h - 8, w, h);
            Panel(r, Ink);
            if (Button(new Rect(r.xMax - 44, r.y + 8, 36, 36), "×", Soft)) { Close(); return; }
            if (history.Count > 0 && Button(new Rect(r.x + 8, r.y + 8, 64, 36), "‹ Back", Soft)) { Back(); return; }
            sw = w - 32;
            float head = history.Count > 0 ? 50 : 14;
            var view = new Rect(r.x + 16, r.y + head, w - 32, h - head - 8);
            float contentH = Mathf.Max(view.height, lastContentH);
            scroll.y = Mathf.Clamp(scroll.y, 0, Mathf.Max(0, contentH - view.height));
            inSheet = true;
            GUI.BeginScrollView(P(view), new Vector2(0, scroll.y * Scale), P(new Rect(0, 0, view.width - 1, contentH)), GUIStyle.none, GUIStyle.none);
            sy = 0;
            try
            {
                switch (sheet)
                {
                    case Rift rift: RiftSheet(rift); break;
                    case Cache c: CacheSheet(c); break;
                    case Spawn sp: SpawnSheet(sp); break;
                    case Creature cr: CreatureSheet(cr); break;
                    case GuardPick gp: GuardSheet(gp); break;
                    case LinkPick lp: LinkSheet(lp.rift); break;
                    case LabPage lab: LabSheet(lab); break;
                    case "bag": BagSheet(); break;
                    case "teams": TeamsSheet(); break;
                    case "menu": MenuSheet(); break;
                    case "guide": GuideSheet(); break;
                    case "scan": ScanSheet(); break;
                    case "missions": MissionsSheet(); break;
                    case "daily": DailySheet(); break;
                    case "arena": ArenaSheet(); break;
                    case "weather": WeatherSheet(); break;
                    case "profile": ProfileSheet(); break;
                    case "levels": LevelsSheet(); break;
                    case "board": BoardSheet(); break;
                    case "account": AccountSheet(); break;
                    case "online": OnlineSheet(); break;
                    case "gmaps": GoogleSheet(); break;
                }
            }
            catch (InvalidOperationException) { /* the sheet changed while drawing */ }
            lastContentH = sy + 12;
            GUI.EndScrollView();
            inSheet = false;
            // Tap outside to close.
            var e = Event.current;
            if (e.type == EventType.MouseUp && !dragged && !P(r).Contains(e.mousePosition)) { Close(); e.Use(); }
        }
        float lastContentH;

        void Line(string text, GUIStyle s, float gap = 6)
        {
            float lw = sw - (sy < 40 && history.Count == 0 ? 44 : 0);
            float h = HeightOf(text, s, lw);
            Label(new Rect(0, sy, lw, h + 2), text, s);
            sy += h + gap;
        }
        void Heading(string text) { sy += 8; Line(text, H2, 6); }
        bool SheetButton(string text, Color? c = null, bool on = true, float h = 46)
        {
            bool hit = Button(new Rect(0, sy, sw, h), text, c, on);
            sy += h + 8;
            return hit;
        }
        void SheetBar(float frac, Color c, string left = null, string right = null)
        {
            if (left != null) { Label(new Rect(0, sy, sw, 16), left, Small); if (right != null) Label(new Rect(0, sy, sw, 16), right, new GUIStyle(Small) { alignment = TextAnchor.UpperRight }); sy += 18; }
            Bar(new Rect(0, sy, sw, 8), frac, c); sy += 16;
        }
        void Portrait(string id, float size = 190)
        {
            var tex = Preview.Show(id);
            GUI.DrawTexture(P(new Rect((sw - size) / 2, sy, size, size)), tex, ScaleMode.ScaleToFit, true);
            sy += size + 4;
        }
        // A tappable row with an optional portrait, title, subtitle and tag.
        bool Row(string title, string sub, string tag = null, string icon = null, Color? dot = null, bool on = true, bool silhouette = false, Color? bg = null)
        {
            float h = 56;
            var r = new Rect(0, sy, sw, h);
            bool hit = Button(r, "", bg ?? new Color(1, 1, 1, 0.06f), on);
            float x = 12;
            if (icon != null) { Icon(new Rect(6, sy + 4, 48, 48), icon, silhouette); x = 60; }
            else if (dot != null) { Dot(new Rect(12, sy + 22, 12, 12), dot.Value); x = 32; }
            float tw = sw - x - (tag != null ? 86 : 10);
            Label(new Rect(x, sy + 8, tw, 20), title, H2);
            Label(new Rect(x, sy + 30, tw, 18), sub ?? "", Small);
            if (tag != null) Label(new Rect(sw - 90, sy, 80, h), tag, Right);
            sy += h + 6;
            return hit && on;
        }
        bool Sure(string key, string label, string again, Color c)
        {
            if (!SheetButton(sure == key ? again : label, c)) return false;
            if (sure != key) { sure = key; return false; }
            sure = null;
            return true;
        }

        double DistTo(double la, double ln) => Game.I.DistTo(la, ln);
        void OutOfRange(double d, string what) => Line($"{Dist(d)} away. Walk within {GameState.RANGE} m to {what}.", Body, 10);

        static string Chips(Species sp) { var r = Species.Rarities[sp.rar]; var e = Species.Elements[sp.el]; return $"{Col(r.name, r.color)} · {Col(e.name, e.color)}"; }

        /* ------------------ Wild creature ------------------ */

        void SpawnSheet(Spawn s)
        {
            var sp = Species.ById(s.sp);
            double d = DistTo(s.lat, s.lng);
            Portrait(sp.id, 180);
            Line(sp.name, Big, 2);
            Line($"{Chips(sp)} · Lv {GameState.SpawnLevel(s)}{(s.boost && Weather.Now != null ? " · " + Col($"{Weather.Name(Weather.Now)} boost", new Color(0.5f, 0.83f, 1f)) : "")}", Body, 6);
            Line(sp.blurb, Body, 6);
            int caught = GameState.CaughtCount(sp.id);
            Line($"{(caught > 0 ? $"You've caught {caught}." : "Not caught yet.")} You have {GameState.Dna(sp.id)} {sp.name} DNA. Leaves in {Rng.Time(s.expires - Rng.NowMs())}.", Small, 10);
            if (d > GameState.RANGE) { OutOfRange(d, "engage"); return; }
            if (SheetButton("Engage in AR", Species.Elements[sp.el].color * 0.7f, true, 52)) { Close(); Game.I.StartEncounter(s); }
            Line($"{GameState.save.items.darts} darts · {GameState.save.items.orbs} orbs", MidS);
        }

        /* ------------------ Supply cache ------------------ */

        void CacheSheet(Cache c)
        {
            Line(c.name, Big, 2);
            Line("Gear left by expeditions that went through the Rifts. Refills every 10 minutes.", Body, 10);
            double d = DistTo(c.lat, c.lng);
            if (d > GameState.RANGE) { OutOfRange(d, "open it"); return; }
            long wait = GameState.CacheWait(c);
            if (wait > 0) { Line($"Empty. Refills in {Rng.Time(wait)}.", Body); return; }
            if (SheetButton("Open cache", null, true, 52))
            {
                var res = GameState.OpenCache(c);
                if (!res.ok) { Toast(res.why); return; }
                Sfx.Play("loot");
                Toast($"Cache opened: {res.loot}{EggNote(res.egg)}", Good);
                Up(res);
                Close();
                Game.I.Refresh();
            }
        }

        /* ------------------ Rifts ------------------ */

        void RiftSheet(Rift rift)
        {
            var st = GameState.State(rift);
            string me = GameState.save.agent.faction;
            var F = st.faction != null ? GameState.Factions[st.faction] : null;
            var col = GameState.RiftColor(st);
            double d = DistTo(rift.lat, rift.lng);
            bool near = d <= GameState.RANGE;
            long hackWait = GameState.HackWait(rift);
            int keys = GameState.save.keys.TryGetValue(rift.id, out var k) ? k.n : 0;
            bool friendly = st.faction == me, enemy = st.faction != null && !friendly;
            string who = st.mine ? "Held by you" : F != null ? $"Held by the {F.name}" : "Unclaimed";

            float top = sy;
            Line(rift.name, Big, 2);
            Line(Col(who, col) + (st.faction != null ? $" · Level {st.level}" : ""), Body, 8);
            Fill(new Rect(-10, top + 2, 4, sy - top - 8), col);

            var apex = GameState.ApexAt(rift);
            if (apex != null)
            {
                var asp = apex.boss.Species; var ael = Species.Elements[asp.el];
                var ar = new Rect(0, sy, sw, 84);
                Panel(ar, new Color(ApexRed.r, ApexRed.g, ApexRed.b, apex.beaten ? 0.08f : 0.18f));
                Icon(new Rect(6, sy + 6, 72, 72), asp.id);
                Label(new Rect(84, sy + 6, sw - 90, 20), Col($"<b>Apex {asp.name}</b>", ApexRed), H2);
                Label(new Rect(84, sy + 26, sw - 90, 16), $"Level {apex.boss.lvl} · {Col(ael.name, ael.color)} · 3× health", Small);
                Label(new Rect(84, sy + 42, sw - 90, 40), apex.beaten ? "You beat it today. A new Apex rises tomorrow." : $"Beat it for {apex.dna} {asp.name} DNA, supplies, big XP and maybe a 10 km egg. Today only.", Small);
                sy += 92;
            }
            if (st.faction != null) SheetBar(st.health / 100f, col, "Charge", $"{st.health}%");
            if (st.guard.Count > 0)
            {
                Heading(friendly ? "Guardians" : "Guardians to beat");
                float gx = 0, gw = Mathf.Min(110, sw / 3);
                foreach (var g in st.guard)
                {
                    Icon(new Rect(gx + (gw - 64) / 2, sy, 64, 64), g.sp);
                    Label(new Rect(gx, sy + 64, gw, 30), $"{g.Species.name}\nLv {g.lvl}", MidS);
                    gx += gw;
                }
                sy += 100;
            }
            string info = (keys > 0 ? $"You hold {keys} key{(keys > 1 ? "s" : "")} to this Rift. " : "") +
                (st.faction == null ? "Nobody holds this Rift. Claim it for your faction with Rift Shards."
                : st.faction == "H" ? "Taken by the Hollow: Rift-eating machines guarding it with corrupted Void and Volt creatures. Beat them for 50% more XP, then claim it."
                : enemy ? "Beat its guardians in battle to knock it back to unclaimed, then claim it."
                : st.mine ? "Your Rift loses charge every day. Recharge it, or it falls to the other side."
                : "A Rift held by your faction. Hack it for supplies and keys, and link it up.");
            Line(info, Small, 10);
            if (!near) { OutOfRange(d, "use it"); return; }

            if (SheetButton(hackWait > 0 ? $"Hack · ready in {Rng.Time(hackWait)}" : "Hack", null, hackWait == 0))
            {
                var r = GameState.Hack(rift);
                if (!r.ok) { Toast(r.why); return; }
                Sfx.Play("hack");
                Toast($"Hacked: {r.loot}{(r.key ? " · Key" : "")}{EggNote(r.egg)}", Good);
                Up(r);
                Game.I.Refresh();
            }
            if (apex != null && !apex.beaten && SheetButton("Battle the Apex", ApexRed * 0.75f)) { Close(); Game.I.StartRaid(rift); return; }
            if (st.faction == null && SheetButton($"Claim · {GameState.CLAIM_COST} shards", GameState.Me.color * 0.75f))
            {
                var r = GameState.Claim(rift);
                if (!r.ok) { Toast(r.why, Bad); Sfx.Play("error"); return; }
                Sfx.Play("caught");
                Toast($"{rift.name} is now held by the {GameState.Me.name}!", Good);
                Up(r);
                Game.I.Refresh();
            }
            if (enemy && SheetButton("Assault the guardians", Danger)) { Close(); Game.I.StartBattle(rift); return; }
            if (friendly && st.health < 100 && SheetButton("Recharge · 2 shards"))
            {
                var r = GameState.Recharge(rift);
                if (!r.ok) { Toast(r.why, Bad); Sfx.Play("error"); return; }
                Sfx.Play("loot");
                Up(r);
            }
            if (st.mine && st.level < 8 && SheetButton($"Upgrade to L{st.level + 1} · {GameState.UpgradeCost(st.level)} shards"))
            {
                var r = GameState.Upgrade(rift);
                if (!r.ok) { Toast(r.why, Bad); Sfx.Play("error"); return; }
                Sfx.Play("caught");
                Toast($"Upgraded to level {GameState.State(rift).level}. Longer link range and more guardians.", Good);
                Up(r);
                Game.I.Refresh();
            }
            if (st.mine && SheetButton("Choose guardians", Soft)) Go(new GuardPick { rift = rift, picked = st.guard.Select((c) => c.id).ToList() });
            if (friendly && SheetButton("Link to another Rift", Soft)) Go(new LinkPick { rift = rift });
        }

        void GuardSheet(GuardPick g)
        {
            var st = GameState.State(g.rift);
            int max = GameState.MaxGuards(st.level);
            Line("Guardians", Big, 4);
            Line($"Pick up to {max} creature{(max > 1 ? "s" : "")} to defend {g.rift.name}. Upgrade the Rift for more slots.", Small, 10);
            var list = GameState.save.creatures.OrderByDescending((c) => c.Power).ToList();
            Grid(list, (c) => g.picked.Contains(c.id), (c) =>
            {
                if (g.picked.Contains(c.id)) g.picked.Remove(c.id);
                else { if (g.picked.Count >= max) g.picked.RemoveAt(0); g.picked.Add(c.id); }
            });
            if (SheetButton("Save", null, true, 50)) { GameState.SetGuards(g.rift, g.picked); Toast("Guardians posted.", Good); Back(); }
        }

        void LinkSheet(Rift rift)
        {
            var st = GameState.State(rift);
            var targets = GameState.LinkTargets(rift);
            Line($"Link from {rift.name}", Big, 4);
            Line($"Links need a key to the other Rift (hack Rifts to get keys). Both Rifts must be held by the {GameState.Me.name}. Link three Rifts into a triangle to raise a control field and earn Aether. Range at level {st.level}: {Dist(GameState.LinkRange(st.level))}.", Small, 10);
            if (targets.Count == 0) { Line("You have no keys yet. Hack other Rifts to collect keys, then come back.", Body); return; }
            foreach (var t in targets)
            {
                if (!Row(t.rift.name, $"{Dist(t.dist)} · {t.key.n} key{(t.key.n > 1 ? "s" : "")}{(t.why != "" ? " · " + t.why : "")}", t.why == "" ? "Link" : null, null, GameState.RiftColor(GameState.State(t.rift)), t.why == "")) continue;
                var r = GameState.MakeLink(rift, t.rift);
                if (!r.ok) { Toast(r.why, Bad); Sfx.Play("error"); return; }
                if (r.fields.Count > 0) { Sfx.Play("win"); Toast($"Control field raised! +{r.fields.Sum():N0} Aether", Good); }
                else { Sfx.Play("hack"); Toast($"Linked to {t.rift.name}.", Good); }
                Up(r);
                Close();
                Game.I.Refresh();
                return;
            }
        }

        /* ------------------ Lab ------------------ */

        // A grid of creature cards (3 across).
        void Grid(List<Creature> list, Func<Creature, bool> selected, Action<Creature> tap)
        {
            float cw = (sw - 16) / 3, chh = 118;
            int i = 0;
            foreach (var c in list)
            {
                var sp = c.Species; var rar = Species.Rarities[sp.rar];
                var r = new Rect((i % 3) * (cw + 8), sy + (i / 3) * (chh + 8), cw, chh);
                bool sel = selected(c);
                if (Button(r, "", sel ? rar.color * 0.5f : new Color(1, 1, 1, 0.06f))) tap(c);
                Fill(new Rect(r.x + 8, r.y + 4, r.width - 16, 2), rar.color);
                Icon(new Rect(r.x + (cw - 70) / 2, r.y + 6, 70, 70), sp.id);
                Label(new Rect(r.x + 4, r.y + 76, cw - 8, 18), $"<b>{sp.name}</b>", MidS);
                Label(new Rect(r.x + 4, r.y + 94, cw - 8, 18), $"Lv {c.lvl} · {c.Power}", MidS);
                if (GameState.save.team.Contains(c.id)) Label(new Rect(r.xMax - 22, r.y + 6, 18, 18), Col("★", Gold), H2);
                i++;
            }
            sy += ((list.Count + 2) / 3) * (chh + 8) + 4;
        }

        void LabSheet(LabPage lab)
        {
            Line("Lab", Big, 8);
            float tw = (sw - 12) / 3;
            string[] tabs = { "mine", "dex", "fuse" }, names = { "Creatures", "Riftdex", "Fusion" };
            for (int i = 0; i < 3; i++) if (Button(new Rect(i * (tw + 6), sy, tw, 36), names[i], lab.tab == tabs[i] ? Teal * 0.6f : Soft, true, BtnS)) { lab.tab = tabs[i]; scroll = Vector2.zero; }
            sy += 46;
            var s = GameState.save;
            if (lab.tab == "mine")
            {
                Line($"★ marks your battle team (up to {GameState.MAX_TEAM}). The first is your walking buddy. Tap a creature to level it up with DNA.", Small, 10);
                var list = s.creatures.OrderByDescending((c) => s.team.Contains(c.id) ? 1 : 0).ThenByDescending((c) => c.Power).ToList();
                Grid(list, (c) => false, (c) => Go(c));
            }
            else if (lab.tab == "dex")
            {
                int caught = Species.All.Count((x) => GameState.CaughtCount(x.id) > 0);
                Line($"{caught} of {Species.All.Length} discovered. Dart creatures to collect their DNA.", Small, 10);
                float cw = (sw - 16) / 3, chh = 110;
                int i = 0;
                foreach (var sp in Species.All)
                {
                    bool known = GameState.Seen(sp.id), got = GameState.CaughtCount(sp.id) > 0;
                    var r = new Rect((i % 3) * (cw + 8), sy + (i / 3) * (chh + 8), cw, chh);
                    Panel(r, new Color(1, 1, 1, got ? 0.08f : 0.03f));
                    Fill(new Rect(r.x + 8, r.y + 4, r.width - 16, 2), Species.Rarities[sp.rar].color);
                    Icon(new Rect(r.x + (cw - 64) / 2, r.y + 6, 64, 64), sp.id, !known);
                    Label(new Rect(r.x + 4, r.y + 72, cw - 8, 18), $"<b>{(known ? sp.name : "???")}</b>", MidS);
                    Label(new Rect(r.x + 4, r.y + 90, cw - 8, 18), $"{(sp.Hybrid ? "Hybrid · " : "")}DNA {GameState.Dna(sp.id)}", MidS);
                    i++;
                }
                sy += ((Species.All.Length + 2) / 3) * (chh + 8);
            }
            else
            {
                Line("Fuse DNA from two species to make hybrid DNA. At 100 hybrid DNA the hybrid is born. After that, hybrid DNA levels it up.", Small, 10);
                foreach (var h in Species.Hybrids)
                {
                    bool owned = s.creatures.Any((c) => c.sp == h.id), ok = GameState.CanFuse(h.id), known = GameState.Seen(h.id);
                    var box = new Rect(0, sy, sw, 150);
                    Panel(box, new Color(1, 1, 1, 0.06f));
                    Fill(new Rect(8, sy + 4, sw - 16, 2), Species.Rarities[h.rar].color);
                    float cw = (sw - 40) / 3;
                    for (int i = 0; i < 3; i++)
                    {
                        float x = 8 + i * (cw + 12);
                        string id = i < 2 ? h.parents[i] : h.id;
                        bool kn = i < 2 ? GameState.Seen(id) : known;
                        Icon(new Rect(x + (cw - 56) / 2, sy + 8, 56, 56), id, !kn);
                        Label(new Rect(x, sy + 64, cw, 16), kn ? Species.ById(id).name : "???", MidS);
                        if (i < 2)
                        {
                            int have = GameState.Dna(id), need = Species.FuseCost(id);
                            Bar(new Rect(x + 6, sy + 84, cw - 12, 5), have / (float)need, Teal);
                            Label(new Rect(x, sy + 90, cw, 16), $"{have}/{need}", MidS);
                        }
                        else Label(new Rect(x, sy + 84, cw, 16), owned ? $"DNA {GameState.Dna(id)}" : $"{GameState.Dna(id)}/100", MidS);
                        if (i < 2) Label(new Rect(x + cw - 2, sy + 24, 16, 20), i == 0 ? "+" : "=", H2);
                    }
                    if (Button(new Rect(8, sy + 110, sw - 16, 34), "Fuse", ok ? Teal * 0.6f : (Color?)null, ok))
                    {
                        var r = GameState.Fuse(h.id);
                        if (!r.ok) { Toast(r.why, Bad); return; }
                        if (r.creature != null) { Sfx.Play("caught"); Toast($"{h.name} is born!", Good); Go(r.creature); }
                        else { Sfx.Play("loot"); Toast($"+{r.gain} {h.name} DNA", Good); }
                        Up(r);
                        return;
                    }
                    sy += 158;
                }
            }
        }

        void CreatureSheet(Creature c)
        {
            if (!GameState.save.creatures.Contains(c)) { Back(); return; }
            var sp = c.Species; var el = Species.Elements[sp.el];
            int cost = c.LevelCost, have = GameState.Dna(c.sp);
            bool team = GameState.save.team.Contains(c.id), maxed = c.lvl >= Species.MaxLevel;
            Portrait(sp.id, 200);
            Line($"{sp.name}  {Small_($"Lv {c.lvl}")}", Big, 2);
            Line(Chips(sp) + (sp.Hybrid ? " · Hybrid" : ""), Body, 8);
            float cw = sw / 4;
            string[] vals = { c.Hp.ToString(), c.Atk.ToString(), c.Spd.ToString(), c.Power.ToString() }, labs = { "HP", "Attack", "Speed", "Power" };
            for (int i = 0; i < 4; i++) { Label(new Rect(i * cw, sy, cw, 22), $"<b>{vals[i]}</b>", new GUIStyle(H2) { alignment = TextAnchor.UpperCenter }); Label(new Rect(i * cw, sy + 22, cw, 16), labs[i], MidS); }
            sy += 46;
            Line($"{sp.blurb} Special move: {el.move}. Potential {c.iv[0]}/{c.iv[1]}/{c.iv[2]} of 10.", Small, 8);
            SheetBar(maxed ? 1 : have / (float)cost, Teal, "DNA", maxed ? $"{have}" : $"{have}/{cost}");
            if (SheetButton(maxed ? "Max level" : $"Level up · {cost} DNA", el.color * 0.7f, !maxed && have >= cost))
            {
                var r = GameState.LevelUpCreature(c);
                if (!r.ok) { Toast(r.why, Bad); return; }
                Sfx.Play("win");
                Toast($"{sp.name} reached level {c.lvl}!", Good);
                Up(r);
            }
            if (SheetButton(team ? "★ On team (remove)" : "☆ Add to team", Soft)) GameState.ToggleTeam(c);
            if (Sure("release", "Release for DNA", "Tap again to release", Danger))
            {
                var r = GameState.Release(c);
                if (!r.ok) { Toast(r.why, Bad); return; }
                Toast($"{sp.name} went back through the Rift. +{r.dnaN} DNA");
                Back();
            }
        }

        /* ------------------ Bag ------------------ */

        void BagSheet()
        {
            var s = GameState.save; var it = s.items;
            Line("Bag", Big, 8);
            Row($"{it.orbs} Rift Orbs", "Flick them to catch creatures", null, null, GameState.Me.color);
            Row($"{it.darts} DNA Darts", "Fire them to collect DNA", null, null, Gold);
            Row($"{it.shards} Rift Shards", "Claim, recharge and upgrade Rifts", null, null, new Color(0.7f, 0.5f, 1f));
            Heading($"Eggs · {s.eggs.Count}/{GameState.MAX_EGGS}");
            if (s.eggs.Count == 0) Line("No eggs yet. You find them in supply caches, sometimes when hacking Rifts, in the daily bonus, the arena and from Apex raids. Walk to hatch them.", Small, 8);
            else
            {
                foreach (var e in s.eggs.OrderByDescending((x) => x.inc).ToList())
                {
                    var k = GameState.Eggs[e.km];
                    Panel(new Rect(0, sy, sw, 64), new Color(1, 1, 1, 0.06f));
                    EggIcon(new Rect(10, sy + 8, 38, 48), e.km);
                    Label(new Rect(58, sy + 8, sw - 170, 20), Col(k.name, k.color), H2);
                    if (e.inc)
                    {
                        Label(new Rect(58, sy + 28, sw - 70, 16), $"Incubating · {Dist(e.walked)} / {e.km} km", Small);
                        Bar(new Rect(58, sy + 48, sw - 72, 6), (float)(e.walked / (e.km * 1000.0)), k.color);
                    }
                    else
                    {
                        Label(new Rect(58, sy + 30, sw - 170, 16), "Waiting for an incubator", Small);
                        if (Button(new Rect(sw - 104, sy + 14, 94, 36), "Incubate", k.color * 0.6f, s.eggs.Count((x) => x.inc) < GameState.INCUBATORS, BtnS))
                        { var r = GameState.Incubate(e); if (r.ok) Toast("Egg in the incubator. Start walking!", Good); else Show(r); }
                    }
                    sy += 72;
                }
                Line($"{GameState.INCUBATORS} incubators. Eggs in them hatch as you walk. Longer eggs hold rarer creatures.", Small, 8);
            }
            Heading("Rift keys");
            var keys = s.keys.Select((kv) => (kv.Key, kv.Value, d: DistTo(kv.Value.lat, kv.Value.lng))).OrderBy((x) => x.d).ToList();
            if (keys.Count == 0) Line("No keys yet. Hacking a Rift often gives you its key. You need keys to link Rifts.", Small);
            foreach (var (id, key, d) in keys) Row(key.name, $"{Dist(d)} away", $"{key.n} key{(key.n > 1 ? "s" : "")}");
        }

        /* ------------------ Arena ------------------ */

        void ArenaSheet()
        {
            var A = GameState.Arena();
            int k = GameState.ArenaTierOf(A.trophies);
            var T0 = GameState.ArenaTiers[k]; var T1 = k + 1 < GameState.ArenaTiers.Length ? GameState.ArenaTiers[k + 1] : null;
            float frac = T1 != null ? (A.trophies - T0.min) / (float)(T1.min - T0.min) : 1;
            var mine = GameState.Team();
            Line("Arena", Big, 8);
            Panel(new Rect(0, sy, sw, 84), new Color(T0.color.r, T0.color.g, T0.color.b, 0.15f));
            Label(new Rect(12, sy + 8, sw - 24, 22), Col($"<b>{T0.name}</b>", T0.color), H2);
            Label(new Rect(12, sy + 30, sw - 24, 16), $"{A.trophies} trophies · {A.wins} wins, {A.losses} losses", Small);
            Bar(new Rect(12, sy + 50, sw - 24, 6), frac, T0.color);
            Label(new Rect(12, sy + 60, sw - 24, 18), T1 != null ? $"{T1.min - A.trophies} to {T1.name}: {T1.reward}" : "Top rank!", Tiny);
            sy += 92;
            Panel(new Rect(0, sy, sw, 60), new Color(1, 1, 1, 0.06f));
            Label(new Rect(12, sy + 8, sw - 120, 20), "<b>Daily chest</b>", H2);
            Label(new Rect(12, sy + 30, sw - 120, 30), $"Win 3 arena battles today ({Math.Min(3, A.dayWins)}/3): 10 orbs · 20 darts · 8 shards · 5 km egg", Tiny);
            if (A.chest) Label(new Rect(sw - 100, sy, 90, 60), Col("Opened ✓", Good), Right);
            else if (Button(new Rect(sw - 100, sy + 12, 90, 36), "Open", A.dayWins >= 3 ? Gold * 0.6f : (Color?)null, A.dayWins >= 3, BtnS))
            {
                var r = GameState.ClaimArenaChest();
                if (r.ok) { Sfx.Play("loot"); Toast($"Arena chest: {r.loot}{EggNote(r.egg)}", Good); Up(r); }
            }
            sy += 68;
            Heading("Choose a rival");
            int myPower = mine.Sum((c) => c.Power);
            for (int i = 0; i < A.rivals.Count; i++)
            {
                var rv = A.rivals[i];
                var f = GameState.Factions[rv.faction];
                var box = new Rect(0, sy, sw, 170);
                Panel(box, new Color(1, 1, 1, 0.06f));
                Dot(new Rect(12, sy + 14, 10, 10), f.color);
                Label(new Rect(28, sy + 8, sw - 160, 22), $"<b>{rv.name}</b>  {Small_($"{rv.trophies} trophies")}", H2);
                var lc = rv.level == "Easy" ? Good : rv.level == "Even" ? Gold : Bad;
                Label(new Rect(sw - 70, sy + 8, 60, 20), Col(rv.level, lc), Right);
                float cw = (sw - 24) / 3;
                for (int j = 0; j < rv.team.Count && j < 3; j++)
                {
                    var c = rv.team[j];
                    Icon(new Rect(12 + j * cw + (cw - 60) / 2, sy + 32, 60, 60), c.sp);
                    Label(new Rect(12 + j * cw, sy + 92, cw, 16), $"{Species.ById(c.sp).name} · {c.lvl}", MidS);
                }
                int theirPower = rv.team.Sum((c) => c.Power);
                Label(new Rect(12, sy + 116, sw - 130, 40), $"Power {theirPower:N0} vs your {myPower:N0} · win +{rv.win}, lose {rv.loss}", Tiny);
                if (Button(new Rect(sw - 110, sy + 118, 100, 40), "Battle", Danger)) { int idx = i; Close(); Game.I.StartDuel(idx); return; }
                sy += 178;
            }
            if (SheetButton("New rivals", Soft)) GameState.NewRivals();
            Line($"Your team: {string.Join(", ", mine.Select((c) => $"{c.Species.name} ({c.lvl})"))}. Change it in the Lab with ★. Arena battles work anywhere; running away counts as a loss.", Small);
        }

        /* ------------------ Teams ------------------ */

        float teamsAt; int teamsRifts; Dictionary<string, int> teamsCount;

        void TeamsSheet()
        {
            string me = GameState.save.agent.faction;
            // Counting 1.5 km of Rifts is slow, so it's worked out every few seconds.
            if (Time.time - teamsAt > 3 || teamsCount == null)
            {
                var here = Game.I.map;
                var near = World.Near(here.lat, here.lng, 1500, Rng.NowMs()).rifts.Where((r) => World.Dist(here.lat, here.lng, r.lat, r.lng) <= 1500).ToList();
                teamsCount = GameState.Control(near);
                teamsRifts = near.Count;
                teamsAt = Time.time;
            }
            var rifts = new int[teamsRifts];
            var n = teamsCount;
            int total = Math.Max(1, rifts.Length);
            int wait = GameState.SwitchWait;
            Line("Teams", Big, 8);
            if (rifts.Length > 0)
            {
                Heading("Who holds your area");
                float x = 0;
                foreach (var f in new[] { "W", "B", "P", "H", "none" })
                {
                    float wd = sw * n[f] / total;
                    Fill(new Rect(x, sy, wd, 14), f == "none" ? GameState.Neutral : GameState.Factions[f].color);
                    x += wd;
                }
                sy += 20;
                Line(string.Join("  ", new[] { "W", "B", "P", "H" }.Select((f) => Col($"{GameState.Factions[f].name} {Math.Round(n[f] * 100.0 / total)}%", GameState.Factions[f].color))) + $"  Unclaimed {Math.Round(n["none"] * 100.0 / total)}%", Small, 4);
                Line($"{rifts.Length} Rifts within 1.5 km of you.", Small, 8);
            }
            foreach (var id in new[] { "W", "B", "P", "H" })
            {
                var F = GameState.Factions[id];
                float top = sy;
                Line($"{Col($"<b>{(F.npc ? "The " : "")}{F.name}</b>", F.color)}{(id == me ? " · your team" : F.npc ? " · machines, not a team you can join" : "")}", H2, 2);
                Line($"<i>\"{F.motto}\"</i>", Small, 2);
                Line(F.about, Small, 6);
                Fill(new Rect(-10, top, 4, sy - top - 6), F.color);
                if (!F.npc && id != me && wait > 0) SheetButton($"Join the {F.name}", null, false);
                else if (!F.npc && id != me && Sure("switch" + id, $"Join the {F.name}", $"Tap again to join the {F.name}", F.color * 0.6f))
                {
                    var r = GameState.SwitchTeam(id);
                    if (!r.ok) { if (!string.IsNullOrEmpty(r.why)) Toast(r.why, Bad); return; }
                    Sfx.Play("caught");
                    Toast($"Welcome to the {F.name}, Agent {GameState.save.agent.name}!{(r.left > 0 ? $" Your {r.left} Rift{(r.left > 1 ? "s" : "")} stay with the {GameState.Factions[r.from].name}." : "")}", Good);
                    Game.I.map.Recolor();
                    Game.I.Refresh();
                    Auth.Publish(GameState.save.agent.name, GameState.save.agent.faction, GameState.Level, GameState.save.agent.xp);
                }
                sy += 6;
            }
            Line(wait > 0 ? $"You can switch team again in {wait} day{(wait > 1 ? "s" : "")}." : $"You can switch team once every {GameState.SWITCH_DAYS} days. Your Rifts stay with your old team and your links and fields are lost; you keep your creatures, items and XP.", Small);
        }

        /* ------------------ Weather ------------------ */

        void WeatherSheet()
        {
            var w = Weather.Now;
            if (w == null) { Line("Weather", Big, 8); Line("No weather yet. It loads once the GPS has found you and you're online.", Body); return; }
            var el = Species.Elements[Weather.Boost.Value];
            Line($"{Weather.Name(w)} · {w.temp}°C", Big, 4);
            Line($"Wind {w.wind} km/h. This is the real weather where you are.", Small, 8);
            Line(Col($"{el.name} creatures are boosted", el.color), H2, 4);
            Line("More of them appear, they come 3 levels stronger, and catching one gives 25% more XP. Boosted creatures have a blue glow on the map.", Small, 8);
            foreach (var x in Species.Wild.Where((x) => x.el == Weather.Boost.Value))
            {
                bool known = GameState.Seen(x.id);
                Row(known ? x.name : "???", Species.Rarities[x.rar].name, null, x.id, null, true, !known);
            }
            Heading("What each weather brings");
            foreach (var kv in Weather.Kinds)
                Line($"{(kv.Key == w.kind ? "<b>" : "")}{kv.Value.name}{(kv.Key == w.kind ? "</b>" : "")}: {Col(Species.Elements[kv.Value.el].name, Species.Elements[kv.Value.el].color)}", Small, 2);
            sy += 6;
            Line("Weather data by Open-Meteo.com", MidS);
        }

        /* ------------------ Missions & daily bonus ------------------ */

        void MissionsSheet()
        {
            var ms = GameState.GetMissions();
            bool allClaimed = ms.list.All((m) => m.claimed);
            var r = GameState.MissionReward;
            var surge = Species.ById(ms.surge);
            Line("Field missions", Big, 8);
            int lp = GameState.LoginPending();
            if (Row("Daily bonus", lp > 0 ? $"Day {lp} is ready to claim!" : $"Day {GameState.save.login.streak} claimed. Come back tomorrow.", "›", null, Gold, true, false, lp > 0 ? Gold * 0.35f : (Color?)null)) Go("daily");
            Line($"New missions every day. Each pays {r} and 300 XP. Finish all three for a Rift Surge.", Small, 10);
            for (int i = 0; i < ms.list.Count; i++)
            {
                var m = ms.list[i];
                bool done = m.got >= m.need;
                Panel(new Rect(0, sy, sw, m.claimed || !done ? 60 : 100), new Color(1, 1, 1, done ? 0.1f : 0.05f));
                Label(new Rect(12, sy + 8, sw - 120, 20), $"<b>{m.text}</b>", H2);
                Label(new Rect(sw - 110, sy + 8, 100, 20), m.kind == "walk" ? $"{Dist(m.got)} / {Dist(m.need)}" : $"{m.got:0} / {m.need}", new GUIStyle(Small) { alignment = TextAnchor.UpperRight });
                Bar(new Rect(12, sy + 34, sw - 24, 6), (float)(m.got / m.need), done ? Good : Teal);
                if (m.claimed) Label(new Rect(12, sy + 42, sw, 16), "Claimed ✓", Tiny);
                else if (done && Button(new Rect(12, sy + 50, sw - 24, 40), "Claim reward", Teal * 0.6f))
                {
                    var res = GameState.ClaimMission(i);
                    if (res.ok) { Sfx.Play("loot"); Toast($"Mission reward: {res.loot}", Good); Up(res); }
                    return;
                }
                sy += (m.claimed || !done ? 60 : 100) + 8;
            }
            bool knownSurge = GameState.Seen(surge.id);
            Panel(new Rect(0, sy, sw, 150), new Color(0.7f, 0.36f, 1f, 0.12f));
            Icon(new Rect(10, sy + 10, 80, 80), surge.id, !knownSurge);
            Label(new Rect(100, sy + 10, sw - 110, 20), "<b>Rift Surge</b>", H2);
            Label(new Rect(100, sy + 32, sw - 110, 60), $"60 {(knownSurge ? surge.name : "mystery creature")} DNA · 10 orbs · 10 shards · 5 km egg · 800 XP", Small);
            if (ms.bonus) Label(new Rect(12, sy + 104, sw - 24, 30), "Claimed ✓ Come back tomorrow.", Small);
            else if (Button(new Rect(12, sy + 100, sw - 24, 40), "Claim Rift Surge", allClaimed ? Gold * 0.6f : (Color?)null, allClaimed))
            {
                var res = GameState.ClaimBonus();
                if (res.ok) { Sfx.Play("caught"); Toast($"Rift Surge! +60 {Species.ById(res.sp).name} DNA, 10 orbs, 10 shards{EggNote(res.egg)}", Good); Up(res); }
                return;
            }
            sy += 158;
        }

        void DailySheet()
        {
            int p = GameState.LoginPending();
            int cur = p > 0 ? p : GameState.save.login.streak;
            Line("Daily bonus", Big, 4);
            Line("Play every day for a week of rewards. Day 7 has a 10 km egg. Miss a day and you start again from day 1.", Small, 10);
            float cw = (sw - 18) / 4, ch = 96;
            for (int i = 0; i < 7; i++)
            {
                int n = i + 1;
                string state = n < cur || (p == 0 && n == cur) ? "got" : n == cur ? "today" : "";
                var r = new Rect((i % 4) * (cw + 6), sy + (i / 4) * (ch + 6), cw, ch);
                Panel(r, state == "today" ? Gold * 0.35f : new Color(1, 1, 1, state == "got" ? 0.12f : 0.05f));
                Label(new Rect(r.x, r.y + 6, cw, 16), $"Day {n}", MidS);
                if (n == 7) EggIcon(new Rect(r.x + (cw - 24) / 2, r.y + 24, 24, 30), 10);
                else Label(new Rect(r.x, r.y + 22, cw, 30), state == "got" ? Col("✓", Good) : "Gift", new GUIStyle(H2) { alignment = TextAnchor.MiddleCenter });
                Label(new Rect(r.x + 3, r.y + 56, cw - 6, 40), GameState.LoginRewards[i].ToString(), new GUIStyle(Tiny) { wordWrap = true, alignment = TextAnchor.UpperCenter });
            }
            sy += 2 * (ch + 6) + 8;
            if (p > 0)
            {
                if (SheetButton($"Claim day {p} · +{100 * p} XP", Gold * 0.6f, true, 52))
                {
                    var r = GameState.ClaimLogin();
                    if (r.ok)
                    {
                        Sfx.Play("loot");
                        Toast($"Day {r.streak} bonus: {r.loot}{(r.loot.egg > 0 && r.egg == null ? " (your egg bag was full)" : "")}", Good);
                        Up(r);
                    }
                }
            }
            else Line("Claimed for today. Come back tomorrow!", Mid);
        }

        /* ------------------ Scan ------------------ */

        void ScanSheet()
        {
            var me = Game.I.map;
            var ents = Game.I.ents;
            var rows = new List<(object e, double d)>();
            foreach (var s in ents.spawns) { double d = World.Dist(me.lat, me.lng, s.lat, s.lng); if (!GameState.IsGone(s) && d < MapView.SIGHT) rows.Add((s, d)); }
            foreach (var r in ents.rifts) rows.Add((r, World.Dist(me.lat, me.lng, r.lat, r.lng)));
            foreach (var c in ents.caches) rows.Add((c, World.Dist(me.lat, me.lng, c.lat, c.lng)));
            var top = rows.Where((x) => x.d < 600).OrderBy((x) => x.d).Take(30).ToList();
            Line("Rift scan", Big, 4);
            Line("Creatures within 300 m, Rifts and caches within 600 m. Creatures move on every 10 minutes.", Small, 10);
            if (top.Count == 0) { Line("Nothing nearby. Go for a walk!", Body); return; }
            foreach (var (e, d) in top)
            {
                string tag = d <= GameState.RANGE ? Col("In range", Good) : "›";
                bool hit = false;
                if (e is Spawn s) { var sp = Species.ById(s.sp); hit = Row(sp.name, $"{Col(Species.Rarities[sp.rar].name, Species.Rarities[sp.rar].color)} · {Dist(d)}", tag, sp.id); }
                else if (e is Rift r)
                {
                    var st = GameState.State(r); var a = GameState.ApexAt(r);
                    string apex = a != null && !a.beaten ? Col($"Apex {a.boss.Species.name}", ApexRed) + " · " : "";
                    hit = Row(r.name, $"{apex}{(st.mine ? "Yours" : st.faction != null ? GameState.Factions[st.faction].name : "Unclaimed")} · {Dist(d)}", tag, null, GameState.RiftColor(st));
                }
                else if (e is Cache c) hit = Row(c.name, $"Supply cache · {Dist(d)}", tag, null, Gold);
                if (hit) { Go(e); return; }
            }
        }

        /* ------------------ Profile, levels, leaderboard ------------------ */

        void ProfileSheet()
        {
            var s = GameState.save; var a = s.agent; var F = GameState.Me; var st = s.stats;
            int L = GameState.Level;
            int held = s.rifts.Values.Count((o) => o.mine && o.faction == a.faction);
            var buddy = GameState.Team().FirstOrDefault();
            float top = sy;
            Line(a.name, Big, 2);
            Line($"{Col(F.one, F.color)} · Level {L} {GameState.Title(L)}", Body, 8);
            Fill(new Rect(-10, top, 4, sy - top - 8), F.color);
            if (SheetButton($"Teams and who holds your area", Soft)) { Go("teams"); return; }
            SheetBar(GameState.LevelFrac, F.color, "XP", $"{GameState.Into:N0}/{GameState.Need:N0}");
            Line($"{a.xp:N0} XP in total.{(L < GameState.MAX_LEVEL ? $" {GameState.Need - GameState.Into:N0} more to level {L + 1}." : " Top level!")}", Small, 8);
            float hw = (sw - 8) / 2;
            if (Button(new Rect(0, sy, hw, 42), "Levels", Soft)) { Go("levels"); return; }
            if (Button(new Rect(hw + 8, sy, hw, 42), "Leaderboard", Soft)) { Go("board"); return; }
            sy += 50;
            var stats = new (string v, string l)[]
            {
                (GameState.Aether.ToString("N0"), "Aether"), (held.ToString(), "Rifts held"), (s.links.Count.ToString(), "Links"),
                (s.fields.Count.ToString(), "Fields"), (st.caught.ToString(), "Caught"), (s.creatures.Count.ToString(), "Creatures"),
                (st.wins.ToString(), "Battles won"), (st.hacks.ToString(), "Hacks"), (Dist(st.meters), "Walked"),
            };
            float cw = sw / 3;
            for (int i = 0; i < stats.Length; i++)
            {
                float x = (i % 3) * cw, y = sy + (i / 3) * 48;
                Label(new Rect(x, y, cw, 22), $"<b>{stats[i].v}</b>", new GUIStyle(H2) { alignment = TextAnchor.UpperCenter });
                Label(new Rect(x, y + 22, cw, 16), stats[i].l, MidS);
            }
            sy += 3 * 48 + 8;
            if (buddy != null)
            {
                Heading("Walking buddy");
                Row(buddy.Species.name, $"Finds 5 DNA every {GameState.BUDDY_M} m you walk · next in {Dist(GameState.BUDDY_M - s.walk.buddy)}", null, buddy.sp);
                Line($"Supply stash every {Dist(GameState.STASH_M)}: next in {Dist(GameState.STASH_M - s.walk.stash)}. Your buddy is the first creature on your team (★ in the Lab).", Small, 8);
            }
            Heading("Medals");
            var medals = GameState.MedalProgress();
            float mw = (sw - 16) / 3, mh = 86;
            for (int i = 0; i < medals.Count; i++)
            {
                var (m, tier, value, next) = medals[i];
                var t = tier > 0 ? GameState.Tiers[tier - 1] : null;
                var r = new Rect((i % 3) * (mw + 8), sy + (i / 3) * (mh + 8), mw, mh);
                Panel(r, t != null ? new Color(t.color.r, t.color.g, t.color.b, 0.2f) : new Color(1, 1, 1, 0.04f));
                string Val(double v) => m.div > 0 ? (v / m.div).ToString("N1") : v.ToString("N0");
                Label(new Rect(r.x + 4, r.y + 6, mw - 8, 18), $"<b>{m.name}</b>", MidS);
                Label(new Rect(r.x + 4, r.y + 24, mw - 8, 16), t != null ? Col(t.name, t.color) : "Not yet", MidS);
                Label(new Rect(r.x + 4, r.y + 42, mw - 8, 40), next != null ? $"{Val(value)} / {Val(next.Value)} {m.what}" : $"{Val(value)} {m.what}", new GUIStyle(Tiny) { wordWrap = true, alignment = TextAnchor.UpperCenter });
            }
            sy += ((medals.Count + 2) / 3) * (mh + 8) + 4;
            Line($"<i>\"{F.motto}\"</i>", MidS);
        }

        void LevelsSheet()
        {
            int L = GameState.Level;
            Line("Agent levels", Big, 4);
            Line("Earn XP by catching and darting creatures, hacking and claiming Rifts, linking, battling, fusing, finishing missions, earning medals and walking. Every level up gives you supplies.", Small, 10);
            for (int n = 1; n <= GameState.MAX_LEVEL; n++)
            {
                var rw = GameState.LevelReward(n);
                string unlock = n % 2 == 0 && n <= 14 ? $" · Rift upgrades to L{Math.Min(8, 1 + n / 2)}" : "";
                string title = n % 5 == 0 ? $" · New title: <b>{GameState.Title(n)}</b>" : "";
                Row($"{n}.  {GameState.XpFor(n):N0} XP", n == 1 ? "Where everyone starts" : $"{rw}{unlock}{title}", n < L ? "✓" : n == L ? "You" : null, null, null, true, false,
                    n == L ? Teal * 0.35f : new Color(1, 1, 1, n > L ? 0.03f : 0.07f));
            }
        }

        List<Board> board; string boardError; bool boardLoading;
        async void LoadBoard()
        {
            board = null; boardError = null; boardLoading = true;
            try { board = await Auth.Leaderboard(); }
            catch (Auth.HttpError e) { boardError = e.status == 403 ? "Your Firestore rules are blocking the leaderboard. Paste the Riftborn rules in Firebase → Firestore Database → Rules and tap Publish." : "Couldn't load the leaderboard. Check your internet connection."; }
            catch (Exception) { boardError = "Couldn't load the leaderboard. Check your internet connection."; }
            boardLoading = false;
        }

        void BoardSheet()
        {
            var me = Auth.user;
            Line("Leaderboard", Big, 4);
            if (boardLoading) { Line("Loading…", Body); return; }
            if (boardError != null) { Line(boardError, Body); return; }
            Line(me != null && me.mode == "cloud" ? "Top agents everywhere, by XP." : "Agents on this phone, by XP. With online accounts (Menu → Account) everyone shares one leaderboard.", Small, 10);
            if (board == null || board.Count == 0) { Line("No agents yet.", Body); return; }
            for (int i = 0; i < board.Count; i++)
            {
                var r = board[i];
                var fc = r.faction != null && GameState.Factions.TryGetValue(r.faction, out var f) ? f.color : Color.gray;
                Row($"{i + 1}. {r.name}", $"Level {r.level} {GameState.Title(r.level)} · {r.xp:N0} XP", null, null, fc, true, false, me != null && r.uid == me.uid ? Teal * 0.3f : (Color?)null);
            }
        }

        /* ------------------ Account & online ------------------ */

        void AccountSheet()
        {
            var u = Auth.user;
            if (u == null) { Close(); return; }
            string agent = GameState.save != null ? GameState.save.agent.name : u.name;
            string problem = u.mode == "cloud" ? Auth.SyncError : "";
            bool goes = u.mode == "local" && Auth.Online;
            bool moves = goes && Auth.Movable() != null;
            Line("Account", Big, 8);
            Row(u.name, $"{(string.IsNullOrEmpty(u.email) ? "No email" : u.email)} · {(u.mode == "cloud" ? "online account" : "account on this phone")}");
            Line(u.mode == "cloud" ? $"Your progress is saved to your account and follows you to any phone.{(Auth.LastSync > 0 ? $" Last synced {DateTimeOffset.FromUnixTimeMilliseconds(Auth.LastSync).ToLocalTime():HH:mm:ss}." : "")}"
                : "Your account and progress are stored on this phone. Uninstalling the app deletes them.", Small, 8);
            if (!string.IsNullOrEmpty(problem)) Line(Col(problem, Bad), Body, 8);
            if (goes) Line(moves ? $"Online accounts are on. Make an online account and {agent} moves to it with all your progress." : $"Online accounts are on. {agent} already moved to an online account: log in to it to carry on.", Small, 8);
            if (u.mode == "cloud" && SheetButton("Sync now", Soft)) SyncNow();
            if (goes && SheetButton(moves ? $"Take {agent} online" : "Log in online")) { Close(); Game.I.GoOnline(); return; }
            if (!Auth.IsBuiltIn && SheetButton(Auth.Online ? "Online accounts: on" : "Set up online accounts", Soft)) { Go("online"); return; }
            if (SheetButton("Log out", Danger)) { Close(); Game.I.LogOut(); }
        }

        async void SyncNow()
        {
            GameState.Write();
            await Auth.Flush();
            Toast(Auth.SyncError != "" ? Auth.SyncError : "Progress saved to your account.", Auth.SyncError != "" ? Bad : Good);
        }

        string fbProject, fbKey; List<SetupStep> fbSteps; bool fbChecking, fbReady;

        void OnlineSheet()
        {
            var u = Auth.user;
            bool isOn = Auth.Online;
            Line("Online accounts", Big, 8);
            if (u != null && u.mode == "cloud")
            {
                Line($"Online accounts are on, using the Firebase project <b>{Auth.ProjectId}</b>. You're logged in as {u.name}.", Body, 8);
                if (Sure("off", "Turn off online accounts", "Tap again to log out and turn them off", Danger)) { Auth.ClearSetup(); Close(); Game.I.LogOut(); }
                Line("Turning them off logs you out. Your online agent stays in your Firebase project for when you turn them back on.", Small);
                return;
            }
            var had = Auth.Setup;
            fbProject ??= had?.projectId ?? "";
            fbKey ??= had?.apiKey ?? "";
            Line($"{(isOn ? $"Online accounts are on, using the Firebase project <b>{Auth.ProjectId}</b>." : "Right now accounts and progress stay on this phone.")} With your own free Firebase project, agents can log in on any phone, progress is saved online, and everyone shares one leaderboard. It takes about 5 minutes and a Google account. No card needed. Use the same project as the web game and one account plays in both.", Small, 8);
            Line("1. Open console.firebase.google.com and create a project. Google Analytics can be off.\n2. Open <b>Authentication</b> and tap <b>Get started</b>. Under <b>Sign-in method</b>, turn on <b>Email/Password</b> and save.\n3. Open <b>Firestore Database</b> and tap <b>Create database</b>. Keep the suggested settings, pick <b>production mode</b>, and create it.\n4. In Firestore's <b>Rules</b> tab, paste the Riftborn rules over everything and tap <b>Publish</b>.\n5. Tap ⚙ → <b>Project settings</b>. Copy the <b>Project ID</b> and the <b>Web API key</b> into the boxes below.", Body, 8);
            float hw = (sw - 8) / 2;
            if (Button(new Rect(0, sy, hw, 40), "Open Firebase", Soft, true, BtnS)) Application.OpenURL("https://console.firebase.google.com/");
            if (Button(new Rect(hw + 8, sy, hw, 40), "Copy rules", Soft, true, BtnS)) { GUIUtility.systemCopyBuffer = Auth.Rules; Toast("Rules copied. Paste them in Firestore Database → Rules.", Good); }
            sy += 50;
            Label(new Rect(0, sy, sw, 16), "Project ID", Small); sy += 18;
            string np = GUI.TextField(P(new Rect(0, sy, sw - 78, 40)), fbProject, 200, Field);
            if (Button(new Rect(sw - 72, sy, 72, 40), "Paste", Soft, true, BtnS)) np = GUIUtility.systemCopyBuffer.Trim();
            sy += 48;
            Label(new Rect(0, sy, sw, 16), "Web API key", Small); sy += 18;
            string nk = GUI.TextField(P(new Rect(0, sy, sw - 78, 40)), fbKey, 400, Field);
            if (Button(new Rect(sw - 72, sy, 72, 40), "Paste", Soft, true, BtnS)) nk = GUIUtility.systemCopyBuffer.Trim();
            sy += 50;
            if (np != fbProject || nk != fbKey) { fbProject = np; fbKey = nk; fbReady = false; }
            if (fbSteps != null) foreach (var st in fbSteps) Line(Col(st.ok ? "✓ " : "✗ ", st.ok ? Good : Bad) + st.text, Small, 4);
            if (fbReady) Line(Col("All set! Online accounts are on.", Good), H2, 8);
            string label = fbChecking ? "Checking your project…" : fbReady ? (u == null ? "Make your online account" : Auth.Movable() != null ? $"Take {(GameState.save != null ? GameState.save.agent.name : u.name)} online" : "Log in online") : fbSteps != null ? "Check again" : "Check and turn on";
            if (SheetButton(label, null, !fbChecking))
            {
                if (fbReady) { fbReady = false; fbSteps = null; Close(); Game.I.GoOnline(); return; }
                CheckFirebase();
            }
            if (isOn && Sure("off", "Turn off online accounts", "Tap again to turn them off", Danger)) { Auth.ClearSetup(); Toast("Online accounts are off. Accounts are kept on this phone again."); Close(); }
            Line("Firebase's free plan is plenty for Riftborn. The Web API key isn't a secret: it only names your project, and the rules keep each agent's save private. Both are kept on this phone.", Small);
        }

        async void CheckFirebase()
        {
            (string apiKey, string projectId) cfg;
            try { cfg = Auth.ParseSetup(fbProject, fbKey); }
            catch (FriendlyError e) { fbSteps = new List<SetupStep> { new SetupStep { ok = false, text = e.Message } }; Sfx.Play("error"); return; }
            fbChecking = true; fbSteps = null;
            var res = await Auth.CheckSetup(cfg.apiKey, cfg.projectId);
            fbChecking = false;
            if (!string.IsNullOrEmpty(res.projectId)) fbProject = res.projectId;
            fbSteps = res.steps;
            if (!res.ok) { Sfx.Play("error"); return; }
            Auth.SaveSetup(res.apiKey, res.projectId);
            Sfx.Play("caught");
            fbReady = true;
            if (Game.I.mode == Game.Mode.Onboard) TitleScreen();
        }

        /* ------------------ Menu, Google Maps, guide ------------------ */

        static readonly Dictionary<string, string> MapNames = new Dictionary<string, string>
        {
            { "scanner", "scanner (like Ingress)" }, { "satellite", "satellite (real photos)" }, { "auto", "day and night follow your clock" },
            { "day", "always day" }, { "night", "always night" }, { "grid", "no street map (offline)" },
        };
        static readonly Dictionary<string, string> MapNext = new Dictionary<string, string>
        {
            { "scanner", "satellite" }, { "satellite", "auto" }, { "auto", "day" }, { "day", "night" }, { "night", "grid" }, { "grid", "scanner" },
        };

        void MenuSheet()
        {
            var st = GameState.save.settings;
            Line("Menu", Big, 8);
            if (SheetButton($"Sound: {(st.sound ? "on" : "off")}", Soft)) { st.sound = !st.sound; GameState.Save(); }
            if (SheetButton($"Map: {(MapNames.TryGetValue(st.map, out var mn) ? mn : "scanner")}", Soft))
            {
                st.map = MapNext.TryGetValue(st.map, out var nx) ? nx : "scanner";
                GameState.Save();
                Game.I.map.ApplySettings();
            }
            if (SheetButton($"AR camera: {(st.ar ? "on" : "off")}", Soft)) { st.ar = !st.ar; GameState.Save(); }
            string src = st.tiles == "esri" ? "Esri" : st.tiles == "osm" ? "OpenStreetMap" : $"automatic ({Game.I.map.SourceName})";
            if (SheetButton($"Map source: {(GMaps.Active ? "Google Maps" : src)}", Soft))
            {
                st.tiles = st.tiles == "auto" ? "esri" : st.tiles == "esri" ? "osm" : "auto";
                GameState.Save();
                Game.I.map.SourceChanged();
            }
            if (SheetButton($"Google Maps: {(GMaps.Key != "" ? (GMaps.State == "error" ? "key problem" : "on") : "off (add a key)")}", Soft)) { Go("gmaps"); return; }
            if (SheetButton($"Movement: {(Game.I.walkMode ? "keys / joystick (demo)" : "GPS")}", Soft)) Game.I.ToggleWalk();
            if (SheetButton($"Teams: {GameState.Me.name}", Soft)) { Go("teams"); return; }
            if (SheetButton($"Account: {Auth.user?.name}", Soft)) { Go("account"); return; }
            if (SheetButton("How to play", Soft)) { Go("guide"); return; }
            if (Sure("reset", "Start this agent over", "Tap again: this deletes this agent's progress", Danger)) { Close(); Game.I.StartOver(); return; }
            Line($"Stay aware of your surroundings. Never play while driving or cycling.\n{(GMaps.Active ? "Map data ©Google" : "Map data © OpenStreetMap contributors and Esri")}.", MidS);
        }

        string gmKey;
        void GoogleSheet()
        {
            var st = GameState.save.settings;
            gmKey ??= st.googleKey ?? "";
            Line("Google Maps", Big, 8);
            Line("Riftborn can draw your streets with Google Maps instead of the free map. It needs a Google Maps Platform API key with the <b>Map Tiles API</b> turned on.", Body, 8);
            Label(new Rect(0, sy, sw, 16), "API key", Small); sy += 18;
            gmKey = GUI.TextField(P(new Rect(0, sy, sw - 78, 40)), gmKey, 200, Field);
            if (Button(new Rect(sw - 72, sy, 72, 40), "Paste", Soft, true, BtnS)) gmKey = GUIUtility.systemCopyBuffer.Trim();
            sy += 50;
            if (GMaps.Status != "") Line(GMaps.State == "error" ? Col(GMaps.Status, Bad) : GMaps.Status, Small, 8);
            if (SheetButton("Save key"))
            {
                st.googleKey = gmKey.Trim();
                GameState.Save();
                GMaps.Reset();
                Game.I.map.SourceChanged();
                Toast(st.googleKey != "" ? "Key saved. Loading Google Maps…" : "Key removed.", Good);
                gmKey = null;
                Close();
                return;
            }
            if (!string.IsNullOrEmpty(st.googleKey) && SheetButton("Remove key", Soft))
            {
                st.googleKey = "";
                GameState.Save();
                GMaps.Reset();
                Game.I.map.SourceChanged();
                Toast("Key removed. Back to the free map.");
                gmKey = null;
                Close();
                return;
            }
            Line("How to get one: in the Google Cloud console, create a project, add billing, enable the <b>Map Tiles API</b>, then create an API key under APIs & Services → Credentials. Restrict it to the Map Tiles API and to this app. Google gives a free monthly allowance; you only pay beyond it.", Small);
        }

        void GuideSheet()
        {
            Line("How to play", Big, 8);
            var parts = new (string h, string t)[]
            {
                ("Rifts", $"Tears between worlds, pinned to real places. Walk within {GameState.RANGE} m and <b>hack</b> them for orbs, darts, shards and keys. <b>Claim</b> unclaimed Rifts for your faction, and <b>assault</b> enemy Rifts by beating their guardians in battle."),
                ("Teams", "Three teams fight over the Rifts: the <b>Wardens</b> (teal), the <b>Breachers</b> (magenta) and the <b>Primals</b> (orange). Watch out for the <b>Hollow</b> (red): Rift-eating machines that grab Rifts from everyone and guard them with corrupted Void and Volt creatures. Anyone can assault a Hollow Rift, and clearing one pays 50% more XP. Profile → Teams shows who holds your area; you can switch team once a month."),
                ("Links & fields", "Link two of your faction's Rifts with a key. Close a triangle of links to raise a <b>control field</b>: bigger fields give more <b>Aether</b>. Links can't cross. Your Rifts lose charge every day, so recharge them or they fall."),
                ("Creatures", "Riftborn creatures roam the map and move on every 10 minutes. Tap one nearby and <b>Engage</b> to meet it in AR through your camera. <b>Darts:</b> line up the gold target and fire. Hits give DNA and calm it down; bullseyes give double. <b>Orbs:</b> swipe an orb up at it. Throw when the coloured ring is small for a bonus. Calm creatures are easier to catch."),
                ("Lab", "Spend DNA to level up creatures. Fuse DNA from two species to create <b>hybrids</b> you can't find in the wild."),
                ("Missions & walking", $"Three new field missions every day. Finish all three for a Rift Surge. Your first team creature is your walking buddy: it finds DNA every {GameState.BUDDY_M} m you walk, and every kilometre you find a supply stash."),
                ("Arena", "Battle other agents' teams from anywhere. Wins earn trophies, losses cost some. Climb from Bronze through Silver, Gold, Platinum and Diamond to Legend; each new rank pays out supplies and eggs. Win three a day for the daily chest."),
                ("Apex raids", "Every day some Rifts are taken over by a huge <b>Apex</b> creature with triple health. Walk there and beat it with your team for lots of its DNA, supplies and big XP. Each Apex can be beaten once a day."),
                ("Eggs", "Eggs turn up in caches, Rift hacks, the daily bonus, the arena and Apex raids. Two incubators hatch them as you walk 2, 5 or 10 km. Longer eggs hold rarer creatures."),
                ("Daily bonus", "Play every day for a week of rising rewards (Missions → Daily bonus). Day 7 gives a 10 km egg."),
                ("Weather", "The game uses the real weather where you are. Each kind draws out one element: sun brings Ember, rain and snow bring Tide, storms bring Volt, wind and scattered cloud bring Gale, overcast brings Stone and fog brings Void. Boosted creatures are more common, stronger and worth more XP."),
                ("Caches", "Supply caches refill every 10 minutes. Great for darts."),
                ("Moving", $"You move by walking around in real life. Riftborn follows your phone's GPS, and you have to be within {GameState.RANGE} m of a Rift, cache or creature to use it. Creatures hide if you go faster than about 40 km/h, so no playing from a car."),
            };
            foreach (var (h, t) in parts) { Line(h, H2, 2); Line(t, Body, 10); }
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
                if (Button(new Rect(r.x + 20, y, w - 40, 48), label, label == "Cancel" ? Soft : (Color?)null))
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
            float y = Safe.y + 76;
            foreach (var (text, color, t) in toasts)
            {
                float a = Mathf.Clamp01((3.5f - (Time.time - t)) * 2);
                float w = Mathf.Min(W - 24, 380), h = HeightOf(text, Mid, w - 20) + 14;
                var old = GUI.color; GUI.color = new Color(1, 1, 1, a);
                var r = new Rect((W - w) / 2, y, w, h);
                var ob = GUI.backgroundColor; GUI.backgroundColor = new Color(0, 0, 0, 0.78f);
                GUI.Box(P(r), GUIContent.none, Box);
                GUI.backgroundColor = ob;
                Label(new Rect(r.x + 10, r.y + 7, w - 20, h - 10), Col(text, color), Mid);
                GUI.color = old;
                y += h + 6;
            }
        }
    }
}

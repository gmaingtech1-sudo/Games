// Riftborn — starts everything and runs the loop: accounts and onboarding,
// where you are (GPS on a phone; WASD or a joystick otherwise), the real
// weather, what's around you, walking rewards, and which screen you're on
// (map, AR encounter or battle). It starts by itself in any scene, so
// there's nothing to set up in the editor.
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;
#if UNITY_ANDROID
using UnityEngine.Android;
#endif

namespace Riftborn
{
    public class Game : MonoBehaviour
    {
        public static Game I;
        public enum Mode { Onboard, Map, Encounter, Battle }
        public Mode mode;
        public MapView map;
        public Encounter encounter;
        public Battle battle;
        public UI ui;
        public Around ents = new Around();
        public bool walkMode;
        public bool tooFast;

        // Where you start with no GPS and no save: Trafalgar Square, London.
        const double START_LAT = 51.50797, START_LNG = -0.12803;
        const double TOO_FAST = 11;          // m/s (~40 km/h): creatures hide, like in a car
        double gLat, gLng, refLat, refLng, lastFix;
        (double lat, double lng, double t)? lastGood;
        bool gpsRunning, gpsWaiting;
        float refreshT, tickT, hudT, movingT, reachT, weatherT, flushT;
        string reachText;
        public static Vector2 Joy;          // on-screen joystick (-1..1)
        bool joyHeld;
        int publishedLevel; long publishedXP; float publishedAt;
        string syncShown = "";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (I) return;
            // Our cameras and lights replace whatever the scene came with.
            foreach (var c in Object.FindObjectsByType<Camera>(FindObjectsSortMode.None)) c.gameObject.SetActive(false);
            foreach (var l in Object.FindObjectsByType<Light>(FindObjectsSortMode.None)) l.gameObject.SetActive(false);
            foreach (var a in Object.FindObjectsByType<AudioListener>(FindObjectsSortMode.None)) a.enabled = false;
            var go = new GameObject("Riftborn");
            DontDestroyOnLoad(go);
            go.AddComponent<Game>();
        }

        void Awake()
        {
            I = this;
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.High;
            Auth.Restore();
            bool saved = Auth.user != null && GameState.Load();
            ui = gameObject.AddComponent<UI>();
            var start = saved && GameState.save.lastPos != null ? GameState.save.lastPos : new LatLng { lat = START_LAT, lng = START_LNG };
            gLat = start.lat; gLng = start.lng;
            World.SetOrigin(gLat, gLng);
            map = MapView.Create();
            DontDestroyOnLoad(map.gameObject);
            map.lat = gLat; map.lng = gLng;
            map.ApplySettings();
            map.OnTap = (t) => { if (mode == Mode.Map && !ui.SheetOpen) { Sfx.Play("tap"); ui.Open(t); } };
            var e = new GameObject("Encounter"); DontDestroyOnLoad(e);
            encounter = e.AddComponent<Encounter>();
            var b = new GameObject("Battle"); DontDestroyOnLoad(b);
            battle = b.AddComponent<Battle>();
            mode = Mode.Onboard;
            ui.TitleScreen();
            if (Application.isEditor || !Application.isMobilePlatform) walkMode = true;
            else StartCoroutine(StartGps());
            GameState.OnXP += (n) => { if (mode == Mode.Map && n > 0) ui.XpPop(n); };
            Weather.OnChange += (w) =>
            {
                map.SetWeather(w);
                Refresh();
                if (mode == Mode.Map && w != null)
                {
                    var el = Species.Elements[Weather.Boost.Value];
                    ui.Toast($"{Weather.Name(w)}: {el.name} creatures are out in force.", UI.Good);
                }
            };
            if (Auth.user != null) _ = PullCloud();
        }

        /* ------------------ Accounts & onboarding ------------------ */

        // Online accounts: take the cloud save if it's newer than this phone's.
        public async Task<string> PullCloud()
        {
            var u = Auth.user;
            if (u == null || u.mode != "cloud") return null;
            string json = await Auth.PullSave(GameState.save != null ? GameState.save.updated : 0);
            if (json != null && GameState.Load(json) && mode == Mode.Onboard) ui.TitleScreen();
            return json;
        }

        // After signing up or logging in: straight in if the agent exists,
        // otherwise make one.
        public async Task AfterLogin(User u)
        {
            bool have = GameState.Load();
            if (u.mode == "cloud") { await PullCloud(); have = GameState.save != null && GameState.Load(); }
            bool adopted = Auth.TakeAdopted(), moved = Auth.TakeMoved();
            if (have && (adopted || moved))
            {
                if (u.mode == "cloud") { GameState.Write(); _ = Auth.Flush(); }
                ui.Toast(moved ? $"{GameState.save.agent.name} moved to your online account. Your progress now follows you to any phone."
                    : $"Your agent {GameState.save.agent.name} is now linked to this account.", UI.Good);
            }
            if (have) { EnterMap(null); return; }
            ui.ChooseFaction();
        }

        public void NewAgent(string faction, string starter)
        {
            GameState.NewGame(Auth.user.name, faction, starter);
            EnterMap(starter);
        }

        public void EnterMap(string freshStarter)
        {
            var s = GameState.save;
            mode = Mode.Map;
            ui.CloseAll();
            var start = s.lastPos ?? new LatLng { lat = gLat, lng = gLng };
            if (World.Dist(World.OriginLat, World.OriginLng, start.lat, start.lng) > 20000) World.SetOrigin(start.lat, start.lng);
            gLat = map.lat = start.lat; gLng = map.lng = start.lng;
            map.Rebase();
            map.Recolor();
            map.ApplySettings();
            map.SetWeather(Weather.Now);
            map.Yaw = 0;
            GameState.Tick();
            Refresh();
            ShowNews();
            GameState.Save();
            Publish(true);
            if (freshStarter != null)
            {
                var sp = Species.ById(freshStarter);
                ui.Toast($"{sp.name} joined you. Welcome to the {GameState.Me.name}, Agent {s.agent.name}!", UI.Good);
                ui.Open("guide");
            }
            else if (GameState.LoginPending() > 0) ui.Open("daily");
        }

        // Online accounts were just set up: log out of the phone account and
        // sign up (bringing this agent along) or log in.
        public async void GoOnline()
        {
            if (Auth.user != null)
            {
                bool movable = Auth.Movable() != null;
                if (GameState.save != null) GameState.Write();
                await Auth.LogOut();
                GameState.save = null;
                BackToTitle();
                if (movable) ui.SignUp(); else ui.LogIn();
                return;
            }
            ui.CloseAll();
            ui.SignUp();
        }

        public async void LogOut()
        {
            if (GameState.save != null) GameState.Write();
            await Auth.LogOut();
            GameState.save = null;
            BackToTitle();
        }

        // Delete this agent (the account stays) and make a new one.
        public async void StartOver()
        {
            GameState.Reset();
            await Auth.DropSave();
            BackToTitle();
        }

        void BackToTitle()
        {
            mode = Mode.Onboard;
            map.Rebase();
            ui.CloseAll();
            ui.TitleScreen();
        }

        /* ------------------ Location ------------------ */

        IEnumerator StartGps()
        {
            gpsWaiting = true;
#if UNITY_ANDROID
            if (!Permission.HasUserAuthorizedPermission(Permission.FineLocation))
            {
                bool answered = false;
                var cb = new PermissionCallbacks();
                cb.PermissionGranted += (_) => answered = true;
                cb.PermissionDenied += (_) => answered = true;
                Permission.RequestUserPermission(Permission.FineLocation, cb);
                float t = 0;
                while (!answered && t < 30) { t += Time.unscaledDeltaTime; yield return null; }
            }
#endif
            bool ok = false;
            try
            {
                if (Input.location.isEnabledByUser || Application.platform == RuntimePlatform.IPhonePlayer)
                {
                    Input.location.Start(5f, 1f);
                    Input.compass.enabled = true;
                    ok = true;
                }
            }
            catch (System.Exception ex) { Debug.LogWarning("Riftborn: location unavailable: " + ex.Message); }
            if (ok)
            {
                float wait = 25;
                while (Input.location.status == LocationServiceStatus.Initializing && wait > 0) { wait -= Time.unscaledDeltaTime; yield return null; }
                ok = Input.location.status == LocationServiceStatus.Running;
            }
            gpsWaiting = false;
            gpsRunning = ok;
            if (!ok)
            {
                walkMode = true;
                ui.Toast("No location. Turn on location for Riftborn, or walk with the joystick.", UI.Bad);
            }
            else walkMode = false;
        }

        public void ToggleWalk()
        {
            walkMode = !walkMode;
            if (!walkMode && !gpsRunning)
            {
                if (Application.isMobilePlatform) StartCoroutine(StartGps());
                else { walkMode = true; ui.Toast("GPS only works on a phone. Use WASD to walk."); }
            }
        }

        public string GpsNote
        {
            get
            {
                if (gpsWaiting) return "Finding your location… Riftborn is played by walking around the real world.";
                if (tooFast) return "Moving too fast. Creatures are hiding.";
                if (!walkMode) return null;
                return Application.isMobilePlatform
                    ? "Demo walking: use the joystick. (Menu → Movement for GPS.)"
                    : "PC mode: WASD / arrow keys to walk, Shift to run. Drag to turn, scroll to zoom, click things to use them.";
            }
        }

        public static Rect JoyRect => new Rect(UI.Safe.x + 16, UI.Safe.yMax - 230, 120, 120);

        void Move(float dt)
        {
            double walked = 0;
            if (walkMode)
            {
                var v = Inp.Walk;
                if (Application.isMobilePlatform) v += JoyInput();
                if (v.sqrMagnitude > 0.001f && mode == Mode.Map && !ui.SheetOpen)
                {
                    float speed = Inp.Run ? 45 : 9;
                    var d = Quaternion.Euler(0, map.Yaw, 0) * new Vector3(v.x, 0, v.y) * speed * dt;
                    gLat += d.z / 110574.0;
                    gLng += d.x / (111320.0 * System.Math.Cos(gLat * System.Math.PI / 180));
                    walked = d.magnitude;
                }
                tooFast = false;
            }
            else if (gpsRunning && Input.location.status == LocationServiceStatus.Running)
            {
                var L = Input.location.lastData;
                if (L.timestamp != lastFix)
                {
                    lastFix = L.timestamp;
                    // Walking rewards count good fixes only, and not in a car.
                    if (lastGood.HasValue && L.horizontalAccuracy < 35)
                    {
                        double d = World.Dist(lastGood.Value.lat, lastGood.Value.lng, L.latitude, L.longitude);
                        double secs = System.Math.Max(0.5, L.timestamp - lastGood.Value.t);
                        tooFast = d / secs > TOO_FAST;
                        if (d < 150 && !tooFast) walked = d;
                    }
                    if (L.horizontalAccuracy < 35 || !lastGood.HasValue) lastGood = (L.latitude, L.longitude, L.timestamp);
                    gLat = L.latitude; gLng = L.longitude;
                }
            }

            double oLat = map.lat, oLng = map.lng;
            double far = World.Dist(map.lat, map.lng, gLat, gLng);
            if (far > 300) { map.lat = gLat; map.lng = gLng; }
            else
            {
                double k = walkMode ? 1 : 1 - System.Math.Exp(-dt * 2.5);
                map.lat += (gLat - map.lat) * k; map.lng += (gLng - map.lng) * k;
            }
            var (x0, y0) = World.ToXY(oLat, oLng);
            var (x1, y1) = World.ToXY(map.lat, map.lng);
            double moved = System.Math.Sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
            if (moved > 0.02) { map.heading = Mathf.Atan2((float)(x1 - x0), (float)(y1 - y0)) * Mathf.Rad2Deg; movingT = 0.4f; }
            else if (!walkMode && Input.compass.enabled && movingT <= 0) map.heading = Input.compass.trueHeading;
            movingT -= dt;
            map.moving = movingT > 0 ? 1 : 0;

            if (walked > 0 && GameState.save != null && mode == Mode.Map) WalkRewards(GameState.Walked(walked));

            // Travelled far from where the map started: move its origin.
            if (World.Dist(World.OriginLat, World.OriginLng, map.lat, map.lng) > 3000)
            {
                World.SetOrigin(map.lat, map.lng);
                map.Rebase();
                Refresh();
            }
        }

        Vector2 JoyInput()
        {
            var r = JoyRect;
            var p = Inp.Pos;
            var v = new Vector2(p.x / UI.Scale, (Screen.height - p.y) / UI.Scale);
            if (Inp.Down && r.Contains(v)) joyHeld = true;
            if (!Inp.Held) joyHeld = false;
            if (!joyHeld) { Joy = Vector2.zero; return Joy; }
            var d = (v - r.center) / (r.width / 2);
            Joy = Vector2.ClampMagnitude(new Vector2(d.x, -d.y), 1);
            return Joy;
        }

        void WalkRewards(List<WalkNews> news)
        {
            foreach (var n in news)
            {
                if (n.kind == "buddy") ui.Toast($"Your buddy {Species.ById(n.sp).name} found 5 DNA while you walked.", UI.Good);
                else if (n.kind == "hatch") ui.Hatched(n.hatch);
                else { Sfx.Play("loot"); ui.Toast($"1 km walked! Supply stash: {n.loot}", UI.Good); }
            }
        }

        /* ------------------ Loop ------------------ */

        public void Refresh()
        {
            refreshT = 3;
            refLat = map.lat; refLng = map.lng;
            double r = Mathf.Clamp(map.RadiusM, 250, 1400);
            ents = World.Near(map.lat, map.lng, r, Rng.NowMs());
            if (tooFast) ents.spawns.Clear();
            if (GameState.save != null && mode != Mode.Onboard) map.SetEntities(ents);
            reachT = 0;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            Auth.Tick(dt);
            flushT -= dt;
            if (flushT <= 0) { flushT = 1.5f; GameState.Flush(); }
            if (mode == Mode.Map || mode == Mode.Onboard) Move(dt);
            weatherT -= dt;
            if (weatherT <= 0) { weatherT = 5; Weather.Update(map.lat, map.lng); }
            if (mode != Mode.Map) return;
            refreshT -= dt;
            if (refreshT <= 0 || World.Dist(refLat, refLng, map.lat, map.lng) > 40) Refresh();
            hudT -= dt;
            if (hudT <= 0)
            {
                hudT = 0.5f;
                ShowNews();
                foreach (var got in GameState.CheckMedals())
                {
                    var t = GameState.Tiers[got.tier - 1];
                    Sfx.Play("win");
                    ui.Toast($"{t.name} {got.m.name} medal! +{t.xp:N0} XP", UI.Good);
                    if (got.up > 0) ui.LevelUp(got.up);
                }
                GameState.save.lastPos = new LatLng { lat = map.lat, lng = map.lng };
                Publish(false);
                string problem = Auth.SyncNeedsFix ? Auth.SyncError : "";
                if (problem != syncShown) { syncShown = problem; if (problem != "") ui.Toast(problem, UI.Bad); }
            }
            tickT -= dt;
            if (tickT <= 0)
            {
                tickT = 30;
                if (GameState.Tick()) Refresh();
                GameState.Save();
            }
            if (Inp.KeyDown(UnityEngine.InputSystem.Key.Escape)) ui.Back();
        }

        // Keep the leaderboard entry current when your level changes.
        void Publish(bool force)
        {
            var s = GameState.save;
            if (s == null) return;
            int L = GameState.Level;
            if (force || L != publishedLevel || (s.agent.xp != publishedXP && Time.realtimeSinceStartup - publishedAt > 60))
            {
                publishedLevel = L; publishedXP = s.agent.xp; publishedAt = Time.realtimeSinceStartup;
                Auth.Publish(s.agent.name, s.agent.faction, L, s.agent.xp);
            }
        }

        // Messages from the game rules: missions done, Rifts lost.
        void ShowNews()
        {
            var ev = GameState.save.events;
            if (ev.Count == 0) return;
            foreach (var e in ev) ui.Toast(e, e.StartsWith("Mission") ? UI.Good : UI.Bad);
            ev.Clear();
            GameState.Save();
        }

        void OnApplicationPause(bool paused)
        {
            if (paused && GameState.save != null) { GameState.save.lastPos = new LatLng { lat = map.lat, lng = map.lng }; GameState.Write(); _ = Auth.Flush(); }
        }

        void OnApplicationQuit() { if (GameState.save != null) GameState.Write(); }

        // A line on the map saying what you can use right now.
        public string InReach()
        {
            reachT -= Time.unscaledDeltaTime;
            if (reachT > 0) return reachText;
            reachT = 1;
            double la = map.lat, ln = map.lng, R = GameState.RANGE;
            int beasts = ents.spawns.Count((s) => !GameState.IsGone(s) && World.Dist(la, ln, s.lat, s.lng) <= R);
            int rifts = ents.rifts.Count((r) => World.Dist(la, ln, r.lat, r.lng) <= R);
            int caches = ents.caches.Count((c) => GameState.CacheWait(c) == 0 && World.Dist(la, ln, c.lat, c.lng) <= R);
            var parts = new List<string>();
            if (beasts > 0) parts.Add($"{beasts} creature{(beasts > 1 ? "s" : "")}");
            if (rifts > 0) parts.Add($"{rifts} Rift{(rifts > 1 ? "s" : "")}");
            if (caches > 0) parts.Add($"{caches} cache{(caches > 1 ? "s" : "")}");
            reachText = parts.Count > 0 ? $"In reach: {string.Join(", ", parts)}. Tap to use" : null;
            return reachText;
        }

        public double DistTo(double lat, double lng) => World.Dist(map.lat, map.lng, lat, lng);

        /* ------------------ Encounters & battles ------------------ */

        public void StartEncounter(Spawn s)
        {
            if (mode != Mode.Map) return;
            if (DistTo(s.lat, s.lng) > GameState.RANGE + 5) { ui.Toast("Too far away now."); return; }
            if (GameState.save.items.orbs <= 0 && GameState.save.items.darts <= 0) { ui.Toast("You have no orbs or darts. Hack Rifts and open caches for supplies.", UI.Bad); Sfx.Play("error"); return; }
            mode = Mode.Encounter;
            map.Show(false);
            encounter.Begin(s, GameState.save.settings.ar, (res) =>
            {
                mode = Mode.Map;
                map.Show(true);
                Refresh();
                if (res != null && res.creature != null) ui.Toast($"{res.creature.Species.name} was added to your Lab.", UI.Good);
            });
        }

        void Fight(List<Creature> theirs, string intro, string winText, System.Action<bool, bool> after)
        {
            var team = GameState.Team();
            if (team.Count == 0) { ui.Toast("You need creatures to battle."); return; }
            mode = Mode.Battle;
            map.Show(false);
            battle.Begin(team, theirs, intro, winText, (won, fled) =>
            {
                mode = Mode.Map;
                map.Show(true);
                after(won, fled);
                Refresh();
            });
        }

        // Beat an enemy Rift's guardians to knock it back to unclaimed.
        public void StartBattle(Rift r)
        {
            if (mode != Mode.Map) return;
            if (DistTo(r.lat, r.lng) > GameState.RANGE + 5) { ui.Toast("Too far away now."); return; }
            var st = GameState.State(r);
            if (st.faction == null || st.faction == GameState.save.agent.faction) return;
            if (st.guard.Count == 0)
            {
                ui.Show(GameState.Neutralize(r), "Rift neutralized", $"Nobody was guarding {r.name}. It's unclaimed now.");
                Refresh();
                return;
            }
            Fight(st.guard, $"{st.guard[0].Species.name} guards {r.name}!", $"{r.name} is knocked back to unclaimed. Claim it for the {GameState.Me.name}!", (won, fled) =>
            {
                if (!won) return;
                var res = GameState.Neutralize(r);
                if (res.hollow) ui.Toast("The Hollow are driven out! +50% XP.", UI.Good);
                ui.Toast("Guardians defeated! DNA: " + string.Join(", ", res.dna.Select((d) => $"+{d.n} {Species.ById(d.sp).name}")), UI.Good);
                if (res.levelUp > 0) ui.LevelUp(res.levelUp);
                GameState.Write();
                ui.Open(r);
            });
        }

        // An Apex raid: your team against one huge creature with triple health.
        public void StartRaid(Rift r)
        {
            if (mode != Mode.Map) return;
            var a = GameState.ApexAt(r);
            if (a == null || a.beaten) return;
            if (DistTo(r.lat, r.lng) > GameState.RANGE + 5) { ui.Toast("Too far away now."); return; }
            var sp = a.boss.Species;
            Fight(new List<Creature> { a.boss }, $"The Apex {sp.name} roars! It has three times the health.", $"The Apex {sp.name} flees back through the Rift, leaving {a.dna} DNA behind.", (won, fled) =>
            {
                if (!won) return;
                var res = GameState.BeatApex(r);
                if (res.ok) ui.Show(res, "Apex defeated!", $"+{res.dnaN} {sp.name} DNA\n+{res.loot}{(res.egg != null ? "\nYou also found a 10 km egg!" : "")}\n\nA new Apex rises somewhere tomorrow.");
            });
        }

        // An arena battle against a rival agent's team. Works anywhere.
        public void StartDuel(int i)
        {
            if (mode != Mode.Map) return;
            var rivals = GameState.Arena().rivals;
            if (i < 0 || i >= rivals.Count) return;
            var rv = rivals[i];
            var theirs = rv.team.Select((c) => new Creature { id = "rv", sp = c.sp, lvl = c.lvl, iv = c.iv }).ToList();
            Fight(theirs, $"{rv.name} sends out {Species.ById(rv.team[0].sp).name}!", $"You beat {rv.name}! +{rv.win} trophies.", (won, fled) =>
            {
                var res = GameState.ArenaResult(i, won);
                if (res.ok)
                {
                    if (res.win) ui.Toast($"Victory! +{res.trophies} trophies · +{res.dnaN} {Species.ById(res.sp).name} DNA", UI.Good);
                    else ui.Toast($"{(fled ? "You left the arena" : "Defeated")}. {res.trophies} trophies", UI.Bad);
                    if (res.ranked != null) { Sfx.Play("win"); ui.Toast($"New arena rank: {res.ranked.name}! Rank rewards added{(res.egg != null ? " · egg" : "")}.", UI.Good); }
                    if (res.levelUp > 0) ui.LevelUp(res.levelUp);
                }
                ui.Open("arena");
            });
        }
    }
}

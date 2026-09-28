// Riftborn — starts everything and runs the loop: where you are (GPS on a
// phone; WASD or a joystick otherwise), what's around you, and which screen
// you're on (map, AR encounter or battle). It starts by itself in any
// scene, so there's nothing to set up in the editor.
using System.Collections;
using System.Linq;
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

        // Where you start with no GPS and no save: Trafalgar Square, London.
        const double START_LAT = 51.50797, START_LNG = -0.12803;
        double gLat, gLng, refLat, refLng, lastFix;
        bool gpsRunning, gpsWaiting;
        float refreshT, tickT, saveT, movingT, reachT;
        string reachText;
        public static Vector2 Joy;          // on-screen joystick (virtual units → -1..1)
        bool joyHeld;

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
            bool saved = GameState.Load();
            ui = gameObject.AddComponent<UI>();
            gLat = saved && GameState.save.lastLat != 0 ? GameState.save.lastLat : START_LAT;
            gLng = saved && GameState.save.lastLng != 0 ? GameState.save.lastLng : START_LNG;
            World.SetOrigin(gLat, gLng);
            map = MapView.Create();
            DontDestroyOnLoad(map.gameObject);
            map.lat = gLat; map.lng = gLng;
            map.satellite = saved && GameState.save.satellite;
            map.ChangedStyle();
            map.OnTap = (t) => { if (mode == Mode.Map && !ui.SheetOpen) ui.Open(t); };
            var e = new GameObject("Encounter"); DontDestroyOnLoad(e);
            encounter = e.AddComponent<Encounter>();
            var b = new GameObject("Battle"); DontDestroyOnLoad(b);
            battle = b.AddComponent<Battle>();
            mode = saved ? Mode.Map : Mode.Onboard;
            if (Application.isEditor || !Application.isMobilePlatform) walkMode = true;
            else StartCoroutine(StartGps());
            Refresh();
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
                ui.Toast("No location. Turn on location for Riftborn, or walk with the joystick.", new Color(1, 0.8f, 0.4f));
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
                if (gpsWaiting) return "Finding your location…";
                if (!walkMode) return null;
                return Application.isMobilePlatform
                    ? "Demo walking: use the joystick. (Settings → Movement for GPS.)"
                    : "PC mode: WASD / arrow keys to walk, Shift to run. Drag to turn, scroll to zoom, click things to use them.";
            }
        }

        public static Rect JoyRect => new Rect(UI.Safe.x + 16, UI.Safe.yMax - 210, 120, 120);

        void Move(float dt)
        {
            if (walkMode)
            {
                var v = Inp.Walk;
                if (Application.isMobilePlatform) v += JoyInput();
                if (v.sqrMagnitude > 0.001f && mode == Mode.Map && !ui.SheetOpen)
                {
                    float speed = Inp.Run ? 45 : 9;
                    var d = Quaternion.Euler(0, map.Yaw, 0) * new Vector3(v.x, 0, v.y) * speed * dt;
                    gLat += d.z / 111320.0;
                    gLng += d.x / (111320.0 * System.Math.Cos(gLat * System.Math.PI / 180));
                }
            }
            else if (gpsRunning && Input.location.status == LocationServiceStatus.Running)
            {
                var L = Input.location.lastData;
                if (L.timestamp != lastFix) { lastFix = L.timestamp; gLat = L.latitude; gLng = L.longitude; }
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
            if (GameState.save != null && moved < 50)
            {
                GameState.save.stats.meters += moved;
                foreach (var h in GameState.Walked(moved)) ui.Hatched(h);
            }

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

        /* ------------------ Loop ------------------ */

        public void Refresh()
        {
            refreshT = 3;
            refLat = map.lat; refLng = map.lng;
            ents = World.Near(map.lat, map.lng, 900, Rng.NowMs());
            if (GameState.save != null) map.SetEntities(ents);
            reachT = 0;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (mode == Mode.Map || mode == Mode.Onboard) Move(dt);
            if (mode != Mode.Map) return;
            refreshT -= dt;
            if (refreshT <= 0 || World.Dist(refLat, refLng, map.lat, map.lng) > 40) Refresh();
            tickT -= dt;
            if (tickT <= 0)
            {
                tickT = 20;
                foreach (var n in GameState.Tick()) ui.Message("Rift lost", n, new Color(1, 0.4f, 0.4f));
            }
            saveT -= dt;
            if (saveT <= 0) { saveT = 15; GameState.save.lastLat = map.lat; GameState.save.lastLng = map.lng; GameState.Save(); }
            if (Inp.KeyDown(UnityEngine.InputSystem.Key.Escape)) ui.Close();
        }

        void OnApplicationPause(bool paused)
        {
            if (paused && GameState.save != null) { GameState.save.lastLat = map.lat; GameState.save.lastLng = map.lng; GameState.Save(); }
        }

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
            var parts = new System.Collections.Generic.List<string>();
            if (beasts > 0) parts.Add($"{beasts} creature{(beasts > 1 ? "s" : "")}");
            if (rifts > 0) parts.Add($"{rifts} Rift{(rifts > 1 ? "s" : "")}");
            if (caches > 0) parts.Add($"{caches} cache{(caches > 1 ? "s" : "")}");
            reachText = parts.Count > 0 ? $"In reach: {string.Join(", ", parts)} — tap to use" : null;
            return reachText;
        }

        /* ------------------ Screens ------------------ */

        public void OnStarted()
        {
            mode = Mode.Map;
            map.Recolor();
            Refresh();
            var me = GameState.Me;
            ui.Message($"Welcome, {GameState.save.agent.name}", $"You're with the {me.name}.\n\nWalk to creatures (the ringed dinosaurs) and tap them to catch them in AR. Hack Rifts for orbs and darts, claim empty ones, and beat the guardians of enemy Rifts. Your reach is the circle around you: {GameState.RANGE} m.", me.color);
        }

        public void Restart()
        {
            GameState.Reset();
            ui.ResetOnboarding();
            mode = Mode.Onboard;
            map.Rebase();
        }

        public void StartEncounter(Spawn s)
        {
            if (mode != Mode.Map) return;
            mode = Mode.Encounter;
            map.Show(false);
            encounter.Begin(s, () =>
            {
                mode = Mode.Map;
                map.Show(true);
                Refresh();
            });
        }

        // An Apex raid: your team against one huge creature with triple health.
        public void StartRaid(Rift r)
        {
            if (mode != Mode.Map) return;
            var a = GameState.ApexAt(r);
            if (a == null || a.beaten) return;
            var team = GameState.Team();
            if (team.Count == 0) { ui.Toast("You need creatures to battle."); return; }
            var sp = a.boss.Species;
            mode = Mode.Battle;
            map.Show(false);
            battle.Begin(team, new System.Collections.Generic.List<Creature> { a.boss }, $"The Apex {sp.name} roars! It has three times the health.",
                $"The Apex {sp.name} flees back through the Rift, leaving {a.dna} DNA behind.", (won) =>
            {
                mode = Mode.Map;
                map.Show(true);
                if (won)
                {
                    var res = GameState.BeatApex(r);
                    if (res.ok)
                    {
                        string egg = res.egg != null ? "\nYou also found a 10 km egg!" : "";
                        ui.Show(res, "Apex defeated!", $"+{res.dnaN} {sp.name} DNA\n+{res.loot}{egg}\n\nA new Apex rises somewhere tomorrow.");
                    }
                }
                Refresh();
            });
        }

        public void StartBattle(Rift r)
        {
            if (mode != Mode.Map) return;
            var team = GameState.Team();
            if (team.Count == 0) { ui.Toast("You need creatures to battle."); return; }
            var st = GameState.State(r);
            if (st.guard.Count == 0)
            {
                ui.Show(GameState.Neutralize(r), "Rift neutralized", $"Nobody was guarding {r.name}. It's unclaimed now.");
                Refresh();
                return;
            }
            bool hollow = st.faction == "H";
            mode = Mode.Battle;
            map.Show(false);
            battle.Begin(team, st.guard, $"{st.guard[0].Species.name} guards {r.name}!", hollow ? "The Hollow are purged from this Rift!" : "The guardians are down!", (won) =>
            {
                mode = Mode.Map;
                map.Show(true);
                if (won)
                {
                    var res = GameState.Neutralize(r);
                    string dna = string.Join(", ", res.dna.Select((d) => $"+{d.n} {Species.ById(d.id).name} DNA"));
                    ui.Show(res, hollow ? "Rift purged!" : "Rift neutralized!", $"{r.name} is unclaimed now. Claim it for your team!\n\n{dna}");
                    GameState.Save();
                }
                Refresh();
            });
        }
    }
}

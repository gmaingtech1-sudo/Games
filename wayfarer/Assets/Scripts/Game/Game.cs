using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    public enum PlayerMode { OnFoot, InShip, Docked }
    public enum GameState { Title, Loading, Playing, Paused, Inventory, Map, Log, Station, Trade, Dead, Warping }

    /// <summary>The game itself: owns every system and runs the frame.</summary>
    public sealed partial class Game : MonoBehaviour
    {
        public static Game I { get; private set; }

        public Camera Cam;
        public PostFX Post;
        public SynthAudio Audio;
        public GameUI UI;
        public Light Torch;

        public SystemView View;
        public readonly PlayerController Player = new PlayerController();
        public ShipController Ship;
        public readonly CameraRig Rig = new CameraRig();
        public MultiTool Tool;
        public readonly Survival Survival = new Survival();
        public Combat Combat;
        public Effects Effects;

        public PlayerMode Mode = PlayerMode.OnFoot;
        public GameState State = GameState.Title;
        public GameState ReturnState = GameState.Playing;
        public float LoadProgress;
        public string LoadText = "";
        public Poi TradePoi;
        public float WarpT;
        public StarInfo WarpTarget;
        public float DeathTimer;
        public string DeathCause;
        public float Fps;

        public readonly List<(string text, float time, bool warn)> Toasts = new List<(string, float, bool)>();
        public string Prompt;
        public Poi PromptPoi;

        float autosave = 90f;
        float loadTimer;
        int terrainFrame;
        bool planetEntered;
        Transform worldParent;

        public static void Boot()
        {
            if (I != null) return;
            var go = new GameObject("Wayfarer");
            DontDestroyOnLoad(go);
            go.AddComponent<Game>();
        }

        // ───────────────────────────── start-up ───────────────────────────
        void Awake()
        {
            I = this;
            Settings.Load();
            Settings.ApplyEngine();
            GraphicsSettings.lightsUseLinearIntensity = true;
            GraphicsSettings.lightsUseColorTemperature = false;
            Application.runInBackground = true;
            QualitySettings.shadowmaskMode = ShadowmaskMode.Shadowmask;

            // retire any cameras and lights the scene came with
            foreach (var c in FindObjectsOfTypeAll<Camera>()) if (c != null && c.gameObject.scene.IsValid()) c.gameObject.SetActive(false);
            foreach (var l in FindObjectsOfTypeAll<Light>()) if (l != null && l.gameObject.scene.IsValid()) l.gameObject.SetActive(false);

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            DontDestroyOnLoad(camGo);
            Cam = camGo.AddComponent<Camera>();
            Cam.allowHDR = true;
            Cam.allowMSAA = Settings.Graphics.Msaa > 0;
            Cam.renderingPath = RenderingPath.Forward;
            Cam.clearFlags = CameraClearFlags.Skybox;
            Cam.depthTextureMode = DepthTextureMode.Depth;
            Cam.nearClipPlane = 0.1f;
            Cam.farClipPlane = 420000f;
            Cam.useOcclusionCulling = false;
            camGo.AddComponent<AudioListener>();
            Audio = camGo.AddComponent<SynthAudio>();
            Post = camGo.AddComponent<PostFX>();

            var torchGo = new GameObject("Torch");
            torchGo.transform.SetParent(camGo.transform, false);
            torchGo.transform.localPosition = new Vector3(0.3f, -0.2f, 0.1f);
            Torch = torchGo.AddComponent<Light>();
            Torch.type = LightType.Spot;
            Torch.spotAngle = 55f;
            Torch.range = 45f;
            Torch.intensity = 2.2f;
            Torch.color = new Color(1f, 0.95f, 0.85f);
            Torch.shadows = LightShadows.None;
            Torch.enabled = false;

            worldParent = new GameObject("World").transform;
            DontDestroyOnLoad(worldParent.gameObject);
            Combat = new Combat(worldParent);
            Effects = new Effects(worldParent);
            Tool = new MultiTool(camGo.transform);
            Tool.SetVisible(false);
            UI = gameObject.AddComponent<GameUI>();
            HookEvents();

            TerrainJobs.Start();
            ApplyAudioSettings();

            // the title screen shows your current system (or the starting one)
            bool hasSave = Profile.HasSave && Profile.Load();
            Galaxy.Reset(Profile.Seed);
            var star = hasSave ? Galaxy.Find(Profile.Data.StarId) ?? Galaxy.StartStar() : Galaxy.StartStar();
            BuildSystem(star, hasSave ? Profile.Data.SystemTime : 0.0);
            State = GameState.Title;
        }

        static T[] FindObjectsOfTypeAll<T>() where T : UnityEngine.Object => Resources.FindObjectsOfTypeAll<T>();

        void OnApplicationQuit()
        {
            if (State != GameState.Title && State != GameState.Loading && State != GameState.Dead && State != GameState.Warping) SaveGame();
            TerrainJobs.Stop();
        }

        void OnDestroy()
        {
            if (I == this) TerrainJobs.Stop();
        }

        void HookEvents()
        {
            Player.Footstep += () => Audio.Play(Sfx.Footstep, 0.35f, UnityEngine.Random.Range(0.9f, 1.1f));
            Player.Landed += impact =>
            {
                Audio.Play(Sfx.Land, Mathf.Clamp01(impact / 12f));
                if (impact > 15f) Survival.Damage((impact - 15f) * 5f, "fall", this);
            };
            Player.Splash += () => Audio.Play(Sfx.Splash);
            Combat.PlayerHit += (dmg, cause) =>
            {
                if (Mode == PlayerMode.OnFoot) Survival.Damage(dmg, cause, this);
                else Ship.Damage(dmg, cause);
                Audio.Play(Sfx.Hit, 0.8f);
                Rig.Shake = Mathf.Max(Rig.Shake, 0.4f);
            };
            Combat.Exploded += (pos, size) =>
            {
                Effects.Explosion(View.ToUnity(pos), size);
                double d = (pos - Rig.RefPos).magnitude;
                Audio.Play(Sfx.Explosion, Mathf.Clamp01((float)(1.2 - d / 3000.0)));
            };
            Combat.Sparked += (pos, c) => Effects.Sparks(View.ToUnity(pos), Vector3.up, c, 8, 6f);
            Combat.Message += s => Toast(s, true);
            Combat.Fired += () => Audio.Play(Mode == PlayerMode.OnFoot ? Sfx.Blaster : Sfx.Cannon, 0.6f);
            Combat.AsteroidDestroyed += (field, rock) =>
            {
                int he = Mathf.RoundToInt(rock.Radius * UnityEngine.Random.Range(0.8f, 1.4f) + 10);
                Collect("helium3", he);
                Collect("ferrite", Mathf.RoundToInt(rock.Radius * 0.5f + 4));
                if (field.Data.Rich && UnityEngine.Random.value < 0.5f) Collect(UnityEngine.Random.value < 0.5f ? "gold" : "platinum", UnityEngine.Random.Range(4, 12));
            };
            Combat.PirateDestroyed += () =>
            {
                int units = UnityEngine.Random.Range(1400, 3200);
                Profile.Data.Inv.Units += units;
                Profile.Data.Kills++;
                Toast($"Pirate destroyed  +{units:N0} units");
                if (UnityEngine.Random.value < 0.4f) Collect("salvage", 1);
            };
            Combat.DroneDestroyed += () => { Collect("ferrite", 15); Profile.Data.Inv.Units += 250; };
            Combat.CreatureKilled += c => Toast($"You killed a {c.Species.Name}");
        }

        public void ApplyAudioSettings()
        {
            Audio.Master = Settings.MasterVolume;
            Audio.MusicVol = Settings.MusicVolume;
            Audio.SfxVol = Settings.EffectsVolume;
        }

        public void ApplyGraphics()
        {
            Settings.ApplyEngine();
            Cam.allowMSAA = Settings.Graphics.Msaa > 0;
            View?.ApplyQuality(Settings.Graphics);
        }

        // ───────────────────────────── systems ────────────────────────────
        void BuildSystem(StarInfo star, double time)
        {
            if (View != null)
            {
                ClearPlanetSystems();
                Combat.ClearDrones();
                Combat.ClearPirates();
                Combat.Bolts.Clear();
                View.Dispose();
                if (Ship != null) { Destroy(Ship.Go); Ship = null; }
            }
            bool start = star == Galaxy.StartStar();
            var data = SystemGen.Generate(star, start);
            View = new SystemView(data, time, Settings.Graphics);
            View.Root.transform.SetParent(worldParent, false);
            View.OriginShifted += () => { };
            Audio.SetMood((int)(star.Seed & 0x7FFFFFFF));
            Ship = new ShipController(worldParent);
            Ship.Message += s => Toast(s, true);
            Ship.Impact += spd => { Audio.Play(Sfx.Hit, Mathf.Clamp01(spd / 40f)); Rig.Shake = Mathf.Max(Rig.Shake, Mathf.Clamp01(spd / 40f)); };
            Ship.Docked += OnDocked;
            Ship.Undocked += () => { Mode = PlayerMode.InShip; Toast("Undocked. Fly safe."); };
            Ship.LandedEvent += () =>
            {
                Audio.Play(Sfx.Land, 0.8f);
                var p = View.Ref;
                if (p != null) Effects.Dust(View.ToUnity(Ship.Pos - Ship.Up * ShipController.GearHeight), (Vector3)Ship.Up, p.Data.Ground1, 4f);
            };
            Ship.TookOff += () => Audio.Play(Sfx.Takeoff);
        }

        public PlanetBody HomePlanet
        {
            get
            {
                foreach (var p in View.Planets) if (p.Data.Type == PlanetType.Lush && !p.Data.IsMoon) return p;
                return View.Planets[0];
            }
        }

        /// <summary>A friendly landing spot: dry land, fairly flat, not too high.</summary>
        Vector3d FindLandingSpot(PlanetBody p, int seed)
        {
            var r = new Rng((ulong)seed + p.Data.Seed);
            Vector3d best = Vector3d.up;
            double bestScore = double.MinValue;
            for (int i = 0; i < 400; i++)
            {
                var d = r.OnSphere();
                d.y *= 0.55;
                d = d.normalized;
                double h = p.Field.Height(d);
                if (p.Data.HasSea && h < p.Data.SeaLevel + 8) continue;
                var n = p.Field.Normal(d);
                double flat = Vector3d.Dot(n, d);
                p.Field.Climate(d.x, d.y, d.z, h, out double m, out double t, out _);
                double score = flat * 3 - Math.Abs(h - 120) / 600 + m * 0.8 - Math.Abs(t - 0.6);
                // prefer being near the sea for a nice first view
                if (p.Data.HasSea) score += 0.6 * (1 - MathUtil.SmoothStep(20, 400, h - p.Data.SeaLevel));
                if (score > bestScore) { bestScore = score; best = d; }
            }
            return best;
        }

        public void NewGame()
        {
            Profile.DeleteSave();
            Profile.NewGame(1461384717UL);
            Galaxy.Reset(Profile.Seed);
            var star = Galaxy.StartStar();
            if (View == null || View.Data.Star.Id != star.Id) BuildSystem(star, 0);
            View.Time = 0;
            foreach (var p in View.Planets) p.UpdateSpin(0);
            Profile.Data.StarId = star.Id;
            Profile.Data.Visited.Add(star.Id);
            var home = HomePlanet;
            SwitchFrame(home);
            Vector3d spot = FindLandingSpot(home, 1);
            // face the sunrise
            Vector3 facing = (Vector3)Vector3d.ProjectOnPlane(home.SunDirLocal(Vector3d.zero), spot).normalized;
            Ship.PlaceLanded(home, spot, facing);
            Ship.Planet = home.Data.Index;
            Ship.LaunchFuel = 0f;
            Ship.PulseFuel = 60f;
            Ship.Hull = 100f;
            Ship.Shield = 100f;
            Vector3 side = Ship.Rot * Vector3.right;
            Vector3d ppos = (spot + (Vector3d)(side * (9f / (float)home.Radius))).normalized;
            Player.Place(ppos * (home.Radius + home.GroundHeightExact(ppos) + 0.2), -side + (Vector3)(Ship.Rot * Vector3.forward) * 0.3f);
            Mode = PlayerMode.OnFoot;
            Profile.Data.Inv.Add("carbon", 40);
            Survival.Refill();
            DiscoverSystem();
            BeginLoading("Waking up on " + home.Data.Name);
            Toast("Your ship's launch thrusters are empty. Find Hydrogen to fuel them.");
        }

        public void ContinueGame()
        {
            if (!Profile.Load()) { NewGame(); return; }
            var d = Profile.Data;
            Galaxy.Reset(Profile.Seed);
            var star = Galaxy.Find(d.StarId) ?? Galaxy.StartStar();
            if (View == null || View.Data.Star.Id != star.Id) BuildSystem(star, d.SystemTime);
            View.Time = d.SystemTime;
            foreach (var p in View.Planets) p.UpdateSpin(View.Time);
            PlanetBody refP = d.RefPlanet >= 0 && d.RefPlanet < View.Planets.Count ? View.Planets[d.RefPlanet] : null;
            SwitchFrame(refP);
            Ship.LaunchFuel = d.LaunchFuel;
            Ship.PulseFuel = d.PulseFuel;
            Ship.Hull = d.Hull;
            Ship.Shield = d.ShipShield;
            Ship.Pos = Profile.UnpackD(d.ShipPos);
            Ship.Rot = Profile.UnpackQ(d.ShipRot);
            Ship.Planet = d.ShipPlanet;
            Mode = (PlayerMode)Mathf.Clamp(d.Mode, 0, 2);
            if (Mode == PlayerMode.Docked && View.Station != null)
            {
                Ship.State = ShipState.Docked;
                Ship.HoldDocked(View);
            }
            else if (Mode == PlayerMode.Docked) Mode = PlayerMode.InShip;
            if (Mode != PlayerMode.Docked) Ship.State = d.ShipLanded ? ShipState.Landed : ShipState.Flying;
            if (Ship.State == ShipState.Flying) { Ship.Speed = 0; Ship.Throttle = 0; }
            if (Mode == PlayerMode.OnFoot && refP != null)
            {
                Player.Pos = Profile.UnpackD(d.PlayerPos);
                Player.Body = Profile.UnpackQ(d.PlayerRot);
                Player.Pitch = d.PlayerPitch;
                Player.Vel = Vector3d.zero;
            }
            else if (Mode == PlayerMode.OnFoot) Mode = PlayerMode.InShip;
            BeginLoading("Resuming your journey");
        }

        public void SaveGame()
        {
            if (View == null) return;
            var d = Profile.Data;
            d.StarId = View.Data.Star.Id;
            d.SystemTime = View.Time;
            d.Mode = (int)Mode;
            d.RefPlanet = View.Ref != null ? View.Ref.Data.Index : -1;
            d.PlayerPos = Profile.Pack(Player.Pos);
            d.PlayerRot = Profile.Pack(Player.Body);
            d.PlayerPitch = Player.Pitch;
            d.ShipPos = Profile.Pack(Ship.Pos);
            d.ShipRot = Profile.Pack(Ship.Rot);
            d.ShipPlanet = View.Ref != null ? View.Ref.Data.Index : -1;
            d.ShipLanded = Ship.State == ShipState.Landed;
            d.LaunchFuel = Ship.LaunchFuel;
            d.PulseFuel = Ship.PulseFuel;
            d.Hull = Ship.Hull;
            d.ShipShield = Ship.Shield;
            Profile.Save();
        }

        void BeginLoading(string text)
        {
            State = GameState.Loading;
            LoadText = text;
            LoadProgress = 0;
            loadTimer = 0;
            Rig.ResetLag();
            Post.Fade = 1f;
        }

        // ───────────────────────────── frame ──────────────────────────────
        void Update()
        {
            float rawDt = Mathf.Min(Time.unscaledDeltaTime, 0.1f);
            Fps = Mathf.Lerp(Fps, 1f / Mathf.Max(rawDt, 1e-4f), 0.05f);
            bool running = State == GameState.Playing || State == GameState.Warping || State == GameState.Station;
            float dt = running ? Mathf.Min(rawDt, 0.05f) : 0f;
            GameInput.Update(State == GameState.Playing && !UI.Modal);
            GlobalKeys();

            for (int i = Toasts.Count - 1; i >= 0; i--)
                if (Time.unscaledTime - Toasts[i].time > 6f) Toasts.RemoveAt(i);

            if (View == null) return;

            switch (State)
            {
                case GameState.Title:
                    View.Tick(rawDt * 20);
                    Rig.UpdateTitle(rawDt, this);
                    Tool.SetVisible(false);
                    Ship.SetVisible(false);
                    Post.Fade = Mathf.MoveTowards(Post.Fade, 0f, rawDt);
                    break;
                case GameState.Loading:
                    TickLoading(rawDt);
                    break;
                case GameState.Warping:
                    TickWarp(rawDt);
                    break;
                case GameState.Dead:
                    DeathTimer += rawDt;
                    Post.Fade = Mathf.Clamp01(DeathTimer * 0.6f);
                    break;
                default:
                    if (running) TickPlaying(dt);
                    break;
            }

            if (State != GameState.Title) Rig.Update(dt, this);
            View.UpdateRender(Rig.RefPos, Cam, Settings.Graphics, dt);
            Rig.Apply(Cam, View, this);
            UpdateTerrain();
            UpdatePlanetSystemsDraw();
            if (State != GameState.Title)
            {
                Ship.SetVisible(true);
                Ship.UpdateVisual(View, false);
            }
            Combat.Draw(View, Cam);
            Effects.Tick(dt, Cam, View.Ref != null ? (Vector3)Rig.RefPos.normalized : Vector3.up);
            DrawToolBeam();
            UpdateAudio(rawDt);
            Post.Damage = Mathf.MoveTowards(Post.Damage, 0f, rawDt * 0.8f);
            Post.Flash = Mathf.MoveTowards(Post.Flash, 0f, rawDt * 1.5f);
            TerrainJobs.Pump(State == GameState.Loading || State == GameState.Warping ? 12.0 : 4.0);
        }

        void GlobalKeys()
        {
            if (State == GameState.Playing && UI.Modal) return;
            if (State == GameState.Playing)
            {
                if (GameInput.RawDown(KeyCode.Escape)) { State = GameState.Paused; Audio.Play(Sfx.Click); }
                else if (GameInput.RawDown(KeyCode.Tab) || GameInput.RawDown(KeyCode.I)) { State = GameState.Inventory; Audio.Play(Sfx.Click); }
                else if (GameInput.RawDown(KeyCode.M)) { State = GameState.Map; UI.OpenMap(); Audio.Play(Sfx.Click); }
                else if (GameInput.RawDown(KeyCode.L)) { State = GameState.Log; Audio.Play(Sfx.Click); }
                else if (GameInput.RawDown(KeyCode.V) && Mode == PlayerMode.InShip) Rig.Cockpit = !Rig.Cockpit;
                else if (GameInput.RawDown(KeyCode.T) && Mode == PlayerMode.OnFoot) { Torch.enabled = !Torch.enabled; Audio.Play(Sfx.Switch); }
            }
            else if (State == GameState.Inventory || State == GameState.Map || State == GameState.Log || State == GameState.Paused || State == GameState.Trade)
            {
                bool close = GameInput.RawDown(KeyCode.Escape)
                    || State == GameState.Inventory && (GameInput.RawDown(KeyCode.Tab) || GameInput.RawDown(KeyCode.I))
                    || State == GameState.Map && GameInput.RawDown(KeyCode.M)
                    || State == GameState.Log && GameInput.RawDown(KeyCode.L);
                if (close && !UI.Capturing)
                {
                    State = Mode == PlayerMode.Docked && State == GameState.Trade ? GameState.Station : GameState.Playing;
                    if (Mode == PlayerMode.Docked && State == GameState.Playing) State = GameState.Station;
                    Audio.Play(Sfx.Click);
                }
            }
        }

        void TickLoading(float dt)
        {
            loadTimer += dt;
            View.Tick(0);
            Rig.Update(0, this);
            // wait for the ground under our feet
            bool rootsReady = true;
            foreach (var p in View.Planets) if (!p.Terrain.RootsReady) rootsReady = false;
            float groundReady = 0f;
            var planet = View.Ref;
            if (planet != null && rootsReady)
            {
                EnsurePlanetSystems();
                Vector3d focus = Mode == PlayerMode.OnFoot ? Player.Pos : Ship.Pos;
                bool have = planet.Terrain.TryMeshHeight(focus.normalized, out _);
                groundReady = have && TerrainJobs.Pending < 6 ? 1f : Mathf.Clamp01(1f - TerrainJobs.Pending / 60f);
            }
            else if (rootsReady) groundReady = 1f;
            LoadProgress = Mathf.Clamp01((rootsReady ? 0.5f : 0.1f) + groundReady * 0.5f);
            if ((rootsReady && groundReady >= 1f && loadTimer > 1.2f) || loadTimer > 25f)
            {
                State = Mode == PlayerMode.Docked ? GameState.Station : GameState.Playing;
                if (Mode == PlayerMode.OnFoot && planet != null)
                {
                    // settle onto the (now loaded) ground
                    Vector3d up = Player.Pos.normalized;
                    double g = planet.Data.Radius + planet.GroundHeight(up);
                    if (Player.Pos.magnitude < g + 0.5) Player.Pos = up * (g + 0.05);
                }
                if (Ship.State == ShipState.Landed && View.Ref != null)
                {
                    Vector3d up = Ship.Pos.normalized;
                    Ship.Pos = up * (View.Ref.Data.Radius + View.Ref.GroundHeight(up) + ShipController.GearHeight);
                }
                if (Mode == PlayerMode.Docked) Audio.Play(Sfx.Dock);
            }
            Post.Fade = Mathf.Clamp01(1f - LoadProgress) * 0.85f + 0.15f * (State == GameState.Loading ? 1f : 0f);
            if (State != GameState.Loading) Post.Fade = 0f;
        }

        void TickPlaying(float dt)
        {
            View.Tick(dt);
            Profile.Data.PlayTime += dt;
            bool controls = State == GameState.Playing;
            Prompt = null;
            PromptPoi = null;

            switch (Mode)
            {
                case PlayerMode.OnFoot:
                    if (View.Ref == null) { Mode = PlayerMode.InShip; break; }
                    var shipHere = Ship.State == ShipState.Landed ? Ship : null;
                    Vector3d before = Player.Pos;
                    Player.Tick(dt, View.Ref, controls, shipHere);
                    Profile.Data.DistanceWalked += (Player.Pos - before).magnitude;
                    if (Ship.State == ShipState.Landed) Ship.Tick(dt, View, false, Combat);
                    Tool.SetVisible(true);
                    Tool.Tick(dt, this, controls);
                    OnFootInteractions(controls);
                    break;
                case PlayerMode.InShip:
                    Tool.SetVisible(false);
                    Vector3d sb = Ship.Pos;
                    Ship.Tick(dt, View, controls, Combat);
                    Profile.Data.DistanceFlown += (Ship.Pos - sb).magnitude;
                    ShipInteractions(controls);
                    if (Ship.DropOutReason != null) { Toast(Ship.DropOutReason); Ship.DropOutReason = null; }
                    break;
                case PlayerMode.Docked:
                    Tool.SetVisible(false);
                    Ship.HoldDocked(View);
                    Ship.Tick(dt, View, false, Combat);
                    break;
            }

            CheckFrame();
            EnsurePlanetSystems();
            TickPlanetSystems(dt);
            Combat.Tick(dt, this);
            Survival.Tick(dt, this);
            Missions.Check(this);
            CheckPlanetDiscovery();

            if (Survival.Dead) Die(Mode == PlayerMode.OnFoot ? "You died" : "Your ship was destroyed");
            if (Mode != PlayerMode.OnFoot && Ship.Hull <= 0f) Die("Your ship was destroyed");

            autosave -= dt;
            if (autosave <= 0f)
            {
                bool safe = Mode == PlayerMode.Docked || Mode == PlayerMode.OnFoot && Player.Grounded || Ship.State == ShipState.Landed;
                if (safe) { SaveGame(); autosave = 120f; }
            }
        }

        // ───────────────────────────── frames ─────────────────────────────
        void CheckFrame()
        {
            Vector3d focus = Mode == PlayerMode.OnFoot ? Player.Pos : Ship.Pos;
            var target = View.PlanetForFrame(focus);
            if (target != View.Ref) SwitchFrame(target);
        }

        void SwitchFrame(PlanetBody target)
        {
            var old = View.Ref;
            if (old == target) return;
            if (Ship != null)
            {
                var m = SystemView.Convert(new SystemView.Motion { Pos = Ship.Pos, Vel = Ship.Vel, Rot = Ship.Rot }, old, target);
                Ship.Pos = m.Pos; Ship.Vel = m.Vel; Ship.Rot = m.Rot;
            }
            if (Mode == PlayerMode.OnFoot)
            {
                var m = SystemView.Convert(new SystemView.Motion { Pos = Player.Pos, Vel = Player.Vel, Rot = Player.Body }, old, target);
                Player.Pos = m.Pos; Player.Vel = m.Vel; Player.Body = m.Rot;
            }
            Combat.ConvertFrame(old, target);
            Rig.ConvertFrame(old, target);
            if (old != null) DisposePlanetSystems(old);
            View.SetReference(target);
            planetEntered = false;
            Effects.Shift(Vector3.zero);
        }

        void EnsurePlanetSystems()
        {
            var p = View.Ref;
            if (p == null) return;
            Vector3d focus = Mode == PlayerMode.OnFoot ? Player.Pos : Ship.Pos;
            double alt = focus.magnitude - p.Radius;
            bool near = alt < 9000;
            if (near)
            {
                if (p.Flora == null && p.Terrain.RootsReady) p.Flora = new FloraSystem(p, Settings.Graphics);
                if (p.Pois == null) p.Pois = new PoiSystem(p);
                if (p.Fauna == null && p.Data.SpeciesCount > 0) p.Fauna = new FaunaSystem(p);
            }
            else if (alt > 14000) DisposePlanetSystems(p);
        }

        void DisposePlanetSystems(PlanetBody p)
        {
            p.Flora?.Dispose(); p.Flora = null;
            p.Fauna?.Dispose(); p.Fauna = null;
            p.Pois?.Dispose(); p.Pois = null;
        }

        void ClearPlanetSystems()
        {
            if (View == null) return;
            foreach (var p in View.Planets) DisposePlanetSystems(p);
        }

        void TickPlanetSystems(float dt)
        {
            var p = View.Ref;
            if (p == null) return;
            Vector3d focus = Mode == PlayerMode.OnFoot ? Player.Pos : Ship.Pos;
            p.Pois?.Update(dt, focus);
            if (p.Fauna != null)
            {
                bool onFoot = Mode == PlayerMode.OnFoot;
                p.Fauna.Update(dt, focus, onFoot, onFoot && Player.Sprinting, View.Time);
            }
        }

        void UpdatePlanetSystemsDraw()
        {
            var p = View.Ref;
            if (p?.Flora != null)
                p.Flora.Update(p.Root.transform.InverseTransformPoint(Cam.transform.position), Cam, p.Root.transform.localToWorldMatrix);
        }

        void UpdateTerrain()
        {
            terrainFrame++;
            Vector3d camSys = View.RefToSys(Rig.RefPos);
            foreach (var p in View.Planets)
            {
                bool isRef = p == View.Ref;
                if (!isRef && (terrainFrame + p.Data.Index) % 15 != 0) continue;
                Vector3d local = isRef ? Rig.RefPos : p.Rotation.Inverse() * (camSys - p.Data.Position);
                p.Terrain.Update(local);
            }
        }

        public bool NearShelter()
        {
            var p = View.Ref;
            if (p?.Pois == null) return false;
            foreach (var poi in p.Pois.Pois)
            {
                if (poi.Type != PoiType.Outpost) continue;
                if ((poi.Pos - Player.Pos).magnitude < 5.5) return true;
            }
            return false;
        }

        // ───────────────────────────── interaction ────────────────────────
        void OnFootInteractions(bool controls)
        {
            var planet = View.Ref;
            if (Ship.State == ShipState.Landed)
            {
                double d = (Ship.Pos - Player.Pos).magnitude;
                if (d < 10.5)
                {
                    Prompt = "Board ship";
                    if (controls && GameInput.Down(KeyCode.E)) { BoardShip(); return; }
                }
            }
            if (planet?.Pois != null)
            {
                var poi = planet.Pois.NearestInteractable(Player.Pos, 3.2);
                if (poi != null)
                {
                    bool done = poi.Looted && poi.Type != PoiType.TradingPost && poi.Type != PoiType.Beacon;
                    Prompt = done ? poi.Label + " (already searched)" : poi.Action;
                    PromptPoi = poi;
                    if (controls && GameInput.Down(KeyCode.E) && !done) InteractPoi(poi);
                }
            }
        }

        void ShipInteractions(bool controls)
        {
            if (Ship.State == ShipState.Landed)
            {
                Prompt = Ship.LaunchFuel >= 20f ? "Take off (Space)   ·   Leave ship (E)" : "Leave ship (E)   ·   Launch thrusters need fuel";
                if (controls && GameInput.Down(KeyCode.E)) LeaveShip();
                return;
            }
            if (Ship.State != ShipState.Flying) return;
            if (Ship.CanDock(View, out string why))
            {
                Prompt = "Dock with " + View.Station.Data.Name + " (E)";
                if (controls && GameInput.Down(KeyCode.E)) { Ship.BeginDocking(View); Audio.Play(Sfx.Dock, 0.6f); }
            }
            else if (View.Ref != null && Ship.Altitude < 120f && Ship.Speed < 120f) Prompt = "Land (E)";
        }

        void BoardShip()
        {
            Mode = PlayerMode.InShip;
            Rig.ResetLag();
            Torch.enabled = false;
            Audio.Play(Sfx.Click);
        }

        void LeaveShip()
        {
            var planet = View.Ref;
            if (planet == null) return;
            Vector3 side = Ship.Rot * Vector3.right;
            Vector3d dir = (Ship.Pos + (Vector3d)(side * 7.5f)).normalized;
            Player.Place(dir * (planet.Radius + planet.GroundHeight(dir) + 0.1), Ship.Rot * Vector3.forward);
            Mode = PlayerMode.OnFoot;
            Audio.Play(Sfx.Click);
        }

        void OnDocked()
        {
            Mode = PlayerMode.Docked;
            State = GameState.Station;
            Audio.Play(Sfx.Dock);
            Ship.Shield = 100f;
            Survival.Refill();
            Toast("Welcome to " + View.Station.Data.Name);
            SaveGame();
        }

        public void Undock()
        {
            if (Mode != PlayerMode.Docked) return;
            State = GameState.Playing;
            Ship.BeginUndocking(View);
            Mode = PlayerMode.InShip;
            Audio.Play(Sfx.Takeoff, 0.6f);
        }

        void InteractPoi(Poi poi)
        {
            var r = new Rng(poi.Seed);
            var planet = View.Ref;
            switch (poi.Type)
            {
                case PoiType.Outpost:
                {
                    int units = r.Int(600, 1800);
                    Profile.Data.Inv.Units += units;
                    string item = r.Pick(new[] { "lifegel", "ionbattery", "plating" });
                    Collect(item, 1);
                    Toast($"Terminal data downloaded  +{units:N0} units");
                    RevealNearby(planet, poi, 6000, 2);
                    DiscoverPlace(poi);
                    Profile.MarkLooted(poi.Id);
                    break;
                }
                case PoiType.Beacon:
                {
                    int n = RevealNearby(planet, poi, 9000, 5);
                    Toast(n > 0 ? $"Beacon activated: {n} locations marked" : "Beacon activated: nothing new nearby");
                    DiscoverPlace(poi);
                    Profile.MarkLooted(poi.Id);
                    break;
                }
                case PoiType.Crate:
                {
                    string[] pool = { "ferrite", "carbon", "sodium", "oxygen", "hydrogen", "helium3", Items.MetalId(planet.Data.Metal) };
                    for (int i = 0; i < 3; i++) Collect(r.Pick(pool), r.Int(15, 45));
                    if (r.Chance(0.25)) Collect("warpcell", 1);
                    Profile.MarkLooted(poi.Id);
                    break;
                }
                case PoiType.Monolith:
                {
                    int units = r.Int(1500, 3500);
                    Profile.Data.Inv.Units += units;
                    UI.ShowLore(poi.Name, Lore.Monolith(poi.Seed), units);
                    DiscoverPlace(poi);
                    Profile.MarkLooted(poi.Id);
                    Audio.Play(Sfx.Discovery);
                    break;
                }
                case PoiType.Wreck:
                {
                    Collect("salvage", r.Int(1, 3));
                    Collect("ferrite", r.Int(30, 60));
                    if (r.Chance(0.4)) Collect("warpcell", 1);
                    if (r.Chance(0.5)) Collect("plating", 1);
                    UI.ShowLore(poi.Name, Lore.Wreck(poi.Seed), 0);
                    DiscoverPlace(poi);
                    Profile.MarkLooted(poi.Id);
                    break;
                }
                case PoiType.TradingPost:
                    TradePoi = poi;
                    DiscoverPlace(poi);
                    State = GameState.Trade;
                    break;
            }
            Audio.Play(Sfx.Collect);
        }

        int RevealNearby(PlanetBody planet, Poi from, double radius, int max)
        {
            if (planet?.Pois == null) return 0;
            int n = 0;
            foreach (var p in planet.Pois.Pois)
            {
                if (p == from || p.Known || n >= max) continue;
                if ((p.Pos - from.Pos).magnitude < radius) { Profile.MarkKnown(p.Id); n++; }
            }
            return n;
        }

        // ───────────────────────────── items ──────────────────────────────
        public void Collect(string id, int n)
        {
            if (n <= 0) return;
            int left = Profile.Data.Inv.Add(id, n);
            var def = Items.Get(id);
            if (left < n) Toast($"+{n - left} {def?.Name ?? id}");
            if (left > 0) { Toast("Inventory full!", true); Audio.Play(Sfx.Error); }
            else Audio.Play(Sfx.Collect, 0.7f);
        }

        public void Toast(string text, bool warn = false)
        {
            Toasts.Add((text, Time.unscaledTime, warn));
            if (Toasts.Count > 6) Toasts.RemoveAt(0);
            if (warn) Audio.Play(Sfx.Toast, 0.5f);
        }

        // ───────────────────────────── discoveries ────────────────────────
        void DiscoverSystem()
        {
            var s = View.Data.Star;
            if (Profile.Discover(new Discovery
            {
                Id = "system:" + s.Id, Kind = "System", Name = s.Name, Where = $"{s.ClassLabel} star",
                Details = $"{View.Data.Planets.Length} planets · {s.Economy} economy", Reward = 600,
            }))
                Toast("New star system discovered  +600 units");
        }

        void CheckPlanetDiscovery()
        {
            var p = View.Ref;
            if (p == null || planetEntered) return;
            Vector3d focus = Mode == PlayerMode.OnFoot ? Player.Pos : Ship.Pos;
            if (focus.magnitude > p.AtmoTop + 500) return;
            planetEntered = true;
            int reward = 1200 + (int)(p.Data.FaunaDensity * 800) + (p.Data.Type == PlanetType.Exotic ? 1500 : 0);
            if (Profile.Discover(new Discovery
            {
                Id = "planet:" + p.Data.Seed, Kind = "Planet", Name = p.Data.Name, Where = View.Data.Star.Name,
                Details = $"{p.Data.TypeLabel} · {p.Data.HazardLabel} · flora {p.Data.FloraLabel.ToLowerInvariant()} · fauna {p.Data.FaunaLabel.ToLowerInvariant()}",
                Reward = reward,
            }))
            {
                Toast($"Planet discovered: {p.Data.Name}  +{reward:N0} units");
                Audio.Play(Sfx.Discovery);
            }
        }

        public void DiscoverFauna(CreatureSpecies s)
        {
            int reward = 600 + (int)(s.Size * 450) + (s.Flyer ? 500 : 0);
            if (Profile.Discover(new Discovery { Id = s.DiscoveryId, Kind = "Fauna", Name = s.Name, Where = View.Ref.Data.Name, Details = s.Description, Reward = reward }))
            {
                Profile.Data.CreaturesScanned++;
                Toast($"New species: {s.Name}  +{reward:N0} units");
                Audio.Play(Sfx.Discovery);
                CheckAllFauna();
            }
        }

        void CheckAllFauna()
        {
            var fa = View.Ref?.Fauna;
            if (fa == null) return;
            foreach (var s in fa.Species) if (!Profile.IsDiscovered(s.DiscoveryId)) return;
            if (Profile.Discover(new Discovery { Id = "allfauna:" + View.Ref.Data.Seed, Kind = "Milestone", Name = "Every species on " + View.Ref.Data.Name, Where = View.Ref.Data.Name, Details = "All fauna catalogued", Reward = 5000 }))
                Toast("Every species on this planet catalogued!  +5,000 units");
        }

        public void DiscoverFlora(FloraSpecies s)
        {
            bool mineral = s.Kind == FloraKind.Deposit || s.Kind == FloraKind.Crystal;
            int reward = mineral ? 280 : 450;
            if (Profile.Discover(new Discovery
            {
                Id = s.DiscoveryId, Kind = mineral ? "Mineral" : "Flora", Name = s.Name, Where = View.Ref.Data.Name,
                Details = s.Resource != null ? "Yields " + Items.Get(s.Resource).Name : "", Reward = reward,
            }))
            {
                Toast($"{(mineral ? "Mineral" : "Plant")} catalogued: {s.Name}  +{reward} units");
                Audio.Play(Sfx.Discovery, 0.7f);
            }
        }

        void DiscoverPlace(Poi p)
        {
            Profile.MarkKnown(p.Id);
            Profile.Discover(new Discovery { Id = "place:" + p.Id, Kind = "Place", Name = p.Name, Where = View.Ref.Data.Name, Details = p.Label, Reward = 300 });
        }

        // ───────────────────────────── warp ───────────────────────────────
        public string CanWarp(StarInfo target)
        {
            if (target == null) return "Pick a star";
            if (target.Id == View.Data.Star.Id) return "You are here";
            if (Mode != PlayerMode.InShip || Ship.State != ShipState.Flying) return "You must be flying your ship";
            if (Ship.InAtmosphere) return "Leave the atmosphere first";
            double d = (target.GalPos - View.Data.Star.GalPos).magnitude;
            if (d > Profile.JumpRange) return $"Out of range ({d:F0} ly > {Profile.JumpRange:F0} ly)";
            if (Profile.Data.Inv.Count("warpcell") < 1) return "You need a Warp Cell";
            return null;
        }

        public void StartWarp(StarInfo target)
        {
            if (CanWarp(target) != null) return;
            Profile.Data.Inv.Remove("warpcell", 1);
            WarpTarget = target;
            WarpT = 0f;
            State = GameState.Warping;
            Audio.Play(Sfx.Warp);
            Ship.Pulsing = false;
            Combat.ClearPirates();
        }

        bool warpBuilt;

        void TickWarp(float dt)
        {
            WarpT += dt;
            Post.Warp = Mathf.Clamp01(WarpT / 1.2f) * (WarpT < 6f ? 1f : Mathf.Clamp01(1f - (WarpT - 6f) / 1.2f));
            Post.WarpTime += dt * (0.5f + Post.Warp * 2f);
            Audio.Warp = Post.Warp;
            Ship.Speed = Mathf.Lerp(Ship.Speed, 3000f, dt);
            Ship.Pos += (Vector3d)(Ship.Forward * Ship.Speed * dt);
            if (WarpT > 2.0f && !warpBuilt)
            {
                warpBuilt = true;
                Post.Flash = 0.6f;
                var target = WarpTarget;
                SwitchFrame(null);
                BuildSystem(target, UnityEngine.Random.Range(0f, 20000f));
                Profile.Data.StarId = target.Id;
                if (!Profile.Data.Visited.Contains(target.Id)) Profile.Data.Visited.Add(target.Id);
                Profile.Data.Jumps++;
                var d = View.Data;
                Ship.State = ShipState.Flying;
                Ship.Pos = d.ArrivalPosition;
                Ship.Rot = Quaternion.LookRotation((Vector3)(d.ArrivalLookAt - d.ArrivalPosition).normalized, Vector3.up);
                Ship.Vel = Vector3d.zero;
                Ship.Speed = 3000f;
                Rig.ResetLag();
            }
            if (warpBuilt)
            {
                bool ready = true;
                foreach (var p in View.Planets) if (!p.Terrain.RootsReady) ready = false;
                if (!ready && WarpT > 5.5f) WarpT = 5.5f;
                Ship.Speed = Mathf.Lerp(Ship.Speed, 120f, dt * 0.8f);
            }
            if (WarpT > 7.2f)
            {
                warpBuilt = false;
                Post.Warp = 0f;
                Audio.Warp = 0f;
                Ship.Speed = 150f;
                Ship.Throttle = 0.4f;
                Ship.Vel = (Vector3d)(Ship.Forward * Ship.Speed);
                State = GameState.Playing;
                DiscoverSystem();
                Toast($"Arrived at {View.Data.Star.Name}");
                SaveGame();
            }
        }

        // ───────────────────────────── death ──────────────────────────────
        void Die(string cause)
        {
            if (State == GameState.Dead) return;
            State = GameState.Dead;
            DeathCause = cause;
            DeathTimer = 0f;
            Audio.Play(Sfx.Explosion, 0.5f);
            Combat.ClearDrones();
            Combat.ClearPirates();
            Combat.Wanted = 0f;
        }

        public void Respawn()
        {
            Survival.Refill();
            Post.Fade = 1f;
            long lost = Profile.Data.Inv.Units / 10;
            Profile.Data.Inv.Units -= lost;
            if (Ship.Hull <= 0f || Mode != PlayerMode.OnFoot)
            {
                Ship.Hull = 100f;
                Ship.Shield = 100f;
                if (View.Station != null)
                {
                    SwitchFrame(null);
                    Ship.State = ShipState.Docked;
                    Ship.HoldDocked(View);
                    Mode = PlayerMode.Docked;
                    BeginLoading("Recovered at " + View.Station.Data.Name);
                }
                else
                {
                    var home = HomePlanet;
                    SwitchFrame(home);
                    var spot = FindLandingSpot(home, 7);
                    Ship.PlaceLanded(home, spot, Vector3.forward);
                    Mode = PlayerMode.InShip;
                    BeginLoading("Ship rebuilt on " + home.Data.Name);
                }
            }
            else
            {
                // wake up next to your ship
                var planet = View.Ref;
                if (Ship.State == ShipState.Landed && planet != null)
                {
                    Vector3 side = Ship.Rot * Vector3.right;
                    Vector3d dir = (Ship.Pos + (Vector3d)(side * 7.5f)).normalized;
                    Player.Place(dir * (planet.Radius + planet.GroundHeight(dir) + 0.2), Ship.Rot * Vector3.forward);
                    BeginLoading("Reconstructing exosuit");
                }
                else
                {
                    Mode = PlayerMode.InShip;
                    BeginLoading("Reconstructing exosuit");
                }
            }
            if (lost > 0) Toast($"Lost {lost:N0} units");
        }

        // ───────────────────────────── helpers ────────────────────────────
        void DrawToolBeam()
        {
            if (Mode != PlayerMode.OnFoot || State != GameState.Playing) return;
            if (Tool.Firing && Tool.Mode == ToolMode.Mining && !Tool.Visor)
            {
                Vector3 a = Tool.MuzzleWorld;
                Vector3 b = View.ToUnity(Tool.BeamEnd);
                Effects.Beam(a, b, new Color(1f, 0.55f, 0.2f) * 3f, 0.05f + UnityEngine.Random.value * 0.02f, Cam);
                Effects.Beam(a, b, new Color(1f, 0.9f, 0.7f) * 2f, 0.015f, Cam);
            }
        }

        void UpdateAudio(float dt)
        {
            var p = View?.Ref;
            float wind = 0f, tone = 0.5f;
            if (p != null && p.Data.HasAtmosphere && State != GameState.Title)
            {
                Vector3d pos = Rig.RefPos;
                double alt = pos.magnitude - p.Radius;
                float density = (float)Math.Exp(-Math.Max(alt, 0) / Math.Max(p.Data.AtmosphereHeight * 0.4, 1));
                wind = density * (Mode == PlayerMode.OnFoot ? 0.5f + (Player.Swimming ? -0.4f : 0f) : Mathf.Clamp01(Ship.Speed / 200f) * 0.9f + 0.1f);
                tone = Mode == PlayerMode.OnFoot ? 0.35f : Mathf.Clamp01(Ship.Speed / 250f);
            }
            if (State == GameState.Title) wind = 0f;
            Audio.Wind = Mathf.Lerp(Audio.Wind, wind, dt * 2f);
            Audio.WindTone = tone;
            bool inShip = (Mode == PlayerMode.InShip) && State != GameState.Title;
            Audio.Engine = Mathf.Lerp(Audio.Engine, inShip ? 0.15f + Ship.EngineLevel * 0.5f : 0f, dt * 3f);
            Audio.EnginePitch = inShip ? Mathf.Clamp01(Ship.Speed / 500f) : 0.3f;
            Audio.Jet = Mathf.Lerp(Audio.Jet, Mode == PlayerMode.OnFoot && Player.Jetting && State == GameState.Playing ? 0.8f : 0f, dt * 8f);
            Audio.Laser = Mathf.Lerp(Audio.Laser, Mode == PlayerMode.OnFoot && Tool.Firing && State == GameState.Playing ? 1f : 0f, dt * 12f);
            Audio.Pulse = Mathf.Lerp(Audio.Pulse, inShip && (Ship.Pulsing || Ship.PulseSpooling) ? 1f : 0f, dt * 2f);
            Audio.Underwater = Mode == PlayerMode.OnFoot && Player.Swimming ? 1f : 0f;
            Audio.MusicIntensity = State == GameState.Title ? 0.8f : Combat.Wanted > 1f || Combat.Pirates.Count > 0 ? 1f : 0.5f;
            Post.Warp = State == GameState.Warping ? Post.Warp : Mathf.MoveTowards(Post.Warp, Mode == PlayerMode.InShip && Ship.Pulsing ? 0.22f : 0f, dt * 0.8f);
            if (Ship != null && Ship.Pulsing) Post.WarpTime += dt;
        }
    }
}

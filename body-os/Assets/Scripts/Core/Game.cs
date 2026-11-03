using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace BodyOS
{
    /// <summary>
    /// The persistent game manager. Owns the single authoritative <see cref="SaveData"/> and every
    /// gameplay system. Systems are plain C# classes ticked from here, which keeps Update loops to a
    /// minimum. Scene objects (player, interactables) query systems through <see cref="I"/>.
    /// </summary>
    public sealed class Game : MonoBehaviour
    {
        public static Game I { get; private set; }

        public ContentDatabase Content { get; private set; }
        public SaveData Data { get; private set; }
        public GameSettings Settings { get; private set; }

        public ProgressionSystem Progression { get; private set; }
        public InventorySystem Inventory { get; private set; }
        public UpgradeSystem Upgrades { get; private set; }
        public BodySystem Body { get; private set; }
        public VitalsSystem Vitals { get; private set; }
        public VisionSystem Vision { get; private set; }
        public EnvironmentSystem Environment { get; private set; }
        public RealitySystem Reality { get; private set; }
        public MissionSystem Missions { get; private set; }
        public PresetSystem Presets { get; private set; }
        public ThreatSystem Threats { get; private set; }

        public PlayerController Player { get; set; }
        public UIRoot UI { get; private set; }
        public bool InGame { get; private set; }
        public bool Loading { get; private set; }

        readonly HashSet<string> flagCache = new HashSet<string>();
        readonly List<string> modalStack = new List<string>();
        float zoneTimer;
        float autosaveTimer;
        int runtimeSceneCounter;

        public bool GameplayBlocked => !InGame || Loading || modalStack.Count > 0;
        public bool IsModalOpen(string id) => modalStack.Contains(id);

        // ------------------------------------------------------------------ Lifecycle

        public static void EnsureExists()
        {
            if (I != null) return;
            var go = new GameObject("BODY.OS Game");
            go.AddComponent<Game>();
        }

        void Awake()
        {
            if (I != null && I != this) { Destroy(gameObject); return; }
            I = this;
            DontDestroyOnLoad(gameObject);

            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            Screen.orientation = ScreenOrientation.AutoRotation;
            Screen.autorotateToPortrait = false;
            Screen.autorotateToPortraitUpsideDown = false;
            Screen.autorotateToLandscapeLeft = true;
            Screen.autorotateToLandscapeRight = true;

            Content = ContentDatabase.Load();
            Settings = SaveSystem.LoadSettings();
            gameObject.AddComponent<AudioManager>();
            UI = UIRoot.Create(transform);
            ApplySettings();
        }

        void Start()
        {
            // Developer convenience: pressing Play directly in the Derelict scene starts the game.
            string scene = SceneManager.GetActiveScene().name;
            if (scene == "Derelict") ContinueOrNew();
            else ShowMainMenu();
        }

        void Update()
        {
            MobileInput.Poll();
            if (!InGame || Loading) return;
            float dt = Time.deltaTime;
            if (dt <= 0f) return; // paused

            Data.playTimeSeconds += dt;
            Environment.Tick(dt);
            Reality.Tick(dt);
            Vision.Tick(dt);
            Vitals.Tick(dt);
            Missions.Tick(dt);

            zoneTimer -= dt;
            if (zoneTimer <= 0f)
            {
                zoneTimer = 0.2f;
                PollZones();
                Threats.Poll();
            }

            autosaveTimer += dt;
            if (autosaveTimer > 120f) SaveGame(false);
        }

        void OnApplicationPause(bool paused)
        {
            if (paused && InGame) SaveGame(false);
            if (!paused) MobileInput.ResetAll();
        }

        void OnApplicationQuit()
        {
            if (InGame) SaveGame(false);
        }

        // ------------------------------------------------------------------ Flags

        public bool HasFlag(string flag) => !string.IsNullOrEmpty(flag) && flagCache.Contains(flag);

        /// <summary>Sets a persistent story flag. Missions, doors and upgrades react to flags.</summary>
        public void SetFlag(string flag)
        {
            if (Data == null || string.IsNullOrEmpty(flag) || flagCache.Contains(flag)) return;
            flagCache.Add(flag);
            Data.story.flags.Add(flag);
            GameEvents.RaiseFlag(flag);
            Missions?.OnFlag(flag);
        }

        public void Log(string entry)
        {
            if (Data == null) return;
            var log = Data.story.log;
            log.Add(System.DateTime.Now.ToString("HH:mm") + "  " + entry);
            while (log.Count > 40) log.RemoveAt(0);
        }

        // ------------------------------------------------------------------ Modal / pause handling

        /// <summary>Opens a modal layer (menu, dialog). Gameplay input is blocked and time pauses while any is open.</summary>
        public void PushModal(string id)
        {
            if (modalStack.Contains(id)) return;
            modalStack.Add(id);
            MobileInput.ResetAll();
            Time.timeScale = 0f;
            AudioListener.pause = false;
        }

        public void PopModal(string id)
        {
            modalStack.Remove(id);
            if (modalStack.Count == 0)
            {
                Time.timeScale = 1f;
                MobileInput.ResetAll();
            }
        }

        // ------------------------------------------------------------------ Game flow

        public void ShowMainMenu()
        {
            InGame = false;
            Player = null;
            modalStack.Clear();
            Time.timeScale = 1f;
            StartCoroutine(LoadSceneRoutine("MainMenu", () =>
            {
                MainMenuBackdrop.Build();
                UI.ShowMainMenu();
                AudioManager.I.PlayMusic(true);
            }));
        }

        public void ContinueOrNew()
        {
            var save = SaveSystem.Load();
            if (save != null) StartSession(save, false);
            else NewGame();
        }

        public void NewGame()
        {
            SaveSystem.DeleteSave();
            var data = new SaveData();
            foreach (var p in DefaultContent.Presets()) data.presets.Add(p);
            StartSession(data, true);
        }

        void StartSession(SaveData data, bool fresh)
        {
            Data = data;
            flagCache.Clear();
            foreach (var f in Data.story.flags) flagCache.Add(f);

            Progression = new ProgressionSystem(this);
            Inventory = new InventorySystem(this);
            Upgrades = new UpgradeSystem(this);
            Body = new BodySystem(this);
            Vitals = new VitalsSystem(this);
            Environment = new EnvironmentSystem(this);
            Reality = new RealitySystem(this);
            Vision = new VisionSystem(this);
            Missions = new MissionSystem(this);
            Presets = new PresetSystem(this);
            Threats = new ThreatSystem(this);

            if (fresh) Log("BODY.OS cold boot. Subject 7 revived.");
            else Log("Session restored.");
            EnterLocation(string.IsNullOrEmpty(Data.story.location) ? "derelict" : Data.story.location);
        }

        public void EnterLocation(string key)
        {
            var loc = Content.Location(key);
            if (loc == null || string.IsNullOrEmpty(loc.playableKey))
            {
                GameEvents.Notify((loc != null ? loc.displayName : key) + " is not reachable yet.", NoticeType.Warning);
                if (InGame) return;
                key = "derelict";
            }
            Data.story.location = key;
            InGame = false;
            UI.HideMainMenu();
            StartCoroutine(LoadSceneRoutine(SceneNameFor(key), () =>
            {
                var spawn = WorldBuilders.Build(key);
                SpawnPlayer(spawn);
                InGame = true;
                autosaveTimer = 0f;
                Vision.ApplyToWorld();
                UI.ShowHud();
                AudioManager.I.PlayMusic(false);
                Missions.Begin();
                GameEvents.RaiseStats();
                GameEvents.RaiseVitals();
                GameEvents.RaiseMission();
            }));
        }

        static string SceneNameFor(string key)
        {
            switch (key)
            {
                case "derelict": return "Derelict";
                case "veyra": return "Veyra";
                default: return key;
            }
        }

        void SpawnPlayer(SpawnPoint spawn)
        {
            Vector3 pos = spawn.position;
            float yaw = spawn.yaw;
            var s = Data.story;
            if (s.hasPosition)
            {
                pos = new Vector3(s.posX, s.posY + 0.1f, s.posZ);
                yaw = s.yaw;
            }
            Player = PlayerController.Spawn(pos, yaw);
        }

        public void RespawnAtCheckpoint()
        {
            if (Player == null) return;
            var spawn = WorldBuilders.LastSpawn;
            Player.Teleport(spawn.position, spawn.yaw);
            Vitals.ReviveAfterCollapse();
            GameEvents.Notify("BODY.OS emergency reboot. Systems restored at the medical bay.", NoticeType.Warning);
            Log("Collapsed and rebooted.");
        }

        public void ReturnToMainMenu()
        {
            if (InGame) SaveGame(false);
            UI.HideAllMenus();
            ShowMainMenu();
        }

        /// <summary>Loads a scene from Build Settings, or creates an empty runtime scene if it isn't there,
        /// so the game also works when scenes have not been generated yet.</summary>
        IEnumerator LoadSceneRoutine(string sceneName, System.Action onLoaded)
        {
            Loading = true;
            UI.Fade(true);
            yield return new WaitForSecondsRealtime(0.25f);
            if (Application.CanStreamedLevelBeLoaded(sceneName))
            {
                var op = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Single);
                while (op != null && !op.isDone) yield return null;
            }
            else
            {
                var old = SceneManager.GetActiveScene();
                var scene = SceneManager.CreateScene(sceneName + "_runtime_" + (++runtimeSceneCounter));
                SceneManager.SetActiveScene(scene);
                if (old.IsValid() && old.isLoaded)
                {
                    var op = SceneManager.UnloadSceneAsync(old);
                    while (op != null && !op.isDone) yield return null;
                }
            }
            yield return null;
            onLoaded?.Invoke();
            Loading = false;
            UI.Fade(false);
        }

        // ------------------------------------------------------------------ Saving

        public void SaveGame(bool notify)
        {
            if (Data == null) return;
            autosaveTimer = 0f;
            if (Player != null && InGame)
            {
                // Last grounded position, so a save mid-jump or mid-fall never restores the player in the air.
                var p = Player.SafePosition;
                var s = Data.story;
                s.hasPosition = true;
                s.posX = p.x; s.posY = p.y; s.posZ = p.z; s.yaw = Player.Yaw;
            }
            Vitals.WriteToSave();
            bool ok = SaveSystem.Save(Data);
            if (notify)
            {
                if (ok) GameEvents.Notify("Progress saved.", NoticeType.Success);
                else GameEvents.Notify("Save failed: " + SaveSystem.LastError, NoticeType.Danger);
            }
        }

        // ------------------------------------------------------------------ Settings

        public void ApplySettings()
        {
            var s = Settings;
            AudioListener.volume = s.masterVolume;
            AudioManager.I?.ApplyVolumes(s);
            QualityProfiles.Apply(s.graphicsQuality);
            UI.ApplyScale(s.uiScale);
            GameEvents.RaiseSettings();
        }

        public void SaveSettings()
        {
            SaveValidator.Validate(Settings);
            SaveSystem.SaveSettings(Settings);
            ApplySettings();
        }

        // ------------------------------------------------------------------ Zones

        void PollZones()
        {
            if (Player == null) return;
            Vector3 p = Player.transform.position + Vector3.up * 0.9f;
            var zones = Registry<FlagZone>.Items;
            for (int i = zones.Count - 1; i >= 0; i--) zones[i].Check(p);
        }

        public static void Vibrate()
        {
#if UNITY_ANDROID || UNITY_IOS
            if (I != null && I.Settings.vibration) Handheld.Vibrate();
#endif
        }
    }
}

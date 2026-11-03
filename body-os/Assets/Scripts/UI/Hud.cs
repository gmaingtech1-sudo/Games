using UnityEngine;
using UnityEngine.UI;

namespace BodyOS
{
    /// <summary>
    /// In-game HUD and touch controls. Displays values straight from the gameplay systems (no copies of
    /// state) and updates text only when the displayed value changes, to avoid per-frame allocations.
    /// </summary>
    public sealed class Hud : MonoBehaviour
    {
        RectTransform root;
        UIBar healthBar, energyBar, suitBar;
        Text healthText, energyText, levelText, objectiveTitle, objectiveText, warningText, promptText, interactLabel, visionLabel, fpsText;
        RectTransform suitRow, warningBox, promptBox, threatRoot, threatArrow, scanRing, scanCard, objectiveBox;
        float layoutTimer;
        bool narrowLayout;
        Text threatText, scanTitle, scanBody, scanProgressText;
        Image scanFill, interactImage;
        Button interactButton;
        AbilitySlot[] slots;
        ScanMarker[] markers;
        float scanCardTimer, fpsTimer, markerTimer;
        int fpsFrames;
        int lastHealth = -1, lastEnergy = -1, lastMaxEnergy = -1;
        string lastPrompt;
        Interactable lastFocus;

        sealed class AbilitySlot
        {
            public RectTransform rt;
            public Button button;
            public Text label;
            public Image cooldown;
            public int index;
        }

        sealed class ScanMarker
        {
            public RectTransform rt;
            public Text text;
            public Image dot;
            public Interactable target;
            public string label;
            public Color color;
        }

        public static Hud Create(RectTransform safe)
        {
            var rt = UIFactory.Rect("HUD", safe);
            UIFactory.Stretch(rt);
            var h = rt.gameObject.AddComponent<Hud>();
            h.root = rt;
            h.Build();
            return h;
        }

        void Build()
        {
            // ---- Touch areas (first, so buttons sit on top of them).
            var look = UIFactory.Image(root, "LookArea", new Color(0, 0, 0, 0), null, true);
            look.rectTransform.anchorMin = new Vector2(0.38f, 0f); look.rectTransform.anchorMax = new Vector2(1f, 1f);
            look.rectTransform.offsetMin = Vector2.zero; look.rectTransform.offsetMax = new Vector2(0, -100);
            look.gameObject.AddComponent<TouchLookArea>();

            var joyZone = UIFactory.Image(root, "JoystickZone", new Color(0, 0, 0, 0), null, true);
            joyZone.rectTransform.anchorMin = new Vector2(0f, 0f); joyZone.rectTransform.anchorMax = new Vector2(0.38f, 0.78f);
            joyZone.rectTransform.offsetMin = Vector2.zero; joyZone.rectTransform.offsetMax = Vector2.zero;
            var baseImg = UIFactory.Image(joyZone.transform, "JoyBase", new Color(0.1f, 0.9f, 1f, 0.25f), UIFactory.Ring);
            var baseRt = baseImg.rectTransform;
            baseRt.anchorMin = baseRt.anchorMax = new Vector2(0f, 0f);
            baseRt.sizeDelta = new Vector2(230, 230);
            baseRt.anchoredPosition = new Vector2(190, 170);
            baseImg.gameObject.AddComponent<CanvasGroup>().alpha = 0.45f;
            var fillCircle = UIFactory.Image(baseRt, "Fill", new Color(0.05f, 0.2f, 0.3f, 0.35f), UIFactory.Circle);
            UIFactory.Stretch(fillCircle.rectTransform, 8, 8, 8, 8);
            var knob = UIFactory.Image(baseRt, "Knob", new Color(0.6f, 0.95f, 1f, 0.85f), UIFactory.Circle);
            knob.rectTransform.sizeDelta = new Vector2(96, 96);
            var joy = joyZone.gameObject.AddComponent<VirtualJoystick>();
            joy.baseRect = baseRt; joy.knob = knob.rectTransform; joy.radius = 100f;

            // ---- Top-left: vitals
            var vit = UIFactory.Panel(root, "Vitals", Theme.PanelHud, true);
            UIFactory.Place(vit.rectTransform, new Vector2(0, 1), new Vector2(0, 1), new Vector2(8, -8), new Vector2(380, 150));
            var vs = UIFactory.VStack(vit.rectTransform, 6, 14);
            vs.childControlHeight = true;
            healthBar = BarRow(vit.transform, "HP", Theme.Health, out healthText, out _);
            energyBar = BarRow(vit.transform, "EN", Theme.Energy, out energyText, out _);
            suitBar = BarRow(vit.transform, "SUIT", Theme.Suit, out _, out suitRow);
            levelText = UIFactory.Text(vit.transform, "", Theme.Tiny, Theme.TextDim);
            UIFactory.Layout(levelText, 24);
            vit.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            fpsText = UIFactory.Text(root, "", Theme.Tiny, Theme.TextMuted);
            UIFactory.Place(fpsText.rectTransform, new Vector2(0, 0), new Vector2(0, 0), new Vector2(10, 4), new Vector2(200, 26));

            // ---- Top-centre: objective + warnings
            var obj = UIFactory.Panel(root, "Objective", Theme.PanelHud, true);
            objectiveBox = obj.rectTransform;
            UIFactory.Place(obj.rectTransform, new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(20, -8), new Vector2(440, 100));
            var os = UIFactory.VStack(obj.rectTransform, 2, 12);
            os.padding = new RectOffset(18, 18, 10, 12);
            objectiveTitle = UIFactory.Text(obj.transform, "", Theme.Tiny, Theme.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            objectiveText = UIFactory.Text(obj.transform, "", Theme.Small, Theme.Text, TextAnchor.MiddleLeft);
            obj.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;

            var warn = UIFactory.Panel(root, "Warning", new Color(0.35f, 0.05f, 0.08f, 0.85f), false);
            warningBox = warn.rectTransform;
            UIFactory.Place(warningBox, new Vector2(0, 1), new Vector2(0, 1), new Vector2(8, -172), new Vector2(380, 48));
            warningText = UIFactory.Text(warn.transform, "", Theme.Small, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            UIFactory.Stretch(warningText.rectTransform, 10, 2, 10, 2);
            warningText.resizeTextForBestFit = true; warningText.resizeTextMinSize = 12; warningText.resizeTextMaxSize = Theme.Small;

            // ---- Top-right: pause + BODY.OS
            var pause = UIFactory.Button(root, "II", () => UIRoot.I.OpenPause(), ButtonStyle.Secondary, 76, 30);
            UIFactory.Place((RectTransform)pause.transform, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-8, -8), new Vector2(76, 76));
            var os2 = UIFactory.Button(root, "BODY.OS", () => UIRoot.I.ToggleBodyOS(), ButtonStyle.Primary, 76, 26);
            UIFactory.Place((RectTransform)os2.transform, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-96, -8), new Vector2(190, 76));

            // ---- Bottom-right: action cluster
            var jump = RoundButton("JUMP", new Vector2(-30, 40), 160, Theme.Accent);
            jump.gameObject.AddComponent<TouchButton>().onPress = MobileInput.QueueJump;

            var interact = RoundButton("USE", new Vector2(-210, 30), 136, Theme.Accent2);
            interactButton = interact;
            interactImage = (Image)interact.targetGraphic;
            interactLabel = UIFactory.ButtonLabel(interact);
            interact.gameObject.AddComponent<TouchButton>().onPress = MobileInput.QueueInteract;

            var vision = RoundButton("EYE", new Vector2(-262, 182), 100, Theme.Violet);
            visionLabel = UIFactory.ButtonLabel(vision);
            visionLabel.fontSize = Theme.Tiny;
            vision.gameObject.AddComponent<TouchButton>().onPress = () => { if (!MobileInput.Blocked) Game.I.Vision.Cycle(); };

            slots = new AbilitySlot[2];
            for (int i = 0; i < 2; i++)
            {
                var s = new AbilitySlot { index = i };
                s.button = RoundButton("", new Vector2(-40 - i * 110, 220), 96, Theme.Violet);
                s.rt = (RectTransform)s.button.transform;
                s.label = UIFactory.ButtonLabel(s.button);
                s.label.fontSize = Theme.Tiny;
                s.cooldown = UIFactory.Image(s.rt, "Cooldown", new Color(0, 0, 0, 0.6f), UIFactory.Circle);
                s.cooldown.type = Image.Type.Filled;
                s.cooldown.fillMethod = Image.FillMethod.Radial360;
                s.cooldown.fillOrigin = (int)Image.Origin360.Top;
                UIFactory.Stretch(s.cooldown.rectTransform);
                int idx = i;
                s.button.gameObject.AddComponent<TouchButton>().onPress = () => UseSlot(idx);
                slots[i] = s;
            }

            // ---- Interaction prompt
            var prompt = UIFactory.Panel(root, "Prompt", Theme.PanelHud, true);
            promptBox = prompt.rectTransform;
            UIFactory.Place(promptBox, new Vector2(1, 0), new Vector2(1, 0), new Vector2(-170, 176), new Vector2(330, 52));
            promptText = UIFactory.Text(prompt.transform, "", Theme.Small, Theme.Text, TextAnchor.MiddleCenter);
            UIFactory.Stretch(promptText.rectTransform, 10, 2, 10, 2);
            promptText.resizeTextForBestFit = true; promptText.resizeTextMinSize = 12; promptText.resizeTextMaxSize = Theme.Small;
            promptBox.anchoredPosition = new Vector2(-420, 60);

            // ---- Centre: threat indicator + scan progress
            threatRoot = UIFactory.Rect("Threat", root);
            UIFactory.Place(threatRoot, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(300, 300));
            var arrowImg = UIFactory.Image(threatRoot, "Arrow", Theme.Danger, UIFactory.Circle);
            threatArrow = arrowImg.rectTransform;
            threatArrow.sizeDelta = new Vector2(26, 26);
            threatText = UIFactory.Text(threatRoot, "", Theme.Small, Theme.Danger, TextAnchor.MiddleCenter, FontStyle.Bold);
            UIFactory.Place(threatText.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 1f), new Vector2(0, -6), new Vector2(420, 32));

            var ringBg = UIFactory.Image(root, "ScanRing", new Color(1, 1, 1, 0.15f), UIFactory.Ring);
            scanRing = ringBg.rectTransform;
            UIFactory.Place(scanRing, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, 40), new Vector2(120, 120));
            scanFill = UIFactory.Image(scanRing, "Fill", Theme.Accent, UIFactory.Ring);
            UIFactory.Stretch(scanFill.rectTransform);
            scanFill.type = Image.Type.Filled; scanFill.fillMethod = Image.FillMethod.Radial360; scanFill.fillOrigin = (int)Image.Origin360.Top;
            scanProgressText = UIFactory.Text(scanRing, "", Theme.Tiny, Theme.Accent, TextAnchor.MiddleCenter, FontStyle.Bold);
            UIFactory.Place(scanProgressText.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 1f), new Vector2(0, -8), new Vector2(360, 28));

            // ---- Scan result card (non-blocking)
            // Not a raycast target (except its button), so it never blocks the joystick underneath.
            var card = UIFactory.Panel(root, "ScanCard", Theme.Panel, true, false);
            scanCard = card.rectTransform;
            UIFactory.Place(scanCard, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-120, 60), new Vector2(430, 300));
            var cs = UIFactory.VStack(scanCard, 6, 16);
            cs.padding = new RectOffset(18, 18, 14, 14);
            scanTitle = UIFactory.Text(scanCard, "", Theme.Small, Theme.Accent, TextAnchor.MiddleLeft, FontStyle.Bold);
            scanBody = UIFactory.Text(scanCard, "", Theme.Tiny + 1, Theme.Text, TextAnchor.UpperLeft);
            UIFactory.Layout(UIFactory.Button(scanCard, "DISMISS", () => scanCard.gameObject.SetActive(false), ButtonStyle.Ghost, 52, Theme.Small), 52);
            card.gameObject.AddComponent<ContentSizeFitter>().verticalFit = ContentSizeFitter.FitMode.PreferredSize;
            scanCard.gameObject.SetActive(false);

            // ---- Scanner markers (pooled)
            markers = new ScanMarker[8];
            for (int i = 0; i < markers.Length; i++)
            {
                var m = new ScanMarker();
                m.rt = UIFactory.Rect("Marker", root);
                m.rt.anchorMin = m.rt.anchorMax = Vector2.zero;
                m.rt.sizeDelta = new Vector2(240, 60);
                m.rt.pivot = new Vector2(0.5f, 0f);
                m.dot = UIFactory.Image(m.rt, "Dot", Theme.Accent, UIFactory.Ring);
                UIFactory.Place(m.dot.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(30, 30));
                m.text = UIFactory.Text(m.rt, "", Theme.Tiny, Theme.Accent, TextAnchor.LowerCenter, FontStyle.Bold);
                UIFactory.Place(m.text.rectTransform, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, 20), new Vector2(240, 30));
                m.rt.gameObject.SetActive(false);
                markers[i] = m;
            }
        }

        UIBar BarRow(Transform parent, string label, Color color, out Text valueText, out RectTransform row)
        {
            row = UIFactory.Rect("Row_" + label, parent);
            UIFactory.HStack(row, 10);
            UIFactory.Layout(row, 28);
            var l = UIFactory.Text(row, label, Theme.Tiny, color, TextAnchor.MiddleLeft, FontStyle.Bold);
            UIFactory.Layout(l, 28, 54);
            var barHolder = UIFactory.Rect("BarHolder", row);
            UIFactory.Layout(barHolder, 28, -1, 1);
            var v = UIFactory.VStack(barHolder, 0);
            v.childAlignment = TextAnchor.MiddleCenter;
            v.padding = new RectOffset(0, 0, 7, 7);
            var bar = new UIBar(barHolder, color, 14);
            valueText = UIFactory.Text(row, "", Theme.Tiny, Theme.Text, TextAnchor.MiddleRight);
            UIFactory.Layout(valueText, 28, 84);
            return bar;
        }

        Button RoundButton(string label, Vector2 pos, float size, Color color)
        {
            var img = UIFactory.Image(root, "Btn_" + label, new Color(0.03f, 0.08f, 0.13f, 0.7f), UIFactory.Circle, true);
            UIFactory.Place(img.rectTransform, new Vector2(1, 0), new Vector2(1, 0), pos, new Vector2(size, size));
            var ring = UIFactory.Image(img.transform, "Ring", color, UIFactory.Ring);
            UIFactory.Stretch(ring.rectTransform);
            var b = img.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            b.transition = Selectable.Transition.None;
            var t = UIFactory.Text(img.transform, label, Theme.Small, Color.white, TextAnchor.MiddleCenter, FontStyle.Bold);
            UIFactory.Stretch(t.rectTransform, 8, 8, 8, 8);
            t.resizeTextForBestFit = true; t.resizeTextMinSize = 12; t.resizeTextMaxSize = Theme.Small;
            return b;
        }

        // ------------------------------------------------------------------ Events

        void OnEnable()
        {
            GameEvents.VitalsChanged += RefreshVitals;
            GameEvents.ProgressionChanged += RefreshLevel;
            GameEvents.MissionChanged += RefreshMission;
            GameEvents.AbilitiesChanged += RefreshSlots;
            GameEvents.StatsChanged += RefreshSlots;
            GameEvents.VisionChanged += RefreshVision;
            GameEvents.SettingsChanged += RefreshSettings;
        }

        void OnDisable()
        {
            GameEvents.VitalsChanged -= RefreshVitals;
            GameEvents.ProgressionChanged -= RefreshLevel;
            GameEvents.MissionChanged -= RefreshMission;
            GameEvents.AbilitiesChanged -= RefreshSlots;
            GameEvents.StatsChanged -= RefreshSlots;
            GameEvents.VisionChanged -= RefreshVision;
            GameEvents.SettingsChanged -= RefreshSettings;
        }

        public void RefreshAll()
        {
            lastHealth = lastEnergy = lastMaxEnergy = -1;
            RefreshVitals(); RefreshLevel(); RefreshMission(); RefreshSlots(); RefreshVision(); RefreshSettings();
        }

        void RefreshSettings() { if (fpsText != null && Game.I != null) fpsText.gameObject.SetActive(Game.I.Settings.showFps); }

        void RefreshVitals()
        {
            var g = Game.I;
            if (g == null || g.Vitals == null) return;
            var v = g.Vitals;
            healthBar.Set(v.HealthFraction);
            energyBar.Set(v.EnergyFraction);
            suitBar.Set(v.SuitFraction);
            energyBar.SetColor(v.IsLowEnergy ? Theme.Warning : Theme.Energy);
            int h = Mathf.CeilToInt(v.Health), e = Mathf.FloorToInt(v.Energy), me = Mathf.RoundToInt(v.MaxEnergy);
            if (h != lastHealth) { lastHealth = h; healthText.text = h.ToString(); }
            if (e != lastEnergy || me != lastMaxEnergy) { lastEnergy = e; lastMaxEnergy = me; energyText.text = e + "/" + me; }
            bool showSuit = v.Suit < v.MaxSuit - 0.5f || g.Environment.Current.IsHazardous;
            if (suitRow.gameObject.activeSelf != showSuit) suitRow.gameObject.SetActive(showSuit);
        }

        void RefreshLevel()
        {
            var g = Game.I;
            if (g == null || g.Progression == null) return;
            var p = g.Progression;
            levelText.text = "LV " + p.Level + "   XP " + p.Xp + "/" + p.XpToNext + "   POINTS " + p.Points + "   NANITES " + g.Inventory.Count("nanites");
        }

        void RefreshMission()
        {
            var g = Game.I;
            if (g == null || g.Missions == null) return;
            var m = g.Missions.Active;
            var o = g.Missions.CurrentObjective;
            if (m == null || o == null)
            {
                objectiveTitle.text = "NO ACTIVE MISSION";
                objectiveText.text = "Explore THE DERELICT.";
                return;
            }
            objectiveTitle.text = m.title + "  " + (g.Missions.ActiveState.objective + 1) + "/" + m.objectives.Length;
            objectiveText.text = g.Missions.ShowHint && !string.IsNullOrEmpty(o.hint) ? o.text + "\n<color=#9ad>Hint: " + o.hint + "</color>" : o.text;
            objectiveText.supportRichText = true;
        }

        void RefreshVision()
        {
            var g = Game.I;
            if (g == null || g.Vision == null) return;
            var mode = g.Vision.Current;
            visionLabel.text = mode == VisionModeId.Normal ? "VISION" : VisionSystem.Info(mode).name.Replace(" VISION", "");
        }

        void RefreshSlots()
        {
            var g = Game.I;
            if (g == null || g.Reality == null) return;
            for (int i = 0; i < slots.Length; i++)
            {
                var s = slots[i];
                string id = i < g.Data.abilitySlots.Count ? g.Data.abilitySlots[i] : "";
                var r = string.IsNullOrEmpty(id) ? null : g.Reality.Get(id);
                bool show = r != null && g.Reality.IsUnlocked(id);
                s.rt.gameObject.SetActive(show);
                if (show) s.label.text = string.IsNullOrEmpty(r.def.shortName) ? r.def.displayName.ToUpperInvariant() : r.def.shortName;
            }
        }

        void UseSlot(int i)
        {
            var g = Game.I;
            if (g == null || MobileInput.Blocked) return;
            string id = i < g.Data.abilitySlots.Count ? g.Data.abilitySlots[i] : "";
            if (!string.IsNullOrEmpty(id)) g.Reality.TryActivate(id);
        }

        public void ShowScan(string title, string body)
        {
            scanTitle.text = "ANALYSIS: " + title;
            scanBody.text = body;
            scanCard.gameObject.SetActive(true);
            scanCardTimer = 14f;
        }

        // ------------------------------------------------------------------ Per-frame

        void Update()
        {
            var g = Game.I;
            if (g == null || !g.InGame || g.Player == null) return;
            float dt = Time.unscaledDeltaTime;

            // Interaction button + prompt.
            var inter = g.Player.Interactor;
            string label = inter.ActionLabel;
            if (inter.Focus != lastFocus || label != lastPrompt)
            {
                lastFocus = inter.Focus;
                lastPrompt = label;
                bool has = inter.Focus != null || inter.Scanning;
                promptBox.gameObject.SetActive(has);
                interactLabel.text = string.IsNullOrEmpty(label) ? "USE" : label;
                interactImage.color = has ? new Color(0.05f, 0.25f, 0.4f, 0.9f) : new Color(0.03f, 0.08f, 0.13f, 0.5f);
                if (has && inter.Focus != null)
                {
                    string extra = "";
                    if (g.Vision.Current == VisionModeId.Scanner && inter.Focus.HasScanData) extra = inter.Focus.Scanned ? "  [analysed]" : "  [scan available]";
                    promptText.text = inter.Focus.displayName + extra;
                }
            }

            // Scan progress.
            bool scanning = inter.Scanning;
            if (scanRing.gameObject.activeSelf != scanning) scanRing.gameObject.SetActive(scanning);
            if (scanning)
            {
                scanFill.fillAmount = inter.ScanProgress;
                scanProgressText.text = "ANALYSING " + Mathf.RoundToInt(inter.ScanProgress * 100f) + "%";
            }

            // Threat indicator.
            var th = g.Threats;
            bool detected = th.Detected;
            if (threatRoot.gameObject.activeSelf != detected) threatRoot.gameObject.SetActive(detected);
            if (detected)
            {
                bool dir = g.Body.ThreatDirection;
                threatArrow.gameObject.SetActive(dir);
                if (dir && g.Player.Cam != null)
                {
                    Vector3 local = g.Player.Cam.transform.InverseTransformDirection(th.Direction);
                    Vector2 d2 = new Vector2(local.x, local.z);
                    if (d2.sqrMagnitude < 0.0001f) d2 = Vector2.up;
                    threatArrow.anchoredPosition = d2.normalized * 130f;
                }
                threatText.text = "HOSTILE  " + Mathf.RoundToInt(th.Distance) + " m" + (dir ? "" : "  (direction unknown)");
            }

            // Warning banner.
            string warn = WarningText(g);
            bool showWarn = warn.Length > 0;
            if (warningBox.gameObject.activeSelf != showWarn) warningBox.gameObject.SetActive(showWarn);
            if (showWarn && warningText.text != warn) warningText.text = warn;

            // Ability cooldowns.
            for (int i = 0; i < slots.Length; i++)
            {
                var s = slots[i];
                if (!s.rt.gameObject.activeSelf) continue;
                var r = g.Reality.Get(g.Data.abilitySlots[i]);
                if (r == null) continue;
                s.cooldown.fillAmount = r.IsActive ? 0f : r.CooldownFraction;
                ((Image)s.button.targetGraphic).color = r.IsActive ? new Color(0.4f, 0.15f, 0.6f, 0.9f) : new Color(0.03f, 0.08f, 0.13f, 0.7f);
            }

            // Scan card timeout.
            if (scanCard.gameObject.activeSelf && Time.timeScale > 0f)
            {
                scanCardTimer -= dt;
                if (scanCardTimer <= 0f) scanCard.gameObject.SetActive(false);
            }

            UpdateMarkers(g, dt);
            AdaptLayout(dt);

            if (fpsText.gameObject.activeSelf)
            {
                fpsFrames++;
                fpsTimer += dt;
                if (fpsTimer >= 0.5f) { fpsText.text = Mathf.RoundToInt(fpsFrames / fpsTimer) + " FPS"; fpsFrames = 0; fpsTimer = 0f; }
            }
        }

        /// <summary>On narrow (4:3 tablet) screens the objective moves below the vitals panel to avoid overlaps.</summary>
        void AdaptLayout(float dt)
        {
            layoutTimer -= dt;
            if (layoutTimer > 0f) return;
            layoutTimer = 0.5f;
            bool narrow = root.rect.width < 1240f;
            if (narrow == narrowLayout) return;
            narrowLayout = narrow;
            if (narrow)
            {
                UIFactory.Place(objectiveBox, new Vector2(0, 1), new Vector2(0, 1), new Vector2(8, -226), new Vector2(380, 100));
            }
            else
            {
                UIFactory.Place(objectiveBox, new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(20, -8), new Vector2(440, 100));
            }
        }

        static string WarningText(Game g)
        {
            var env = g.Environment;
            if (env.IsDamaging) return "SUIT DEPLETED // TAKING DAMAGE";
            if (env.HasDeficit)
            {
                if (env.RadiationDeficit > 0) return "RADIATION // SUIT " + Mathf.RoundToInt(g.Vitals.SuitFraction * 100f) + "%";
                if (env.ToxicDeficit > 0) return "TOXIC ATMOSPHERE // SUIT " + Mathf.RoundToInt(g.Vitals.SuitFraction * 100f) + "%";
                return "EXTREME COLD // SUIT " + Mathf.RoundToInt(g.Vitals.SuitFraction * 100f) + "%";
            }
            if (g.Vitals.IsCriticalEnergy) return "CRITICAL ENERGY // LOW POWER MODE";
            if (g.Vitals.IsLowEnergy) return "LOW ENERGY";
            if (env.Current.ColdSeverity > 0) return "COLD: HEATING DRAIN ACTIVE";
            return "";
        }

        void UpdateMarkers(Game g, float dt)
        {
            bool active = g.Vision.Current == VisionModeId.Scanner && g.Player.Cam != null;
            markerTimer -= dt;
            if (active && markerTimer <= 0f)
            {
                markerTimer = 0.25f;
                // Pick the closest scannable/interactable objects in scanner range.
                for (int i = 0; i < markers.Length; i++) markers[i].target = null;
                float range = g.Vision.ScannerRange;
                Vector3 p = g.Player.transform.position;
                var items = Registry<Interactable>.Items;
                for (int i = 0; i < items.Count; i++)
                {
                    var it = items[i];
                    if (it == null || !it.IsAvailable) continue;
                    float d = (it.FocusPoint - p).sqrMagnitude;
                    if (d > range * range) continue;
                    // Insert into the fixed-size list, replacing the farthest.
                    int slot = -1; float worst = -1f;
                    for (int k = 0; k < markers.Length; k++)
                    {
                        if (markers[k].target == null) { slot = k; break; }
                        float dk = (markers[k].target.FocusPoint - p).sqrMagnitude;
                        if (dk > worst) { worst = dk; slot = k; }
                    }
                    if (markers[slot].target == null || d < worst) markers[slot].target = it;
                }
                for (int k = 0; k < markers.Length; k++)
                {
                    var t = markers[k].target;
                    if (t == null) continue;
                    var vt = t.GetComponent<VisionTarget>();
                    var cat = vt != null && vt.scan != ScanCategory.None ? vt.scan : ScanCategory.Interactable;
                    markers[k].color = VisionMaterials.ColorOf(cat);
                    markers[k].label = t.displayName + (t.HasScanData && !t.Scanned ? "  ?" : "");
                }
            }

            var cam = active ? g.Player.Cam.Camera : null;
            var canvasRect = (RectTransform)root;
            for (int i = 0; i < markers.Length; i++)
            {
                var m = markers[i];
                bool show = active && m.target != null && m.target.isActiveAndEnabled;
                Vector3 sp = Vector3.zero;
                if (show)
                {
                    sp = cam.WorldToScreenPoint(m.target.FocusPoint + Vector3.up * 0.4f);
                    show = sp.z > 0.2f;
                }
                if (m.rt.gameObject.activeSelf != show) m.rt.gameObject.SetActive(show);
                if (!show) continue;
                if (RectTransformUtility.ScreenPointToLocalPointInRectangle(canvasRect, sp, null, out var local))
                    m.rt.anchoredPosition = local + new Vector2(canvasRect.rect.width * canvasRect.pivot.x, canvasRect.rect.height * canvasRect.pivot.y);
                m.dot.color = m.color;
                m.text.color = m.color;
                if (!ReferenceEquals(m.text.text, m.label)) m.text.text = m.label;
            }
        }
    }
}

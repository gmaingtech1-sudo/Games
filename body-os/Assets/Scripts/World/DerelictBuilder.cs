using UnityEngine;
using static BodyOS.LevelKit;

namespace BodyOS
{
    /// <summary>
    /// Builds THE DERELICT procedurally (no external models needed).
    ///
    /// Layout (top view, +Z = north):
    ///                       [VAULT]  (sealed, portal only)
    ///   [BRIDGE] ─── [CONTAINMENT LAB]
    ///      │ bulkhead (power puzzle)
    ///   [ATRIUM]  (hostile drone)
    ///      │ coolant leak (cold)
    ///   [ENGINEERING]──[CORRIDOR]──[STORAGE BAY] (dark, low-gravity section, power cell on catwalk)
    ///   (reactor: radiation)  │
    ///                     [MED BAY] (start)
    /// </summary>
    public static class DerelictBuilder
    {
        public static readonly SpawnPoint Start = new SpawnPoint { position = new Vector3(-3f, 0.1f, -2f), yaw = 0f };

        public static SpawnPoint Build()
        {
            var root = new GameObject("THE DERELICT").transform;
            WorldLighting.SetBase(new Color(0.11f, 0.12f, 0.15f), true, new Color(0.01f, 0.02f, 0.04f), 0.018f);

            MedBay(root);
            Corridor(root);
            Engineering(root);
            Storage(root);
            Atrium(root);
            Bridge(root);
            Lab(root);
            Vault(root);
            return Start;
        }

        static Opening O(Side s, float c, float w = 2.4f, float h = 3f) { return new Opening(s, c, w, h); }

        // ------------------------------------------------------------------ MED BAY
        static void MedBay(Transform root)
        {
            var t = Room(root, "MedBay", new Vector3(-7, 0, -6), new Vector3(7, 0, 6), 4f, O(Side.North, 0f)).transform;
            PointLight(t, new Vector3(0, 3.4f, 0), new Color(0.75f, 0.9f, 1f), 12f, 1.3f);
            PointLight(t, new Vector3(-4.5f, 2.5f, -3f), Art.Cyan, 5f, 1f);

            // Cryo pods. Pod 7 (the player's) is open.
            for (int i = 0; i < 3; i++)
            {
                Pod(t, new Vector3(-5.6f, 0, -3f + i * 3f), 0f, i == 0);
                Pod(t, new Vector3(5.6f, 0, -3f + i * 3f), 180f, false);
            }

            var term = Terminal.Create(t, "medterminal", "Medical Terminal", new Vector3(2.5f, 0, -5.3f), 0f);
            term.title = "MEDICAL TERMINAL // POD 7";
            term.body = "REVIVAL COMPLETE. Subject 7 vital signs: stable.\n\n" +
                        "Neural lattice integration: 100%. BODY.OS v7.3 is installed and running.\n\n" +
                        "BODY.OS lets you reconfigure your body, brain and senses. Every adjustment has a real effect, and every effect has a cost.\n\n" +
                        "WARNING: Several BODY.OS modules are not part of the human specification. Origin: unknown.\n\n" +
                        "Crew status: NO RESPONSE. Ship status: DERELICT.";
            term.openSection = 0;
            term.openSectionLabel = "OPEN BODY.OS";
            term.scanText = "Medical terminal, still on emergency power. It holds your revival record.";

            RechargeStation.Create(t, "medbay", new Vector3(3.5f, 0, 5.4f), 180f);
            var n = Pickup.Create(t, "medbay_n1", "nanites", 5, new Vector3(-2f, 0, 4.5f));
            n.xp = 0;
            Pickup.Create(t, "medbay_gel", "medigel", 1, new Vector3(4f, 0.9f, -5.2f));
            Box(t, "Shelf", new Vector3(4f, 0.45f, -5.3f), new Vector3(1.6f, 0.9f, 0.6f), HullLight);

            var clue = Box(t, "Pod7Panel", new Vector3(-4.6f, 1.2f, -4.2f), new Vector3(0.5f, 0.4f, 0.1f), GlowCyan, false, false).AddComponent<Clue>();
            clue.id = "pod7"; clue.displayName = "Pod 7 Readout"; clue.focusOffset = Vector3.zero;
            clue.scanText = "Pod 7 occupancy log: 3 revival attempts aborted. Attempt 4 succeeded after BODY.OS overrode the safety interlocks. Something wanted you awake.";
            var vt = clue.gameObject.AddComponent<VisionTarget>(); vt.environment = false; vt.scan = ScanCategory.Clue;

            Sign(t, "MEDICAL BAY", new Vector3(0, 3.3f, 5.8f), 180f, Art.Cyan);
            FlagZone.Create(t, "medbay", new Vector3(0, 2, 0), new Vector3(14, 4, 12), "", "medbay");
            Door.Create(t, "medbay_door", "Med Bay Door", new Vector3(0, 0, 6f), true);
        }

        static void Pod(Transform t, Vector3 pos, float yaw, bool open)
        {
            var p = Group("CryoPod", t).transform;
            p.localPosition = pos;
            p.localRotation = Quaternion.Euler(0, yaw, 0);
            Box(p, "Base", new Vector3(0, 0.3f, 0), new Vector3(1.1f, 0.6f, 2.2f), HullLight);
            Box(p, "Back", new Vector3(-0.5f, 1.4f, 0), new Vector3(0.2f, 2.2f, 2.2f), HullDark);
            Box(p, "Glow", new Vector3(-0.38f, 1.4f, 0), new Vector3(0.04f, 1.6f, 1.8f), open ? GlowAmber : GlowBlue, false, false);
            if (!open) Primitive(PrimitiveType.Capsule, p, "Glass", new Vector3(0, 1.3f, 0), new Vector3(0.9f, 1.0f, 0.9f), Glass);
        }

        // ------------------------------------------------------------------ CORRIDOR
        static void Corridor(Transform root)
        {
            var t = Room(root, "Corridor", new Vector3(-2.5f, 0, 6), new Vector3(2.5f, 0, 30), 4f,
                O(Side.South, 0f), O(Side.West, 18f), O(Side.East, 18f), O(Side.North, 0f)).transform;
            PointLight(t, new Vector3(0, 3.4f, 10), new Color(0.7f, 0.85f, 1f), 9f, 1.1f);
            PointLight(t, new Vector3(0, 3.4f, 18), new Color(0.7f, 0.85f, 1f), 9f, 1.1f);
            PointLight(t, new Vector3(0, 3f, 26.5f), new Color(0.5f, 0.75f, 1f), 8f, 1.4f);

            // Ruptured coolant line: cold zone.
            var cold = new GameObject("ColdZone").AddComponent<HazardZone>();
            cold.transform.SetParent(t, false);
            cold.transform.localPosition = new Vector3(0, 2, 26.5f);
            cold.size = new Vector3(5f, 4f, 7f);
            cold.conditions = new ZoneConditions { name = "Coolant leak", temperature = -45f, atmosphere = Atmosphere.Safe, radiation = 0, gravity = 1f };
            var frost = Art.Lit("frost", new Color(0.75f, 0.9f, 1f), 0.9f, 0f, new Color(0.2f, 0.35f, 0.5f));
            Box(t, "Pipe", new Vector3(-2.1f, 3.2f, 26.5f), new Vector3(0.35f, 0.35f, 7f), frost);
            for (int i = 0; i < 6; i++)
                Box(t, "Ice", new Vector3(-1.6f + (i % 3) * 1.4f, 0.05f, 24f + i * 0.9f), new Vector3(0.8f, 0.1f, 0.6f), frost, false);
            Sign(t, "WARNING: COOLANT LEAK", new Vector3(2.3f, 2.8f, 23f), -90f, Art.Warning, 0.1f);
            EnvironmentalScanner.Create(t, "corridor", new Vector3(2.25f, 0, 21.5f), -90f, cold);

            Sign(t, "ENGINEERING", new Vector3(-2.3f, 3.3f, 18f), 90f, Art.Cyan, 0.09f);
            Sign(t, "STORAGE", new Vector3(2.3f, 3.3f, 18f), -90f, Art.Cyan, 0.09f);
            FlagZone.Create(t, "corridor", new Vector3(0, 2, 18), new Vector3(5, 4, 24), "", "corridor");
            Door.Create(t, "eng_door", "Engineering Door", new Vector3(-2.5f, 0, 18f), false);
            Door.Create(t, "storage_door", "Storage Door", new Vector3(2.5f, 0, 18f), false);
            Door.Create(t, "atrium_door", "Atrium Door", new Vector3(0, 0, 30f), true);
            Pickup.Create(t, "corridor_n1", "nanites", 5, new Vector3(1.5f, 0, 8f));
        }

        // ------------------------------------------------------------------ ENGINEERING
        static void Engineering(Transform root)
        {
            var t = Room(root, "Engineering", new Vector3(-20, 0, 10), new Vector3(-2.5f, 0, 26), 4.5f, O(Side.East, 18f)).transform;
            PointLight(t, new Vector3(-8, 3.8f, 18), new Color(1f, 0.9f, 0.75f), 12f, 1.2f);
            PointLight(t, new Vector3(-18, 2.5f, 18), Art.Danger, 7f, 1.6f);

            var fab = Terminal.Create(t, "fabricator", "Upgrade Fabricator", new Vector3(-9f, 0, 25.3f), 180f, GlowCyan);
            fab.title = "UPGRADE FABRICATOR";
            fab.prompt = "LINK";
            fab.body = "Fabricator linked to BODY.OS.\n\nSchematics recovered from the ship archive:\n" +
                       " • THERMAL OPTICS (advanced sensory system)\n • CAPACITOR LATTICE (energy capacity)\n • ENVIRONMENTAL WEAVE (suit protection)\n\n" +
                       "Spend upgrade points and nanite shards to install technology. Earn points by levelling up: explore, analyse, solve problems.";
            fab.schematicFlags = new[] { "schematic.thermal", "schematic.capacitor", "schematic.weave" };
            fab.schematicNames = new[] { "Thermal Optics", "Capacitor Lattice", "Environmental Weave" };
            fab.openSection = 5;
            fab.openSectionLabel = "OPEN TECHNOLOGY";
            fab.scanText = "A matter fabricator retooled for BODY.OS hardware. The work is recent: weeks, not years.";
            var fabVt = fab.GetComponent<VisionTarget>(); fabVt.heat = 0.7f;

            // Workbenches and props.
            for (int i = 0; i < 3; i++)
                Box(t, "Bench", new Vector3(-7f + i * -3.2f, 0.5f, 12f), new Vector3(2.2f, 1f, 1f), HullLight);
            Box(t, "Machinery", new Vector3(-5f, 1.5f, 24.5f), new Vector3(2.5f, 3f, 1.5f), HullDark).GetComponent<VisionTarget>().heat = 0.5f;
            RechargeStation.Create(t, "engineering", new Vector3(-12.5f, 0, 25.6f), 180f);
            Pickup.Create(t, "eng_n1", "nanites", 5, new Vector3(-10f, 1f, 12f));
            Pickup.Create(t, "eng_cap", "energy_capsule", 1, new Vector3(-7f, 1f, 12f));

            // Reactor alcove (radiation).
            Box(t, "ReactorShield", new Vector3(-14.5f, 2f, 13f), new Vector3(0.3f, 4f, 6f), HullDark);
            Box(t, "ReactorShield", new Vector3(-14.5f, 2f, 23f), new Vector3(0.3f, 4f, 6f), HullDark);
            var core = Primitive(PrimitiveType.Cylinder, t, "ReactorCore", new Vector3(-18.2f, 2f, 18f), new Vector3(1.6f, 2f, 1.6f), GlowRed, true);
            var coreVt = core.AddComponent<VisionTarget>(); coreVt.environment = false; coreVt.heat = 1f;
            var rad = new GameObject("RadiationZone").AddComponent<HazardZone>();
            rad.transform.SetParent(t, false);
            rad.transform.localPosition = new Vector3(-17.3f, 2, 18);
            rad.size = new Vector3(5.4f, 4.5f, 16f);
            rad.conditions = new ZoneConditions { name = "Reactor alcove", temperature = 34f, atmosphere = Atmosphere.Safe, radiation = 1, gravity = 1f };
            var hot = new GameObject("RadiationCore").AddComponent<HazardZone>();
            hot.transform.SetParent(t, false);
            hot.transform.localPosition = new Vector3(-18.2f, 2, 18);
            hot.size = new Vector3(3.6f, 4.5f, 3.6f);
            hot.priority = 1;
            hot.conditions = new ZoneConditions { name = "Reactor core", temperature = 60f, atmosphere = Atmosphere.Safe, radiation = 2, gravity = 1f };
            EnvironmentalScanner.Create(t, "reactor", new Vector3(-14.2f, 0, 14.5f), 90f, rad);
            Sign(t, "REACTOR // RADIATION", new Vector3(-14.3f, 3.6f, 18f), 90f, Art.Danger, 0.09f);

            var log = Terminal.Create(t, "reactorlog", "Reactor Log", new Vector3(-16.5f, 0, 10.6f), 0f);
            log.title = "REACTOR LOG // CHIEF ENGINEER ODA";
            log.body = "Day 211. I shut the reactor down by hand. The readings were not coming from the core.\n\n" +
                       "They were coming from the Veyra cargo, and from Subject 7's pod. The same frequency.\n\n" +
                       "If you are reading this, Seven: the fabricator is yours. We built it for you. I'm sorry for everything else.";
            log.firstUseXp = 30;
            log.interference = 0.4f;
            log.scanText = "Personal log terminal belonging to the chief engineer. Heavy radiation noise.";
            Pickup.Create(t, "reactor_n1", "nanites", 10, new Vector3(-19f, 0, 24f));

            FlagZone.Create(t, "engineering", new Vector3(-11, 2, 18), new Vector3(17, 4, 16), "", "engineering");
            FlagZone.Create(t, "reactor", new Vector3(-17.3f, 2, 18), new Vector3(5, 4, 15), "", "reactor");
        }

        // ------------------------------------------------------------------ STORAGE BAY (dark)
        static void Storage(Transform root)
        {
            var t = Room(root, "StorageBay", new Vector3(2.5f, 0, 10), new Vector3(22, 0, 28), 6f, false, O(Side.West, 18f)).transform;
            // Almost no light: night vision, thermal or the scanner help here.
            PointLight(t, new Vector3(12, 5.5f, 19), new Color(1f, 0.25f, 0.2f), 9f, 0.35f);

            // Racks.
            for (int r = 0; r < 3; r++)
            {
                float x = 11f + r * 2.6f;
                Box(t, "Rack", new Vector3(x, 1.6f, 15f), new Vector3(0.8f, 3.2f, 5f), HullDark);
                Box(t, "Rack", new Vector3(x, 1.6f, 24.5f), new Vector3(0.8f, 3.2f, 5f), HullDark);
            }

            // Catwalk with the power cell (1.9 m high).
            var cat = Box(t, "Catwalk", new Vector3(20.25f, 0.95f, 19f), new Vector3(3.5f, 1.9f, 14f), HullLight);
            Box(t, "CatwalkEdge", new Vector3(18.52f, 1.86f, 19f), new Vector3(0.06f, 0.06f, 14f), GlowAmber, false, false);
            var cell = Pickup.Create(t, "cell1", "power_cell", 1, new Vector3(20.6f, 1.9f, 24.5f), false);
            cell.scanText = "Class-C power cell, 94% charge. Compatible with standard door couplings.";
            cell.xp = 20;
            var catClue = cat.AddComponent<Clue>();
            catClue.id = "catwalk"; catClue.displayName = "Upper Rack"; catClue.focusOffset = new Vector3(-1.75f, 1f, 0f); catClue.interactRange = 3f;
            catClue.scanText = "Upper rack deck, 1.90 m. Standard jump output reaches about 1.55 m. Options: raise Jump Height in BODY.OS (7+), or find something to climb.";
            catClue.scanXp = 20;
            var catVt = cat.GetComponent<VisionTarget>(); catVt.scan = ScanCategory.Clue;

            // A heavy container that can be pushed next to the catwalk as a step (Strength 7).
            PushableCrate.Create(t, "crate1", new Vector3(12.5f, 0.5f, 20f), new Vector3(1.2f, 1f, 1.2f), 7);

            // Low-gravity section with a high shelf.
            var lowG = new GameObject("LowGravityZone").AddComponent<HazardZone>();
            lowG.transform.SetParent(t, false);
            lowG.transform.localPosition = new Vector3(6.25f, 3, 19);
            lowG.size = new Vector3(7.5f, 6f, 18f);
            lowG.conditions = new ZoneConditions { name = "Damaged gravity plating", temperature = 6f, atmosphere = Atmosphere.Safe, radiation = 0, gravity = 0.4f };
            Box(t, "HighShelf", new Vector3(5f, 1.5f, 26.7f), new Vector3(4f, 3f, 2.4f), HullLight);
            Pickup.Create(t, "lowg_n1", "nanites", 10, new Vector3(5f, 3f, 26.7f));
            Sign(t, "GRAVITY PLATING DAMAGED", new Vector3(2.8f, 4.5f, 22f), 90f, Art.Warning, 0.09f);
            for (int i = 0; i < 7; i++)
            {
                var deb = Box(t, "Debris", new Vector3(3.8f + (i * 1.3f) % 5f, 1.2f + (i % 3) * 1.1f, 13f + i * 1.9f), new Vector3(0.35f, 0.25f, 0.4f), HullLight, false);
                deb.transform.localRotation = Quaternion.Euler(i * 23f, i * 47f, i * 11f);
                deb.AddComponent<FloatingDebris>();
            }

            // Toxic vent with a nanite cache.
            var tox = new GameObject("ToxicZone").AddComponent<HazardZone>();
            tox.transform.SetParent(t, false);
            tox.transform.localPosition = new Vector3(14f, 2, 11.6f);
            tox.size = new Vector3(4f, 4f, 3.2f);
            tox.conditions = new ZoneConditions { name = "Ruptured vent", temperature = 25f, atmosphere = Atmosphere.Toxic, radiation = 0, gravity = 1f };
            Box(t, "Vent", new Vector3(14f, 0.08f, 10.6f), new Vector3(2f, 0.16f, 1f), Art.Lit("vent", new Color(0.3f, 0.6f, 0.2f), 0.3f, 0.2f, new Color(0.2f, 0.5f, 0.1f)));
            PointLight(t, new Vector3(14f, 1f, 11f), new Color(0.4f, 1f, 0.3f), 4f, 0.8f);
            Pickup.Create(t, "toxic_n1", "nanites", 10, new Vector3(15.2f, 0, 10.8f));

            var manifest = Terminal.Create(t, "manifest", "Cargo Manifest", new Vector3(8.5f, 0, 10.6f), 0f);
            manifest.title = "CARGO MANIFEST";
            manifest.body = "BAY 2 INVENTORY\n\n• VEYRA SURVEY CRATES x14 — DO NOT OPEN\n• Class-C power cell x1 — upper rack deck, east wall\n• Gravity plating, west section — FAULTY, repair pending\n\nNote: emergency lighting only.";
            manifest.firstUseXp = 15;

            FlagZone.Create(t, "storage", new Vector3(12, 2, 19), new Vector3(19, 4, 18), "", "storage");
        }

        // ------------------------------------------------------------------ ATRIUM
        static void Atrium(Transform root)
        {
            var t = Room(root, "Atrium", new Vector3(-6, 0, 30), new Vector3(6, 0, 42), 6f, O(Side.South, 0f), O(Side.North, 0f, 3f, 3.4f)).transform;
            PointLight(t, new Vector3(0, 5.4f, 36), new Color(0.6f, 0.8f, 1f), 12f, 1.1f);
            Primitive(PrimitiveType.Cylinder, t, "Dome", new Vector3(0, 5.9f, 36), new Vector3(7f, 0.05f, 7f), GlowBlue);
            Primitive(PrimitiveType.Cylinder, t, "Planter", new Vector3(0, 0.4f, 36), new Vector3(2.4f, 0.4f, 2.4f), HullLight, true);

            var bulk = Door.Create(t, "bulkhead", "Bridge Bulkhead", new Vector3(0, 0, 42f), true, 3f, 3.4f);
            bulk.requiredFlag = "power.bulkhead";
            bulk.lockedReason = "Sealed. The bulkhead has no power.";
            bulk.scanTitle = "BRIDGE BULKHEAD";
            bulk.scanText = "Emergency bulkhead, sealed. Power coupling: OFFLINE.\nRequirement: one Class-C power cell seated in the coupling to the right of the door.\nThe coupling's regulator is damaged: manual calibration needed.";
            bulk.scanXp = 40;
            PowerSocket.Create(t, "bulkhead_socket", "power.bulkhead", new Vector3(2.4f, 0, 41.75f), 180f);
            Sign(t, "BRIDGE", new Vector3(0, 4.0f, 41.8f), 180f, Art.Cyan);

            var drone = HostileDrone.Create(t, "drone1", new Vector3(0, 1.3f, 36f), new[]
            {
                new Vector3(-4f, 1.3f, 33f), new Vector3(4f, 1.3f, 33f), new Vector3(4f, 1.3f, 39f), new Vector3(-4f, 1.3f, 39f)
            });
            drone.speed = 2.0f;
            drone.chaseRadius = 4.5f;

            Pickup.Create(t, "atrium_n1", "nanites", 5, new Vector3(-5f, 0, 41f));
            FlagZone.Create(t, "atrium", new Vector3(0, 2, 36), new Vector3(12, 4, 12), "", "atrium");
        }

        // ------------------------------------------------------------------ BRIDGE
        static void Bridge(Transform root)
        {
            var t = Room(root, "Bridge", new Vector3(-8, 0, 42), new Vector3(8, 0, 56), 5f, O(Side.South, 0f, 3f, 3.4f), O(Side.East, 50f)).transform;
            PointLight(t, new Vector3(0, 4.4f, 49), new Color(0.65f, 0.8f, 1f), 13f, 1.1f);
            var stars = Art.UnlitTextured("starfield", Art.StarTexture);
            Box(t, "Viewport", new Vector3(0, 2.6f, 55.8f), new Vector3(13f, 3f, 0.05f), stars, false, false);
            Box(t, "Console", new Vector3(0, 0.5f, 51f), new Vector3(6f, 1f, 1f), HullLight);
            Box(t, "ConsoleGlow", new Vector3(0, 1.02f, 51f), new Vector3(5.6f, 0.04f, 0.8f), GlowCyan, false, false);
            Box(t, "Chair", new Vector3(0, 0.5f, 48.5f), new Vector3(0.9f, 1f, 0.9f), HullDark);

            var comm = Terminal.Create(t, "commarray", "Comm Array", new Vector3(3.5f, 0, 54.6f), 180f, GlowCyan);
            comm.title = "INCOMING TRANSMISSION // SOURCE: VEYRA";
            comm.prompt = "RECEIVE";
            comm.transmission = true;
            comm.body = "...signal lock... carrier stable...\n\n" +
                        "Seven. If you are hearing this, BODY.OS woke you. It was never built for a human body. It was built for what you were before.\n\n" +
                        "The ruins on Veyra are not ruins. They are waiting.\n\n" +
                        "The reality kernel inside you is dormant. The crew sealed the containment lab off the bridge. Open it. Learn what you can do.\n\n" +
                        "Then come home.\n\n...signal lost...";
            comm.setFlags = new[] { "transmission.heard" };
            comm.firstUseXp = 40;
            comm.requiredFlag = "power.bulkhead";
            comm.scanText = "Long-range comm array. A transmission is looping on a frequency that should not exist.";
            comm.interference = 0.6f;

            var nav = Terminal.Create(t, "navigation", "Navigation Console", new Vector3(-3.5f, 0, 54.6f), 180f);
            nav.title = "NAVIGATION";
            nav.body = "Known destinations:\n\n• VEYRA — ancient ruins, environmental hazards\n• THE FROZEN MOON — extreme cold\n• THE FRACTURED WORLD — unstable gravity and space\n\nNavigation core: OFFLINE. The jump drive needs a phase-stable core and a working navigation map.\n\n(These destinations are planned expansions and are not yet playable.)";
            nav.openSection = 0;
            nav.openSectionLabel = "VIEW DESTINATIONS";
            nav.firstUseXp = 20;

            var capLog = Terminal.Create(t, "captainlog", "Captain's Log", new Vector3(7.4f, 0, 45f), -90f);
            capLog.title = "CAPTAIN'S LOG // FINAL ENTRY";
            capLog.body = "We came for a survey and left with a passenger.\n\nThe thing in Pod 7 looks human now. The integration took. BODY.OS reports it can adjust 'gravity response, temporal coupling, dimensional perception'. None of those words should belong on a medical readout.\n\nI have ordered the crew to the escape pods. Seven can't come. Seven isn't finished yet.";
            capLog.firstUseXp = 30;

            var labDoor = Door.Create(t, "lab_door", "Containment Lab", new Vector3(8f, 0, 50f), false);
            labDoor.requiredFlag = "mission.wake.complete";
            labDoor.lockedReason = "CONTAINMENT LAB: sealed by the captain's order.";
            labDoor.scanText = "Containment lab door, sealed by command authority. The lock is listening on the same frequency as the comm array.";
            Sign(t, "CONTAINMENT", new Vector3(7.8f, 3.3f, 50f), -90f, Art.Violet, 0.09f);

            FlagZone.Create(t, "bridge", new Vector3(0, 2, 49), new Vector3(16, 4, 14), "", "bridge");
        }

        // ------------------------------------------------------------------ CONTAINMENT LAB
        static void Lab(Transform root)
        {
            var t = Room(root, "ContainmentLab", new Vector3(8, 0, 44), new Vector3(26, 0, 58), 8f, O(Side.West, 50f)).transform;
            PointLight(t, new Vector3(14, 6f, 54), Art.Violet, 12f, 1.2f);
            PointLight(t, new Vector3(22, 5f, 47), new Color(0.6f, 0.9f, 1f), 9f, 0.9f);

            // Partition separating the barrier-protected section.
            Box(t, "Partition", new Vector3(18.5f, 4f, 51f), new Vector3(3f, 8f, 0.3f), Hull);
            Box(t, "Partition", new Vector3(24.5f, 4f, 51f), new Vector3(3f, 8f, 0.3f), Hull);
            Box(t, "Partition", new Vector3(21.5f, 6f, 51f), new Vector3(4f, 4f, 0.3f), Hull);
            Box(t, "PartitionW", new Vector3(17f, 4f, 47.5f), new Vector3(0.3f, 8f, 7f), Hull);

            // 1) Hidden glyph (Dimensional Perception).
            var glyph = Terminal.Create(t, "glyph", "Dimensional Glyph", new Vector3(11f, 0, 57.4f), 180f, GlowViolet);
            glyph.title = "GLYPH // DECODED";
            glyph.prompt = "DECODE";
            glyph.body = "The glyph resolves into coordinates and a single word in a language you somehow read: RETURN.\n\nYour Memory attribute strains to hold the shape of it.";
            glyph.setFlags = new[] { "glyph.decoded" };
            glyph.firstUseXp = 40;
            var gvt = glyph.GetComponent<VisionTarget>();
            gvt.hidden = true; gvt.anomaly = true;
            gvt.RefreshOriginals();

            // 2) Gravity shaft ledge (Reduced Gravity).
            Box(t, "ShaftLedge", new Vector3(23.5f, 1.9f, 55.5f), new Vector3(5f, 3.8f, 5f), HullLight);
            Box(t, "LedgeEdge", new Vector3(21f, 3.78f, 55.5f), new Vector3(0.06f, 0.06f, 5f), GlowCyan, false, false);
            var ledgeClue = Box(t, "LedgeMarker", new Vector3(20.9f, 1.5f, 55.5f), new Vector3(0.05f, 1f, 2f), GlowViolet, false, false).AddComponent<Clue>();
            ledgeClue.id = "ledge"; ledgeClue.displayName = "Observation Ledge"; ledgeClue.focusOffset = Vector3.zero; ledgeClue.interactRange = 4f;
            ledgeClue.scanText = "Observation ledge: 3.8 m. Far beyond any body configuration at standard gravity.";
            var lvt = ledgeClue.gameObject.AddComponent<VisionTarget>(); lvt.environment = false; lvt.scan = ScanCategory.Clue;
            FlagZone.Create(t, "ledge", new Vector3(23.5f, 5f, 55.5f), new Vector3(5f, 2.4f, 5f), "lab.ledge", "", "From up here you can see the lab's true shape: it was built around the vault.");
            Pickup.Create(t, "ledge_n1", "nanites", 10, new Vector3(24.5f, 3.8f, 56.5f));

            // 3) Pulse barrier (Time Distortion).
            PulseBarrier.Create(t, new Vector3(21.5f, 0, 51f), new Vector3(3f, 3.6f, 2f)).offTime = 0.2f;
            FlagZone.Create(t, "chrono", new Vector3(21.5f, 1.5f, 48.6f), new Vector3(3f, 3f, 2f), "lab.chrono");

            // 4) Phase-locked core (Matter Interaction).
            PhaseLockedContainer.Create(t, "core", new Vector3(23.5f, 0, 46.2f));

            // 5) Spatial fold to the vault (Spatial Anomaly).
            var a = SpatialPortal.Create(t, "lab", new Vector3(19.2f, 0, 45f), 0f);
            var b = SpatialPortal.Create(t, "vault", new Vector3(31f, 0, 45f), 0f);
            a.partner = b; b.partner = a;

            Sign(t, "CONTAINMENT LAB", new Vector3(8.3f, 4f, 53f), 90f, Art.Violet, 0.1f);
            RechargeStation.Create(t, "lab", new Vector3(9f, 0, 45.6f), 0f);
            FlagZone.Create(t, "lab", new Vector3(17, 2, 51), new Vector3(18, 4, 14), "", "reality_lab");
        }

        // ------------------------------------------------------------------ VAULT
        static void Vault(Transform root)
        {
            var t = Room(root, "Vault", new Vector3(28, 0, 43), new Vector3(34, 0, 52), 4f).transform;
            PointLight(t, new Vector3(31, 3.4f, 48), new Color(0.4f, 1f, 0.7f), 9f, 1.1f);
            var map = Terminal.Create(t, "starmap", "Star Map", new Vector3(31f, 0, 51.4f), 180f, GlowViolet);
            map.title = "STAR MAP";
            map.body = "A navigation map unlike any human chart. Veyra is marked not as a planet but as an origin.\n\nThe Frozen Moon and the Fractured World orbit it like guards.\n\nWith the phase core and this map, the jump drive could reach Veyra. (Future expansion: not yet playable.)";
            map.firstUseXp = 50;
            map.setFlags = new[] { "starmap.read" };
            RechargeStation.Create(t, "vault", new Vector3(33.4f, 0, 47.5f), -90f);
            FlagZone.Create(t, "vault", new Vector3(31, 2, 47.5f), new Vector3(6, 4, 9), "lab.vault", "vault");
        }
    }
}

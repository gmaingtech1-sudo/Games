using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Built-in game content, defined in code so the game is fully playable without any authored assets.
    /// BODY.OS > Export Default Content (editor) writes these out as ScriptableObject assets; assets in
    /// Resources/ScriptableObjects/... override entries with the same id and can add new ones.
    /// </summary>
    public static class DefaultContent
    {
        // ------------------------------------------------------------------ Upgrades
        public static UpgradeDefinition[] Upgrades()
        {
            return new[]
            {
                Up("kinetic_actuators", "Kinetic Actuators", UpgradeCategory.Movement,
                    "Enhanced movement systems. Raises the Movement Speed and Jump Height caps by 1 per tier.",
                    2, new[] { 1, 2 }, new[] { 0, 10 }, 1, null, null, "",
                    Fx(UpgradeEffectType.StatCap, 1, StatId.Speed), Fx(UpgradeEffectType.StatCap, 1, StatId.Jump)),

                Up("myofiber_lattice", "Myofiber Lattice", UpgradeCategory.Movement,
                    "Reinforced musculature. +2 body allocation budget and +1 Strength cap per tier.",
                    2, new[] { 1, 2 }, new[] { 5, 15 }, 2, null, null, "",
                    Fx(UpgradeEffectType.BodyBudget, 2), Fx(UpgradeEffectType.StatCap, 1, StatId.Strength)),

                Up("neural_bus", "Neural Bus Expansion", UpgradeCategory.Neural,
                    "Additional cognitive bandwidth. +2 brain allocation budget and +1 Reaction/Analysis cap per tier.",
                    2, new[] { 1, 2 }, new[] { 5, 15 }, 2, null, null, "",
                    Fx(UpgradeEffectType.BrainBudget, 2), Fx(UpgradeEffectType.StatCap, 1, StatId.Reaction), Fx(UpgradeEffectType.StatCap, 1, StatId.Analysis)),

                Up("thermal_optics", "Thermal Optics", UpgradeCategory.Senses,
                    "Advanced sensory system. Unlocks THERMAL vision: heat-emitting objects and creatures glow through the dark.",
                    1, new[] { 1 }, new[] { 10 }, 1, null, new[] { "schematic.thermal" }, "Schematic required: find an upgrade terminal.",
                    FxKey(UpgradeEffectType.UnlockVision, "Thermal")),

                Up("capacitor_lattice", "Capacitor Lattice", UpgradeCategory.Energy,
                    "Improved energy capacity. +25 maximum energy per tier.",
                    3, new[] { 1, 1, 2 }, new[] { 0, 10, 20 }, 1, null, new[] { "schematic.capacitor" }, "Schematic required: find an upgrade terminal.",
                    Fx(UpgradeEffectType.MaxEnergy, 25)),

                Up("environmental_weave", "Environmental Weave", UpgradeCategory.Protection,
                    "Suit protection mesh. +1 cold, toxic and radiation protection and +20 suit capacity per tier.",
                    3, new[] { 1, 1, 2 }, new[] { 5, 15, 25 }, 1, null, new[] { "schematic.weave" }, "Schematic required: find an upgrade terminal.",
                    Fx(UpgradeEffectType.ProtectionCold, 1), Fx(UpgradeEffectType.ProtectionToxic, 1),
                    Fx(UpgradeEffectType.ProtectionRadiation, 1), Fx(UpgradeEffectType.SuitCapacity, 20)),

                Up("regen_matrix", "Regenerative Matrix", UpgradeCategory.Recovery,
                    "Enhanced recovery. +25% energy and health regeneration per tier.",
                    2, new[] { 1, 2 }, new[] { 5, 15 }, 2, null, null, "",
                    Fx(UpgradeEffectType.RegenMultiplier, 0.25f), Fx(UpgradeEffectType.MaxHealth, 10)),

                Up("deep_scanner", "Deep Scanner Suite", UpgradeCategory.Scanner,
                    "Scanner upgrade. +40% scanner range and -20% vision mode drain per tier.",
                    2, new[] { 1, 1 }, new[] { 5, 10 }, 1, null, null, "",
                    Fx(UpgradeEffectType.ScannerRange, 0.4f), Fx(UpgradeEffectType.VisionDrainMultiplier, 0.2f)),

                Up("reality_kernel", "Reality Kernel", UpgradeCategory.Reality,
                    "The dormant core of BODY.OS. Unlocks REDUCED GRAVITY, DIMENSIONAL PERCEPTION and DIMENSIONAL vision.",
                    1, new[] { 2 }, new[] { 15 }, 1, null, new[] { "mission.wake.complete" }, "Dormant. Complete WAKE PROTOCOL.",
                    FxKey(UpgradeEffectType.UnlockAbility, "reduced_gravity"), FxKey(UpgradeEffectType.UnlockAbility, "dimensional_perception"),
                    FxKey(UpgradeEffectType.UnlockVision, "Dimensional")),

                Up("chrono_module", "Chrono Distortion Module", UpgradeCategory.Reality,
                    "Reality module. Unlocks TIME DISTORTION: slow designated moving objects and hostiles.",
                    1, new[] { 1 }, new[] { 5 }, 1, new[] { "reality_kernel" }, null, "",
                    FxKey(UpgradeEffectType.UnlockAbility, "time_distortion")),

                Up("matter_module", "Matter Phase Module", UpgradeCategory.Reality,
                    "Reality module. Unlocks MATTER INTERACTION: manipulate phase-locked objects.",
                    1, new[] { 1 }, new[] { 5 }, 1, new[] { "reality_kernel" }, null, "",
                    FxKey(UpgradeEffectType.UnlockAbility, "matter_interaction")),

                Up("spatial_module", "Spatial Fold Module", UpgradeCategory.Reality,
                    "Reality module. Unlocks SPATIAL ANOMALY: stabilise and traverse spatial portals.",
                    1, new[] { 1 }, new[] { 5 }, 1, new[] { "reality_kernel" }, null, "",
                    FxKey(UpgradeEffectType.UnlockAbility, "spatial_anomaly")),
            };
        }

        static UpgradeDefinition Up(string id, string name, UpgradeCategory cat, string desc, int tiers, int[] pts, int[] nan,
            int level, string[] reqUpgrades, string[] reqFlags, string lockedHint, params UpgradeEffect[] fx)
        {
            var u = ScriptableObject.CreateInstance<UpgradeDefinition>();
            u.name = id; u.id = id; u.displayName = name; u.category = cat; u.description = desc;
            u.maxTier = tiers; u.pointCost = pts; u.naniteCost = nan; u.requiredLevel = level;
            u.requiredUpgrades = reqUpgrades ?? new string[0];
            u.requiredFlags = reqFlags ?? new string[0];
            u.lockedHint = lockedHint; u.effects = fx;
            return u;
        }

        static UpgradeEffect Fx(UpgradeEffectType t, float v, StatId stat = StatId.Strength)
        {
            return new UpgradeEffect { type = t, valuePerTier = v, stat = stat };
        }

        static UpgradeEffect FxKey(UpgradeEffectType t, string key) { return new UpgradeEffect { type = t, key = key, valuePerTier = 1 }; }

        // ------------------------------------------------------------------ Abilities
        public static RealityAbilityDefinition[] Abilities()
        {
            return new[]
            {
                Ab("reduced_gravity", "Reduced Gravity", "LOW-G", RealityAbilityType.ReducedGravity,
                    "Your gravity response drops to 35% for a short time. Leap to otherwise unreachable heights.",
                    25, 10, 18, new Color(0.3f, 0.8f, 1f)),
                Ab("time_distortion", "Time Distortion", "TIME", RealityAbilityType.TimeDistortion,
                    "Slows designated moving machinery and hostiles within 15 m to 20% speed.",
                    30, 7, 22, new Color(1f, 0.85f, 0.3f)),
                Ab("spatial_anomaly", "Spatial Anomaly", "FOLD", RealityAbilityType.SpatialAnomaly,
                    "Stabilises dormant spatial portals so they can be traversed.",
                    30, 15, 20, new Color(0.4f, 1f, 0.7f)),
                Ab("dimensional_perception", "Dimensional Perception", "SEE", RealityAbilityType.DimensionalPerception,
                    "A perception pulse that reveals hidden elements and anomalies for a short time.",
                    20, 12, 14, new Color(0.75f, 0.4f, 1f)),
                Ab("matter_interaction", "Matter Interaction", "PHASE", RealityAbilityType.MatterInteraction,
                    "Phase your hands out of sync with normal matter to manipulate phase-locked objects.",
                    35, 10, 25, new Color(1f, 0.4f, 0.75f)),
            };
        }

        static RealityAbilityDefinition Ab(string id, string name, string shortName, RealityAbilityType t, string desc, float cost, float dur, float cd, Color c)
        {
            var a = ScriptableObject.CreateInstance<RealityAbilityDefinition>();
            a.name = id; a.id = id; a.displayName = name; a.shortName = shortName; a.type = t; a.description = desc;
            a.energyCost = cost; a.duration = dur; a.cooldown = cd; a.color = c;
            return a;
        }

        // ------------------------------------------------------------------ Items
        public static ItemDefinition[] Items()
        {
            return new[]
            {
                It("nanites", "Nanite Shards", ItemKind.Resource, "Programmable matter. Spent on technology upgrades.", Art.Cyan),
                It("power_cell", "Power Cell (Class-C)", ItemKind.KeyItem, "A charged power cell. Fits standard ship sockets.", Art.Warning),
                It("energy_capsule", "Energy Capsule", ItemKind.Consumable, "Restores 50 energy when used.", Art.Success),
                It("medigel", "Medi-Gel", ItemKind.Consumable, "Restores 40 health when used.", Art.Danger),
                It("phase_core", "Phase Core", ItemKind.KeyItem, "A core vibrating out of phase with reality. It hums when near Veyra's coordinates.", Art.Violet),
            };
        }

        static ItemDefinition It(string id, string name, ItemKind k, string desc, Color c)
        {
            var i = ScriptableObject.CreateInstance<ItemDefinition>();
            i.name = id; i.id = id; i.displayName = name; i.kind = k; i.description = desc; i.color = c;
            return i;
        }

        // ------------------------------------------------------------------ Missions
        public static MissionDefinition[] Missions()
        {
            var wake = ScriptableObject.CreateInstance<MissionDefinition>();
            wake.name = wake.id = "wake_protocol";
            wake.title = "WAKE PROTOCOL";
            wake.summary = "You woke inside a derelict ship with no memories. BODY.OS is online. Find out where you are.";
            wake.completeFlag = "mission.wake.complete";
            wake.rewardXp = 250; wake.rewardPoints = 2; wake.rewardNanites = 10;
            wake.objectives = new[]
            {
                Obj("moved", "Leave the cryo pod. Use the left joystick to move.", "Drag the left side of the screen.", 20),
                Obj("interact.medterminal", "Access the medical terminal.", "Walk up to the glowing terminal and tap INTERACT.", 30),
                Obj("os.opened", "Open BODY.OS.", "Tap the BODY.OS button at the top right.", 20),
                Obj("os.adjusted", "Adjust a BODY.OS attribute in the Body section.", "Open BODY.OS > Body and move any slider.", 30),
                Obj("scanned.bulkhead", "Scan the sealed bulkhead at the end of the atrium.", "Scanner vision lets you analyse objects. Try the eye button.", 40),
                Obj("item.power_cell", "Find a power cell for the bulkhead.", "The storage bay is dark, and the shelving is tall. Your body can be reconfigured.", 50),
                Obj("power.bulkhead", "Restore power to the bulkhead.", "Install the cell in the socket beside the door.", 50),
                Obj("transmission.heard", "Investigate the bridge comm array.", "The bridge is beyond the bulkhead.", 40),
            };

            var signal = ScriptableObject.CreateInstance<MissionDefinition>();
            signal.name = signal.id = "fractured_signal";
            signal.title = "FRACTURED SIGNAL";
            signal.summary = "The transmission unlocked something dormant in BODY.OS. The containment lab off the bridge holds answers.";
            signal.startFlag = "mission.wake.complete";
            signal.completeFlag = "mission.signal.complete";
            signal.rewardXp = 300; signal.rewardPoints = 2; signal.rewardNanites = 20;
            signal.objectives = new[]
            {
                Obj("upgrade.reality_kernel", "Install the Reality Kernel (BODY.OS > Technology).", "It costs 2 upgrade points.", 40),
                Obj("glyph.decoded", "Find and decode the hidden glyph in the containment lab.", "Some things only exist in another dimension.", 50, 1),
                Obj("lab.ledge", "Reach the observation ledge in the gravity shaft.", "The ledge is far too high for any body setting.", 50, 1),
                Obj("lab.chrono", "Pass the pulse barrier.", "Machines obey time. You don't have to.", 50),
                Obj("item.phase_core", "Retrieve the phase-locked core.", "Normal hands pass straight through it.", 50),
                Obj("lab.vault", "Reach the sealed vault.", "There is no door. There is a fold in space.", 60),
            };
            return new[] { wake, signal };
        }

        static ObjectiveDefinition Obj(string flag, string text, string hint, int xp, int points = 0)
        {
            return new ObjectiveDefinition { flag = flag, text = text, hint = hint, xp = xp, pointReward = points };
        }

        // ------------------------------------------------------------------ Locations
        public static LocationDefinition[] Locations()
        {
            return new[]
            {
                // Destinations (Navigation)
                Loc("derelict", "THE DERELICT", "An abandoned research vessel drifting in deep space. Tutorial and hub.", true, "derelict", "", 0),
                Loc("veyra", "VEYRA", "An alien planet of ancient ruins and environmental hazards.", true, "", "Navigation core offline. Expansion destination: not yet playable.", 0),
                Loc("frozen_moon", "THE FROZEN MOON", "A cold world that demands environmental adaptation.", true, "", "Coordinates corrupted. Expansion destination: not yet playable.", 0),
                Loc("fractured_world", "THE FRACTURED WORLD", "A world where gravity and space behave unpredictably.", true, "", "Signal source unknown. Expansion destination: not yet playable.", 0),

                // Rooms of the Derelict
                Loc("medbay", "Medical Bay", "Cryo pods line the walls. Only yours was occupied.", false, "", "", 25,
                    Frag("medbay.1", 5, "Pod 7. You remember the cold, and a voice counting backwards from ten."),
                    Frag("medbay.2", 8, "The other pods were never meant for people. They were sized for something taller.")),
                Loc("corridor", "Central Corridor", "The ship's spine. A coolant line has ruptured near the atrium.", false, "", "", 25,
                    Frag("corridor.1", 6, "You have walked this corridor before. Many times. Running.")),
                Loc("engineering", "Engineering", "Workbenches, an upgrade fabricator and a sealed reactor alcove.", false, "", "", 25,
                    Frag("engineering.1", 6, "Someone rebuilt the fabricator to print parts for BODY.OS. For you."),
                    Frag("engineering.2", 9, "The reactor was shut down deliberately, from the inside.")),
                Loc("reactor", "Reactor Alcove", "Radiation leaks from the cracked shielding.", false, "", "", 30,
                    Frag("reactor.1", 7, "The radiation is not from the reactor. It is coming from the cargo you brought aboard.")),
                Loc("storage", "Storage Bay", "Dark, cold cargo racks. Part of the deck has lost artificial gravity.", false, "", "", 25,
                    Frag("storage.1", 5, "The crates are labelled VEYRA SURVEY - DO NOT OPEN."),
                    Frag("storage.2", 8, "You opened one.")),
                Loc("atrium", "Atrium", "A domed junction leading to the bridge bulkhead.", false, "", "", 25,
                    Frag("atrium.1", 7, "The maintenance drone started attacking the crew the day the signal arrived.")),
                Loc("bridge", "The Bridge", "Command deck. The comm array is still receiving.", false, "", "", 40,
                    Frag("bridge.1", 6, "The captain's chair faces the stars, not the controls."),
                    Frag("bridge.2", 9, "You were not crew. You were the cargo.")),
                Loc("reality_lab", "Containment Lab", "Space bends wrong in here. Instruments disagree with each other.", false, "", "", 40,
                    Frag("lab.1", 8, "BODY.OS was installed here. You agreed to it. You think.")),
                Loc("vault", "Sealed Vault", "A room with no doors.", false, "", "", 60,
                    Frag("vault.1", 10, "The vault holds a map. Veyra is not a planet. It is an address.")),
            };
        }

        static LocationDefinition Loc(string id, string name, string desc, bool dest, string key, string locked, int xp, params MemoryFragment[] frags)
        {
            var l = ScriptableObject.CreateInstance<LocationDefinition>();
            l.name = id; l.id = id; l.displayName = name; l.description = desc; l.isDestination = dest;
            l.playableKey = key; l.lockedReason = locked; l.discoveryXp = xp; l.fragments = frags;
            return l;
        }

        static MemoryFragment Frag(string id, int mem, string text) { return new MemoryFragment { id = id, memoryRequired = mem, text = text }; }

        // ------------------------------------------------------------------ Presets
        public static ConfigPreset[] Presets()
        {
            // Order: Strength, Speed, Jump, Endurance, Recovery, Throttle, Reaction, Concentration, Memory, Threat, Analysis
            return new[]
            {
                Pre("explorer", "EXPLORER", "Balanced movement, enhanced scanning, moderate consumption.", "Scanner", 4, 6, 6, 5, 5, 5, 5, 4, 6, 4, 7),
                Pre("survivor", "SURVIVOR", "Endurance and recovery for hazards. Low energy throttle.", "Normal", 4, 4, 4, 7, 7, 3, 4, 6, 5, 6, 5),
                Pre("combat", "COMBAT", "Speed, strength and threat detection. Hungry for energy.", "Normal", 7, 7, 5, 4, 3, 7, 7, 4, 3, 8, 4),
                Pre("engineer", "ENGINEER", "Strength and analysis for working with technology.", "Scanner", 6, 4, 4, 6, 6, 5, 5, 6, 5, 3, 7),
                Pre("reality_breaker", "REALITY BREAKER", "Recovery and focus to fuel reality abilities.", "Dimensional", 3, 5, 6, 4, 8, 8, 6, 8, 4, 4, 4),
            };
        }

        static ConfigPreset Pre(string id, string name, string desc, string vision, params int[] v)
        {
            return new ConfigPreset { id = id, name = name, description = desc, vision = vision, stats = v, customised = false };
        }
    }
}

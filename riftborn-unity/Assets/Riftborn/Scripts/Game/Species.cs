// Riftborn — the creatures: elements, rarities, the 42 species (the same
// list as the web game's js/creatures.js) and their stats.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Riftborn
{
    public enum El { Ember, Tide, Gale, Stone, Volt, Void }
    public enum Plan { Raptor, Rex, Horned, Plated, Longneck, Flyer }

    public class Element
    {
        public string name, icon, move; public Color color;
        public Element(string n, string hex, string icon, string move) { name = n; color = Species.Hex(hex); this.icon = icon; this.move = move; }
    }

    public class Rarity
    {
        public string name; public Color color; public double weight, catchRate, flee; public int dna, xp;
        public Rarity(string n, string hex, double w, double c, double f, int d, int x) { name = n; color = Species.Hex(hex); weight = w; catchRate = c; flee = f; dna = d; xp = x; }
    }

    public class Species
    {
        public readonly string id, name, blurb;
        public readonly El el;
        public readonly int rar, hp, atk, spd;
        public readonly Plan plan;
        public readonly float size;
        public readonly Color dorsal, belly, accent, eye;
        public readonly HashSet<string> feat;
        public readonly string[] parents;
        public bool Hybrid => parents != null;
        public bool Has(string f) => feat.Contains(f);

        public Species(string id, string name, El el, int rar, Plan plan, double size, string d, string b, string a, string eye,
            string feat, int hp, int atk, int spd, string blurb, string p1, string p2)
        {
            this.id = id; this.name = name; this.el = el; this.rar = rar; this.plan = plan; this.size = (float)size;
            dorsal = Hex(d); belly = Hex(b); accent = Hex(a); this.eye = Hex(eye);
            this.feat = new HashSet<string>(feat.Split(' '));
            this.hp = hp; this.atk = atk; this.spd = spd; this.blurb = blurb;
            parents = p1 == null ? null : new[] { p1, p2 };
        }

        public static Color Hex(string hex)
        {
            ColorUtility.TryParseHtmlString(hex, out var c);
            return c;
        }

        public static readonly Dictionary<El, Element> Elements = new Dictionary<El, Element>
        {
            { El.Ember, new Element("Ember", "#FF6A3D", "🔥", "Magma Burst") },
            { El.Tide, new Element("Tide", "#3DB8FF", "💧", "Riptide") },
            { El.Gale, new Element("Gale", "#7CF0C8", "🌪️", "Cyclone Rend") },
            { El.Stone, new Element("Stone", "#E0AE68", "🪨", "Quake Slam") },
            { El.Volt, new Element("Volt", "#FFE14D", "⚡", "Arc Lightning") },
            { El.Void, new Element("Void", "#B45CFF", "🌀", "Rift Collapse") },
        };

        public static readonly Rarity[] Rarities =
        {
            new Rarity("Common", "#B8C4D6", 62, 0.5, 0.08, 12, 100),
            new Rarity("Rare", "#4DA3FF", 27, 0.32, 0.15, 10, 250),
            new Rarity("Epic", "#C86BFF", 9, 0.18, 0.22, 8, 600),
            new Rarity("Legendary", "#FFB020", 2, 0.08, 0.3, 6, 1500),
        };

        // Each element beats the next one around the circle. Void hits
        // everything a bit harder and takes a bit more from everything.
        static readonly Dictionary<El, El> Beats = new Dictionary<El, El> { { El.Ember, El.Gale }, { El.Gale, El.Stone }, { El.Stone, El.Volt }, { El.Volt, El.Tide }, { El.Tide, El.Ember } };
        public static float Advantage(El atk, El def)
        {
            if (atk == El.Void && def == El.Void) return 1;
            if (atk == El.Void || def == El.Void) return 1.25f;
            if (Beats[atk] == def) return 1.5f;
            if (Beats[def] == atk) return 0.67f;
            return 1;
        }

        public static readonly Species[] All =
        {
            new Species("cindertail", "Cindertail", El.Ember, 0, Plan.Raptor, 1.4, "#6B2E1E", "#D9B48E", "#E0572C", "#FFC23A", "stripes feathers", 100, 24, 16, "A quick little raptor. Its tail smoulders when it gets excited.", null, null),
            new Species("mossback", "Mossback", El.Stone, 0, Plan.Plated, 2.2, "#4F5B33", "#BDB287", "#8BA63F", "#E8D070", "plates spots", 140, 18, 8, "Moss grows on its plates. It naps in parks and nobody notices.", null, null),
            new Species("zephyrix", "Zephyrix", El.Gale, 0, Plan.Flyer, 1.6, "#3D6A62", "#E3E6D8", "#2FA487", "#F2E6B0", "crest", 90, 22, 20, "Rides the wind over rooftops, squawking at pigeons.", null, null),
            new Species("sparkjaw", "Sparkjaw", El.Volt, 0, Plan.Raptor, 1.4, "#2C3050", "#CFC6A2", "#F2C230", "#FFE14D", "stripes feathers", 95, 25, 17, "Hangs around streetlights. Its bite tingles.", null, null),
            new Species("ripplehorn", "Ripplehorn", El.Tide, 0, Plan.Horned, 2, "#3E5667", "#CBD0C8", "#5FA8D8", "#F4E9C8", "horns3 frill", 135, 20, 10, "Its frill ripples like water when it is curious.", null, null),
            new Species("pebblestomp", "Pebblestomp", El.Stone, 0, Plan.Horned, 1.7, "#6E6154", "#D2C6B0", "#A08E78", "#FFD23F", "horns1 frill spots", 130, 21, 11, "Stubborn and sturdy. Headbutts lampposts to say hello.", null, null),
            new Species("emberjaw", "Emberjaw", El.Ember, 1, Plan.Rex, 4, "#4A2017", "#C99A74", "#E8602A", "#FFD23F", "stripes spikes", 170, 34, 12, "Its roar leaves the air shimmering with heat.", null, null),
            new Species("tidecrest", "Tidecrest", El.Tide, 1, Plan.Longneck, 5.5, "#35566E", "#D6DEDC", "#6FB6D8", "#F2F2E0", "crest spots", 190, 26, 9, "Gentle giant. Sings low songs that sound like waves.", null, null),
            new Species("galeclaw", "Galeclaw", El.Gale, 1, Plan.Raptor, 1.7, "#2F5A50", "#E0E6DA", "#8FD2BA", "#F6F0C8", "feathers crest stripes", 120, 30, 22, "Hunts in gusts. You hear the wind before you see it.", null, null),
            new Species("stonehorn", "Stonehorn", El.Stone, 1, Plan.Horned, 2.5, "#6A5038", "#D8C09A", "#EDE0C6", "#FFB020", "horns3 frill spikes", 180, 28, 9, "Its horns are harder than granite. Very proud of them.", null, null),
            new Species("voltwing", "Voltwing", El.Volt, 1, Plan.Flyer, 2, "#26294A", "#E8DCA2", "#F2D040", "#FFE14D", "crest stripes", 115, 32, 21, "Leaves little lightning trails across storm clouds.", null, null),
            new Species("duskmaw", "Duskmaw", El.Void, 2, Plan.Rex, 4.4, "#1F1629", "#6E5C80", "#A04CE8", "#E05CFF", "spikes glow", 210, 40, 13, "Only hunts at dusk. Its shadow moves before it does.", null, null),
            new Species("frostspire", "Frostspire", El.Tide, 2, Plan.Plated, 3, "#9CB6C6", "#E9EFF2", "#78C4EE", "#3DB8FF", "plates glow spikes", 230, 32, 10, "Its plates are made of ice that never melts.", null, null),
            new Species("thunderneck", "Thunderneck", El.Volt, 2, Plan.Longneck, 6.5, "#2F2E4F", "#D8D0A2", "#F2D040", "#FFE14D", "stripes glow", 250, 34, 8, "When it stomps, phones nearby lose a bar of signal.", null, null),
            new Species("pyrewing", "Pyrewing", El.Ember, 2, Plan.Flyer, 2.4, "#6E1B13", "#E2AA72", "#FF8A20", "#FFE14D", "crest glow", 150, 42, 24, "Dives out of sunsets trailing sparks.", null, null),
            new Species("riftking", "Riftking", El.Void, 3, Plan.Rex, 5.8, "#140C1E", "#4A3666", "#D850F0", "#FF5CF0", "spikes glow crown", 300, 52, 16, "The first thing to come through the Rifts. It rules the other side.", null, null),
            new Species("aetherwyrm", "Aetherwyrm", El.Gale, 3, Plan.Longneck, 7.5, "#C3D8D2", "#F2F6F2", "#3FD6B6", "#2EE6C5", "crest glow spots", 320, 46, 14, "Said to hold the sky together. Seen only where many Rifts meet.", null, null),
            new Species("magmaron", "Magmaron", El.Ember, 3, Plan.Horned, 3.4, "#2B100B", "#8A3A1A", "#FF8A20", "#FFD23F", "horns3 frill glow spikes", 290, 50, 12, "Walks on lava like it is a warm carpet.", null, null),
            new Species("mudstomper", "Mudstomper", El.Stone, 0, Plan.Plated, 1.9, "#5E4A34", "#C4AE8A", "#8C7250", "#E8C060", "armor club spots", 150, 17, 7, "Covered in bony studs. Swings its tail club at anything that sneaks up.", null, null),
            new Species("brookrunner", "Brookrunner", El.Tide, 0, Plan.Raptor, 1.5, "#3E5A58", "#D2D8C8", "#6FA89A", "#F2E6B0", "tubecrest stripes", 105, 21, 17, "Hoots through its tube crest to call the herd to the river.", null, null),
            new Species("thistlehorn", "Thistlehorn", El.Gale, 0, Plan.Horned, 1.5, "#4E5E3C", "#D0CCA8", "#9CB86A", "#FFD23F", "horns1 frill stripes", 125, 21, 12, "Its frill rattles in the wind like dry leaves.", null, null),
            new Species("zapling", "Zapling", El.Volt, 0, Plan.Flyer, 1.2, "#36384E", "#E2DAB0", "#E8C83A", "#FFE14D", "crest", 85, 23, 21, "Perches on power lines and hums along with them.", null, null),
            new Species("kindlepup", "Kindlepup", El.Ember, 0, Plan.Raptor, 1.2, "#6A3A22", "#DCBC94", "#C8642E", "#FFC23A", "dome spots", 110, 22, 15, "Headbutts everything. Its dome is always warm.", null, null),
            new Species("boulderback", "Boulderback", El.Stone, 1, Plan.Plated, 2.7, "#56504A", "#C8BCA8", "#A8967A", "#FFB020", "armor club spikes", 200, 27, 7, "A walking fortress. One swing of its club can split a boulder.", null, null),
            new Species("sailfin", "Sailfin", El.Tide, 1, Plan.Rex, 3.8, "#3A4E5A", "#D8D6C8", "#C86A3A", "#F4E9C8", "sail stripes", 175, 32, 13, "Hunts along riverbanks, its great sail flushing red when it is angry.", null, null),
            new Species("hornblower", "Hornblower", El.Gale, 1, Plan.Raptor, 2.4, "#4A5A3E", "#DAD6BC", "#B8C86A", "#F6F0C8", "tubecrest spots", 150, 27, 18, "Its call carries for miles. Other creatures scatter when they hear it.", null, null),
            new Species("skullcrack", "Skullcrack", El.Stone, 1, Plan.Raptor, 1.9, "#5A4A3E", "#D4C4A8", "#8A6A4E", "#FFD23F", "dome spikes", 150, 30, 16, "Settles every argument by ramming. It has never lost one.", null, null),
            new Species("tidereaver", "Tidereaver", El.Tide, 2, Plan.Rex, 5, "#23384A", "#C8D4D8", "#3DB8FF", "#9FE8FF", "sail stripes glow", 240, 42, 14, "Its sail glows like deep water. Storm drains flood when it passes.", null, null),
            new Species("ironhide", "Ironhide", El.Volt, 2, Plan.Plated, 3.2, "#3A3A48", "#C8C4B0", "#F2D040", "#FFE14D", "armor club glow", 260, 36, 8, "Lightning jumps between its armour studs. Nothing bites it twice.", null, null),
            new Species("nightglider", "Nightglider", El.Void, 2, Plan.Flyer, 2.6, "#1C1428", "#6A5A7E", "#A04CE8", "#E05CFF", "crest glow", 150, 44, 25, "Blots out the stars as it glides over rooftops at midnight.", null, null),
            new Species("solarch", "Solarch", El.Ember, 3, Plan.Rex, 6, "#4A1E10", "#D8A070", "#FF9A30", "#FFE14D", "sail crown glow spikes", 310, 54, 14, "Its blazing sail soaks up the sun. Streetlights flicker on when it sleeps.", null, null),
            new Species("stormcrown", "Stormcrown", El.Volt, 3, Plan.Horned, 3.6, "#262A48", "#D0CCB0", "#F2D040", "#FFE14D", "horns3 frill glow spikes", 300, 50, 13, "Thunder rolls every time it lowers its horns.", null, null),
            new Species("scorchglider", "Scorchglider", El.Ember, 1, Plan.Flyer, 2, "#7A3218", "#E8C29A", "#2FA487", "#FFD23F", "crest stripes", 140, 34, 23, "Cindertail × Zephyrix. Glides on its own heat.", "cindertail", "zephyrix"),
            new Species("reefwarden", "Reefwarden", El.Tide, 1, Plan.Plated, 2.6, "#2F6B66", "#D8E6CC", "#8FD8EE", "#F4F0D0", "plates spots spikes", 200, 26, 10, "Mossback × Ripplehorn. A walking coral reef.", "mossback", "ripplehorn"),
            new Species("stormfang", "Stormfang", El.Volt, 2, Plan.Rex, 4.4, "#2A2750", "#D4B284", "#F2D040", "#FFE14D", "stripes spikes glow", 230, 44, 15, "Emberjaw × Sparkjaw. Thunder follows it around.", "emberjaw", "sparkjaw"),
            new Species("skyrender", "Skyrender", El.Gale, 2, Plan.Raptor, 2, "#23505C", "#E8F0E8", "#F2D040", "#FFE14D", "feathers crest stripes glow", 160, 42, 26, "Galeclaw × Sparkjaw. Faster than you can blink.", "galeclaw", "sparkjaw"),
            new Species("tempestral", "Tempestral", El.Volt, 2, Plan.Longneck, 6.5, "#2E4A78", "#E2ECF2", "#F2D040", "#FFE14D", "crest glow stripes", 270, 38, 11, "Tidecrest × Voltwing. Carries a storm on its back.", "tidecrest", "voltwing"),
            new Species("gravemaw", "Gravemaw", El.Void, 3, Plan.Horned, 3.2, "#35283F", "#BFB0D2", "#A04CE8", "#E05CFF", "horns3 frill glow spikes", 310, 50, 12, "Stonehorn × Duskmaw. Its frill opens onto another world.", "stonehorn", "duskmaw"),
            new Species("sailcrusher", "Sailcrusher", El.Ember, 2, Plan.Rex, 4.6, "#5A2A1A", "#D8B090", "#E8602A", "#FFD23F", "sail stripes spikes", 230, 44, 13, "Sailfin × Emberjaw. Its sail steams in the rain.", "sailfin", "emberjaw"),
            new Species("bastionhorn", "Bastionhorn", El.Stone, 1, Plan.Horned, 2.8, "#5A5048", "#D0C4AE", "#A8967A", "#FFB020", "horns3 frill armor", 220, 28, 9, "Boulderback × Pebblestomp. Armoured from nose to tail.", "boulderback", "pebblestomp"),
            new Species("thunderdome", "Thunderdome", El.Volt, 2, Plan.Raptor, 2.1, "#2E3050", "#D8CCA0", "#F2D040", "#FFE14D", "dome stripes glow", 180, 42, 19, "Skullcrack × Sparkjaw. Its headbutts land like lightning strikes.", "skullcrack", "sparkjaw"),
            new Species("mistcaller", "Mistcaller", El.Tide, 2, Plan.Raptor, 2.6, "#34505A", "#DCE4E0", "#78C4EE", "#9FE8FF", "tubecrest spots glow", 200, 36, 18, "Hornblower × Tidecrest. Fog rolls in wherever it sings.", "hornblower", "tidecrest"),
        };

        static readonly Dictionary<string, Species> byId = All.ToDictionary((s) => s.id);
        public static Species ById(string id) => byId[id];
        public static bool Exists(string id) => id != null && byId.ContainsKey(id);

        // DNA of each parent used per fusion.
        public static int FuseCost(string parentId) => new[] { 60, 100, 160, 240 }[ById(parentId).rar];

        // The web game's element ids ("ember", "tide"…).
        public static string ElId(El e) => e.ToString().ToLowerInvariant();
        public static readonly Species[] Wild = All.Where((s) => !s.Hybrid).ToArray();
        public static readonly Species[] Hybrids = All.Where((s) => s.Hybrid).ToArray();
        public const int MaxLevel = 30;
    }

    [Serializable]
    public class Creature
    {
        public string id, sp;
        public int lvl;
        public int[] iv = { 5, 5, 5 };
        public long t;
        [NonSerialized] public float hpx = 1;     // Apex bosses have several times the health
        public bool Boss => hpx > 1;
        public Species Species => Species.ById(sp);

        // Rounded like JavaScript's Math.round, so stats match the web game.
        static int R(double x) => (int)Math.Floor(x + 0.5);
        int[] Iv => iv != null && iv.Length >= 3 ? iv : new[] { 5, 5, 5 };
        public int Hp => R((Species.hp + Iv[0] * 2) * (1 + (lvl - 1) * 0.08));
        public int Atk => R((Species.atk + Iv[1] * 0.6) * (1 + (lvl - 1) * 0.07));
        public int Spd => R(Species.spd + Iv[2] * 0.3 + lvl / 4.0);
        public int Power => R(Hp * 0.8 + Atk * 10 + Spd * 5);
        // DNA needed to go from this level to the next.
        public int LevelCost => R((20 + lvl * 12) * new[] { 1, 1.4, 1.9, 2.6 }[Species.rar]);
    }
}

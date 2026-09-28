// Riftborn — the player's save and the game's rules, ported from the web
// game's js/state.js: XP and levels, items, creatures and DNA, the Rifts
// (hack, claim, recharge, assault), supply caches, catching, and the
// teams. Saved as JSON in PlayerPrefs.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Riftborn
{
    public class Faction
    {
        public string id, name, one, motto, about; public Color color; public bool npc;
        public Faction(string id, string name, string one, string hex, string motto, string about, bool npc = false)
        { this.id = id; this.name = name; this.one = one; color = Species.Hex(hex); this.motto = motto; this.about = about; this.npc = npc; }
    }

    [Serializable] public class Agent { public string name, faction; public int xp; public long switched; }
    [Serializable] public class Items { public int orbs = 20, darts = 30, shards = 12; }
    [Serializable] public class Count { public string id; public int n; }
    [Serializable] public class Stamp { public string id; public long t; }
    [Serializable] public class RiftOverride { public string id, faction; public int level, health; public long t, gseed; public bool mine; public List<string> guard = new List<string>(); }
    [Serializable] public class Stats { public int caught, hits, hacks, claimed, wins, purged, drops, hatched, apex; public double meters; }
    [Serializable] public class Egg { public string id; public int km; public double walked; public bool inc; }

    [Serializable]
    public class SaveData
    {
        public int v = 1;
        public long created, updated;
        public Agent agent = new Agent();
        public Items items = new Items();
        public List<Creature> creatures = new List<Creature>();
        public List<string> team = new List<string>();
        public List<Count> dna = new List<Count>();
        public List<Count> dex = new List<Count>();       // species caught (n) — seen when present
        public List<RiftOverride> rifts = new List<RiftOverride>();
        public List<Stamp> hacks = new List<Stamp>(), drops = new List<Stamp>(), gone = new List<Stamp>();
        public Stats stats = new Stats();
        public List<Egg> eggs = new List<Egg>();
        public List<string> raids = new List<string>();   // "riftId:day" → that day's Apex is beaten
        public double lastLat, lastLng;
        public bool sound = true, satellite;
    }

    public class Loot { public int orbs, darts, shards; public override string ToString() => string.Join(" · ", new[] { orbs > 0 ? orbs + " orbs" : null, darts > 0 ? darts + " darts" : null, shards > 0 ? shards + " shards" : null }.Where((x) => x != null)); }

    public class Result { public bool ok; public string why; public int levelUp; public Loot loot; public Creature creature; public bool key, hollow; public List<Count> dna; public Egg egg; public int dnaN; public static Result No(string why) => new Result { ok = false, why = why }; }

    public class EggKind { public string name; public Color color; public double[] odds; public int xp; public EggKind(string n, string hex, double[] o, int x) { name = n; color = Species.Hex(hex); odds = o; xp = x; } }

    // A huge Apex creature holding a Rift for the day.
    public class Apex { public Creature boss; public bool beaten; public int dna; }

    public class RiftState { public string faction; public int level, health; public bool mine; public List<Creature> guard = new List<Creature>(); }

    public static class GameState
    {
        public static SaveData save;
        const string KEY = "riftborn-save";

        public const long HACK_MS = 5 * 60000, DROP_MS = 10 * 60000;
        public const double DECAY_PER_DAY = 12;
        public const int MAX_TEAM = 3, MAX_LEVEL = 40, CLAIM_COST = 6, SWITCH_DAYS = 30;
        public const double RANGE = 100;   // meters you can reach things from

        public static readonly Dictionary<string, Faction> Factions = new Dictionary<string, Faction>
        {
            { "W", new Faction("W", "Wardens", "Warden", "#2EE6C5", "Seal the Rifts. Protect both worlds.", "Keepers of the line between worlds. They hold the Rifts to keep them closed and the creatures in check.") },
            { "B", new Faction("B", "Breachers", "Breacher", "#FF4FA3", "Tear them open. Claim the power beyond.", "Thrill-seekers and scientists who want the Rifts wide open, and everything on the other side.") },
            { "P", new Faction("P", "Primals", "Primal", "#FFA028", "The creatures belong here. Let the wild take back the streets.", "They side with the creatures, and hold the Rifts so the wild can pour through and take the city back.") },
            { "H", new Faction("H", "Hollow", "Hollow", "#E0282E", "Consume. Corrupt. Repeat.", "Machines born in the Rifts that feed on their energy. Nobody controls them. They grab Rifts from every team and guard them with corrupted Void and Volt creatures.", true) },
        };
        public static readonly string[] Playable = { "W", "B", "P" };
        public static readonly Color Neutral = Species.Hex("#A9A3C9");
        public static Faction Me => Factions[save.agent.faction];
        public static Color MyColor => save != null && !string.IsNullOrEmpty(save.agent.faction) ? Me.color : Species.Hex("#2EE6C5");

        /* ------------------ Save ------------------ */

        public static bool Load()
        {
            var json = PlayerPrefs.GetString(KEY, "");
            if (string.IsNullOrEmpty(json)) return false;
            try { save = JsonUtility.FromJson<SaveData>(json); } catch (Exception) { save = null; }
            if (save != null) { save.eggs ??= new List<Egg>(); save.raids ??= new List<string>(); save.stats ??= new Stats(); }
            return save != null && save.agent != null && !string.IsNullOrEmpty(save.agent.faction);
        }

        public static void Save()
        {
            if (save == null) return;
            save.updated = Rng.NowMs();
            PlayerPrefs.SetString(KEY, JsonUtility.ToJson(save));
            PlayerPrefs.Save();
        }

        public static void Reset() { PlayerPrefs.DeleteKey(KEY); save = null; }

        public static void NewGame(string name, string faction, string starter)
        {
            save = new SaveData { created = Rng.NowMs() };
            save.agent.name = name;
            save.agent.faction = faction;
            var c = AddCreature(starter, 5, new[] { 7, 7, 7 });
            save.team.Add(c.id);
            AddDna(starter, 60);
            Save();
        }

        /* ------------------ Agent level ------------------ */

        public static int XpFor(int L) => L <= 1 ? 0 : (int)Math.Round(400 * Math.Pow(L - 1, 1.75));
        public static int Level { get { int L = 1; while (L < MAX_LEVEL && save.agent.xp >= XpFor(L + 1)) L++; return L; } }
        public static float LevelFrac { get { int L = Level; return L >= MAX_LEVEL ? 1 : (save.agent.xp - XpFor(L)) / (float)(XpFor(L + 1) - XpFor(L)); } }
        static readonly string[] Titles = { "Recruit", "Scout", "Tracker", "Hunter", "Ranger", "Riftwalker", "Vanguard", "Legend", "Riftborn" };
        public static string Title(int L) => Titles[Math.Min(Titles.Length - 1, L / 5)];

        public static event Action<int> OnXP;

        // Returns the new level if this XP levelled you up, else 0.
        public static int AddXP(int n)
        {
            int before = Level;
            save.agent.xp += n;
            OnXP?.Invoke(n);
            int after = Level;
            if (after > before) Give(new Loot { orbs = 5 + after, darts = 10 + after * 2, shards = 3 + after / 2 });
            Save();
            return after > before ? after : 0;
        }

        /* ------------------ Items, creatures, DNA ------------------ */

        public static void Give(Loot l) { save.items.orbs += l.orbs; save.items.darts += l.darts; save.items.shards += l.shards; }

        static int Get(List<Count> list, string id) { var c = list.Find((x) => x.id == id); return c == null ? 0 : c.n; }
        static void Add(List<Count> list, string id, int n) { var c = list.Find((x) => x.id == id); if (c == null) list.Add(new Count { id = id, n = n }); else c.n += n; }
        static long GetT(List<Stamp> list, string id) { var s = list.Find((x) => x.id == id); return s == null ? 0 : s.t; }
        static void SetT(List<Stamp> list, string id, long t) { var s = list.Find((x) => x.id == id); if (s == null) list.Add(new Stamp { id = id, t = t }); else s.t = t; }

        public static int Dna(string sp) => Get(save.dna, sp);
        public static void AddDna(string sp, int n) { Add(save.dna, sp, n); MarkSeen(sp); }
        public static bool Seen(string sp) => save.dex.Any((d) => d.id == sp);
        public static int CaughtCount(string sp) => Get(save.dex, sp);
        static void MarkSeen(string sp) { if (!Seen(sp)) save.dex.Add(new Count { id = sp, n = 0 }); }

        public static Creature AddCreature(string sp, int lvl, int[] iv = null)
        {
            var c = new Creature { id = Rng.NowMs().ToString("x") + Rng.RandInt(0, 99999).ToString("x"), sp = sp, lvl = Mathf.Clamp(lvl, 1, Species.MaxLevel), iv = iv ?? new[] { Rng.RandInt(0, 10), Rng.RandInt(0, 10), Rng.RandInt(0, 10) }, t = Rng.NowMs() };
            save.creatures.Add(c);
            MarkSeen(sp);
            Add(save.dex, sp, 1);
            return c;
        }

        public static Creature CreatureById(string id) => save.creatures.Find((c) => c.id == id);

        public static Result LevelUpCreature(Creature c)
        {
            if (c.lvl >= Species.MaxLevel) return Result.No("Already at max level.");
            int cost = c.LevelCost;
            if (Dna(c.sp) < cost) return Result.No($"Needs {cost} {c.Species.name} DNA.");
            Add(save.dna, c.sp, -cost);
            c.lvl++;
            return new Result { ok = true, levelUp = AddXP(40) };
        }

        public static List<Creature> Team()
        {
            var picked = save.team.Select(CreatureById).Where((c) => c != null).ToList();
            var rest = save.creatures.Where((c) => !picked.Contains(c)).OrderByDescending((c) => c.Power);
            return picked.Concat(rest).Take(MAX_TEAM).ToList();
        }

        public static void ToggleTeam(Creature c)
        {
            if (save.team.Contains(c.id)) save.team.Remove(c.id);
            else { if (save.team.Count >= MAX_TEAM) save.team.RemoveAt(0); save.team.Add(c.id); }
            Save();
        }

        /* ------------------ Rifts ------------------ */

        static long Day(long t) => t / 86400000;

        // Current state of a Rift: the generated one, overridden by what you
        // have done to it. A few untouched Rifts change hands every day.
        public static RiftState State(Rift rift)
        {
            long now = Rng.NowMs();
            var o = save.rifts.Find((x) => x.id == rift.id);
            if (o != null)
            {
                double health = o.health;
                if (o.faction != null && o.mine) health = Math.Max(0, o.health - (now - o.t) / 86400000.0 * DECAY_PER_DAY);
                var st = new RiftState { faction = string.IsNullOrEmpty(o.faction) ? null : o.faction, level = o.level, health = (int)Math.Round(health), mine = o.mine };
                if (o.mine) st.guard = o.guard.Select(CreatureById).Where((c) => c != null).ToList();
                else if (st.faction != null) st.guard = Guards(rift, o.level, o.gseed, st.faction == "H");
                return st;
            }
            string f = rift.baseFaction; int L = rift.baseLevel;
            Func<double> r = new Seeded(Rng.Key("contest", rift.id, Day(now))).Next;
            if (r() < 0.1)
            {
                double x = r();
                f = x < 0.25 ? "W" : x < 0.5 ? "B" : x < 0.7 ? "P" : x < 0.85 ? "H" : null;
                L = f != null ? Rng.RandInt(1, 6, r) : 0;
            }
            int hp = f != null ? 55 + (int)(Rng.Hash(Rng.Key("hp", rift.id, Day(now))) % 46) : 0;
            return new RiftState { faction = f, level = L, health = hp, guard = f != null ? Guards(rift, L, Day(now), f == "H") : new List<Creature>() };
        }

        static List<Creature> Guards(Rift rift, int level, long seed, bool hollow) =>
            World.Guardians(rift, level, seed, hollow).Select((g) => new Creature { id = "g", sp = g.sp, lvl = g.lvl, iv = g.iv }).ToList();

        public static Color RiftColor(RiftState st) => st.faction != null ? Factions[st.faction].color : Neutral;

        public static long HackWait(Rift rift) => Math.Max(0, GetT(save.hacks, rift.id) + HACK_MS - Rng.NowMs());

        public static Result Hack(Rift rift)
        {
            if (HackWait(rift) > 0) return Result.No("Cooling down.");
            var st = State(rift);
            bool enemy = st.faction != null && st.faction != save.agent.faction;
            int lvl = Math.Max(1, st.level);
            var loot = new Loot { orbs = Rng.RandInt(enemy ? 0 : 1, 2 + (int)Math.Ceiling(lvl / 3.0)), darts = Rng.RandInt(2, 4 + lvl), shards = Rng.RandInt(1, 2 + lvl / 3) };
            Give(loot);
            var egg = Rng.Next() < 0.08 ? AddEgg(Rng.Next() < 0.3 ? 5 : 2) : null;
            SetT(save.hacks, rift.id, Rng.NowMs());
            save.stats.hacks++;
            return new Result { ok = true, loot = loot, egg = egg, levelUp = AddXP(enemy ? 100 : 50) };
        }

        static RiftOverride Override(Rift rift)
        {
            var o = save.rifts.Find((x) => x.id == rift.id);
            if (o == null) { o = new RiftOverride { id = rift.id }; save.rifts.Add(o); }
            return o;
        }

        public static Result Claim(Rift rift)
        {
            var st = State(rift);
            if (st.faction != null) return Result.No("This Rift is already held.");
            if (save.items.shards < CLAIM_COST) return Result.No($"Claiming needs {CLAIM_COST} Rift Shards. Hack Rifts and open caches to get more.");
            save.items.shards -= CLAIM_COST;
            var o = Override(rift);
            o.faction = save.agent.faction; o.level = 1; o.health = 100; o.t = Rng.NowMs(); o.mine = true;
            o.guard = new List<string> { Team()[0].id };
            save.stats.claimed++;
            return new Result { ok = true, levelUp = AddXP(300) };
        }

        public static Result Recharge(Rift rift)
        {
            var st = State(rift);
            if (st.faction != save.agent.faction) return Result.No("Not your team's Rift.");
            if (st.health >= 100) return Result.No("Already fully charged.");
            if (save.items.shards < 2) return Result.No("Needs 2 Rift Shards.");
            save.items.shards -= 2;
            var o = Override(rift);
            if (string.IsNullOrEmpty(o.faction)) { o.faction = st.faction; o.level = st.level; }
            o.health = 100; o.t = Rng.NowMs();
            return new Result { ok = true, levelUp = AddXP(60) };
        }

        // You beat the guardians: the Rift goes back to unclaimed.
        public static Result Neutralize(Rift rift)
        {
            var st = State(rift);
            var o = Override(rift);
            o.faction = null; o.level = 0; o.health = 0; o.t = Rng.NowMs(); o.mine = false; o.guard = new List<string>();
            var dna = st.guard.Select((g) => new Count { id = g.sp, n = 15 + g.lvl }).ToList();
            foreach (var d in dna) AddDna(d.id, d.n);
            save.stats.wins++;
            bool hollow = st.faction == "H";
            if (hollow) save.stats.purged++;
            return new Result { ok = true, hollow = hollow, dna = dna, levelUp = AddXP((int)((400 + st.level * 50) * (hollow ? 1.5 : 1))) };
        }

        // Time passes: your Rifts lose charge, and fall at zero (the Hollow
        // are the likeliest to take them).
        public static List<string> Tick()
        {
            var news = new List<string>();
            long now = Rng.NowMs();
            foreach (var o in save.rifts)
            {
                if (!o.mine || string.IsNullOrEmpty(o.faction)) continue;
                double health = o.health - (now - o.t) / 86400000.0 * DECAY_PER_DAY;
                if (health > 0) continue;
                var others = Playable.Where((f) => f != save.agent.faction).Concat(new[] { "H", "H" }).ToArray();
                string to = others[Rng.RandInt(0, others.Length - 1)];
                o.faction = to; o.level = Math.Max(1, o.level - 1); o.health = 80; o.t = now; o.mine = false; o.gseed = Rng.RandInt(1, 1000000); o.guard = new List<string>();
                var r = World.RiftById(o.id);
                news.Add($"{(r != null ? r.name : "One of your Rifts")} ran out of charge and was taken by the {Factions[to].name}.");
            }
            save.gone.RemoveAll((g) => g.t < now);
            if (news.Count > 0) Save();
            return news;
        }

        /* ------------------ Caches & catching ------------------ */

        public static long CacheWait(Cache c) => Math.Max(0, GetT(save.drops, c.id) + DROP_MS - Rng.NowMs());

        public static Result OpenCache(Cache c)
        {
            if (CacheWait(c) > 0) return Result.No("Already looted. It refills soon.");
            var loot = new Loot { darts = Rng.RandInt(4, 9), orbs = Rng.RandInt(2, 4), shards = Rng.RandInt(0, 2) };
            Give(loot);
            double x = Rng.Next();
            var egg = x < 0.12 ? AddEgg(2) : x < 0.17 ? AddEgg(5) : null;
            SetT(save.drops, c.id, Rng.NowMs());
            save.stats.drops++;
            return new Result { ok = true, loot = loot, egg = egg, levelUp = AddXP(30) };
        }

        /* ------------------ Eggs ------------------ */

        // Like Pokémon GO: eggs come from caches, Rift hacks and Apex raids,
        // and hatch after you walk 2, 5 or 10 km with them in an incubator.
        // Longer eggs hold rarer creatures.
        public const int MAX_EGGS = 9, INCUBATORS = 2;
        public static readonly Dictionary<int, EggKind> Eggs = new Dictionary<int, EggKind>
        {
            { 2, new EggKind("2 km egg", "#7CE08A", new double[] { 80, 20, 0, 0 }, 200) },
            { 5, new EggKind("5 km egg", "#FFB347", new double[] { 35, 50, 15, 0 }, 500) },
            { 10, new EggKind("10 km egg", "#C86BFF", new double[] { 0, 40, 47, 13 }, 1000) },
        };

        // A new egg, straight into a free incubator. Null when the bag is full.
        public static Egg AddEgg(int km)
        {
            if (!Eggs.ContainsKey(km) || save.eggs.Count >= MAX_EGGS) return null;
            var e = new Egg { id = Rng.NowMs().ToString("x") + Rng.RandInt(0, 99999).ToString("x"), km = km, inc = save.eggs.Count((x) => x.inc) < INCUBATORS };
            save.eggs.Add(e);
            return e;
        }

        public static Result Incubate(Egg e)
        {
            if (e.inc) return Result.No("");
            if (save.eggs.Count((x) => x.inc) >= INCUBATORS) return Result.No("Both incubators are in use. Hatch an egg first.");
            e.inc = true;
            Save();
            return new Result { ok = true };
        }

        static Result Hatch(Egg e)
        {
            var E = Eggs[e.km];
            int rar = Rng.Weighted(new[] { 0, 1, 2, 3 }.Where((k) => E.odds[k] > 0).ToList(), (k) => E.odds[k]);
            var sp = Rng.Weighted(Species.Wild.Where((x) => x.rar == rar).ToList(), (x) => 1);
            int lvl = Math.Min(Species.MaxLevel, 3 + (int)Math.Floor(Level * 0.8) + rar * 2);
            var c = AddCreature(sp.id, lvl, new[] { Rng.RandInt(5, 10), Rng.RandInt(5, 10), Rng.RandInt(5, 10) });
            int dna = 30 + e.km * 5;
            AddDna(sp.id, dna);
            save.eggs.Remove(e);
            // The incubator takes the next egg waiting.
            var next = save.eggs.Find((x) => !x.inc);
            if (next != null) next.inc = true;
            save.stats.hatched++;
            var res = new Result { ok = true, creature = c, egg = e, dnaN = dna, levelUp = AddXP(E.xp) };
            Save();
            return res;
        }

        // You walked m meters: eggs in incubators get closer to hatching.
        public static List<Result> Walked(double m)
        {
            var hatched = new List<Result>();
            if (save == null || m <= 0) return hatched;
            foreach (var e in save.eggs.Where((x) => x.inc).ToList())
            {
                e.walked += m;
                if (e.walked >= e.km * 1000) hatched.Add(Hatch(e));
            }
            return hatched;
        }

        /* ------------------ Apex raids ------------------ */

        // Like Jurassic World Alive's apex creatures and Pokémon GO raids: each
        // day about one Rift in twelve is taken over by a huge Apex creature
        // (the same ones as in the web game). Beat it once that day for lots of
        // its DNA.
        public static Apex ApexAt(Rift rift, long now = 0)
        {
            if (now == 0) now = Rng.NowMs();
            long d = Day(now);
            Func<double> r = new Seeded(Rng.Key("apex", rift.id, d)).Next;
            if (r() >= 0.08) return null;
            var sp = Rng.Weighted(Species.Wild.Where((x) => x.rar >= 1).ToList(), (x) => new double[] { 0, 6, 3, 1 }[x.rar], r);
            int lvl = Math.Max(8, Math.Min(Species.MaxLevel, 6 + (int)Math.Floor(Level * 0.9 + 0.5) + Rng.RandInt(0, 3, r) + sp.rar * 2));
            return new Apex
            {
                boss = new Creature { id = "apex", sp = sp.id, lvl = lvl, iv = new[] { 10, 10, 10 }, hpx = 3 },
                beaten = save.raids.Contains($"{rift.id}:{d}"),
                dna = 40 + sp.rar * 20,
            };
        }

        public static Result BeatApex(Rift rift)
        {
            var a = ApexAt(rift);
            if (a == null || a.beaten) return Result.No("");
            long d = Day(Rng.NowMs());
            save.raids.Add($"{rift.id}:{d}");
            // Forget old raids.
            save.raids.RemoveAll((k) => long.TryParse(k.Substring(k.LastIndexOf(':') + 1), out long kd) && kd < d - 1);
            var loot = new Loot { orbs = 8, darts = 15, shards = 6 };
            Give(loot);
            AddDna(a.boss.sp, a.dna);
            var egg = Rng.Next() < 0.35 ? AddEgg(10) : null;
            save.stats.apex++;
            save.stats.wins++;
            var res = new Result { ok = true, loot = loot, egg = egg, dnaN = a.dna, levelUp = AddXP(1500 + a.boss.lvl * 20) };
            Save();
            return res;
        }

        public static int SpawnLevel(Spawn s) => 1 + (int)Math.Floor(s.lvlRoll * Math.Min(Species.MaxLevel, 3 + Math.Floor(Level * 1.5)));
        public static bool IsGone(Spawn s) => save.gone.Any((g) => g.id == s.id);

        public static Result FinishEncounter(Spawn spawn, bool caught, bool fled, int dna, int bonusXP)
        {
            var sp = Species.ById(spawn.sp);
            MarkSeen(sp.id);
            if (dna > 0) AddDna(sp.id, dna);
            var res = new Result { ok = true };
            if (caught)
            {
                res.creature = AddCreature(sp.id, SpawnLevel(spawn), spawn.ivs);
                AddDna(sp.id, 25);
                save.stats.caught++;
                res.levelUp = AddXP(Species.Rarities[sp.rar].xp + bonusXP);
            }
            else if (dna > 0) res.levelUp = AddXP(20 + dna);
            if (caught || fled) SetT(save.gone, spawn.id, spawn.expires);
            Save();
            return res;
        }

        /* ------------------ Teams ------------------ */

        public static Dictionary<string, int> Control(IEnumerable<Rift> rifts)
        {
            var n = new Dictionary<string, int> { { "W", 0 }, { "B", 0 }, { "P", 0 }, { "H", 0 }, { "none", 0 } };
            foreach (var r in rifts) n[State(r).faction ?? "none"]++;
            return n;
        }

        public static int SwitchWait => (int)Math.Max(0, Math.Ceiling((save.agent.switched + SWITCH_DAYS * 86400000L - Rng.NowMs()) / 86400000.0));

        // Join another team: your Rifts stay with your old team.
        public static Result SwitchTeam(string to)
        {
            if (!Playable.Contains(to) || to == save.agent.faction) return Result.No("");
            if (SwitchWait > 0) return Result.No($"You can switch again in {SwitchWait} days.");
            string from = save.agent.faction;
            foreach (var o in save.rifts) if (o.mine) { o.mine = false; o.faction = from; o.guard = new List<string>(); o.gseed = Rng.RandInt(1, 1000000); }
            save.agent.faction = to;
            save.agent.switched = Rng.NowMs();
            Save();
            return new Result { ok = true };
        }
    }
}

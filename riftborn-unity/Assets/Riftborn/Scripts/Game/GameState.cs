// Riftborn — the player's save and the game's rules, a straight port of
// the web game's js/state.js. The save is the web game's JSON format, so
// the same online account plays in both.
//
// Items and XP, creatures, DNA and fusion; everything you can do to a Rift
// (hack, claim, upgrade, recharge, guard, link, and the control fields that
// links make); supply caches and catching; medals; daily field missions;
// walking rewards; eggs; Apex raids; the arena; the daily login bonus; and
// the teams.
using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Riftborn
{
    public class Faction
    {
        public string id, name, one, glyph, motto, about; public Color color; public bool npc;
        public Faction(string id, string name, string one, string hex, string glyph, string motto, string about, bool npc = false)
        { this.id = id; this.name = name; this.one = one; color = Species.Hex(hex); this.glyph = glyph; this.motto = motto; this.about = about; this.npc = npc; }
    }

    /* ------------------ The save (the web game's format) ------------------ */

    public class Agent { public string name, faction; public long xp, switched; }
    public class Items { public int orbs = 20, darts = 30, shards = 12; }
    public class KeyItem { public int n; public string name; public double lat, lng; }
    public class DexEntry { public int seen, caught; }
    public class RiftOverride { public string faction; public int level; public double health; public long t; public bool mine; public List<string> guard; public long? gseed; }
    public class Link { public string a, b; public double[] al, bl; }
    public class Field { public string[] ids; public double[][] ll; public int aether; }
    public class Stats { public int caught, darts, hits, hacks, claimed, links, fields, wins, fused, hatched, apex, purged; public double meters; }
    public class Settings { public bool sound = true; public string map = "scanner"; public int mapV = 2; public string tiles = "auto"; public bool ar = true; public string googleKey = ""; public Dictionary<string, object> _extra; }
    public class Mission { public string kind, text; public int need; public double got; public bool claimed; }
    public class Missions { public string day; public List<Mission> list = new List<Mission>(); public bool bonus; public string surge; }
    public class Walk { public double buddy, stash; }
    public class Egg { public string id; public int km; public double walked; public bool inc; }
    public class Login { public long day; public int streak; }
    public class Rival { public string name, faction, level; public int trophies, win, loss; public List<Creature> team = new List<Creature>(); }
    public class ArenaData { public int trophies, best, wins, losses, tierGot; public string day = ""; public int dayWins; public bool chest; public List<Rival> rivals; }
    public class LatLng { public double lat, lng; }

    public class SaveData
    {
        public int v = 1;
        public long created, updated;
        public Agent agent = new Agent();
        public Items items = new Items();
        public Dictionary<string, KeyItem> keys = new Dictionary<string, KeyItem>();
        public List<Creature> creatures = new List<Creature>();
        public List<string> team = new List<string>();
        public Dictionary<string, int> dna = new Dictionary<string, int>();
        public Dictionary<string, DexEntry> dex = new Dictionary<string, DexEntry>();
        public Dictionary<string, RiftOverride> rifts = new Dictionary<string, RiftOverride>();
        public List<Link> links = new List<Link>();
        public List<Field> fields = new List<Field>();
        public Dictionary<string, long> gone = new Dictionary<string, long>(), hacks = new Dictionary<string, long>(), drops = new Dictionary<string, long>();
        public List<string> events = new List<string>();
        public Stats stats = new Stats();
        public Dictionary<string, int> medals = new Dictionary<string, int>();
        public Settings settings = new Settings();
        public Missions missions;
        public Walk walk = new Walk();
        public List<Egg> eggs = new List<Egg>();
        public Dictionary<string, bool> raids = new Dictionary<string, bool>();
        public Login login = new Login();
        public ArenaData arena = new ArenaData();
        public LatLng lastPos;
        public Dictionary<string, object> _extra;   // anything newer versions add
    }

    /* ------------------ Results ------------------ */

    public class Loot
    {
        public int orbs, darts, shards, egg;
        public override string ToString() => string.Join(" · ", new[] { orbs > 0 ? $"{orbs} orb{(orbs > 1 ? "s" : "")}" : null, darts > 0 ? $"{darts} dart{(darts > 1 ? "s" : "")}" : null, shards > 0 ? $"{shards} shard{(shards > 1 ? "s" : "")}" : null, egg > 0 ? $"{egg} km egg" : null }.Where((x) => x != null));
    }

    public class Result
    {
        public bool ok, key, hollow, win;
        public string why, sp, from, to;
        public int levelUp, dnaN, gain, trophies, streak, left, weatherXP;
        public Loot loot;
        public Creature creature;
        public Egg egg;
        public List<(string sp, int n)> dna;
        public List<int> fields;
        public ArenaTier ranked;
        public static Result No(string why = null) => new Result { ok = false, why = why };
    }

    public class RiftState { public string faction; public int level, health; public bool mine; public List<Creature> guard = new List<Creature>(); }
    public class EggKind { public string name; public Color color; public double[] odds; public int xp; public EggKind(string n, string hex, double[] o, int x) { name = n; color = Species.Hex(hex); odds = o; xp = x; } }
    public class Apex { public Creature boss; public bool beaten; public int dna; }
    public class Medal { public string id, name, stat, what; public int div; public int[] tiers; }
    public class MedalTier { public string name; public Color color; public int xp; }
    public class ArenaTier { public string name; public int min; public Color color; public Loot reward; }
    public class LinkTarget { public Rift rift; public KeyItem key; public double dist; public string why; }
    public class WalkNews { public string kind, sp; public Loot loot; public Result hatch; }

    public static class GameState
    {
        public static SaveData save;

        public const long HACK_MS = 5 * 60000, DROP_MS = 10 * 60000;
        public const double DECAY_PER_DAY = 12;
        public const int MAX_TEAM = 3, MAX_LEVEL = 40, CLAIM_COST = 6, SWITCH_DAYS = 30;
        public const double RANGE = 100;   // meters you can reach things from

        // The teams, like Ingress's factions. The Hollow are Rift-eating
        // machines that take Rifts from everyone and that anyone can beat.
        public static readonly Dictionary<string, Faction> Factions = new Dictionary<string, Faction>
        {
            { "W", new Faction("W", "Wardens", "Warden", "#2EE6C5", "⬡", "Seal the Rifts. Protect both worlds.", "Keepers of the line between worlds. They hold the Rifts to keep them closed and the creatures in check.") },
            { "B", new Faction("B", "Breachers", "Breacher", "#FF4FA3", "✶", "Tear them open. Claim the power beyond.", "Thrill-seekers and scientists who want the Rifts wide open, and everything on the other side.") },
            { "P", new Faction("P", "Primals", "Primal", "#FFA028", "❖", "The creatures belong here. Let the wild take back the streets.", "They side with the creatures, and hold the Rifts so the wild can pour through and take the city back.") },
            { "H", new Faction("H", "Hollow", "Hollow", "#E0282E", "✖", "Consume. Corrupt. Repeat.", "Machines born in the Rifts that feed on their energy. Nobody controls them. They grab Rifts from every team and guard them with corrupted Void and Volt creatures.", true) },
        };
        public static readonly string[] Playable = { "W", "B", "P" };
        public static readonly Color Neutral = Species.Hex("#A9A3C9");
        public static Faction Me => Factions[save.agent.faction];
        public static Color MyColor => save != null && save.agent.faction != null && Factions.ContainsKey(save.agent.faction) ? Me.color : Species.Hex("#2EE6C5");

        /* ------------------ Save ------------------ */

        static SaveData Blank(string name, string faction) => new SaveData { created = Rng.NowMs(), agent = new Agent { name = name, faction = faction } };

        // Load the current account's save (or the given JSON, e.g. from the cloud).
        public static bool Load(string json = null)
        {
            string raw = json ?? Auth.LoadSave();
            if (string.IsNullOrEmpty(raw)) return false;
            try
            {
                var tree = Json.Obj(raw);
                if (tree == null) return false;
                if (tree.TryGetValue("dna", out var d) && d is List<object>) tree = Migrate(tree);   // an early Unity save
                if (!(tree.TryGetValue("v", out var v) && v is double vv && vv == 1) || !(tree.TryGetValue("agent", out var ag) && ag is Dictionary<string, object>)) return false;
                var s = Json.To<SaveData>(tree);
                s.agent ??= new Agent();
                if (s.agent.faction == null) return false;
                s.items ??= new Items(); s.keys ??= new Dictionary<string, KeyItem>(); s.creatures ??= new List<Creature>(); s.team ??= new List<string>();
                s.dna ??= new Dictionary<string, int>(); s.dex ??= new Dictionary<string, DexEntry>(); s.rifts ??= new Dictionary<string, RiftOverride>();
                s.links ??= new List<Link>(); s.fields ??= new List<Field>(); s.gone ??= new Dictionary<string, long>(); s.hacks ??= new Dictionary<string, long>();
                s.drops ??= new Dictionary<string, long>(); s.events ??= new List<string>(); s.stats ??= new Stats(); s.medals ??= new Dictionary<string, int>();
                s.settings ??= new Settings(); s.walk ??= new Walk(); s.eggs ??= new List<Egg>(); s.raids ??= new Dictionary<string, bool>();
                s.login ??= new Login(); s.arena ??= new ArenaData();
                if (s.settings.map == "streets") s.settings.map = "auto";
                if (s.settings.mapV != 2) { s.settings.map = "scanner"; s.settings.mapV = 2; }
                s.creatures.RemoveAll((c) => c == null || !Species.Exists(c.sp));
                save = s;
                if (json != null) Write();
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning("Riftborn: couldn't read the save: " + e.Message);
                return false;
            }
        }

        // Saves from the first Unity version (lists instead of maps) become
        // the web format.
        static Dictionary<string, object> Migrate(Dictionary<string, object> o)
        {
            Dictionary<string, object> Map(string k, Func<Dictionary<string, object>, object> val)
            {
                var m = new Dictionary<string, object>();
                if (o.TryGetValue(k, out var l) && l is List<object> list)
                    foreach (var x in list.OfType<Dictionary<string, object>>()) if (x.TryGetValue("id", out var id) && id is string sid) m[sid] = val(x);
                return m;
            }
            o["dex"] = Map("dex", (x) => new Dictionary<string, object> { { "seen", 1.0 }, { "caught", x.TryGetValue("n", out var n) ? n : 0.0 } });
            o["dna"] = Map("dna", (x) => x.TryGetValue("n", out var n) ? n : 0.0);
            o["rifts"] = Map("rifts", (x) => { var c = new Dictionary<string, object>(x); c.Remove("id"); if (c.TryGetValue("faction", out var f) && f as string == "") c["faction"] = null; return c; });
            foreach (var k in new[] { "hacks", "drops", "gone" }) o[k] = Map(k, (x) => x.TryGetValue("t", out var t) ? t : 0.0);
            var raids = new Dictionary<string, object>();
            if (o.TryGetValue("raids", out var r) && r is List<object> rl) foreach (var k in rl.OfType<string>()) raids[k] = true;
            o["raids"] = raids;
            var settings = new Dictionary<string, object> { { "sound", o.TryGetValue("sound", out var snd) ? snd : true }, { "map", o.TryGetValue("satellite", out var sat) && sat is bool sb && sb ? "satellite" : "scanner" }, { "mapV", 2.0 } };
            o["settings"] = settings;
            if (o.TryGetValue("lastLat", out var la) && la is double lat && lat != 0) o["lastPos"] = new Dictionary<string, object> { { "lat", lat }, { "lng", o["lastLng"] } };
            foreach (var k in new[] { "sound", "satellite", "lastLat", "lastLng" }) o.Remove(k);
            o["v"] = 1.0;
            return o;
        }

        public static string ToJson() => Json.Write(Json.From(save));

        // Write to the phone and (online accounts) queue it for the cloud.
        public static void Write()
        {
            if (save == null) return;
            save.updated = Rng.NowMs();
            string json = ToJson();
            Auth.WriteSave(json);
            Auth.QueueSave(json);
        }

        // Saving is batched: a burst of changes writes once.
        static bool dirty;
        public static void Save() { dirty = true; }
        public static void Flush() { if (dirty && save != null) { dirty = false; Write(); } }
        public static void Persist() => Save();

        public static void NewGame(string name, string faction, string starter)
        {
            save = Blank(name, faction);
            var c = AddCreature(starter, 5, new[] { 7, 7, 7 });
            save.team = new List<string> { c.id };
            save.dna[starter] = 60;
            Write();
        }

        public static void Reset() { Auth.ClearSave(); save = null; }

        /* ------------------ Agent level ------------------ */

        public static int XpFor(int L) => L <= 1 ? 0 : (int)Math.Round(400 * Math.Pow(L - 1, 1.75), MidpointRounding.AwayFromZero);
        public static int Level { get { long xp = save.agent.xp; int L = 1; while (L < MAX_LEVEL && xp >= XpFor(L + 1)) L++; return L; } }
        public static long Into => save.agent.xp - XpFor(Level);
        public static long Need => Level >= MAX_LEVEL ? 1 : XpFor(Level + 1) - XpFor(Level);
        public static float LevelFrac => Level >= MAX_LEVEL ? 1 : Into / (float)Need;
        public static readonly string[] Titles = { "Recruit", "Scout", "Tracker", "Hunter", "Ranger", "Riftwalker", "Vanguard", "Legend", "Riftborn" };
        public static string Title(int L) => Titles[Math.Min(Titles.Length - 1, L / 5)];
        public static Loot LevelReward(int L) => new Loot { orbs = 5 + L, darts = 10 + L * 2, shards = 3 + L / 2 };

        public static event Action<int> OnXP;

        // Returns the new level if this XP levelled you up, else 0.
        public static int AddXP(double n)
        {
            int before = Level;
            int add = (int)Math.Floor(n + 0.5);
            save.agent.xp += add;
            OnXP?.Invoke(add);
            int after = Level;
            Save();
            if (after > before) { Give(LevelReward(after)); return after; }
            return 0;
        }

        // Another team (a random one; the Hollow are the likeliest to pounce).
        public static string EnemyId()
        {
            var others = Playable.Where((f) => f != save.agent.faction).Concat(new[] { "H", "H" }).ToArray();
            return others[Rng.RandInt(0, others.Length - 1)];
        }

        /* ------------------ Items ------------------ */

        public static void Give(Loot l) { save.items.orbs += l.orbs; save.items.darts += l.darts; save.items.shards += l.shards; Save(); }

        public static bool Take(string kind, int n)
        {
            var it = save.items;
            int have = kind == "orbs" ? it.orbs : kind == "darts" ? it.darts : it.shards;
            if (have < n) return false;
            if (kind == "orbs") it.orbs -= n; else if (kind == "darts") it.darts -= n; else it.shards -= n;
            Save();
            return true;
        }

        static void AddKey(Rift rift)
        {
            if (!save.keys.TryGetValue(rift.id, out var k)) save.keys[rift.id] = k = new KeyItem { n = 0, name = rift.name, lat = rift.lat, lng = rift.lng };
            k.n++;
            k.name = rift.name;
        }

        /* ------------------ Creatures & DNA ------------------ */

        public static Creature AddCreature(string sp, int lvl, int[] iv = null)
        {
            var c = new Creature { id = Rng.Uid(), sp = sp, lvl = Mathf.Clamp(lvl, 1, Species.MaxLevel), iv = iv ?? new[] { Rng.RandInt(0, 10), Rng.RandInt(0, 10), Rng.RandInt(0, 10) }, t = Rng.NowMs() };
            save.creatures.Add(c);
            MarkDex(sp, true);
            Save();
            return c;
        }

        public static Creature CreatureById(string id) => id == null ? null : save.creatures.Find((c) => c.id == id);

        public static void MarkDex(string sp, bool caught)
        {
            if (!save.dex.TryGetValue(sp, out var d)) save.dex[sp] = d = new DexEntry();
            d.seen = Math.Max(d.seen, 1);
            if (caught) d.caught++;
        }
        public static bool Seen(string sp) => save.dex.TryGetValue(sp, out var d) && (d.seen > 0 || d.caught > 0);
        public static int CaughtCount(string sp) => save.dex.TryGetValue(sp, out var d) ? d.caught : 0;

        public static int Dna(string sp) => save.dna.TryGetValue(sp, out var n) ? n : 0;
        public static void AddDna(string sp, double n) { save.dna[sp] = Dna(sp) + (int)Math.Floor(n + 0.5); Save(); }

        public static Result LevelUpCreature(Creature c)
        {
            if (c == null || c.lvl >= Species.MaxLevel) return Result.No("Already at max level.");
            int cost = c.LevelCost;
            if (Dna(c.sp) < cost) return Result.No($"Needs {cost} {c.Species.name} DNA.");
            save.dna[c.sp] -= cost;
            c.lvl++;
            return new Result { ok = true, levelUp = AddXP(40) };
        }

        // Release a creature back through the Rift for some DNA.
        public static Result Release(Creature c)
        {
            if (save.creatures.Count <= 1) return Result.No("You need to keep at least one creature.");
            if (c == null) return Result.No();
            int back = 20 + c.lvl * 5;
            AddDna(c.sp, back);
            save.creatures.Remove(c);
            save.team.Remove(c.id);
            foreach (var o in save.rifts.Values) o.guard?.Remove(c.id);
            Save();
            return new Result { ok = true, dnaN = back };
        }

        public static List<Creature> Team()
        {
            var picked = save.team.Select(CreatureById).Where((c) => c != null).ToList();
            if (picked.Count >= Math.Min(MAX_TEAM, save.creatures.Count)) return picked.Take(MAX_TEAM).ToList();
            var rest = save.creatures.Where((c) => !picked.Contains(c)).OrderByDescending((c) => c.Power);
            return picked.Concat(rest).Take(MAX_TEAM).ToList();
        }

        public static void ToggleTeam(Creature c)
        {
            if (save.team.Contains(c.id)) save.team.Remove(c.id);
            else { if (save.team.Count >= MAX_TEAM) save.team.RemoveAt(0); save.team.Add(c.id); }
            Save();
        }

        // Fusing spends DNA from both parents and gives hybrid DNA. The first
        // time hybrid DNA reaches 100, the hybrid is created.
        public static bool CanFuse(string h) => Species.ById(h).parents.All((p) => Dna(p) >= Species.FuseCost(p));

        public static Result Fuse(string h)
        {
            var sp = Species.ById(h);
            if (!CanFuse(h)) return Result.No("Not enough DNA.");
            foreach (var p in sp.parents) save.dna[p] -= Species.FuseCost(p);
            int gain = Rng.RandInt(15, 45) + (Rng.Next() < 0.1 ? 40 : 0);
            AddDna(h, gain);
            save.stats.fused++;
            MarkDex(h, false);
            Creature created = null;
            bool owned = save.creatures.Any((c) => c.sp == h);
            if (!owned && Dna(h) >= 100)
            {
                save.dna[h] -= 100;
                created = AddCreature(h, 1);
            }
            return new Result { ok = true, gain = gain, creature = created, levelUp = AddXP(200) };
        }

        /* ------------------ Rifts ------------------ */

        public static long Day(long t) => (long)Math.Floor(t / 86400000.0);

        // Current state of a Rift: the generated one, overridden by what you
        // have done to it. A few untouched Rifts change hands every day.
        public static RiftState State(Rift rift, long now = 0)
        {
            if (now == 0) now = Rng.NowMs();
            if (save.rifts.TryGetValue(rift.id, out var o) && o != null)
            {
                double health = o.health;
                if (o.faction != null && o.mine) health = Math.Max(0, o.health - (now - o.t) / 86400000.0 * DECAY_PER_DAY);
                var st = new RiftState { faction = string.IsNullOrEmpty(o.faction) ? null : o.faction, level = o.level, health = (int)Math.Floor(health + 0.5), mine = o.mine };
                if (o.mine) st.guard = (o.guard ?? new List<string>()).Select(CreatureById).Where((c) => c != null).ToList();
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

        static List<Creature> Guards(Rift rift, int level, object seed, bool hollow) =>
            World.Guardians(rift, level, seed, hollow).Select((g) => new Creature { id = "g", sp = g.sp, lvl = g.lvl, iv = g.iv }).ToList();

        public static Color RiftColor(RiftState st) => st.faction != null ? Factions[st.faction].color : Neutral;

        public static long HackWait(Rift rift, long now = 0) => Math.Max(0, (save.hacks.TryGetValue(rift.id, out var t) ? t : 0) + HACK_MS - (now == 0 ? Rng.NowMs() : now));

        public static Result Hack(Rift rift)
        {
            long now = Rng.NowMs();
            if (HackWait(rift, now) > 0) return Result.No("Cooling down.");
            var st = State(rift, now);
            bool friendly = st.faction == save.agent.faction;
            bool enemy = st.faction != null && !friendly;
            int lvl = Math.Max(1, st.level);
            var loot = new Loot { orbs = Rng.RandInt(enemy ? 0 : 1, 2 + (int)Math.Ceiling(lvl / 3.0)), darts = Rng.RandInt(2, 4 + lvl), shards = Rng.RandInt(1, 2 + lvl / 3) };
            Give(loot);
            bool key = false;
            if (Rng.Next() < (enemy ? 0.45 : 0.7)) { AddKey(rift); key = true; }
            var egg = Rng.Next() < 0.08 ? AddEgg(Rng.Next() < 0.3 ? 5 : 2) : null;
            save.hacks[rift.id] = now;
            save.stats.hacks++;
            Track("hack");
            return new Result { ok = true, loot = loot, key = key, egg = egg, levelUp = AddXP(enemy ? 100 : 50) };
        }

        public static int UpgradeCost(int L) => 3 + L * 2;
        public static int MaxRiftLevel => Math.Min(8, 1 + Level / 2);
        public static int MaxGuards(int L) => L <= 2 ? 1 : L <= 5 ? 2 : 3;

        public static Result Claim(Rift rift)
        {
            var st = State(rift);
            if (st.faction != null) return Result.No("This Rift is already held.");
            if (!Take("shards", CLAIM_COST)) return Result.No($"Claiming needs {CLAIM_COST} Rift Shards. Hack Rifts and open caches to get more.");
            var best = Team().FirstOrDefault();
            save.rifts[rift.id] = new RiftOverride { faction = save.agent.faction, level = 1, health = 100, t = Rng.NowMs(), mine = true, guard = best != null ? new List<string> { best.id } : new List<string>() };
            AddKey(rift);
            save.stats.claimed++;
            Track("claim");
            return new Result { ok = true, levelUp = AddXP(300) };
        }

        public static Result Upgrade(Rift rift)
        {
            var st = State(rift);
            if (!st.mine) return Result.No("You can only upgrade your own Rifts.");
            if (st.level >= 8) return Result.No("Already at the top level.");
            if (st.level >= MaxRiftLevel) return Result.No($"Reach agent level {st.level * 2} to go higher.");
            int cost = UpgradeCost(st.level);
            if (!Take("shards", cost)) return Result.No($"Needs {cost} Rift Shards.");
            var o = save.rifts[rift.id];
            o.level++;
            o.health = 100;
            o.t = Rng.NowMs();
            return new Result { ok = true, levelUp = AddXP(150) };
        }

        public static Result Recharge(Rift rift)
        {
            var st = State(rift);
            if (st.faction != save.agent.faction) return Result.No("Not your faction.");
            if (st.health >= 100) return Result.No("Already fully charged.");
            if (!Take("shards", 2)) return Result.No("Needs 2 Rift Shards.");
            if (save.rifts.TryGetValue(rift.id, out var o)) { o.health = 100; o.t = Rng.NowMs(); }
            else save.rifts[rift.id] = new RiftOverride { faction = st.faction, level = st.level, health = 100, t = Rng.NowMs(), mine = false };
            return new Result { ok = true, levelUp = AddXP(60) };
        }

        public static void SetGuards(Rift rift, List<string> ids)
        {
            if (!save.rifts.TryGetValue(rift.id, out var o) || !o.mine) return;
            o.guard = ids.Take(MaxGuards(o.level)).ToList();
            Save();
        }

        // You beat the guardians: the Rift goes neutral.
        public static Result Neutralize(Rift rift)
        {
            var st = State(rift);
            save.rifts[rift.id] = new RiftOverride { faction = null, level = 0, health = 0, t = Rng.NowMs(), mine = false };
            foreach (var g in st.guard) AddDna(g.sp, 15 + g.lvl);
            save.stats.wins++;
            Track("win");
            bool hollow = st.faction == "H";
            if (hollow) { save.stats.purged++; Track("purge"); }
            ValidateLinks();
            return new Result { ok = true, hollow = hollow, dna = st.guard.Select((g) => (g.sp, 15 + g.lvl)).ToList(), levelUp = AddXP((400 + st.level * 50) * (hollow ? 1.5 : 1)) };
        }

        /* ------------------ Teams ------------------ */

        // Who holds the Rifts near you, like Ingress's regional score.
        public static Dictionary<string, int> Control(IEnumerable<Rift> rifts)
        {
            var n = new Dictionary<string, int> { { "W", 0 }, { "B", 0 }, { "P", 0 }, { "H", 0 }, { "none", 0 } };
            foreach (var r in rifts) n[State(r).faction ?? "none"]++;
            return n;
        }

        public static int SwitchWait => (int)Math.Max(0, Math.Ceiling((save.agent.switched + SWITCH_DAYS * 86400000L - Rng.NowMs()) / 86400000.0));

        // Join another team. Your Rifts stay with your old team and your links
        // and fields are gone; everything else comes along.
        public static Result SwitchTeam(string to)
        {
            if (!Playable.Contains(to) || to == save.agent.faction) return Result.No();
            if (SwitchWait > 0) return Result.No($"You can switch again in {SwitchWait} days.");
            string from = save.agent.faction;
            int kept = 0;
            foreach (var o in save.rifts.Values) if (o.mine) { o.mine = false; o.faction = from; o.guard = null; o.gseed = Rng.RandInt(1, 1000000); kept++; }
            save.links.Clear();
            save.fields.Clear();
            save.agent.faction = to;
            save.agent.switched = Rng.NowMs();
            Write();
            return new Result { ok = true, from = from, to = to, left = kept };
        }

        /* ------------------ Links & fields ------------------ */

        public static double LinkRange(int L) => 300 * Math.Pow(2, Math.Max(0, L - 1));
        static (double, double) XY(double[] ll) => World.ToXY(ll[0], ll[1]);
        static double[] LL(Rift r) => new[] { r.lat, r.lng };

        static bool LinkExists(string a, string b) => save.links.Any((l) => (l.a == a && l.b == b) || (l.a == b && l.b == a));
        static bool LinkCrosses(double[] al, double[] bl) { var A = XY(al); var B = XY(bl); return save.links.Any((l) => World.Crosses(A, B, XY(l.al), XY(l.bl))); }

        // Rifts you could link to from `rift`, from the keys you hold.
        public static List<LinkTarget> LinkTargets(Rift rift)
        {
            var st = State(rift);
            var outp = new List<LinkTarget>();
            if (st.faction != save.agent.faction) return outp;
            double range = LinkRange(st.level);
            foreach (var kv in save.keys)
            {
                if (kv.Key == rift.id || kv.Value.n <= 0) continue;
                var target = World.RiftById(kv.Key);
                if (target == null) continue;
                var tst = State(target);
                double d = World.Dist(rift.lat, rift.lng, target.lat, target.lng);
                string why = "";
                if (tst.faction != save.agent.faction) why = "Not held by your faction";
                else if (d > range) why = $"Too far (range {Rng.Dist(range)})";
                else if (LinkExists(rift.id, kv.Key)) why = "Already linked";
                else if (LinkCrosses(LL(rift), LL(target))) why = "Would cross a link";
                outp.Add(new LinkTarget { rift = target, key = kv.Value, dist = d, why = why });
            }
            return outp.OrderBy((x) => x.why != "" ? 1 : 0).ThenBy((x) => x.dist).ToList();
        }

        public static Result MakeLink(Rift rift, Rift target)
        {
            var t = LinkTargets(rift).Find((x) => x.rift.id == target.id);
            if (t == null) return Result.No("You need a key to that Rift.");
            if (t.why != "") return Result.No(t.why);
            var k = save.keys[target.id];
            k.n--;
            if (k.n <= 0) save.keys.Remove(target.id);
            save.links.Add(new Link { a = rift.id, b = target.id, al = LL(rift), bl = LL(target) });
            save.stats.links++;
            int up = AddXP(300);
            // New fields: every Rift linked to both ends closes a triangle.
            var made = new List<int>();
            List<(string id, double[] ll)> Nb(string id) => save.links.Where((l) => l.a == id || l.b == id).Select((l) => l.a == id ? (l.b, l.bl) : (l.a, l.al)).ToList();
            var nA = Nb(rift.id); var nB = Nb(target.id);
            foreach (var c in nA)
            {
                if (!nB.Any((x) => x.id == c.id)) continue;
                var ids = new[] { rift.id, target.id, c.id }.OrderBy((x) => x, StringComparer.Ordinal).ToArray();
                if (save.fields.Any((f) => string.Join(",", f.ids) == string.Join(",", ids))) continue;
                var ll = new[] { LL(rift), LL(target), c.ll };
                double area = World.TriArea(XY(ll[0]), XY(ll[1]), XY(ll[2]));
                int aether = Math.Max(1, (int)Math.Floor(area / 100 + 0.5));
                save.fields.Add(new Field { ids = ids, ll = ll, aether = aether });
                save.stats.fields++;
                made.Add(aether);
                int u = AddXP(1000 + Math.Min(aether, 5000));
                if (u > 0) up = u;
            }
            Save();
            return new Result { ok = true, fields = made, levelUp = up };
        }

        // Drop links and fields whose Rifts are no longer ours.
        public static int ValidateLinks()
        {
            long now = Rng.NowMs();
            var ok = new Dictionary<string, bool>();
            bool Check(string id)
            {
                if (!ok.TryGetValue(id, out var v))
                {
                    var r = World.RiftById(id);
                    ok[id] = v = r != null && State(r, now).faction == save.agent.faction;
                }
                return v;
            }
            int before = save.links.Count;
            save.links.RemoveAll((l) => !(Check(l.a) && Check(l.b)));
            save.fields.RemoveAll((f) => !f.ids.All(Check));
            return before - save.links.Count;
        }

        public static int Aether => save.fields.Sum((f) => f.aether);

        // Time passes: your Rifts lose charge, and fall to the other side at
        // zero (the Hollow are the likeliest to take them).
        public static bool Tick()
        {
            long now = Rng.NowMs();
            bool changed = false;
            foreach (var id in save.rifts.Keys.ToList())
            {
                var o = save.rifts[id];
                if (!o.mine || string.IsNullOrEmpty(o.faction)) continue;
                double health = o.health - (now - o.t) / 86400000.0 * DECAY_PER_DAY;
                if (health > 0) continue;
                var r = World.RiftById(id);
                string to = EnemyId();
                save.rifts[id] = new RiftOverride { faction = to, level = Math.Max(1, o.level - 1), health = 80, t = now, mine = false, gseed = Rng.RandInt(1, 1000000) };
                save.events.Add($"{(r != null ? r.name : "One of your Rifts")} ran out of charge and was taken by the {Factions[to].name}.");
                changed = true;
            }
            if (changed) ValidateLinks();
            foreach (var k in save.gone.Where((kv) => kv.Value < now).Select((kv) => kv.Key).ToList()) save.gone.Remove(k);
            foreach (var k in save.hacks.Where((kv) => kv.Value + HACK_MS < now).Select((kv) => kv.Key).ToList()) save.hacks.Remove(k);
            foreach (var k in save.drops.Where((kv) => kv.Value + DROP_MS < now).Select((kv) => kv.Key).ToList()) save.drops.Remove(k);
            if (changed) Save();
            return changed;
        }

        /* ------------------ Caches & encounters ------------------ */

        public static long CacheWait(Cache c, long now = 0) => Math.Max(0, (save.drops.TryGetValue(c.id, out var t) ? t : 0) + DROP_MS - (now == 0 ? Rng.NowMs() : now));

        public static Result OpenCache(Cache c)
        {
            if (CacheWait(c) > 0) return Result.No("Already looted. It refills soon.");
            var loot = new Loot { darts = Rng.RandInt(4, 9), orbs = Rng.RandInt(2, 4), shards = Rng.RandInt(0, 2) };
            Give(loot);
            double x = Rng.Next();
            var egg = x < 0.12 ? AddEgg(2) : x < 0.17 ? AddEgg(5) : null;
            save.drops[c.id] = Rng.NowMs();
            Track("drop");
            return new Result { ok = true, loot = loot, egg = egg, levelUp = AddXP(30) };
        }

        // Weather-boosted creatures come a few levels stronger.
        public static int SpawnLevel(Spawn s)
        {
            int cap = Math.Min(Species.MaxLevel, 3 + (int)Math.Floor(Level * 1.5));
            return Math.Min(Species.MaxLevel, 1 + (int)Math.Floor(s.lvlRoll * cap) + (s.boost ? 3 : 0));
        }
        public static bool IsGone(Spawn s) => save.gone.ContainsKey(s.id);

        public static Result FinishEncounter(Spawn spawn, bool caught, bool fled, int dna, int hits, int bonusXP)
        {
            var sp = Species.ById(spawn.sp);
            MarkDex(sp.id, false);
            if (dna > 0) AddDna(sp.id, dna);
            var res = new Result { ok = true };
            res.weatherXP = caught && spawn.boost ? (int)Math.Floor(Species.Rarities[sp.rar].xp * 0.25 + 0.5) : 0;
            if (caught)
            {
                res.creature = AddCreature(sp.id, SpawnLevel(spawn), spawn.ivs);
                AddDna(sp.id, 25);
                save.stats.caught++;
                Track("catch");
                Track("el:" + Species.ElId(sp.el));
                res.levelUp = AddXP(Species.Rarities[sp.rar].xp + bonusXP + res.weatherXP);
            }
            else if (dna > 0) res.levelUp = AddXP(20 + dna);
            if (hits > 0) { Track("darts", hits); save.stats.hits += hits; }
            if (caught || fled) save.gone[spawn.id] = spawn.expires;
            Write();
            return res;
        }

        /* ------------------ Medals ------------------ */

        // Like Ingress badges: five tiers each for how much you've done.
        public static readonly MedalTier[] Tiers =
        {
            new MedalTier { name = "Bronze", color = Species.Hex("#CD8A4E"), xp = 500 },
            new MedalTier { name = "Silver", color = Species.Hex("#C9D2DC"), xp = 2000 },
            new MedalTier { name = "Gold", color = Species.Hex("#FFC83A"), xp = 6000 },
            new MedalTier { name = "Platinum", color = Species.Hex("#9FE8FF"), xp = 15000 },
            new MedalTier { name = "Onyx", color = Species.Hex("#B45CFF"), xp = 40000 },
        };
        public static readonly Medal[] Medals =
        {
            new Medal { id = "trekker", name = "Trekker", stat = "meters", what = "km walked", div = 1000, tiers = new[] { 10000, 100000, 300000, 1000000, 2500000 } },
            new Medal { id = "collector", name = "Collector", stat = "caught", what = "creatures caught", tiers = new[] { 10, 100, 500, 2000, 8000 } },
            new Medal { id = "hacker", name = "Hacker", stat = "hacks", what = "Rifts hacked", tiers = new[] { 20, 200, 1000, 5000, 20000 } },
            new Medal { id = "sharpshooter", name = "Sharpshooter", stat = "hits", what = "dart hits", tiers = new[] { 50, 500, 2500, 10000, 40000 } },
            new Medal { id = "builder", name = "Builder", stat = "claimed", what = "Rifts claimed", tiers = new[] { 5, 50, 200, 1000, 5000 } },
            new Medal { id = "connector", name = "Connector", stat = "links", what = "links made", tiers = new[] { 5, 50, 250, 1000, 5000 } },
            new Medal { id = "mind", name = "Mind Controller", stat = "fields", what = "control fields", tiers = new[] { 2, 25, 100, 500, 2000 } },
            new Medal { id = "brawler", name = "Brawler", stat = "wins", what = "battles won", tiers = new[] { 5, 50, 200, 1000, 5000 } },
            new Medal { id = "geneticist", name = "Geneticist", stat = "fused", what = "fusions", tiers = new[] { 3, 30, 150, 500, 2000 } },
            new Medal { id = "breeder", name = "Breeder", stat = "hatched", what = "eggs hatched", tiers = new[] { 3, 30, 150, 600, 2500 } },
            new Medal { id = "apex", name = "Apex Hunter", stat = "apex", what = "Apex raids won", tiers = new[] { 1, 10, 50, 200, 1000 } },
            new Medal { id = "purifier", name = "Purifier", stat = "purged", what = "Hollow Rifts cleared", tiers = new[] { 1, 15, 75, 300, 1500 } },
        };

        public static double StatValue(string stat)
        {
            var f = typeof(Stats).GetField(stat);
            var v = f?.GetValue(save.stats);
            return v is int i ? i : v is double d ? d : 0;
        }

        public static List<(Medal m, int tier, double value, int? next)> MedalProgress() => Medals.Select((m) =>
        {
            double v = StatValue(m.stat);
            int tier = 0;
            while (tier < 5 && v >= m.tiers[tier]) tier++;
            return (m, tier, v, tier < 5 ? m.tiers[tier] : (int?)null);
        }).ToList();

        // Award newly reached medal tiers (with XP). Returns what was earned.
        public static List<(Medal m, int tier, int up)> CheckMedals()
        {
            var outp = new List<(Medal, int, int)>();
            foreach (var x in MedalProgress())
            {
                int had = save.medals.TryGetValue(x.m.id, out var h) ? h : 0;
                if (x.tier <= had) continue;
                save.medals[x.m.id] = x.tier;
                int up = 0;
                for (int t = had; t < x.tier; t++) { int u = AddXP(Tiers[t].xp); if (u > 0) up = u; }
                outp.Add((x.m, x.tier, up));
            }
            if (outp.Count > 0) Save();
            return outp;
        }

        /* ------------------ Field missions ------------------ */

        // Three missions a day, the same for everyone on that day. Finish all
        // three for a Rift Surge bonus.
        class MissionKind { public string kind; public int[] need; public Func<int, string, string> text; }
        static readonly MissionKind[] MissionKinds =
        {
            new MissionKind { kind = "catch", need = new[] { 3, 6 }, text = (n, e) => $"Catch {n} creatures" },
            new MissionKind { kind = "hack", need = new[] { 3, 6 }, text = (n, e) => $"Hack {n} Rifts" },
            new MissionKind { kind = "drop", need = new[] { 2, 4 }, text = (n, e) => $"Open {n} supply caches" },
            new MissionKind { kind = "walk", need = new[] { 1000, 2500 }, text = (n, e) => $"Walk {(n / 1000.0).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture)} km" },
            new MissionKind { kind = "darts", need = new[] { 8, 16 }, text = (n, e) => $"Land {n} dart hits" },
            new MissionKind { kind = "win", need = new[] { 1, 1 }, text = (n, e) => "Win a Rift battle" },
            new MissionKind { kind = "claim", need = new[] { 1, 2 }, text = (n, e) => $"Claim {n} Rift{(n > 1 ? "s" : "")} for your faction" },
            new MissionKind { kind = "purge", need = new[] { 1, 1 }, text = (n, e) => "Clear a Rift held by the Hollow" },
            new MissionKind { kind = "el", need = new[] { 2, 3 }, text = (n, e) => $"Catch {n} {Species.Elements[(El)Enum.Parse(typeof(El), e, true)].name} creatures" },
        };

        public static Missions GetMissions()
        {
            string day = Rng.Today();
            if (save.missions != null && save.missions.day == day) return save.missions;
            Func<double> r = new Seeded("missions:" + day).Next;
            var pool = MissionKinds.ToList();
            var list = new List<Mission>();
            var els = new[] { "ember", "tide", "gale", "stone", "volt" };
            while (list.Count < 3)
            {
                int pi = (int)Math.Floor(r() * pool.Count);
                var m = pool[pi]; pool.RemoveAt(pi);
                int n = Rng.RandInt(m.need[0], m.need[1], r);
                int need = m.kind == "walk" ? (int)Math.Floor(n / 100.0 + 0.5) * 100 : n;
                string el = m.kind == "el" ? els[(int)Math.Floor(r() * els.Length)] : null;
                list.Add(new Mission { kind = m.kind == "el" ? "el:" + el : m.kind, text = m.text(need, el), need = need, got = 0, claimed = false });
            }
            var pick = Species.Wild.Where((sp) => sp.rar >= 1 && sp.rar <= 2).ToList();
            save.missions = new Missions { day = day, list = list, bonus = false, surge = pick[(int)Math.Floor(r() * pick.Count)].id };
            Save();
            return save.missions;
        }

        // Count progress; returns missions that just got finished.
        public static List<Mission> Track(string kind, double n = 1)
        {
            var done = new List<Mission>();
            if (save == null) return done;
            foreach (var m in GetMissions().list)
            {
                if (m.kind != kind || m.got >= m.need) continue;
                m.got = Math.Min(m.need, m.got + n);
                if (m.got >= m.need) done.Add(m);
            }
            foreach (var m in done) save.events.Add($"Mission complete: {m.text}. Claim your reward in Missions.");
            return done;
        }

        public static readonly Loot MissionReward = new Loot { orbs = 5, darts = 10, shards = 3 };

        public static Result ClaimMission(int i)
        {
            var ms = GetMissions();
            if (i < 0 || i >= ms.list.Count) return Result.No();
            var m = ms.list[i];
            if (m.claimed || m.got < m.need) return Result.No();
            m.claimed = true;
            Give(MissionReward);
            return new Result { ok = true, loot = MissionReward, levelUp = AddXP(300) };
        }

        public static Result ClaimBonus()
        {
            var ms = GetMissions();
            if (ms.bonus || !ms.list.All((m) => m.claimed)) return Result.No();
            ms.bonus = true;
            Give(new Loot { shards = 10, orbs = 10 });
            AddDna(ms.surge, 60);
            MarkDex(ms.surge, false);
            var egg = AddEgg(5);
            return new Result { ok = true, sp = ms.surge, egg = egg, levelUp = AddXP(800) };
        }

        public static bool MissionsReady { get { var ms = GetMissions(); return ms.list.Any((m) => m.got >= m.need && !m.claimed) || (!ms.bonus && ms.list.All((m) => m.claimed)); } }

        /* ------------------ Walking rewards ------------------ */

        // Your buddy (first creature on your team) finds 5 of its DNA every
        // 250 m you walk, every kilometre you find a supply stash, and eggs in
        // incubators get closer to hatching.
        public const double BUDDY_M = 250, STASH_M = 1000;

        public static List<WalkNews> Walked(double m)
        {
            var news = new List<WalkNews>();
            if (save == null || m <= 0) return news;
            save.stats.meters += m;
            save.walk.buddy += m;
            save.walk.stash += m;
            Track("walk", m);
            var buddy = Team().FirstOrDefault();
            while (save.walk.buddy >= BUDDY_M)
            {
                save.walk.buddy -= BUDDY_M;
                if (buddy != null) { AddDna(buddy.sp, 5); news.Add(new WalkNews { kind = "buddy", sp = buddy.sp }); }
            }
            while (save.walk.stash >= STASH_M)
            {
                save.walk.stash -= STASH_M;
                var loot = new Loot { orbs = 3, darts = 6, shards = 2 };
                Give(loot);
                AddXP(100);
                news.Add(new WalkNews { kind = "stash", loot = loot });
            }
            foreach (var e in save.eggs.Where((x) => x.inc).ToList())
            {
                e.walked += m;
                if (e.walked >= e.km * 1000) news.Add(new WalkNews { kind = "hatch", hatch = Hatch(e) });
            }
            Save();
            return news;
        }

        /* ------------------ Eggs ------------------ */

        // Like Pokémon GO: eggs come from caches, Rifts, the daily bonus, the
        // arena and Apex raids, and hatch after you walk 2, 5 or 10 km with
        // them in an incubator. Longer eggs hold rarer creatures.
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
            var e = new Egg { id = Rng.Uid(), km = km, walked = 0, inc = save.eggs.Count((x) => x.inc) < INCUBATORS };
            save.eggs.Add(e);
            Save();
            return e;
        }

        public static Result Incubate(Egg e)
        {
            if (e == null || e.inc) return Result.No();
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
            return new Result { ok = true, creature = c, egg = e, dnaN = dna, levelUp = AddXP(E.xp) };
        }

        /* ------------------ Apex raids ------------------ */

        // Like Jurassic World Alive's apex creatures and Pokémon GO raids: each
        // day about one Rift in twelve is taken over by a huge Apex creature.
        // Beat it once that day for lots of its DNA.
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
                beaten = save.raids.ContainsKey($"{rift.id}:{d}"),
                dna = 40 + sp.rar * 20,
            };
        }

        public static Result BeatApex(Rift rift)
        {
            var a = ApexAt(rift);
            if (a == null || a.beaten) return Result.No();
            long d = Day(Rng.NowMs());
            save.raids[$"{rift.id}:{d}"] = true;
            // Forget old raids.
            foreach (var k in save.raids.Keys.ToList())
                if (long.TryParse(k.Substring(k.LastIndexOf(':') + 1), out long kd) && kd < d - 1) save.raids.Remove(k);
            var loot = new Loot { orbs = 8, darts = 15, shards = 6 };
            Give(loot);
            AddDna(a.boss.sp, a.dna);
            MarkDex(a.boss.sp, false);
            var egg = Rng.Next() < 0.35 ? AddEgg(10) : null;
            save.stats.apex++;
            save.stats.wins++;
            Track("win");
            var res = new Result { ok = true, sp = a.boss.sp, dnaN = a.dna, loot = loot, egg = egg, levelUp = AddXP(1500 + a.boss.lvl * 20) };
            Write();
            return res;
        }

        /* ------------------ Arena ------------------ */

        // Like Jurassic World Alive's arena: battle other agents' teams from
        // anywhere, win trophies, climb the ranks. Rivals are generated to
        // match your team, and each rank pays out once when you reach it.
        public static readonly ArenaTier[] ArenaTiers =
        {
            new ArenaTier { name = "Bronze", min = 0, color = Species.Hex("#CD8A4E") },
            new ArenaTier { name = "Silver", min = 300, color = Species.Hex("#C9D2DC"), reward = new Loot { orbs = 10, darts = 20, shards = 5 } },
            new ArenaTier { name = "Gold", min = 700, color = Species.Hex("#FFC83A"), reward = new Loot { orbs = 15, darts = 25, shards = 10, egg = 5 } },
            new ArenaTier { name = "Platinum", min = 1200, color = Species.Hex("#9FE8FF"), reward = new Loot { orbs = 20, darts = 30, shards = 15, egg = 10 } },
            new ArenaTier { name = "Diamond", min = 1800, color = Species.Hex("#7FB8FF"), reward = new Loot { orbs = 25, darts = 40, shards = 20, egg = 10 } },
            new ArenaTier { name = "Legend", min = 2600, color = Species.Hex("#B45CFF"), reward = new Loot { orbs = 40, darts = 60, shards = 30, egg = 10 } },
        };
        public static int ArenaTierOf(int tr) { int k = 0; while (k < ArenaTiers.Length - 1 && tr >= ArenaTiers[k + 1].min) k++; return k; }
        static readonly string[] RIVAL_A = { "Nova", "Rex", "Kai", "Vex", "Juno", "Ash", "Zed", "Mika", "Onyx", "Sol", "Rook", "Ivy", "Blaze", "Echo", "Luna", "Flint", "Storm", "Rift", "Talon", "Kora" };
        static readonly string[] RIVAL_B = { "Hunter", "Striker", "Walker", "Fang", "Claw", "Runner", "Tamer", "Scout", "Warden", "Breaker", "Rider", "Queen", "King", "Ace", "Shade" };

        public static ArenaData Arena()
        {
            var A = save.arena;
            string d = Rng.Today();
            if (A.day != d) { A.day = d; A.dayWins = 0; A.chest = false; }
            if (A.rivals == null || A.rivals.Count == 0) A.rivals = MakeRivals();
            return A;
        }

        static List<Rival> MakeRivals()
        {
            var A = save.arena;
            int tier = ArenaTierOf(A.trophies);
            var mine = Team();
            int myLvl = (int)Math.Floor(mine.Sum((c) => c.lvl) / (double)Math.Max(1, mine.Count) + 0.5);
            int maxRar = Math.Min(3, 1 + (int)Math.Floor(tier / 1.5));
            var pool = Species.All.Where((x) => x.rar <= maxRar && (!x.Hybrid || tier >= 2)).ToList();
            var outp = new List<Rival>();
            foreach (var (level, off, win, loss) in new[] { ("Easy", -2, 18, -8), ("Even", 0, 28, -14), ("Hard", 3, 42, -20) })
            {
                var rv = new Rival
                {
                    name = RIVAL_A[Rng.RandInt(0, RIVAL_A.Length - 1)] + RIVAL_B[Rng.RandInt(0, RIVAL_B.Length - 1)] + (Rng.Next() < 0.5 ? Rng.RandInt(2, 99).ToString() : ""),
                    faction = Playable[Rng.RandInt(0, Playable.Length - 1)],
                    trophies = Math.Max(0, A.trophies + off * 35 + Rng.RandInt(-30, 30)),
                    level = level, win = win, loss = loss,
                };
                for (int i = 0; i < 3; i++)
                {
                    var sp = Rng.Weighted(pool, (x) => 4 - x.rar);
                    rv.team.Add(new Creature { sp = sp.id, lvl = Mathf.Clamp(myLvl + off + Rng.RandInt(-1, 1), 1, Species.MaxLevel), iv = new[] { Rng.RandInt(3, 10), Rng.RandInt(3, 10), Rng.RandInt(3, 10) } });
                }
                outp.Add(rv);
            }
            return outp;
        }

        public static void NewRivals() { save.arena.rivals = MakeRivals(); Save(); }

        // After an arena battle (fleeing counts as a loss).
        public static Result ArenaResult(int i, bool win)
        {
            var A = Arena();
            if (i < 0 || i >= A.rivals.Count) return Result.No();
            var rv = A.rivals[i];
            var res = new Result { ok = true, win = win };
            if (win)
            {
                A.trophies += rv.win;
                A.wins++;
                A.dayWins++;
                res.loot = new Loot { orbs = 2, darts = 5, shards = 1 };
                Give(res.loot);
                string pick = rv.team[Rng.RandInt(0, rv.team.Count - 1)].sp;
                AddDna(pick, 15);
                MarkDex(pick, false);
                res.sp = pick; res.dnaN = 15;
                save.stats.wins++;
                Track("win");
                res.levelUp = AddXP(250 + Array.IndexOf(new[] { "Easy", "Even", "Hard" }, rv.level) * 100);
                res.trophies = rv.win;
            }
            else
            {
                A.trophies = Math.Max(0, A.trophies + rv.loss);
                A.losses++;
                res.levelUp = AddXP(50);
                res.trophies = rv.loss;
            }
            A.best = Math.Max(A.best, A.trophies);
            // New ranks pay out once.
            int after = ArenaTierOf(A.trophies);
            if (after > A.tierGot)
            {
                for (int k = A.tierGot + 1; k <= after; k++)
                {
                    var rw = ArenaTiers[k].reward;
                    Give(rw);
                    if (rw.egg > 0) res.egg = AddEgg(rw.egg) ?? res.egg;
                }
                A.tierGot = after;
                res.ranked = ArenaTiers[after];
            }
            A.rivals = MakeRivals();
            Write();
            return res;
        }

        // Win three arena battles in a day for a chest.
        public static Result ClaimArenaChest()
        {
            var A = Arena();
            if (A.chest || A.dayWins < 3) return Result.No();
            A.chest = true;
            var loot = new Loot { orbs = 10, darts = 20, shards = 8 };
            Give(loot);
            var egg = AddEgg(5);
            return new Result { ok = true, loot = loot, egg = egg, levelUp = AddXP(500) };
        }

        /* ------------------ Daily login ------------------ */

        // Come back every day for a week of rewards; day 7 is a 10 km egg. Miss
        // a day and it starts again from day 1.
        public static readonly Loot[] LoginRewards =
        {
            new Loot { orbs = 5, darts = 10 },
            new Loot { darts = 20 },
            new Loot { shards = 5 },
            new Loot { orbs = 10, darts = 10 },
            new Loot { shards = 8, egg = 2 },
            new Loot { orbs = 10, darts = 20, shards = 5 },
            new Loot { orbs = 15, shards = 10, egg = 10 },
        };

        // Today's reward if you haven't claimed it: streak 1-7, else 0.
        public static int LoginPending()
        {
            long today = Rng.LocalDay(Rng.NowMs());
            var L = save.login;
            if (L.day == today) return 0;
            return L.day == today - 1 ? (L.streak % 7) + 1 : 1;
        }

        public static Result ClaimLogin()
        {
            int p = LoginPending();
            if (p == 0) return Result.No();
            save.login = new Login { day = Rng.LocalDay(Rng.NowMs()), streak = p };
            var rw = LoginRewards[p - 1];
            Give(rw);
            var egg = rw.egg > 0 ? AddEgg(rw.egg) : null;
            return new Result { ok = true, streak = p, loot = rw, egg = egg, levelUp = AddXP(100 * p) };
        }
    }
}

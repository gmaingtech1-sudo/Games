// Riftborn — the world. Everything on the map is generated from the real
// latitude and longitude, so the same street corner always has the same
// Rift, for everyone, with no server. A straight port of the web game's
// js/world.js: same cells, same rolls, same names.
using System;
using System.Collections.Generic;
using System.Linq;

namespace Riftborn
{
    public class Rift
    {
        public string id, name; public double lat, lng;
        public string baseFaction; public int baseLevel; public long seed;
    }

    public class Cache { public string id, name; public double lat, lng; }

    public class Spawn
    {
        public string id, sp; public double lat, lng, lvlRoll; public int[] ivs; public long expires;
    }

    public class Guardian { public string sp; public int lvl; public int[] iv; }

    public class Cell
    {
        public string key; public int j, i; public double lngSize; public El biome;
        public Rift rift; public Cache cache; public long offset;
    }

    public class Around { public List<Rift> rifts = new List<Rift>(); public List<Cache> caches = new List<Cache>(); public List<Spawn> spawns = new List<Spawn>(); }

    public static class World
    {
        const double CELL = 0.0011;          // cell size in degrees of latitude (~122 m)
        public const long SPAWN_MS = 10 * 60000;
        const double M_LAT = 110574, M_LNG = 111320, DEG = Math.PI / 180;

        /* ------------------ Geography ------------------ */

        public static double OriginLat, OriginLng, OriginCos = 1;
        public static void SetOrigin(double lat, double lng) { OriginLat = lat; OriginLng = lng; OriginCos = Math.Cos(lat * DEG); }

        // Local flat coordinates in meters: x east, y north.
        public static (double x, double y) ToXY(double lat, double lng) => ((lng - OriginLng) * M_LNG * OriginCos, (lat - OriginLat) * M_LAT);
        public static (double lat, double lng) ToLL(double x, double y) => (OriginLat + y / M_LAT, OriginLng + x / (M_LNG * OriginCos));

        public static double Dist(double lat1, double lng1, double lat2, double lng2)
        {
            const double R = 6371000;
            double dLat = (lat2 - lat1) * DEG, dLng = (lng2 - lng1) * DEG;
            double s = Math.Pow(Math.Sin(dLat / 2), 2) + Math.Cos(lat1 * DEG) * Math.Cos(lat2 * DEG) * Math.Pow(Math.Sin(dLng / 2), 2);
            return 2 * R * Math.Asin(Math.Min(1, Math.Sqrt(s)));
        }

        static double LngSize(int j) => CELL / Math.Max(0.15, Math.Cos((j + 0.5) * CELL * DEG));

        /* ------------------ Names ------------------ */

        static readonly string[] PRE = { "Ash", "Ember", "Hollow", "Glass", "Iron", "Moss", "Star", "Thorn", "Echo", "Frost", "Veil", "Storm", "Cinder", "Amber", "Obsidian", "Silver", "Dusk", "Dawn", "Bramble", "Wyrm", "Salt", "Lumen", "Grim", "Sable" };
        static readonly string[] SUF = { "gate", "spire", "well", "scar", "hollow", "shrine", "cairn", "reach", "fall", "maw", "crown", "wake", "loom", "rest", "vault", "deep" };
        static readonly string[] FORM = { "The {A}{b}", "{A}{b} Rift", "{A}{b} Breach", "Rift of {A}{b}", "{A}{b} Anomaly", "The {A} Tear" };
        static readonly string[] CACHE_NAMES = { "Field Cache", "Supply Drop", "Warden Crate", "Salvage Pod", "Expedition Cache", "Dropped Kit" };

        static string ReplaceFirst(string s, string what, string with)
        {
            int k = s.IndexOf(what, StringComparison.Ordinal);
            return k < 0 ? s : s.Substring(0, k) + with + s.Substring(k + what.Length);
        }

        static string RiftName(Func<double> r)
        {
            string form = Rng.Pick(FORM, r), a = Rng.Pick(PRE, r), b = Rng.Pick(SUF, r);
            return ReplaceFirst(ReplaceFirst(form, "{A}", a), "{b}", b);
        }

        /* ------------------ Cells ------------------ */

        static readonly Dictionary<string, Cell> cache = new Dictionary<string, Cell>();
        static readonly El[] BiomeEls = { El.Ember, El.Tide, El.Gale, El.Stone, El.Volt };

        static El BiomeOf(int j, int i) => BiomeEls[Rng.Hash(Rng.Key("biome", (int)Math.Floor(j / 8.0), (int)Math.Floor(i / 8.0))) % BiomeEls.Length];

        // About half the cells hold a Rift, and a 2x2 block of cells that
        // rolled none gets one anyway.
        const double RIFT_CHANCE = 0.46;
        static bool RolledRift(int j, int i) => new Seeded(Rng.Key("cell", j, i)).Next() < RIFT_CHANCE;
        static bool HasRift(int j, int i)
        {
            if (RolledRift(j, i)) return true;
            int bj = (int)Math.Floor(j / 2.0) * 2, bi = (int)Math.Floor(i / 2.0) * 2;
            var block = new[] { (bj, bi), (bj, bi + 1), (bj + 1, bi), (bj + 1, bi + 1) };
            if (block.Any((b) => RolledRift(b.Item1, b.Item2))) return false;
            var pick = block[Rng.Hash(Rng.Key("block", bj, bi)) % 4];
            return pick.Item1 == j && pick.Item2 == i;
        }

        static Cell StaticCell(int j, int i, double lngSize)
        {
            string key = Rng.Key(j, i);
            if (cache.TryGetValue(key, out var cell)) return cell;
            var rs = new Seeded("cell:" + key);
            Func<double> r = rs.Next;
            double lat0 = j * CELL, lng0 = i * lngSize;
            (double, double) At() => (lat0 + (0.12 + r() * 0.76) * CELL, lng0 + (0.12 + r() * 0.76) * lngSize);
            cell = new Cell { key = key, j = j, i = i, lngSize = lngSize, biome = BiomeOf(j, i), offset = (long)Math.Floor(r() * SPAWN_MS) };
            r();   // the Rift roll (see HasRift)
            if (HasRift(j, i))
            {
                var p = At();
                // Wardens, Primals, Breachers, the Hollow or nobody.
                double a = r(), b = a < 0.42 ? 0 : r();
                string faction = a < 0.27 ? "W" : a < 0.42 ? "P" : b < 0.45 ? "B" : b < 0.62 ? "P" : b < 0.78 ? "H" : null;
                bool held = a < 0.42 || b < 0.72;
                int level = held ? Rng.Weighted(new[] { 1, 2, 3, 4, 5, 6, 7, 8 }, (l) => 9 - l, r) : 0;
                if (faction != null && level == 0) level = 1 + (int)(Rng.Hash("hl:" + key) % 5);
                cell.rift = new Rift { id = "r" + key, lat = p.Item1, lng = p.Item2, name = RiftName(r), baseFaction = faction, baseLevel = level, seed = (long)Math.Floor(r() * 1e9) };
            }
            if (r() < 0.2)
            {
                var p = At();
                cell.cache = new Cache { id = "d" + key, lat = p.Item1, lng = p.Item2, name = Rng.Pick(CACHE_NAMES, r) };
            }
            cache[key] = cell;
            if (cache.Count > 4000) cache.Clear();
            return cell;
        }

        static double SpeciesWeight(Species sp, El biome, bool night)
        {
            double w = Species.Rarities[sp.rar].weight / Species.Wild.Count((s) => s.rar == sp.rar);
            if (sp.el == biome) w *= 3;
            if (night && sp.el == El.Void) w *= 3;
            if (!night && sp.el == El.Void) w *= 0.6;
            return w;
        }

        // Creatures in a cell right now. They change every 10 minutes.
        static List<Spawn> SpawnsIn(Cell cell, long now)
        {
            long win = (long)Math.Floor((now + cell.offset) / (double)SPAWN_MS);
            Func<double> r = new Seeded(Rng.Key("spawn", cell.key, win)).Next;
            double x = r();
            int n = x < 0.6 ? 0 : x < 0.92 ? 1 : 2;
            int hour = DateTimeOffset.FromUnixTimeMilliseconds(now).ToLocalTime().Hour;
            bool night = hour >= 20 || hour < 5;
            var list = new List<Spawn>();
            for (int k = 0; k < n; k++)
            {
                var sp = Rng.Weighted(Species.Wild, (s) => SpeciesWeight(s, cell.biome, night), r);
                list.Add(new Spawn
                {
                    id = "s" + cell.key + ":" + win + ":" + k, sp = sp.id,
                    lat = cell.j * CELL + (0.08 + r() * 0.84) * CELL,
                    lng = cell.i * cell.lngSize + (0.08 + r() * 0.84) * cell.lngSize,
                    lvlRoll = r(),
                    ivs = new[] { Rng.RandInt(0, 10, r), Rng.RandInt(0, 10, r), Rng.RandInt(0, 10, r) },
                    expires = (win + 1) * SPAWN_MS - cell.offset,
                });
                r();   // seed (used by the web game's animation)
            }
            return list;
        }

        // Everything within `radius` meters.
        public static Around Near(double lat, double lng, double radius, long now)
        {
            var o = new Around();
            double dLat = radius / M_LAT;
            int j0 = (int)Math.Floor((lat - dLat) / CELL), j1 = (int)Math.Floor((lat + dLat) / CELL);
            for (int j = j0; j <= j1; j++)
            {
                double lngSize = LngSize(j);
                double dLng = radius / (M_LNG * Math.Max(0.15, Math.Cos(lat * DEG)));
                int i0 = (int)Math.Floor((lng - dLng) / lngSize), i1 = (int)Math.Floor((lng + dLng) / lngSize);
                for (int i = i0; i <= i1; i++)
                {
                    var cell = StaticCell(j, i, lngSize);
                    if (cell.rift != null) o.rifts.Add(cell.rift);
                    if (cell.cache != null) o.caches.Add(cell.cache);
                    o.spawns.AddRange(SpawnsIn(cell, now));
                }
            }
            return o;
        }

        public static Rift RiftById(string id)
        {
            var parts = id.Substring(1).Split(':');
            int j = int.Parse(parts[0]), i = int.Parse(parts[1]);
            return StaticCell(j, i, LngSize(j)).rift;
        }

        /* ------------------ Rift guardians ------------------ */

        // hollow: the Hollow's machines corrupt Void and Volt creatures.
        public static List<Guardian> Guardians(Rift rift, int level, long seedExtra, bool hollow)
        {
            Func<double> r = new Seeded(Rng.Key("guard", rift.id, level, seedExtra)).Next;
            int n = level <= 2 ? 1 : level <= 5 ? 2 : 3;
            int maxRar = level >= 8 ? 3 : level >= 5 ? 2 : level >= 2 ? 1 : 0;
            var pool = Species.Wild.Where((s) => s.rar <= maxRar).ToList();
            if (hollow) pool = Species.Wild.Where((s) => (s.el == El.Void || s.el == El.Volt) && s.rar <= Math.Max(1, maxRar)).ToList();
            var team = new List<Guardian>();
            for (int k = 0; k < n; k++)
            {
                var sp = Rng.Weighted(pool, (s) => 4 - s.rar, r);
                team.Add(new Guardian { sp = sp.id, lvl = Math.Max(1, level * 3 - 2 + Rng.RandInt(-1, 2, r)), iv = new[] { Rng.RandInt(0, 10, r), Rng.RandInt(0, 10, r), Rng.RandInt(0, 10, r) } });
            }
            return team;
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    public enum PoiType { Outpost, Beacon, Crate, Monolith, Wreck, TradingPost }

    /// <summary>A place of interest on a planet's surface.</summary>
    public sealed class Poi
    {
        public string Id;
        public PoiType Type;
        public string Name;
        public Vector3d Pos;          // planet-local, on the ground
        public Quaternion Rot;        // planet-local
        public GameObject Go;
        public readonly List<BoxObstacle> Boxes = new List<BoxObstacle>();
        public readonly List<Obstacle> Cylinders = new List<Obstacle>();
        public Vector3d Interact;     // where to press E
        public bool Looted => Profile.LootedIds.Contains(Id);
        public bool Known => Profile.KnownPoiIds.Contains(Id);
        public ulong Seed;

        public string Label
        {
            get
            {
                switch (Type)
                {
                    case PoiType.Outpost: return "Outpost";
                    case PoiType.Beacon: return "Signal beacon";
                    case PoiType.Crate: return "Supply cache";
                    case PoiType.Monolith: return "Ancient monolith";
                    case PoiType.Wreck: return "Crash site";
                    default: return "Trading post";
                }
            }
        }

        public string Action
        {
            get
            {
                switch (Type)
                {
                    case PoiType.Outpost: return "Access terminal";
                    case PoiType.Beacon: return "Activate beacon";
                    case PoiType.Crate: return "Open cache";
                    case PoiType.Monolith: return "Touch the monolith";
                    case PoiType.Wreck: return "Salvage wreckage";
                    default: return "Trade";
                }
            }
        }
    }

    /// <summary>Generates and shows outposts, beacons, ruins and wrecks near the player.</summary>
    public sealed class PoiSystem
    {
        readonly PlanetBody planet;
        readonly PlanetData data;
        public readonly List<Poi> Pois = new List<Poi>();
        readonly Dictionary<long, Poi> byCell = new Dictionary<long, Poi>();
        readonly HashSet<long> emptyCells = new HashSet<long>();
        readonly Transform root;
        readonly int level;
        readonly Livery livery;
        readonly Material stoneMat;
        float timer;
        const double GenerateRange = 9000;
        const double ShowRange = 2600;

        public PoiSystem(PlanetBody planet)
        {
            this.planet = planet;
            data = planet.Data;
            root = new GameObject("Places").transform;
            root.SetParent(planet.Root.transform, false);
            double faceArc = Math.PI * 0.5 * data.Radius;
            level = Mathf.Clamp((int)Math.Round(Math.Log(faceArc / 1400.0, 2)), 1, 20);
            var r = new Rng(Hash.Mix(data.Seed, 0x9011));
            livery = new Livery
            {
                Hull = r.Hsv(0f, 1f, 0.02f, 0.12f, 0.72f, 0.88f),
                Accent = r.Hsv(0f, 1f, 0.55f, 0.85f, 0.6f, 0.9f),
                Dark = new Color(0.13f, 0.14f, 0.16f),
                Glow = r.Hsv(0.45f, 0.62f, 0.5f, 0.8f, 1f, 1f),
                GlowAlt = new Color(1f, 0.5f, 0.2f),
                GlowIntensity = 5f,
            };
            stoneMat = Materials.Prop(Color.Lerp(data.Stone, data.Rock1, 0.4f), 0f, 0.15f, 0.7f);
        }

        Material Pick(Poi p, string slot)
        {
            if (slot == "Stone") return stoneMat;
            return livery.Pick(slot);
        }

        public void Update(float dt, Vector3d playerLocal)
        {
            timer -= dt;
            if (timer <= 0f)
            {
                timer = 1.0f;
                for (int f = 0; f < 6; f++) Visit(playerLocal, f, 0, -1, -1, 2);
                foreach (var p in Pois)
                {
                    double d = (p.Pos - playerLocal).magnitude;
                    if (p.Go == null && d < ShowRange) Spawn(p);
                    else if (p.Go != null && d > ShowRange + 600) { UnityEngine.Object.Destroy(p.Go); p.Go = null; }
                }
            }
        }

        void Visit(Vector3d cam, int face, int lv, double a0, double b0, double size)
        {
            var dir = CubeSphere.Direction(face, a0 + size * 0.5, b0 + size * 0.5);
            double arc = CubeSphere.NodeArc(size, data.Radius);
            if ((dir * data.Radius - cam).magnitude > GenerateRange + arc) return;
            if (lv < level)
            {
                double h = size * 0.5;
                Visit(cam, face, lv + 1, a0, b0, h);
                Visit(cam, face, lv + 1, a0 + h, b0, h);
                Visit(cam, face, lv + 1, a0, b0 + h, h);
                Visit(cam, face, lv + 1, a0 + h, b0 + h, h);
                return;
            }
            long n = 1L << lv;
            long i = (long)Math.Floor((a0 + 1) / 2 * n + 0.5), j = (long)Math.Floor((b0 + 1) / 2 * n + 0.5);
            long key = ((long)face << 58) | (i << 29) | j;
            if (byCell.ContainsKey(key) || emptyCells.Contains(key)) return;
            var p = Generate(key, face, a0, b0, size);
            if (p == null) { emptyCells.Add(key); return; }
            byCell[key] = p;
            Pois.Add(p);
        }

        Poi Generate(long key, int face, double a0, double b0, double size)
        {
            var r = new Rng(Hash.Mix(data.Seed, (ulong)key, 0x901));
            if (!r.Chance(0.55 * data.PoiDensity)) return null;
            PoiType type = (PoiType)r.Weighted(new[] { 0.22, 0.14, 0.26, 0.12, 0.14, 0.12 });
            if (data.Type == PlanetType.Dead && type == PoiType.TradingPost) type = PoiType.Outpost;
            for (int attempt = 0; attempt < 5; attempt++)
            {
                double a = a0 + size * r.Range(0.15, 0.85), b = b0 + size * r.Range(0.15, 0.85);
                var dir = CubeSphere.Direction(face, a, b);
                double h = planet.Field.Height(dir);
                if (data.HasSea && h < data.SeaLevel + 1.0) continue;
                var nrm = planet.Field.Normal(dir);
                if (Vector3d.Dot(nrm, dir) < 0.94 && type != PoiType.Wreck) continue;
                var p = new Poi
                {
                    Id = "poi:" + data.Seed + ":" + key,
                    Type = type,
                    Seed = r.NextULong(),
                    Pos = dir * (data.Radius + h),
                };
                p.Name = type == PoiType.Monolith ? "Ruin of " + NameGen.Word(new Rng(p.Seed), 2, 3)
                       : type == PoiType.Crate ? "Supply cache"
                       : type == PoiType.Wreck ? "Crashed " + NameGen.Word(new Rng(p.Seed), 2, 2)
                       : NameGen.Outpost(p.Seed);
                var up = (Vector3)dir;
                p.Rot = Quaternion.AngleAxis(r.Range(0f, 360f), up) * Quaternion.FromToRotation(Vector3.up, up);
                BuildShapes(p);
                return p;
            }
            return null;
        }

        void AddBox(Poi p, Vector3 localCenter, Vector3 size, bool walkable = false)
        {
            p.Boxes.Add(new BoxObstacle
            {
                Center = p.Pos + (Vector3d)(p.Rot * localCenter),
                Rot = p.Rot,
                Half = size * 0.5f,
                Walkable = walkable,
            });
        }

        void AddCylinder(Poi p, Vector3 localBase, float radius, float height)
        {
            p.Cylinders.Add(new Obstacle
            {
                Base = p.Pos + (Vector3d)(p.Rot * localBase),
                Up = (Vector3d)(p.Rot * Vector3.up),
                Radius = radius,
                Height = height,
            });
        }

        // collision shapes in model space (Unity axes: +Z is the front)
        void BuildShapes(Poi p)
        {
            switch (p.Type)
            {
                case PoiType.Outpost:
                    AddBox(p, new Vector3(0, 1.9f, 0), new Vector3(7.2f, 3.8f, 6.8f));
                    AddBox(p, new Vector3(-5.2f, 1.5f, -0.5f), new Vector3(4f, 3f, 4f));
                    p.Interact = p.Pos + (Vector3d)(p.Rot * new Vector3(0, 0.3f, 4.4f));
                    break;
                case PoiType.Beacon:
                    AddCylinder(p, Vector3.zero, 0.9f, 7f);
                    p.Interact = p.Pos + (Vector3d)(p.Rot * new Vector3(0, 0.3f, 1.4f));
                    break;
                case PoiType.Crate:
                    AddBox(p, new Vector3(0, 0.4f, 0), new Vector3(1.26f, 0.8f, 0.86f), true);
                    p.Interact = p.Pos + (Vector3d)(p.Rot * new Vector3(0, 0.3f, 1.0f));
                    break;
                case PoiType.Monolith:
                    AddCylinder(p, Vector3.zero, 1.2f, 8f);
                    for (int k = 0; k < 6; k++)
                    {
                        float a = k * Mathf.PI / 3;
                        AddCylinder(p, new Vector3(-Mathf.Cos(a) * 6f, 0, Mathf.Sin(a) * 6f), 0.7f, 4f);
                    }
                    p.Interact = p.Pos + (Vector3d)(p.Rot * new Vector3(0, 0.6f, 2.0f));
                    break;
                case PoiType.Wreck:
                    AddBox(p, new Vector3(0, 1.0f, 0), new Vector3(3.5f, 2.2f, 8f));
                    p.Interact = p.Pos + (Vector3d)(p.Rot * new Vector3(2.8f, 0.4f, 1.0f));
                    break;
                case PoiType.TradingPost:
                    AddBox(p, new Vector3(0, 0.45f, 0), new Vector3(15f, 0.9f, 15f), true);
                    AddBox(p, new Vector3(0, 0.55f, 11f), new Vector3(0.8f, 1.1f, 0.6f));
                    p.Interact = p.Pos + (Vector3d)(p.Rot * new Vector3(0, 0.3f, 10f));
                    break;
            }
        }

        void Spawn(Poi p)
        {
            var go = new GameObject(p.Name);
            go.transform.SetParent(root, false);
            go.transform.localPosition = (Vector3)p.Pos;
            go.transform.localRotation = p.Rot;
            switch (p.Type)
            {
                case PoiType.Outpost:
                    Models.Spawn("outpost", go.transform, s => Pick(p, s));
                    break;
                case PoiType.Beacon:
                    Models.Spawn("beacon", go.transform, s => Pick(p, s));
                    break;
                case PoiType.Crate:
                    Models.Spawn("crate", go.transform, s => Pick(p, s));
                    break;
                case PoiType.Monolith:
                    Models.Spawn("monolith", go.transform, s => Pick(p, s));
                    break;
                case PoiType.Wreck:
                    Models.Spawn("crashed_pod", go.transform, s => Pick(p, s));
                    break;
                case PoiType.TradingPost:
                    Models.Spawn("landing_pad", go.transform, s => Pick(p, s));
                    var term = Models.Spawn("terminal", go.transform, s => Pick(p, s));
                    term.transform.localPosition = new Vector3(0, 0.8f, 11f);
                    term.transform.localRotation = Quaternion.Euler(0, 180f, 0);
                    break;
            }
            // sink the base a little so nothing floats on uneven ground
            foreach (Transform c in go.transform) c.localPosition += Vector3.down * 0.15f;
            p.Go = go;
        }

        public void Obstacles(Vector3d pos, double radius, List<BoxObstacle> boxes, List<Obstacle> cylinders)
        {
            foreach (var p in Pois)
            {
                if ((p.Pos - pos).magnitude > radius + 25) continue;
                boxes.AddRange(p.Boxes);
                cylinders.AddRange(p.Cylinders);
            }
        }

        public Poi NearestInteractable(Vector3d pos, double maxDist)
        {
            Poi best = null;
            double bd = maxDist;
            foreach (var p in Pois)
            {
                double d = (p.Interact - pos).magnitude;
                if (d < bd) { bd = d; best = p; }
            }
            return best;
        }

        public Poi Nearest(Vector3d pos, Predicate<Poi> filter = null)
        {
            Poi best = null;
            double bd = double.MaxValue;
            foreach (var p in Pois)
            {
                if (filter != null && !filter(p)) continue;
                double d = (p.Pos - pos).magnitude;
                if (d < bd) { bd = d; best = p; }
            }
            return best;
        }

        public void Dispose()
        {
            foreach (var p in Pois) if (p.Go != null) UnityEngine.Object.Destroy(p.Go);
            Pois.Clear();
            if (root != null) UnityEngine.Object.Destroy(root.gameObject);
            UnityEngine.Object.Destroy(stoneMat);
        }
    }
}

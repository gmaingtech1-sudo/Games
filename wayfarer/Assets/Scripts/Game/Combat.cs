using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    public enum BoltKind { ShipCannon, Blaster, DroneLaser, PirateCannon }

    public sealed class Bolt
    {
        public BoltKind Kind;
        public Vector3d Pos, Vel;
        public float Life;
        public float Damage;
        public bool Hostile;
    }

    public sealed class Drone
    {
        public Vector3d Pos, Vel;
        public Quaternion Rot = Quaternion.identity;
        public float Health = 70f;
        public GameObject Go;
        public float FireTimer = 2f;
        public float Orbit;
        public bool Patrol;
        public float PatrolTime;
        public bool Leaving;
    }

    public sealed class Pirate
    {
        public Vector3d Pos, Vel;
        public Quaternion Rot = Quaternion.identity;
        public float Health = 70f, Shield = 60f;
        public GameObject Go;
        public float FireTimer = 3f;
        public float Burst;
        public float Speed = 250f;
        public float Evade;
        public Vector3 Offset;
    }

    /// <summary>Bolts, lasers, sentinel drones and pirates.</summary>
    public sealed class Combat
    {
        public readonly List<Bolt> Bolts = new List<Bolt>();
        public readonly List<Drone> Drones = new List<Drone>();
        public readonly List<Pirate> Pirates = new List<Pirate>();
        public float Wanted;               // 0..3 sentinel alert on the current planet
        float calmTimer;
        float patrolTimer = 60f;
        public float PirateTimer = 300f;
        float gunHeat, gunCooldown;
        bool gunSide;
        readonly Transform root;
        readonly Material cannonMat, blasterMat, laserMat, pirateMat;
        readonly Livery droneLivery, pirateLivery;
        readonly System.Random rnd = new System.Random();

        public event Action<float, string> PlayerHit;          // damage, cause
        public event Action<Vector3d, float> Exploded;         // ref pos, size
        public event Action<string> Message;
        public event Action<AsteroidField, AsteroidField.Rock> AsteroidDestroyed;
        public event Action<Vector3d, Color> Sparked;
        public event Action<Creature> CreatureKilled;
        public event Action DroneDestroyed;
        public event Action PirateDestroyed;
        public event Action Fired;

        public float GunHeat => gunHeat;

        public Combat(Transform parent)
        {
            root = new GameObject("Combat").transform;
            root.SetParent(parent, false);
            cannonMat = Materials.Additive(new Color(0.5f, 0.85f, 1f), 6f, 0f, 1f);
            blasterMat = Materials.Additive(new Color(1f, 0.75f, 0.3f), 6f, 0f, 1f);
            laserMat = Materials.Additive(new Color(1f, 0.2f, 0.15f), 7f, 0f, 1f);
            pirateMat = Materials.Additive(new Color(1f, 0.35f, 0.9f), 6f, 0f, 1f);
            droneLivery = new Livery { Hull = new Color(0.72f, 0.66f, 0.55f), Accent = new Color(0.9f, 0.2f, 0.15f), Dark = new Color(0.12f, 0.1f, 0.1f), Glow = new Color(1f, 0.15f, 0.1f), GlowIntensity = 6f };
            pirateLivery = new Livery { Hull = new Color(0.2f, 0.2f, 0.22f), Accent = new Color(0.8f, 0.1f, 0.25f), Dark = new Color(0.08f, 0.08f, 0.09f), Glow = new Color(1f, 0.2f, 0.6f), GlowAlt = new Color(1f, 0.3f, 0.2f), GlowIntensity = 6f };
        }

        float R(float a, float b) => a + (float)rnd.NextDouble() * (b - a);

        // ───────────────────────────── firing ─────────────────────────────
        public void FireShipGuns(ShipController ship, SystemView view)
        {
            if (gunCooldown > 0f || gunHeat >= 1f) return;
            gunCooldown = 0.09f;
            gunHeat = Mathf.Min(1f, gunHeat + 0.035f);
            gunSide = !gunSide;
            Vector3 muzzle = new Vector3(gunSide ? 1.1f : -1.1f, -0.35f, 3.5f);
            var b = new Bolt
            {
                Kind = BoltKind.ShipCannon,
                Pos = ship.Pos + (Vector3d)(ship.Rot * muzzle),
                Vel = ship.Vel + (Vector3d)(ship.Forward * 1700f),
                Life = 1.6f,
                Damage = 11f * (1f + 0.35f * Profile.Level("ship_guns")),
            };
            Bolts.Add(b);
            Fired?.Invoke();
        }

        public void FireBlaster(Vector3d from, Vector3d dir)
        {
            Bolts.Add(new Bolt
            {
                Kind = BoltKind.Blaster,
                Pos = from,
                Vel = dir * 160.0,
                Life = 1.2f,
                Damage = 18f * (1f + 0.4f * Profile.Level("tool_blaster")),
            });
            Fired?.Invoke();
        }

        void FireEnemy(BoltKind kind, Vector3d from, Vector3d dir, Vector3d baseVel, float speed, float dmg)
        {
            Bolts.Add(new Bolt { Kind = kind, Pos = from, Vel = baseVel + dir * speed, Life = 3f, Damage = dmg, Hostile = true });
        }

        // ───────────────────────────── update ─────────────────────────────
        public void Tick(float dt, Game game)
        {
            gunCooldown -= dt;
            gunHeat = Mathf.Max(0f, gunHeat - dt * 0.35f);
            var view = game.View;
            var planet = view.Ref;
            bool onFoot = game.Mode == PlayerMode.OnFoot;
            Vector3d target = onFoot ? game.Player.Pos + game.Player.Up * 1.1 : game.Ship.Pos;

            TickSentinels(dt, game, planet, onFoot, target);
            TickPirates(dt, game, target);
            TickBolts(dt, game, target, onFoot);
        }

        void TickBolts(float dt, Game game, Vector3d target, bool onFoot)
        {
            var view = game.View;
            var planet = view.Ref;
            for (int i = Bolts.Count - 1; i >= 0; i--)
            {
                var b = Bolts[i];
                b.Life -= dt;
                Vector3d from = b.Pos;
                b.Pos += b.Vel * dt;
                bool dead = b.Life <= 0f;
                Vector3d seg = b.Pos - from;
                double len = seg.magnitude;
                Vector3d dir = len > 1e-6 ? seg / len : Vector3d.forward;

                if (!dead && b.Hostile)
                {
                    double pr = onFoot ? 0.8 : 8.0;
                    if (SegmentHitsSphere(from, dir, len, target, pr))
                    {
                        PlayerHit?.Invoke(b.Damage, b.Kind == BoltKind.DroneLaser ? "Sentinel laser" : "Pirate fire");
                        dead = true;
                    }
                }
                else if (!dead)
                {
                    // player shots
                    foreach (var d in Drones)
                        if (SegmentHitsSphere(from, dir, len, d.Pos, 1.4))
                        {
                            HitDrone(game, d, b.Damage);
                            dead = true;
                            break;
                        }
                    if (!dead)
                        foreach (var p in Pirates)
                            if (SegmentHitsSphere(from, dir, len, p.Pos, 7.0))
                            {
                                HitPirate(game, p, b.Damage);
                                dead = true;
                                break;
                            }
                    if (!dead && b.Kind == BoltKind.ShipCannon) dead = HitAsteroid(game, from, dir, len, b.Damage);
                    if (!dead && planet?.Fauna != null && b.Kind == BoltKind.Blaster)
                    {
                        var c = planet.Fauna.Raycast(from, dir, len, out _);
                        if (c != null)
                        {
                            planet.Fauna.Damage(c, b.Damage, from);
                            Sparked?.Invoke(b.Pos, new Color(1f, 0.4f, 0.3f));
                            if (c.State == CreatureState.Dead) { CreatureKilled?.Invoke(c); AddWanted(0.7f, planet); }
                            dead = true;
                        }
                    }
                }
                // the ground stops everything
                if (!dead && planet != null)
                {
                    Vector3d up = b.Pos.normalized;
                    double g = planet.Data.Radius + planet.GroundHeight(up);
                    if (b.Pos.magnitude < g)
                    {
                        dead = true;
                        Sparked?.Invoke(up * g, b.Hostile ? new Color(1f, 0.3f, 0.2f) : new Color(1f, 0.8f, 0.4f));
                    }
                }
                if (dead) Bolts.RemoveAt(i);
            }
        }

        static bool SegmentHitsSphere(Vector3d from, Vector3d dir, double len, Vector3d c, double r)
        {
            if (!MathUtil.RaySphere(from, dir, c, r, out double t0, out double t1)) return false;
            return t1 >= 0 && t0 <= len;
        }

        bool HitAsteroid(Game game, Vector3d from, Vector3d dir, double len, float dmg)
        {
            var view = game.View;
            foreach (var f in view.Fields)
            {
                if (!f.Visible) continue;
                Vector3d c = view.SysToRef(f.Data.Position);
                if ((from - c).magnitude > f.Data.Radius + 500) continue;
                Quaternion inv = Quaternion.Inverse(f.Root.transform.rotation);
                Vector3 o = inv * (Vector3)(from - c);
                Vector3 d = inv * (Vector3)dir;
                foreach (var k in f.Rocks)
                {
                    if (!k.Alive) continue;
                    Vector3 oc = o - k.Pos;
                    float bb = Vector3.Dot(oc, d);
                    float cc = oc.sqrMagnitude - k.Radius * k.Radius * 0.8f;
                    float disc = bb * bb - cc;
                    if (disc < 0) continue;
                    float t = -bb - Mathf.Sqrt(disc);
                    if (t < 0 || t > len) continue;
                    k.Health -= dmg;
                    Vector3d hit = from + dir * t;
                    Sparked?.Invoke(hit, new Color(1f, 0.75f, 0.4f));
                    if (k.Health <= 0)
                    {
                        k.Alive = false;
                        Exploded?.Invoke(c + (Vector3d)(f.Root.transform.rotation * k.Pos), k.Radius * 0.15f);
                        AsteroidDestroyed?.Invoke(f, k);
                    }
                    return true;
                }
            }
            return false;
        }

        // ──────────────────────────── sentinels ───────────────────────────
        public void AddWanted(float amount, PlanetBody planet)
        {
            if (planet == null || planet.Data.SentinelLevel == 0) return;
            float before = Wanted;
            Wanted = Mathf.Min(3f, Wanted + amount);
            calmTimer = 0f;
            if (before < 1f && Wanted >= 1f) Message?.Invoke("Sentinel drones are coming for you!");
        }

        public void OnResourceMined(PlanetBody planet, int amount)
        {
            if (planet == null) return;
            int lvl = planet.Data.SentinelLevel;
            if (lvl >= 3) AddWanted(0.004f * amount, planet);
            else if (lvl == 2) AddWanted(0.0012f * amount, planet);
        }

        void TickSentinels(float dt, Game game, PlanetBody planet, bool onFoot, Vector3d target)
        {
            if (planet == null)
            {
                ClearDrones();
                Wanted = 0;
                return;
            }
            // escape: fly far away in the ship
            if (!onFoot && game.Ship.Altitude > 900f && Wanted > 0) { Wanted = 0; foreach (var d in Drones) d.Leaving = true; }

            int wantDrones = Wanted >= 1f ? Mathf.Clamp(Mathf.FloorToInt(Wanted) + 1, 2, 4) : 0;
            int hostile = 0;
            foreach (var d in Drones) if (!d.Patrol && !d.Leaving) hostile++;
            if (hostile < wantDrones) SpawnDrone(game, planet, target, false);

            if (Wanted > 0f)
            {
                bool nearby = false;
                foreach (var d in Drones) if (!d.Patrol && (d.Pos - target).magnitude < 160) nearby = true;
                calmTimer += dt;
                if (!nearby && calmTimer > 18f) Wanted = Mathf.Max(0f, Wanted - dt * 0.25f);
                if (Wanted < 1f && Wanted > 0f && calmTimer > 18f)
                {
                    Wanted = 0f;
                    foreach (var d in Drones) d.Leaving = true;
                    Message?.Invoke("The sentinels have lost interest.");
                }
            }

            // idle patrols on watched worlds
            if (planet.Data.SentinelLevel > 0 && onFoot)
            {
                patrolTimer -= dt;
                if (patrolTimer <= 0f && Drones.Count == 0)
                {
                    patrolTimer = R(90f, 170f) / planet.Data.SentinelLevel;
                    SpawnDrone(game, planet, target, true);
                }
            }

            for (int i = Drones.Count - 1; i >= 0; i--)
            {
                var d = Drones[i];
                Vector3d up = d.Pos.normalized;
                bool hostileNow = !d.Patrol && !d.Leaving && Wanted >= 1f;
                if (d.Patrol)
                {
                    d.PatrolTime += dt;
                    if (d.PatrolTime > 28f) d.Leaving = true;
                    if (Wanted >= 1f) { d.Patrol = false; }
                }
                Vector3d goal;
                if (d.Leaving) goal = d.Pos + up * 60.0 + (d.Pos - target).normalized * 40.0;
                else
                {
                    d.Orbit += dt * (hostileNow ? 0.6f : 0.25f);
                    Vector3d tUp = target.normalized;
                    Vector3d t1 = Vector3d.Cross(tUp, Math.Abs(tUp.y) < 0.9 ? Vector3d.up : Vector3d.right).normalized;
                    Vector3d t2 = Vector3d.Cross(tUp, t1);
                    double rad = hostileNow ? 14 : 18;
                    goal = target + tUp * (hostileNow ? 7.0 : 10.0) + (t1 * Math.Cos(d.Orbit) + t2 * Math.Sin(d.Orbit)) * rad;
                    if (!onFoot) goal = target + tUp * 25.0;
                }
                Vector3d to = goal - d.Pos;
                double spd = d.Leaving ? 25 : hostileNow ? 16 : 8;
                Vector3d want = to.magnitude > 1 ? to.normalized * Math.Min(spd, to.magnitude * 1.5) : Vector3d.zero;
                d.Vel = Vector3d.Lerp(d.Vel, want, 1 - Math.Exp(-dt * 2));
                d.Pos += d.Vel * dt;
                // keep off the ground
                double g = planet.Data.Radius + planet.GroundHeight(d.Pos.normalized) + 3.0;
                if (d.Pos.magnitude < g) d.Pos = d.Pos.normalized * g;
                Vector3 look = (Vector3)(target - d.Pos);
                if (look.sqrMagnitude > 0.01f) d.Rot = Quaternion.Slerp(d.Rot, Quaternion.LookRotation(look.normalized, (Vector3)up), dt * 4f);

                if (hostileNow)
                {
                    d.FireTimer -= dt;
                    if (d.FireTimer <= 0f && (target - d.Pos).magnitude < 90)
                    {
                        d.FireTimer = R(1.3f, 2.4f);
                        Vector3d aim = (target - d.Pos).normalized;
                        FireEnemy(BoltKind.DroneLaser, d.Pos + aim * 1.0, aim, Vector3d.zero, onFoot ? 70f : 400f, onFoot ? 7f : 4f);
                    }
                }
                if (d.Leaving && (d.Pos - target).magnitude > 250)
                {
                    UnityEngine.Object.Destroy(d.Go);
                    Drones.RemoveAt(i);
                }
            }
        }

        void SpawnDrone(Game game, PlanetBody planet, Vector3d target, bool patrol)
        {
            Vector3d up = target.normalized;
            Vector3d t1 = Vector3d.Cross(up, Math.Abs(up.y) < 0.9 ? Vector3d.up : Vector3d.right).normalized;
            double a = rnd.NextDouble() * Math.PI * 2;
            Vector3d t2 = Vector3d.Cross(up, t1);
            var d = new Drone
            {
                Pos = target + (t1 * Math.Cos(a) + t2 * Math.Sin(a)) * 70.0 + up * 25.0,
                Patrol = patrol,
                Orbit = (float)a,
            };
            d.Go = Models.Spawn("drone", planet.Root.transform, droneLivery.Pick);
            Drones.Add(d);
        }

        void HitDrone(Game game, Drone d, float dmg)
        {
            d.Health -= dmg;
            Sparked?.Invoke(d.Pos, new Color(1f, 0.6f, 0.3f));
            AddWanted(d.Patrol ? 1.2f : 0.25f, game.View.Ref);
            d.Patrol = false;
            if (d.Health <= 0)
            {
                Exploded?.Invoke(d.Pos, 1.2f);
                UnityEngine.Object.Destroy(d.Go);
                Drones.Remove(d);
                DroneDestroyed?.Invoke();
                AddWanted(0.35f, game.View.Ref);
            }
        }

        public void ClearDrones()
        {
            foreach (var d in Drones) UnityEngine.Object.Destroy(d.Go);
            Drones.Clear();
        }

        // ───────────────────────────── pirates ────────────────────────────
        void TickPirates(float dt, Game game, Vector3d target)
        {
            var view = game.View;
            bool inSpace = game.Mode == PlayerMode.InShip && game.Ship.State == ShipState.Flying && !game.Ship.InAtmosphere
                           && (view.Station == null || (game.Ship.Pos - view.StationPosRef).magnitude > 20000);
            if (inSpace && Pirates.Count == 0)
            {
                PirateTimer -= dt;
                if (PirateTimer <= 0f)
                {
                    PirateTimer = R(360f, 720f);
                    SpawnPirates(game, UnityEngine.Random.Range(2, 4));
                }
            }
            var ship = game.Ship;
            for (int i = Pirates.Count - 1; i >= 0; i--)
            {
                var p = Pirates[i];
                Vector3d to = (target + (Vector3d)(ship.Rot * p.Offset)) - p.Pos;
                double dist = (target - p.Pos).magnitude;
                p.Evade -= dt;
                Vector3 desired = p.Evade > 0 ? (Vector3)Vector3d.Cross(to, Vector3d.up).normalized : (Vector3)to.normalized;
                p.Rot = Quaternion.Slerp(p.Rot, Quaternion.LookRotation(desired, p.Rot * Vector3.up), dt * 1.8f);
                float want = dist > 1500 ? 520f : dist > 400 ? 330f : Mathf.Max(ship.Speed * 0.9f, 140f);
                p.Speed = Mathf.MoveTowards(p.Speed, want, dt * 120f);
                p.Vel = (Vector3d)(p.Rot * Vector3.forward * p.Speed);
                p.Pos += p.Vel * dt;
                if (game.Mode != PlayerMode.InShip || ship.State != ShipState.Flying || ship.Pulsing && dist > 8000)
                {
                    if (dist > 15000) { UnityEngine.Object.Destroy(p.Go); Pirates.RemoveAt(i); continue; }
                }
                p.FireTimer -= dt;
                Vector3 aimDir = (Vector3)(target - p.Pos).normalized;
                if (p.FireTimer <= 0f && dist < 1200 && Vector3.Dot(p.Rot * Vector3.forward, aimDir) > 0.93f && game.Mode == PlayerMode.InShip)
                {
                    p.Burst += 1;
                    p.FireTimer = p.Burst % 5 == 0 ? R(1.8f, 3f) : 0.12f;
                    // lead the target a little
                    Vector3d lead = (target + ship.Vel * (dist / 1400.0) - p.Pos).normalized;
                    FireEnemy(BoltKind.PirateCannon, p.Pos + lead * 7.0, lead, p.Vel, 1400f, 4.5f);
                }
                if (game.Mode == PlayerMode.Docked || view.Ref != null && game.Ship.InAtmosphere)
                {
                    UnityEngine.Object.Destroy(p.Go);
                    Pirates.RemoveAt(i);
                }
            }
        }

        public void SpawnPirates(Game game, int count)
        {
            var ship = game.Ship;
            Message?.Invoke($"Warning: {count} pirate fighters closing in!");
            for (int i = 0; i < count; i++)
            {
                var off = new Vector3(R(-400f, 400f), R(-200f, 200f), -2500f + R(-300f, 300f));
                var p = new Pirate
                {
                    Pos = ship.Pos + (Vector3d)(ship.Rot * off),
                    Offset = new Vector3(R(-60f, 60f), R(-30f, 30f), R(-150f, -60f)),
                };
                p.Rot = Quaternion.LookRotation((Vector3)(ship.Pos - p.Pos).normalized);
                p.Go = Models.Spawn("ship_pirate", game.View.Root.transform, pirateLivery.Pick);
                Pirates.Add(p);
            }
        }

        void HitPirate(Game game, Pirate p, float dmg)
        {
            Sparked?.Invoke(p.Pos, p.Shield > 0 ? new Color(0.5f, 0.7f, 1f) : new Color(1f, 0.6f, 0.2f));
            float s = Mathf.Min(p.Shield, dmg);
            p.Shield -= s;
            p.Health -= dmg - s;
            if (p.Health < 40f && p.Evade <= 0f) p.Evade = 2.5f;
            if (p.Health <= 0)
            {
                Exploded?.Invoke(p.Pos, 3f);
                UnityEngine.Object.Destroy(p.Go);
                Pirates.Remove(p);
                PirateDestroyed?.Invoke();
            }
        }

        public void ClearPirates()
        {
            foreach (var p in Pirates) UnityEngine.Object.Destroy(p.Go);
            Pirates.Clear();
        }

        public void ConvertFrame(PlanetBody from, PlanetBody to)
        {
            Bolts.Clear();
            foreach (var p in Pirates)
            {
                var m = SystemView.Convert(new SystemView.Motion { Pos = p.Pos, Vel = p.Vel, Rot = p.Rot }, from, to);
                p.Pos = m.Pos; p.Vel = m.Vel; p.Rot = m.Rot;
            }
            ClearDrones();
        }

        // ──────────────────────────── drawing ─────────────────────────────
        public void Draw(SystemView view, Camera cam)
        {
            foreach (var b in Bolts)
            {
                Vector3 p = view.ToUnity(b.Pos);
                Vector3 v = (Vector3)b.Vel;
                float len = b.Kind == BoltKind.ShipCannon || b.Kind == BoltKind.PirateCannon ? 18f : 2.5f;
                float width = b.Kind == BoltKind.ShipCannon || b.Kind == BoltKind.PirateCannon ? 0.9f : 0.18f;
                Material m = b.Kind == BoltKind.ShipCannon ? cannonMat : b.Kind == BoltKind.Blaster ? blasterMat : b.Kind == BoltKind.DroneLaser ? laserMat : pirateMat;
                Vector3 dir = v.sqrMagnitude > 1e-4f ? v.normalized : Vector3.forward;
                var mtx = Matrix4x4.TRS(p - dir * len, Quaternion.LookRotation(dir), new Vector3(width, width, len));
                Graphics.DrawMesh(MeshGen.Beam, mtx, m, 0, cam, 0, null, ShadowCastingMode.Off, false);
            }
            var planetRoot = view.Ref != null ? view.Ref.Root.transform : null;
            foreach (var d in Drones)
            {
                if (d.Go == null) continue;
                if (planetRoot != null)
                {
                    d.Go.transform.localPosition = (Vector3)d.Pos;
                    d.Go.transform.localRotation = d.Rot;
                }
            }
            foreach (var p in Pirates)
            {
                if (p.Go == null) continue;
                p.Go.transform.position = view.ToUnity(p.Pos);
                p.Go.transform.rotation = p.Rot;
            }
        }
    }
}

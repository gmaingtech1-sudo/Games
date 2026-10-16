using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    public enum Diet { Herbivore, Omnivore, Carnivore }
    public enum Temperament { Docile, Skittish, Curious, Aggressive }

    /// <summary>A procedurally designed animal species native to one planet.</summary>
    public sealed class CreatureSpecies
    {
        public int Index;
        public ulong Seed;
        public string Name, DiscoveryId;
        public string Body, Head, Leg, Tail, Horn, Ear;
        public bool Crest, Flyer;
        public float Size;            // body length in metres
        public float LegLength;       // hip height in metres
        public float HeadScale;
        public float Speed;
        public Diet Diet;
        public Temperament Temperament;
        public int HerdMin, HerdMax;
        public float Weight;          // spawn weight
        public Material Skin, Skin2, Eye, HornMat;
        public float CallPitch;
        public float Mass => Mathf.Round(Size * Size * Size * 55f * (Diet == Diet.Carnivore ? 1.2f : 1f));
        public float Height => LegLength + Size * 0.45f;

        public string Description =>
            $"{Diet} · {Temperament} · {Height:F1} m · {Mass:N0} kg";
    }

    public enum CreatureState { Idle, Wander, Graze, Flee, Chase, Circle, Dead }

    public sealed class Creature
    {
        public CreatureSpecies Species;
        public GameObject Go;
        public Transform BodyPivot, Head, TailT;
        public readonly List<Transform> Legs = new List<Transform>();
        public readonly List<float> LegPhase = new List<float>();
        public readonly List<Transform> Wings = new List<Transform>();
        public Vector3d Pos;           // planet-local
        public Vector3d Heading;       // planet-local tangent
        public float Speed;
        public CreatureState State;
        public float Timer;
        public Vector3d Target;
        public float Health;
        public float Gait;
        public float AttackCooldown;
        public float DeadTime;
        public double FlyAltitude;
        public float BodyHeight;
        public Quaternion[] LegRest;
        public Quaternion HeadRest, TailRest;
        public float CallTimer;
        public bool Discovered;
        public float Radius => Species.Size * 0.6f;
    }

    /// <summary>Spawns, animates and runs the behaviour of animals around the player.</summary>
    public sealed class FaunaSystem
    {
        readonly PlanetBody planet;
        readonly PlanetData data;
        public readonly List<CreatureSpecies> Species = new List<CreatureSpecies>();
        public readonly List<Creature> Creatures = new List<Creature>();
        readonly Transform root;
        readonly Rng rng;
        float spawnTimer;
        bool disposed;

        public event Action<Creature, float> PlayerBitten;  // creature, damage
        public event Action<Creature> Called;               // a creature makes a sound

        public FaunaSystem(PlanetBody planet)
        {
            this.planet = planet;
            data = planet.Data;
            root = new GameObject("Fauna").transform;
            root.SetParent(planet.Root.transform, false);
            rng = new Rng(Hash.Mix(data.Seed, (ulong)DateTime.Now.Ticks));
            BuildSpecies();
        }

        void BuildSpecies()
        {
            var r = new Rng(Hash.Mix(data.Seed, 0xFA0A));
            string[] bodies = { "cr_body_a", "cr_body_b", "cr_body_c", "cr_body_d" };
            string[] heads = { "cr_head_a", "cr_head_b", "cr_head_c", "cr_head_d" };
            string[] legs = { "cr_leg_a", "cr_leg_b", "cr_leg_c" };
            string[] tails = { "cr_tail_a", "cr_tail_b", null };
            string[] horns = { "cr_horn_a", "cr_horn_b", null, null };
            bool hostile = data.Type == PlanetType.Toxic || data.Type == PlanetType.Irradiated || data.Type == PlanetType.Volcanic || data.Type == PlanetType.Exotic;
            for (int i = 0; i < data.SpeciesCount; i++)
            {
                ulong seed = r.NextULong();
                var sr = new Rng(seed);
                var s = new CreatureSpecies { Index = i, Seed = seed };
                s.Flyer = i > 0 && sr.Chance(0.18);
                s.Body = s.Flyer ? sr.Pick(new[] { "cr_body_a", "cr_body_c" }) : sr.Pick(bodies);
                bool insect = s.Body == "cr_body_d";
                s.Head = insect ? "cr_head_d" : sr.Pick(heads);
                s.Leg = insect ? "cr_leg_c" : sr.Pick(new[] { "cr_leg_a", "cr_leg_b" });
                s.Tail = insect ? null : sr.Pick(tails);
                s.Horn = insect ? null : sr.Pick(horns);
                s.Ear = !insect && sr.Chance(0.4) ? "cr_ear_a" : null;
                s.Crest = !insect && sr.Chance(0.25);
                float roll = (float)sr.Next();
                s.Size = s.Flyer ? sr.Range(0.5f, 1.4f) : roll < 0.45f ? sr.Range(0.35f, 0.9f) : roll < 0.85f ? sr.Range(0.9f, 2.2f) : sr.Range(2.2f, 5.5f);
                s.LegLength = s.Flyer ? s.Size * 0.3f : s.Size * (s.Leg == "cr_leg_a" ? sr.Range(0.75f, 1.25f) : s.Leg == "cr_leg_b" ? sr.Range(0.45f, 0.75f) : sr.Range(0.35f, 0.55f));
                s.HeadScale = sr.Range(0.8f, 1.3f);
                s.Speed = (s.Flyer ? sr.Range(9f, 16f) : sr.Range(3.5f, 8.5f)) * Mathf.Sqrt(Mathf.Max(0.5f, s.LegLength));
                s.Diet = (Diet)sr.Weighted(new[] { 0.6, 0.25, 0.15 });
                if (s.Diet == Diet.Carnivore && hostile && !s.Flyer) s.Temperament = sr.Chance(0.7) ? Temperament.Aggressive : Temperament.Curious;
                else if (s.Diet == Diet.Carnivore) s.Temperament = sr.Chance(0.35) ? Temperament.Aggressive : Temperament.Skittish;
                else s.Temperament = (Temperament)sr.Weighted(new[] { 0.35, 0.45, 0.2, 0.0 });
                if (i == 0 && data.Hazard == HazardType.None) s.Temperament = Temperament.Docile; // gentle first impressions
                s.HerdMin = s.Size > 2.5f ? 1 : 2;
                s.HerdMax = s.Size > 2.5f ? 3 : s.Flyer ? 4 : 6;
                s.Weight = (float)sr.Range(0.4, 1.0) * (s.Size > 3f ? 0.5f : 1f);
                s.CallPitch = Mathf.Clamp(1.6f / Mathf.Sqrt(s.Size), 0.4f, 2.5f);
                s.Name = NameGen.Species(seed);
                s.DiscoveryId = "fauna:" + data.Seed + ":" + i;

                // colours: planet-flavoured with a bold second tone
                Color.RGBToHSV(data.Ground1, out float gh, out _, out _);
                float hue = (gh + sr.Range(-0.25f, 0.25f) + 1f) % 1f;
                var skin = Color.HSVToRGB(hue, sr.Range(0.25f, 0.75f), sr.Range(0.3f, 0.75f));
                var skin2 = Color.HSVToRGB((hue + sr.Range(0.05f, 0.5f)) % 1f, sr.Range(0.1f, 0.6f), sr.Range(0.55f, 0.95f));
                s.Skin = Materials.Prop(skin, 0f, sr.Range(0.2f, 0.6f), 0.15f);
                s.Skin.SetFloat("_NoiseScale", 3f);
                s.Skin.SetFloat("_Pattern", sr.Chance(0.6) ? sr.Range(0.2f, 1f) : 0f);
                s.Skin.SetColor("_PatternColor", Color.HSVToRGB((hue + 0.5f) % 1f, sr.Range(0.3f, 0.8f), sr.Range(0.15f, 0.5f)));
                s.Skin2 = Materials.Prop(skin2, 0f, 0.35f, 0.1f);
                var eyeC = sr.Chance(0.3) ? Color.HSVToRGB(sr.NextF(), 0.8f, 1f) : new Color(0.02f, 0.02f, 0.02f);
                s.Eye = eyeC.maxColorComponent > 0.5f ? Materials.Glow(eyeC, 1.6f) : Materials.Prop(eyeC, 0f, 0.95f, 0f);
                s.HornMat = Materials.Prop(Color.HSVToRGB(0.1f, sr.Range(0.05f, 0.3f), sr.Range(0.6f, 0.9f)), 0f, 0.5f, 0.2f);
                Species.Add(s);
            }
        }

        Material Pick(CreatureSpecies s, string slot)
        {
            switch (slot)
            {
                case "Skin2": return s.Skin2;
                case "Eye": return s.Eye;
                case "Horn": return s.HornMat;
                default: return s.Skin;
            }
        }

        // ───────────────────────────── building ───────────────────────────
        Creature Build(CreatureSpecies s)
        {
            var c = new Creature { Species = s, Health = 30f + s.Size * s.Size * 25f };
            c.Go = new GameObject(s.Name);
            c.Go.transform.SetParent(root, false);
            var pivot = new GameObject("Body").transform;
            pivot.SetParent(c.Go.transform, false);
            c.BodyPivot = pivot;

            var body = Models.Spawn(s.Body, pivot, slot => Pick(s, slot));
            body.transform.localScale = Vector3.one * s.Size;

            Transform Marker(string name) => Models.Find(body.transform, name);
            Vector3 LocalOf(Transform m) => m != null ? pivot.InverseTransformPoint(m.position) : Vector3.zero;

            // legs hang from the hips down to the ground
            float thick = Mathf.Clamp(s.Size * 0.9f, 0.3f, 4f);
            foreach (var name in new[] { "LegFL", "LegFR", "LegML", "LegMR", "LegBL", "LegBR" })
            {
                var m = Marker(name);
                if (m == null || s.Flyer && (name.StartsWith("LegM"))) continue;
                var hip = new GameObject(name).transform;
                hip.SetParent(pivot, false);
                hip.localPosition = LocalOf(m);
                var leg = Models.Spawn(s.Leg, hip, slot => Pick(s, slot));
                bool right = name.EndsWith("R");
                leg.transform.localScale = new Vector3(right ? -thick : thick, s.LegLength, thick);
                c.Legs.Add(hip);
                bool front = name.StartsWith("LegF"), mid = name.StartsWith("LegM");
                float phase = s.Body == "cr_body_d"
                    ? ((front || name == "LegBL") ^ right ? 0f : Mathf.PI) + (mid ? Mathf.PI : 0f)
                    : ((front ^ right) ? 0f : Mathf.PI);
                c.LegPhase.Add(phase);
            }
            c.LegRest = new Quaternion[c.Legs.Count];
            for (int i = 0; i < c.Legs.Count; i++) c.LegRest[i] = c.Legs[i].localRotation;

            // the body sits on top of its legs
            var hipMarker = Marker("LegFL") ?? Marker("LegBL");
            float hipLocalY = hipMarker != null ? LocalOf(hipMarker).y : -0.2f * s.Size;
            c.BodyHeight = s.LegLength - hipLocalY;
            pivot.localPosition = new Vector3(0, c.BodyHeight, 0);

            var neck = Marker("Neck");
            if (neck != null)
            {
                var hp = new GameObject("Head").transform;
                hp.SetParent(pivot, false);
                hp.localPosition = LocalOf(neck);
                var head = Models.Spawn(s.Head, hp, slot => Pick(s, slot));
                head.transform.localScale = Vector3.one * s.Size * s.HeadScale;
                c.Head = hp;
                c.HeadRest = hp.localRotation;
                if (s.Horn != null)
                {
                    var hm = Models.Find(head.transform, "Horn");
                    if (hm != null)
                    {
                        var horn = Models.Spawn(s.Horn, hp, slot => Pick(s, slot));
                        horn.transform.localPosition = hp.InverseTransformPoint(hm.position);
                        horn.transform.localScale = Vector3.one * s.Size * s.HeadScale;
                    }
                }
                if (s.Ear != null)
                {
                    foreach (var en in new[] { "EarL", "EarR" })
                    {
                        var em = Models.Find(head.transform, en);
                        if (em == null) continue;
                        var ear = Models.Spawn(s.Ear, hp, slot => Pick(s, slot));
                        ear.transform.localPosition = hp.InverseTransformPoint(em.position);
                        bool right = en == "EarR";
                        ear.transform.localScale = new Vector3(right ? -1 : 1, 1, 1) * s.Size * s.HeadScale;
                    }
                }
            }

            var tailM = Marker("Tail");
            if (tailM != null && s.Tail != null)
            {
                var tp = new GameObject("Tail").transform;
                tp.SetParent(pivot, false);
                tp.localPosition = LocalOf(tailM);
                var tail = Models.Spawn(s.Tail, tp, slot => Pick(s, slot));
                tail.transform.localScale = Vector3.one * s.Size;
                c.TailT = tp;
                c.TailRest = tp.localRotation;
            }

            var back = Marker("Back");
            if (back != null && s.Crest)
            {
                var crest = Models.Spawn("cr_crest", pivot, slot => Pick(s, slot));
                crest.transform.localPosition = LocalOf(back);
                crest.transform.localScale = Vector3.one * s.Size;
            }
            if (back != null && s.Flyer)
            {
                foreach (int side in new[] { 1, -1 })
                {
                    var wp = new GameObject(side > 0 ? "WingL" : "WingR").transform;
                    wp.SetParent(pivot, false);
                    wp.localPosition = LocalOf(back) + new Vector3(0.1f * side * s.Size, 0, 0);
                    var wing = Models.Spawn("cr_wing_a", wp, slot => Pick(s, slot));
                    wing.transform.localScale = new Vector3(side < 0 ? 1f : -1f, 1f, 1f) * s.Size * 1.6f;
                    c.Wings.Add(wp);
                }
            }
            foreach (var r in c.Go.GetComponentsInChildren<Renderer>())
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
            return c;
        }

        // ───────────────────────────── simulation ─────────────────────────
        public void Update(float dt, Vector3d playerLocal, bool playerOnFoot, bool playerSprinting, double time)
        {
            if (disposed || Species.Count == 0) return;
            spawnTimer -= dt;
            int target = Mathf.RoundToInt((float)data.FaunaDensity * 16f);
            if (spawnTimer <= 0f)
            {
                spawnTimer = 1.2f;
                if (Creatures.Count < target) SpawnHerd(playerLocal);
            }

            for (int i = Creatures.Count - 1; i >= 0; i--)
            {
                var c = Creatures[i];
                double dist = (c.Pos - playerLocal).magnitude;
                if (dist > 480 || (c.State == CreatureState.Dead && c.DeadTime > 12f))
                {
                    UnityEngine.Object.Destroy(c.Go);
                    Creatures.RemoveAt(i);
                    continue;
                }
                Think(c, dt, playerLocal, dist, playerOnFoot, playerSprinting);
                Move(c, dt);
                Animate(c, dt, time);
            }
        }

        void SpawnHerd(Vector3d player)
        {
            float total = 0;
            foreach (var s in Species) total += s.Weight;
            float pick = rng.NextF() * total;
            CreatureSpecies sp = Species[0];
            foreach (var s in Species) { pick -= s.Weight; if (pick <= 0) { sp = s; break; } }

            Vector3d up = player.normalized;
            Vector3d t1 = Vector3d.Cross(up, Math.Abs(up.y) < 0.9 ? Vector3d.up : Vector3d.right).normalized;
            Vector3d t2 = Vector3d.Cross(up, t1);
            double ang = rng.Range(0.0, Math.PI * 2);
            double d = rng.Range(90.0, 200.0);
            Vector3d center = player + (t1 * Math.Cos(ang) + t2 * Math.Sin(ang)) * d;
            Vector3d cdir = center.normalized;
            double h = planet.GroundHeightExact(cdir);
            if (data.HasSea && h < data.SeaLevel + 0.5 && !sp.Flyer) return;

            int n = rng.Int(sp.HerdMin, sp.HerdMax);
            for (int i = 0; i < n; i++)
            {
                double a = rng.Range(0.0, Math.PI * 2), r = rng.Range(0.0, 10.0 + sp.Size * 2);
                Vector3d p = (center + (t1 * Math.Cos(a) + t2 * Math.Sin(a)) * r).normalized;
                var c = Build(sp);
                c.Pos = p * (data.Radius + planet.GroundHeightExact(p));
                c.Heading = Vector3d.Cross(p, t1).normalized;
                c.State = CreatureState.Idle;
                c.Timer = rng.Range(0.5f, 4f);
                c.CallTimer = rng.Range(4f, 20f);
                if (sp.Flyer)
                {
                    c.FlyAltitude = rng.Range(25.0, 90.0);
                    c.State = CreatureState.Circle;
                    c.Target = center.normalized * (data.Radius + h + c.FlyAltitude);
                }
                Creatures.Add(c);
            }
        }

        Vector3d RandomNear(Vector3d pos, double radius)
        {
            Vector3d up = pos.normalized;
            Vector3d t1 = Vector3d.Cross(up, Math.Abs(up.y) < 0.9 ? Vector3d.up : Vector3d.right).normalized;
            Vector3d t2 = Vector3d.Cross(up, t1);
            double a = rng.Range(0.0, Math.PI * 2);
            return pos + (t1 * Math.Cos(a) + t2 * Math.Sin(a)) * rng.Range(radius * 0.3, radius);
        }

        void Think(Creature c, float dt, Vector3d player, double dist, bool onFoot, bool sprinting)
        {
            var s = c.Species;
            c.Timer -= dt;
            c.AttackCooldown -= dt;
            c.CallTimer -= dt;
            if (c.CallTimer <= 0f && c.State != CreatureState.Dead)
            {
                c.CallTimer = rng.Range(8f, 30f);
                if (dist < 120) Called?.Invoke(c);
            }
            if (c.State == CreatureState.Dead) { c.DeadTime += dt; c.Speed = 0; return; }

            if (s.Flyer)
            {
                // circle lazily around a point in the sky
                Vector3d up = c.Pos.normalized;
                Vector3d toC = Vector3d.ProjectOnPlane(c.Target - c.Pos, up);
                Vector3d tangent = Vector3d.Cross(up, toC.normalized);
                c.Heading = (tangent + toC.normalized * (toC.magnitude > 40 ? 0.6 : 0.1)).normalized;
                c.Speed = s.Speed;
                if (c.Timer <= 0f) { c.Timer = rng.Range(10f, 25f); c.Target = RandomNear(c.Pos, 80); }
                return;
            }

            bool threatened = onFoot && (dist < 7 || (sprinting && dist < 16));
            switch (s.Temperament)
            {
                case Temperament.Aggressive:
                    if (onFoot && dist < 26 && c.State != CreatureState.Flee) { c.State = CreatureState.Chase; c.Timer = 6f; }
                    break;
                case Temperament.Skittish:
                    if (threatened) { c.State = CreatureState.Flee; c.Timer = rng.Range(4f, 7f); }
                    break;
                case Temperament.Curious:
                    if (onFoot && dist < 30 && dist > 5 && c.State == CreatureState.Idle && rng.Chance(0.02))
                    { c.State = CreatureState.Wander; c.Target = player; c.Timer = 5f; }
                    break;
            }

            switch (c.State)
            {
                case CreatureState.Idle:
                    c.Speed = 0;
                    if (c.Timer <= 0f)
                    {
                        if (rng.Chance(0.45)) { c.State = CreatureState.Graze; c.Timer = rng.Range(2f, 6f); }
                        else { c.State = CreatureState.Wander; c.Target = RandomNear(c.Pos, 28); c.Timer = rng.Range(5f, 12f); }
                    }
                    break;
                case CreatureState.Graze:
                    c.Speed = 0;
                    if (c.Timer <= 0f) { c.State = CreatureState.Idle; c.Timer = rng.Range(1f, 4f); }
                    break;
                case CreatureState.Wander:
                {
                    Vector3d to = Vector3d.ProjectOnPlane(c.Target - c.Pos, c.Pos.normalized);
                    if (to.magnitude < 2.5 || c.Timer <= 0f) { c.State = CreatureState.Idle; c.Timer = rng.Range(1f, 5f); break; }
                    c.Heading = to.normalized;
                    c.Speed = s.Speed * 0.35f;
                    break;
                }
                case CreatureState.Flee:
                {
                    Vector3d away = Vector3d.ProjectOnPlane(c.Pos - player, c.Pos.normalized);
                    if (away.sqrMagnitude > 1e-6) c.Heading = away.normalized;
                    c.Speed = s.Speed;
                    if (c.Timer <= 0f) { c.State = CreatureState.Idle; c.Timer = 2f; }
                    break;
                }
                case CreatureState.Chase:
                {
                    Vector3d to = Vector3d.ProjectOnPlane(player - c.Pos, c.Pos.normalized);
                    if (to.sqrMagnitude > 1e-6) c.Heading = to.normalized;
                    c.Speed = dist > 2.2 + c.Radius ? s.Speed * 0.9f : 0f;
                    if (dist < 2.6 + c.Radius && c.AttackCooldown <= 0f && onFoot)
                    {
                        c.AttackCooldown = 1.4f;
                        PlayerBitten?.Invoke(c, 6f + s.Size * 4f);
                    }
                    if (c.Timer <= 0f && dist > 30) { c.State = CreatureState.Idle; c.Timer = 3f; }
                    if (!onFoot) { c.State = CreatureState.Idle; c.Timer = 3f; }
                    break;
                }
            }
        }

        void Move(Creature c, float dt)
        {
            Vector3d up = c.Pos.normalized;
            if (c.Speed > 0.01f)
            {
                c.Pos += Vector3d.ProjectOnPlane(c.Heading, up).normalized * (c.Speed * dt);
                up = c.Pos.normalized;
            }
            double ground = planet.GroundHeight(up);
            if (c.Species.Flyer)
            {
                double alt = c.Pos.magnitude - data.Radius - ground;
                double wantAlt = c.FlyAltitude;
                double newAlt = alt + (wantAlt - alt) * Math.Min(1.0, dt * 0.5);
                c.Pos = up * (data.Radius + ground + Math.Max(newAlt, 3));
            }
            else
            {
                if (data.HasSea && ground < data.SeaLevel - 0.3)
                {
                    // don't wade into the sea: turn back
                    c.Heading = -c.Heading;
                    ground = Math.Max(ground, data.SeaLevel - 0.3);
                }
                c.Pos = up * (data.Radius + ground);
            }
            Vector3d fwd = Vector3d.ProjectOnPlane(c.Heading, up);
            if (fwd.sqrMagnitude < 1e-8) fwd = Vector3d.Cross(up, Vector3d.right);
            var t = c.Go.transform;
            t.localPosition = (Vector3)c.Pos;
            var want = Quaternion.LookRotation((Vector3)fwd.normalized, (Vector3)up);
            t.localRotation = c.State == CreatureState.Dead ? t.localRotation : Quaternion.Slerp(t.localRotation, want, Mathf.Clamp01(dt * 6f));
        }

        void Animate(Creature c, float dt, double time)
        {
            var s = c.Species;
            float stride = Mathf.Max(0.25f, s.LegLength * 1.6f);
            c.Gait += dt * (c.Speed / stride) * Mathf.PI * 2f;
            float moving = Mathf.Clamp01(c.Speed / Mathf.Max(0.5f, s.Speed * 0.3f));
            float amp = 28f * moving;
            for (int i = 0; i < c.Legs.Count; i++)
                c.Legs[i].localRotation = c.LegRest[i] * Quaternion.Euler(Mathf.Sin(c.Gait + c.LegPhase[i]) * amp, 0, 0);
            float bob = Mathf.Abs(Mathf.Sin(c.Gait)) * 0.04f * s.Size * moving;
            c.BodyPivot.localPosition = new Vector3(0, c.BodyHeight + bob, 0);
            float t = (float)time;
            if (c.Head != null)
            {
                float graze = c.State == CreatureState.Graze ? 35f : 0f;
                c.Head.localRotation = c.HeadRest * Quaternion.Euler(graze + Mathf.Sin(t * 0.7f + s.Index) * 6f + Mathf.Sin(c.Gait * 2f) * 4f * moving,
                                                                    Mathf.Sin(t * 0.37f + s.Index * 2f) * 18f * (1f - moving), 0);
            }
            if (c.TailT != null)
                c.TailT.localRotation = c.TailRest * Quaternion.Euler(Mathf.Sin(t * 1.3f) * 6f, Mathf.Sin(t * 2.2f + s.Index) * 22f, 0);
            for (int i = 0; i < c.Wings.Count; i++)
            {
                float flap = Mathf.Sin(t * 7f + s.Index) * 38f;
                c.Wings[i].localRotation = Quaternion.Euler(0, 0, i == 0 ? flap : -flap);
            }
            if (c.State == CreatureState.Dead)
            {
                var tr = c.Go.transform;
                float tip = Mathf.Clamp01(c.DeadTime * 1.5f);
                c.BodyPivot.localRotation = Quaternion.Euler(0, 0, 90f * tip);
                if (c.DeadTime > 8f) tr.localPosition -= (Vector3)(c.Pos.normalized * (dt * 0.3));
            }
        }

        // ───────────────────────────── queries ────────────────────────────
        public Creature Raycast(Vector3d origin, Vector3d dir, double maxDist, out double dist)
        {
            Creature best = null;
            dist = maxDist;
            foreach (var c in Creatures)
            {
                if (c.State == CreatureState.Dead) continue;
                Vector3d center = c.Pos + c.Pos.normalized * (c.BodyHeight + c.Species.Size * 0.1);
                double r = Math.Max(0.5, c.Species.Size * 0.65);
                if (MathUtil.RaySphere(origin, dir, center, r, out double t0, out double t1) && t1 > 0)
                {
                    double t = Math.Max(t0, 0);
                    if (t < dist) { dist = t; best = c; }
                }
            }
            return best;
        }

        public void Damage(Creature c, float amount, Vector3d from)
        {
            if (c.State == CreatureState.Dead) return;
            c.Health -= amount;
            if (c.Health <= 0)
            {
                c.State = CreatureState.Dead;
                c.DeadTime = 0;
                c.Speed = 0;
                return;
            }
            c.State = c.Species.Temperament == Temperament.Aggressive ? CreatureState.Chase : CreatureState.Flee;
            c.Timer = 6f;
        }

        public void Dispose()
        {
            disposed = true;
            foreach (var c in Creatures) UnityEngine.Object.Destroy(c.Go);
            Creatures.Clear();
            if (root != null) UnityEngine.Object.Destroy(root.gameObject);
            foreach (var s in Species)
            {
                UnityEngine.Object.Destroy(s.Skin); UnityEngine.Object.Destroy(s.Skin2);
                UnityEngine.Object.Destroy(s.Eye); UnityEngine.Object.Destroy(s.HornMat);
            }
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    public enum ShipState { Landed, TakingOff, Flying, Landing, Docking, Docked, Undocking }

    /// <summary>Your starship: its model, flight model, landing and take-off,
    /// the pulse drive, docking with stations and its health.</summary>
    public sealed class ShipController
    {
        public Vector3d Pos, Vel;        // reference frame
        public Quaternion Rot = Quaternion.identity;
        public ShipState State = ShipState.Landed;
        public int Planet = -1;          // which planet's frame the ship was left in (when not piloted)
        public float Throttle = 0.35f;
        public float Speed;
        public bool Boosting, Pulsing, PulseSpooling;
        public float PulseSpool, PulseSpeed;
        public float BoostEnergy = 1f;
        public float Hull = 100f, Shield = 100f;
        public float LaunchFuel, PulseFuel;
        public float LastDamageTime = -10f;
        public float Altitude;           // above ground, when near a planet
        public bool InAtmosphere;
        public float EngineLevel;        // 0..1 for sound and glow
        public string DropOutReason;

        public const float GearHeight = 2.14f;
        public readonly GameObject Go;
        readonly Transform gear;
        public readonly Transform Cockpit;
        readonly List<Transform> flames = new List<Transform>();
        readonly Material flameMat;
        readonly Material glowMat;
        readonly Livery livery;
        Vector2 stick;
        public Vector2 Stick => stick;
        float gearT = 1f;
        float stateT;
        Vector3d autoFrom, autoTo;
        Quaternion autoRotFrom, autoRotTo;
        float autoDuration;
        int dockStage;

        public event Action<string> Message;
        public event Action<float> Impact;       // collision speed
        public event Action Docked;
        public event Action Undocked;
        public event Action LandedEvent;
        public event Action TookOff;

        public Vector3d Up => Pos.normalized;
        public Vector3 Forward => Rot * Vector3.forward;
        public Vector3d CockpitPos => Pos + (Vector3d)(Rot * new Vector3(0, 1.05f, 3.2f));
        public bool Controllable => State == ShipState.Flying;

        public ShipController(Transform parent)
        {
            var d = Profile.Data;
            livery = new Livery
            {
                Hull = new Color(d.ShipHull[0], d.ShipHull[1], d.ShipHull[2]),
                Accent = new Color(d.ShipAccent[0], d.ShipAccent[1], d.ShipAccent[2]),
                Dark = new Color(0.12f, 0.13f, 0.15f),
                Glow = new Color(0.35f, 0.8f, 1f),
                GlowAlt = new Color(1f, 0.35f, 0.2f),
                GlowIntensity = 5f,
            };
            Go = new GameObject("Starship");
            Go.transform.SetParent(parent, false);
            var model = Models.Spawn("ship_explorer", Go.transform, livery.Pick);
            gear = Models.Find(model.transform, "Gear");
            Cockpit = Models.Find(model.transform, "Cockpit");
            glowMat = livery.Pick("Glow");

            flameMat = Materials.Additive(new Color(0.45f, 0.75f, 1f), 3f, 0f, 1f);
            foreach (var p in new[] { new Vector3(-1.45f, 0.05f, -7.25f), new Vector3(1.45f, 0.05f, -7.25f), new Vector3(0f, 0.22f, -7.15f) })
            {
                var f = new GameObject("Flame");
                f.transform.SetParent(Go.transform, false);
                f.transform.localPosition = p;
                f.transform.localRotation = Quaternion.Euler(0, 180f, 0);
                f.AddComponent<MeshFilter>().sharedMesh = MeshGen.Beam;
                var mr = f.AddComponent<MeshRenderer>();
                mr.sharedMaterial = flameMat;
                mr.shadowCastingMode = ShadowCastingMode.Off;
                flames.Add(f.transform);
            }
        }

        public void SetVisible(bool v) => Go.SetActive(v);

        // ───────────────────────────── flight ─────────────────────────────
        public void Tick(float dt, SystemView view, bool controls, Combat combat)
        {
            stateT += dt;
            var planet = view.Ref;
            UpdateAltitude(view);

            switch (State)
            {
                case ShipState.Landed:
                    Vel = Vector3d.zero;
                    Speed = 0;
                    gearT = Mathf.MoveTowards(gearT, 1f, dt);
                    EngineLevel = Mathf.MoveTowards(EngineLevel, controls ? 0.12f : 0f, dt);
                    if (controls && (GameInput.Down(KeyCode.Space) || GameInput.Down(KeyCode.W))) TryTakeOff();
                    break;
                case ShipState.TakingOff:
                    TickTakeOff(dt, planet);
                    break;
                case ShipState.Flying:
                    TickFlight(dt, view, controls, combat);
                    break;
                case ShipState.Landing:
                    TickLanding(dt, planet);
                    break;
                case ShipState.Docking:
                case ShipState.Undocking:
                    TickAuto(dt, view);
                    break;
                case ShipState.Docked:
                    Vel = Vector3d.zero;
                    Speed = 0;
                    EngineLevel = 0;
                    break;
            }

            if (Time.time - LastDamageTime > 4f)
            {
                float max = 100f;
                Shield = Mathf.Min(max, Shield + dt * 9f);
            }
        }

        void UpdateAltitude(SystemView view)
        {
            var p = view.Ref;
            if (p == null) { Altitude = float.MaxValue; InAtmosphere = false; return; }
            Vector3d up = Pos.normalized;
            double ground = p.GroundHeight(up);
            double r = Pos.magnitude;
            if (p.Data.HasSea && !p.Data.SeaIsLava) ground = Math.Max(ground, p.Data.SeaLevel);
            Altitude = (float)(r - p.Data.Radius - ground);
            InAtmosphere = r < p.AtmoTop + 200;
        }

        public bool TryTakeOff()
        {
            if (State != ShipState.Landed) return false;
            if (LaunchFuel < 20f)
            {
                Message?.Invoke("Launch thrusters need fuel. Recharge them with Hydrogen or Uranium (Tab).");
                return false;
            }
            LaunchFuel -= 20f;
            State = ShipState.TakingOff;
            stateT = 0;
            autoFrom = Pos;
            Throttle = 0.35f;
            TookOff?.Invoke();
            return true;
        }

        void TickTakeOff(float dt, PlanetBody planet)
        {
            Vector3d up = Pos.normalized;
            float t = Mathf.Clamp01(stateT / 2.6f);
            float ease = t * t * (3 - 2 * t);
            Pos = autoFrom + up * (ease * 32.0);
            gearT = 1f - Mathf.Clamp01(stateT / 1.5f);
            EngineLevel = 0.6f;
            // lift the nose a touch
            Rot = Quaternion.Slerp(Rot, Quaternion.LookRotation(Vector3.ProjectOnPlane(Forward, (Vector3)up).normalized, (Vector3)up) * Quaternion.Euler(-8f, 0, 0), dt * 1.5f);
            if (t >= 1f)
            {
                State = ShipState.Flying;
                Speed = 60f;
                Vel = (Vector3d)(Forward * Speed);
                stateT = 0;
            }
        }

        void TickFlight(float dt, SystemView view, bool controls, Combat combat)
        {
            var planet = view.Ref;
            gearT = Mathf.MoveTowards(gearT, 0f, dt);
            Vector2 md = controls ? GameInput.MouseDelta : Vector2.zero;
            stick += md * 0.018f;
            stick *= Mathf.Exp(-dt * 3.2f);
            if (stick.magnitude > 1f) stick.Normalize();

            float steer = Pulsing ? 0.28f : 1f;
            float pitchRate = -stick.y * 95f * steer;
            float yawRate = stick.x * 70f * steer;
            float roll = controls ? GameInput.Axis(KeyCode.A, KeyCode.D) : 0f;
            float rollRate = roll * 120f - (InAtmosphere ? stick.x * 55f : 0f);
            Rot = Rot * Quaternion.Euler(pitchRate * dt, yawRate * dt, rollRate * dt);

            // in the air, gently level the wings when you let go
            if (InAtmosphere && planet != null && Mathf.Abs(roll) < 0.1f)
            {
                Vector3 up = (Vector3)Pos.normalized;
                Vector3 f = Forward;
                if (Mathf.Abs(Vector3.Dot(f, up)) < 0.95f)
                {
                    var level = Quaternion.LookRotation(f, up);
                    var bank = Quaternion.AngleAxis(-stick.x * 35f, f) * level;
                    Rot = Quaternion.Slerp(Rot, bank, dt * 1.2f);
                }
            }

            // throttle
            if (controls)
            {
                if (GameInput.Key(KeyCode.W)) Throttle = Mathf.Min(1f, Throttle + dt * 0.8f);
                if (GameInput.Key(KeyCode.S)) Throttle = Mathf.Max(0f, Throttle - dt * 0.8f);
            }
            Boosting = controls && GameInput.Key(KeyCode.LeftShift) && BoostEnergy > 0.02f && !Pulsing;
            if (Boosting) BoostEnergy = Mathf.Max(0f, BoostEnergy - dt / 6f);
            else BoostEnergy = Mathf.Min(1f, BoostEnergy + dt / 10f);

            float max = InAtmosphere ? 230f : 420f;
            float target = Throttle * max;
            if (Boosting) target = max * 2.3f;

            // pulse drive
            if (controls && GameInput.Down(KeyCode.J)) TogglePulse(view);
            if (PulseSpooling)
            {
                PulseSpool += dt;
                target = Mathf.Max(target, 300f);
                if (PulseSpool > 1.3f) { PulseSpooling = false; Pulsing = true; PulseSpeed = Mathf.Max(Speed, 800f); }
            }
            if (Pulsing)
            {
                float eff = 1f - 0.3f * Profile.Level("ship_pulse");
                PulseFuel -= dt * 0.9f * eff;
                PulseSpeed = Mathf.Min(70000f, PulseSpeed + (PulseSpeed * 0.9f + 3000f) * dt);
                target = PulseSpeed;
                string reason = PulseBlocked(view);
                if (PulseFuel <= 0f) { PulseFuel = 0f; reason = "Pulse engine out of fuel"; }
                if (reason != null) DropOut(reason);
                if (controls && GameInput.Key(KeyCode.S)) DropOut(null);
            }

            float accel = Pulsing ? 1e6f : Boosting ? 140f : 70f;
            if (!Pulsing && Speed > target) accel = Speed > 1000f ? Speed * 2.2f : 110f;
            Speed = Mathf.MoveTowards(Speed, target, accel * dt);
            float grip = InAtmosphere ? 2.8f : 1.4f;
            Vector3d wantVel = (Vector3d)(Forward * Speed);
            Vel = Vector3d.Lerp(Vel, wantVel, 1 - Math.Exp(-grip * dt));
            if (Pulsing) Vel = wantVel;
            Pos += Vel * dt;
            EngineLevel = Mathf.MoveTowards(EngineLevel, Mathf.Clamp01(0.25f + Speed / max * 0.6f + (Boosting ? 0.4f : 0f)), dt * 2f);

            // don't fly through the ground
            if (planet != null)
            {
                Vector3d up = Pos.normalized;
                double ground = planet.GroundHeight(up);
                if (planet.Data.HasSea && !planet.Data.SeaIsLava) ground = Math.Max(ground, planet.Data.SeaLevel - 0.5);
                double minR = planet.Data.Radius + ground + 2.5;
                double r = Pos.magnitude;
                if (r < minR)
                {
                    double into = -Vector3d.Dot(Vel, up);
                    Pos = up * minR;
                    if (into > 0)
                    {
                        Vel += up * into * 1.4;
                        if (into > 12) Damage((float)(into - 12) * 1.8f, "impact");
                        Impact?.Invoke((float)into);
                    }
                    // pitch up out of the ground
                    Rot = Quaternion.Slerp(Rot, Quaternion.LookRotation(Vector3.ProjectOnPlane(Forward, (Vector3)up).normalized, (Vector3)up), 0.3f);
                    Speed *= 0.8f;
                }
                // landing
                if (controls && GameInput.Down(KeyCode.E))
                {
                    if (Altitude < 120f && Speed < 120f) BeginLanding(planet);
                    else if (Altitude < 400f) Message?.Invoke("Slow down and get lower to land (under 120 m).");
                }
            }

            // stations and asteroids
            CollideSpace(view, dt);

            if (controls && GameInput.Fire && !Pulsing) combat?.FireShipGuns(this, view);
        }

        string PulseBlocked(SystemView view)
        {
            Vector3d sys = view.RefToSys(Pos);
            Vector3d vSys = view.RefToSys(Pos + (Vector3d)(Forward * 1f)) - sys;
            foreach (var p in view.Planets)
            {
                double d = (sys - p.Data.Position).magnitude;
                double lim = p.AtmoTop * 1.25 + 3000;
                if (d < lim) return "Pulse drive disengaged near " + p.Data.Name;
                // look ahead so we stop in time
                double ahead = Vector3d.Dot(p.Data.Position - sys, vSys.normalized);
                if (ahead > 0 && ahead < PulseSpeed * 1.2)
                {
                    Vector3d closest = sys + vSys.normalized * ahead;
                    if ((closest - p.Data.Position).magnitude < lim && d < lim + PulseSpeed * 1.2) return "Arriving at " + p.Data.Name;
                }
            }
            if (view.Station != null && (sys - view.Station.Data.Position).magnitude < 6000) return "Arriving at " + view.Station.Data.Name;
            foreach (var g in view.Giants)
                if ((sys - g.Data.Position).magnitude < g.Data.Radius * 1.4) return "Too close to " + g.Data.Name;
            if (sys.magnitude < view.Data.StarRadius * 3) return "Too close to the star";
            return null;
        }

        public void TogglePulse(SystemView view)
        {
            if (Pulsing || PulseSpooling) { DropOut(null); return; }
            if (InAtmosphere) { Message?.Invoke("The pulse drive only works in space."); return; }
            if (PulseFuel < 1f) { Message?.Invoke("Pulse engine needs fuel. Recharge it with Helium-3 (Tab)."); return; }
            string why = PulseBlocked(view);
            if (why != null) { Message?.Invoke("Too close to something to engage the pulse drive."); return; }
            PulseSpooling = true;
            PulseSpool = 0f;
        }

        void DropOut(string reason)
        {
            if (Pulsing && reason != null) DropOutReason = reason;
            Pulsing = false;
            PulseSpooling = false;
            Speed = Mathf.Min(Speed, 400f);
            Vel = (Vector3d)(Forward * Speed);
            Throttle = 0.6f;
        }

        void CollideSpace(SystemView view, float dt)
        {
            if (view.Station != null)
            {
                Vector3d sp = view.StationPosRef;
                Quaternion sr = view.StationRotRef;
                Vector3d rel = Pos - sp;
                if (rel.magnitude < 600)
                {
                    Vector3 local = Quaternion.Inverse(sr) * (Vector3)rel;
                    if (StationBody.Collide(local, 7f, out Vector3 push))
                    {
                        Pos += (Vector3d)(sr * push);
                        float spd = (float)Vel.magnitude;
                        Vel = Vel * -0.3;
                        Speed *= 0.3f;
                        if (spd > 15) Damage((spd - 15) * 0.8f, "impact");
                        Impact?.Invoke(spd);
                    }
                }
            }
            foreach (var f in view.Fields)
            {
                if (!f.Visible) continue;
                Vector3d c = view.SysToRef(f.Data.Position);
                Vector3d rel = Pos - c;
                if (rel.magnitude > f.Data.Radius + 400) continue;
                Quaternion inv = Quaternion.Inverse(f.Root.transform.rotation);
                Vector3 local = inv * (Vector3)rel;
                foreach (var k in f.Rocks)
                {
                    if (!k.Alive) continue;
                    Vector3 d = local - k.Pos;
                    float min = k.Radius * 0.85f + 6f;
                    if (d.sqrMagnitude > min * min) continue;
                    float m = d.magnitude;
                    Vector3 n = m > 1e-3f ? d / m : Vector3.up;
                    local = k.Pos + n * min;
                    Pos = c + (Vector3d)(f.Root.transform.rotation * local);
                    float spd = (float)Vel.magnitude;
                    Vel = (Vector3d)(f.Root.transform.rotation * Vector3.Reflect((Vector3)(Quaternion.Inverse(f.Root.transform.rotation) * (Vector3)Vel), n)) * 0.4;
                    Speed *= 0.4f;
                    if (Pulsing) DropOut("Collision");
                    if (spd > 20) Damage((spd - 20) * 0.6f, "impact");
                    Impact?.Invoke(spd);
                }
            }
        }

        // ───────────────────────────── landing ────────────────────────────
        void BeginLanding(PlanetBody planet)
        {
            State = ShipState.Landing;
            stateT = 0;
            Pulsing = false;
            PulseSpooling = false;
        }

        void TickLanding(float dt, PlanetBody planet)
        {
            if (planet == null) { State = ShipState.Flying; return; }
            Vector3d up = Pos.normalized;
            gearT = Mathf.MoveTowards(gearT, 1f, dt * 0.8f);
            // bleed off speed and sink
            Vector3d vTan = Vector3d.ProjectOnPlane(Vel, up) * Math.Exp(-dt * 1.8);
            double ground = planet.GroundHeight(up);
            double groundR = planet.Data.Radius + ground;
            double padFloor = LandingFloor(planet, Pos);
            if (padFloor > groundR) groundR = padFloor;
            double alt = Pos.magnitude - groundR - GearHeight;
            double sink = Math.Min(14.0, 1.5 + alt * 0.6);
            Vel = vTan - up * sink;
            Pos += Vel * dt;
            Speed = (float)Vel.magnitude;
            EngineLevel = Mathf.MoveTowards(EngineLevel, 0.35f, dt);
            // level out over the ground, keeping our heading
            Vector3 f = Vector3.ProjectOnPlane(Forward, (Vector3)up);
            if (f.sqrMagnitude < 1e-4f) f = Vector3.ProjectOnPlane(Rot * Vector3.up, (Vector3)up);
            var n = (Vector3)(planet.Field.Normal(up) * 0.5 + up * 0.5).normalized;
            Rot = Quaternion.Slerp(Rot, Quaternion.LookRotation(Vector3.ProjectOnPlane(f, n).normalized, n), dt * 2.5f);
            if (Pos.magnitude - groundR <= GearHeight + 0.05)
            {
                Pos = up * (groundR + GearHeight);
                if (planet.Data.HasSea && ground < planet.Data.SeaLevel - 1.0 && padFloor < 0)
                {
                    // there's no landing on water: hover and tell the player
                    Pos = up * (planet.Data.Radius + planet.Data.SeaLevel + 6.0);
                    State = ShipState.Flying;
                    Speed = 20f;
                    Message?.Invoke("You can't land on water.");
                    return;
                }
                State = ShipState.Landed;
                Vel = Vector3d.zero;
                Speed = 0;
                Throttle = 0.35f;
                LandedEvent?.Invoke();
            }
        }

        /// <summary>Landing pads raise the floor under the ship.</summary>
        public static double LandingFloor(PlanetBody planet, Vector3d pos)
        {
            double best = -1;
            if (planet.Pois == null) return best;
            foreach (var p in planet.Pois.Pois)
            {
                if (p.Type != PoiType.TradingPost) continue;
                if ((p.Pos - pos).magnitude > 40) continue;
                foreach (var b in p.Boxes)
                {
                    if (!b.Walkable) continue;
                    var local = Quaternion.Inverse(b.Rot) * (Vector3)(pos - b.Center);
                    if (Mathf.Abs(local.x) < b.Half.x && Mathf.Abs(local.z) < b.Half.z)
                        best = Math.Max(best, (b.Center + (Vector3d)(b.Rot * new Vector3(local.x, b.Half.y, local.z))).magnitude);
                }
            }
            return best;
        }

        /// <summary>Put the ship down at a spot on a planet (used on load and new game).</summary>
        public void PlaceLanded(PlanetBody planet, Vector3d dir, Vector3 facing)
        {
            dir = dir.normalized;
            double g = planet.GroundHeightExact(dir);
            Pos = dir * (planet.Data.Radius + g + GearHeight);
            var n = (Vector3)(planet.Field.Normal(dir) * 0.5 + dir * 0.5).normalized;
            Vector3 f = Vector3.ProjectOnPlane(facing, n);
            if (f.sqrMagnitude < 1e-6f) f = Vector3.ProjectOnPlane(Vector3.forward, n);
            Rot = Quaternion.LookRotation(f.normalized, n);
            State = ShipState.Landed;
            Vel = Vector3d.zero;
            Speed = 0;
            gearT = 1f;
        }

        // ───────────────────────────── docking ────────────────────────────
        public bool CanDock(SystemView view, out string why)
        {
            why = null;
            if (view.Station == null || State != ShipState.Flying) return false;
            double d = (Pos - view.StationPosRef).magnitude;
            if (d > 3500) return false;
            if (Pulsing) { why = "Drop out of pulse first"; return false; }
            return true;
        }

        public void BeginDocking(SystemView view)
        {
            State = ShipState.Docking;
            dockStage = 0;
            stateT = 0;
            Pulsing = false;
            PulseSpooling = false;
            SetupAutoLeg(view);
        }

        public void BeginUndocking(SystemView view)
        {
            State = ShipState.Undocking;
            dockStage = 0;
            stateT = 0;
            SetupAutoLeg(view);
        }

        Vector3d StationPoint(SystemView view, Vector3 local) => view.StationPosRef + (Vector3d)(view.StationRotRef * local);

        void SetupAutoLeg(SystemView view)
        {
            stateT = 0;
            var sr = view.StationRotRef;
            Vector3 entry = new Vector3(0, 0, 170f);
            Vector3 pad = new Vector3(0, -12.8f + GearHeight, 40f);
            Quaternion inward = sr * Quaternion.Euler(0, 180f, 0);
            Quaternion outward = sr;
            autoFrom = Pos;
            autoRotFrom = Rot;
            if (State == ShipState.Docking)
            {
                if (dockStage == 0) { autoTo = StationPoint(view, entry); autoRotTo = inward; autoDuration = Mathf.Clamp((float)(autoTo - Pos).magnitude / 180f, 2.5f, 20f); }
                else if (dockStage == 1) { autoTo = StationPoint(view, pad + new Vector3(0, 4f, 0)); autoRotTo = inward; autoDuration = 5.5f; }
                else { autoTo = StationPoint(view, pad); autoRotTo = inward; autoDuration = 2f; }
            }
            else
            {
                if (dockStage == 0) { autoTo = StationPoint(view, pad + new Vector3(0, 5f, 0)); autoRotTo = inward; autoDuration = 1.6f; }
                else if (dockStage == 1) { autoTo = StationPoint(view, pad + new Vector3(0, 5f, 0)); autoRotTo = outward; autoDuration = 2.4f; }
                else { autoTo = StationPoint(view, entry + new Vector3(0, 0, 250f)); autoRotTo = outward; autoDuration = 4.5f; }
            }
        }

        void TickAuto(float dt, SystemView view)
        {
            float t = Mathf.Clamp01(stateT / autoDuration);
            float e = t * t * (3 - 2 * t);
            Vector3d prev = Pos;
            Pos = Vector3d.Lerp(autoFrom, autoTo, e);
            Rot = Quaternion.Slerp(autoRotFrom, autoRotTo, Mathf.Clamp01(t * 1.6f));
            Vel = (Pos - prev) / Math.Max(dt, 1e-4);
            Speed = (float)Vel.magnitude;
            EngineLevel = 0.4f;
            gearT = State == ShipState.Docking && dockStage >= 1 ? Mathf.MoveTowards(gearT, 1f, dt) : Mathf.MoveTowards(gearT, 0f, dt);
            if (t < 1f) return;
            dockStage++;
            if (dockStage >= 3)
            {
                if (State == ShipState.Docking)
                {
                    State = ShipState.Docked;
                    Vel = Vector3d.zero;
                    Speed = 0;
                    Docked?.Invoke();
                }
                else
                {
                    State = ShipState.Flying;
                    Speed = 120f;
                    Throttle = 0.4f;
                    Vel = (Vector3d)(Forward * Speed);
                    Undocked?.Invoke();
                }
                return;
            }
            SetupAutoLeg(view);
        }

        /// <summary>Keeps a docked ship glued to the (moving) station pad.</summary>
        public void HoldDocked(SystemView view)
        {
            Pos = StationPoint(view, new Vector3(0, -12.8f + GearHeight, 40f));
            Rot = view.StationRotRef * Quaternion.Euler(0, 180f, 0);
        }

        // ───────────────────────────── health ─────────────────────────────
        public void Damage(float amount, string cause)
        {
            LastDamageTime = Time.time;
            float shieldMul = 1f / (1f + 0.4f * Profile.Level("ship_shield"));
            float absorbed = Mathf.Min(Shield, amount * shieldMul);
            Shield -= absorbed;
            float rest = amount - absorbed / shieldMul;
            if (rest > 0) Hull = Mathf.Max(0f, Hull - rest);
        }

        // ───────────────────────────── visuals ────────────────────────────
        public void UpdateVisual(SystemView view, bool hideForCockpit)
        {
            var t = Go.transform;
            t.position = view.ToUnity(Pos);
            t.rotation = Rot;
            if (gear != null)
            {
                gear.gameObject.SetActive(gearT > 0.02f);
                gear.localScale = new Vector3(1f, Mathf.Lerp(0.2f, 1f, gearT), 1f);
            }
            float flame = State == ShipState.Landed || State == ShipState.Docked ? 0f : EngineLevel;
            float len = 1.5f + flame * 6f + (Boosting ? 5f : 0f) + (Pulsing ? 12f : 0f);
            foreach (var f in flames)
            {
                f.gameObject.SetActive(flame > 0.02f);
                f.localScale = new Vector3(0.9f, 0.9f, len * (0.9f + 0.2f * Mathf.PerlinNoise(Time.time * 20f, f.localPosition.x)));
            }
            flameMat.SetVector("_Color", (Vector4)(new Color(0.45f, 0.75f, 1f).linear * (1.5f + flame * 4f)));
            glowMat.SetVector("_Emission", (Vector4)(new Color(0.35f, 0.8f, 1f).linear * (1.5f + EngineLevel * 6f)));
        }

        /// <summary>The ship as boxes you can walk into when it's parked.</summary>
        public void AddObstacles(List<BoxObstacle> boxes)
        {
            if (State != ShipState.Landed) return;
            boxes.Add(new BoxObstacle { Center = Pos + (Vector3d)(Rot * new Vector3(0, 0.3f, -0.2f)), Rot = Rot, Half = new Vector3(2.0f, 1.0f, 7.2f), Walkable = true });
            boxes.Add(new BoxObstacle { Center = Pos + (Vector3d)(Rot * new Vector3(0, 0.1f, 1.9f)), Rot = Rot, Half = new Vector3(5.8f, 0.3f, 2.4f), Walkable = true });
        }

        public void Recolor(Color hull, Color accent)
        {
            livery.Hull = hull;
            livery.Accent = accent;
            livery.Pick("Hull").SetColor("_Color", hull);
            livery.Pick("HullAccent").SetColor("_Color", accent);
        }
    }
}

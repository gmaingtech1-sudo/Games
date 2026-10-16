using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>Walking, sprinting, jumping, jetpacking and swimming on a
    /// planet. Positions are in the planet's own (rotating) frame, so "up" is
    /// simply away from the planet's centre.</summary>
    public sealed class PlayerController
    {
        public Vector3d Pos, Vel;
        public Quaternion Body = Quaternion.identity;
        public float Pitch;
        public bool Grounded, Swimming, Sprinting, Jetting, Moving;
        public float Jetpack = 1f, Stamina = 1f;
        public float Bob;
        public float FallImpact;
        public const float EyeHeight = 1.68f;
        public const float Radius = 0.38f;
        public const float Height = 1.8f;

        float bobPhase;
        float stepTimer;
        float jumpCooldown;
        readonly List<Obstacle> cylinders = new List<Obstacle>();
        readonly List<BoxObstacle> boxes = new List<BoxObstacle>();

        public event Action Footstep;
        public event Action<float> Landed;   // impact speed
        public event Action Splash;

        public Vector3d Up => Pos.normalized;
        public Vector3d EyePos => Pos + Up * (EyeHeight + Bob);
        public Quaternion ViewRotation => Body * Quaternion.Euler(Pitch, 0, 0);
        public Vector3 Forward => Body * Vector3.forward;

        public void Place(Vector3d pos, Vector3 facing)
        {
            Pos = pos;
            Vel = Vector3d.zero;
            Vector3 up = (Vector3)pos.normalized;
            Vector3 f = Vector3.ProjectOnPlane(facing, up);
            if (f.sqrMagnitude < 1e-6f) f = Vector3.ProjectOnPlane(Vector3.forward, up);
            if (f.sqrMagnitude < 1e-6f) f = Vector3.ProjectOnPlane(Vector3.right, up);
            Body = Quaternion.LookRotation(f.normalized, up);
            Pitch = 0;
        }

        public void Tick(float dt, PlanetBody planet, bool controls, ShipController ship)
        {
            var data = planet.Data;
            Vector3d up = Up;
            // keep the body upright as we walk around the planet
            Vector3 curUp = Body * Vector3.up;
            Body = Quaternion.FromToRotation(curUp, (Vector3)up) * Body;
            if (controls)
            {
                Vector2 md = GameInput.MouseDelta;
                Body = Quaternion.AngleAxis(md.x * 2.2f, (Vector3)up) * Body;
                Pitch = Mathf.Clamp(Pitch - md.y * 2.2f, -88f, 88f);
            }
            Body = Quaternion.LookRotation(Vector3.ProjectOnPlane(Body * Vector3.forward, (Vector3)up).normalized, (Vector3)up);

            Vector2 mv = controls ? GameInput.Move : Vector2.zero;
            Moving = mv.sqrMagnitude > 0.01f;
            Sprinting = controls && Moving && mv.y > 0.1f && GameInput.Key(KeyCode.LeftShift) && Stamina > 0.05f && !Swimming;
            if (Sprinting) Stamina = Mathf.Max(0f, Stamina - dt / 9f);
            else Stamina = Mathf.Min(1f, Stamina + dt / 5f);

            double groundR = data.Radius + planet.GroundHeight(up);
            double alt = Pos.magnitude - groundR;
            double sea = data.HasSea ? data.Radius + data.SeaLevel : double.MinValue;
            Swimming = data.HasSea && !data.SeaIsLava && !data.SeaIsIce && Pos.magnitude + 1.2 < sea;
            bool wasGrounded = Grounded;
            Grounded = alt <= 0.06 && Vector3d.Dot(Vel, up) <= 0.6;

            Vector3 fwd = Body * Vector3.forward, right = Body * Vector3.right;
            float speed = Swimming ? 3.2f : Sprinting ? 9.5f : 5.2f;
            Vector3 wish3 = (fwd * mv.y + right * mv.x);
            if (wish3.sqrMagnitude > 1f) wish3.Normalize();
            Vector3d wish = (Vector3d)(wish3 * speed);

            double vUp = Vector3d.Dot(Vel, up);
            Vector3d vTan = Vel - up * vUp;
            double accel = Grounded ? 42 : Swimming ? 10 : 7;
            vTan = MoveTowards(vTan, wish, accel * dt);
            if (Grounded && !Moving) vTan *= Math.Max(0, 1 - dt * 12);

            jumpCooldown -= dt;
            Jetting = false;
            double g = data.Gravity;
            float jetBoost = 1f + 0.35f * Profile.Level("suit_jet");
            if (Swimming)
            {
                double target = controls && GameInput.Key(KeyCode.Space) ? 2.8 : controls && GameInput.Key(KeyCode.LeftControl) ? -2.5 : -0.4;
                // float up to the surface when near it
                if (Pos.magnitude + 1.2 > sea - 0.3 && target < 0.1) target = Math.Min(target + 0.8, 0.3);
                vUp += (target - vUp) * Math.Min(1, dt * 3);
                Jetpack = Mathf.Min(1f, Jetpack + dt * 0.3f);
            }
            else if (Grounded)
            {
                vUp = 0;
                if (controls && GameInput.Down(KeyCode.Space) && jumpCooldown <= 0f)
                {
                    vUp = 5.6;
                    jumpCooldown = 0.3f;
                    Grounded = false;
                }
                Jetpack = Mathf.Min(1f, Jetpack + dt * 0.45f);
            }
            else
            {
                vUp -= g * dt;
                if (controls && GameInput.Key(KeyCode.Space) && Jetpack > 0f && jumpCooldown <= 0.1f)
                {
                    Jetting = true;
                    vUp += (g + 12.0 * jetBoost) * dt;
                    vUp = Math.Min(vUp, 8.5 * jetBoost);
                    vTan += (Vector3d)(fwd * (5f * dt * jetBoost));
                    Jetpack = Mathf.Max(0f, Jetpack - dt / (4.5f * jetBoost));
                }
            }
            Vel = vTan + up * vUp;
            Pos += Vel * dt;

            // bump into trees, rocks, buildings and the ship
            cylinders.Clear();
            boxes.Clear();
            planet.Flora?.Obstacles(Pos, 4, cylinders);
            planet.Pois?.Obstacles(Pos, 4, boxes, cylinders);
            if (ship != null) ship.AddObstacles(boxes);
            Collision.ResolveCylinders(ref Pos, up, Radius, Height, cylinders);
            double floorR = Collision.ResolveBoxes(ref Pos, up, Radius, Height, boxes, out _);

            // stand on the ground (or on a platform)
            up = Up;
            groundR = data.Radius + planet.GroundHeight(up);
            if (floorR > groundR) groundR = floorR;
            double r = Pos.magnitude;
            if (r < groundR)
            {
                double impact = -Vector3d.Dot(Vel, up);
                Pos = up * groundR;
                if (impact > 0) Vel += up * impact;
                if (!wasGrounded && impact > 2.5)
                {
                    FallImpact = (float)impact;
                    Landed?.Invoke((float)impact);
                }
                Grounded = true;
            }
            else if (wasGrounded && r - groundR < 0.35 && vUp <= 0.1)
            {
                // stick to the ground walking down slopes
                Pos = up * groundR;
                Grounded = true;
            }

            // slide off very steep slopes
            if (Grounded && floorR < 0)
            {
                var n = planet.Field.Normal(up);
                double steep = Vector3d.Dot(n, up);
                if (steep < 0.62)
                {
                    Vector3d downhill = Vector3d.ProjectOnPlane(-up, n).normalized;
                    Vel += downhill * (g * (0.62 - steep) * 3.0 * dt);
                }
            }

            // water entry
            bool swimNow = data.HasSea && !data.SeaIsLava && !data.SeaIsIce && Pos.magnitude + 1.2 < sea;
            if (swimNow && !Swimming && Vector3d.Dot(Vel, up) < -2) Splash?.Invoke();

            // head bob and footsteps
            float hspeed = (float)vTan.magnitude;
            if (Grounded && hspeed > 0.6f)
            {
                bobPhase += dt * hspeed * 1.9f;
                Bob = Settings.HeadBob ? Mathf.Abs(Mathf.Sin(bobPhase)) * 0.045f * Mathf.Clamp01(hspeed / 6f) : 0f;
                stepTimer -= dt * hspeed;
                if (stepTimer <= 0f)
                {
                    stepTimer = 1.6f;
                    Footstep?.Invoke();
                }
            }
            else Bob = Mathf.Lerp(Bob, 0f, dt * 8f);
        }

        static Vector3d MoveTowards(Vector3d a, Vector3d b, double maxDelta)
        {
            Vector3d d = b - a;
            double m = d.magnitude;
            if (m <= maxDelta || m < 1e-9) return b;
            return a + d / m * maxDelta;
        }
    }
}

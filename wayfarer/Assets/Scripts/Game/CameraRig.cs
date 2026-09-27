using UnityEngine;

namespace Wayfarer
{
    /// <summary>Where the camera is and where it looks: first person on foot,
    /// a chase or cockpit view in the ship, an orbit view when parked, and a
    /// slow drift for the title screen.</summary>
    public sealed class CameraRig
    {
        public Vector3d RefPos;
        public Quaternion Rot = Quaternion.identity;
        public float Fov = 75f;
        public bool Cockpit;
        public float Shake;
        Quaternion lag = Quaternion.identity;
        bool lagInit;
        float orbitYaw = 200f, orbitPitch = 12f, orbitDist = 26f;
        float titleT;

        public void ResetLag() => lagInit = false;

        public void ConvertFrame(PlanetBody from, PlanetBody to)
        {
            var m = SystemView.Convert(new SystemView.Motion { Pos = RefPos, Vel = Vector3d.zero, Rot = lag }, from, to);
            lag = m.Rot;
            RefPos = m.Pos;
        }

        public void Update(float dt, Game g)
        {
            float baseFov = Settings.Fov;
            switch (g.Mode)
            {
                case PlayerMode.OnFoot:
                {
                    var p = g.Player;
                    RefPos = p.EyePos;
                    Rot = p.ViewRotation;
                    Fov = Mathf.Lerp(Fov, baseFov + (p.Sprinting ? 6f : 0f), dt * 5f);
                    break;
                }
                case PlayerMode.InShip:
                case PlayerMode.Docked:
                    UpdateShip(dt, g, baseFov);
                    break;
            }
            if (Shake > 0f)
            {
                Shake = Mathf.MoveTowards(Shake, 0f, dt * 2.5f);
                float s = Shake * Shake;
                Rot = Rot * Quaternion.Euler(Random.Range(-1f, 1f) * s * 1.5f, Random.Range(-1f, 1f) * s * 1.5f, Random.Range(-1f, 1f) * s);
            }
        }

        void UpdateShip(float dt, Game g, float baseFov)
        {
            var ship = g.Ship;
            if (!lagInit) { lag = ship.Rot; lagInit = true; }
            bool parked = ship.State == ShipState.Landed || ship.State == ShipState.Docked;
            if (Cockpit && !parked)
            {
                RefPos = ship.CockpitPos;
                Rot = ship.Rot;
                Fov = Mathf.Lerp(Fov, baseFov + Mathf.Clamp(ship.Speed / 60f, 0f, 12f) + (ship.Pulsing ? 12f : 0f), dt * 3f);
                lag = ship.Rot;
                return;
            }
            if (parked)
            {
                // free orbit around the parked ship
                Vector2 md = g.Mode == PlayerMode.Docked ? Vector2.zero : GameInput.MouseDelta;
                orbitYaw += md.x * 2.5f;
                orbitPitch = Mathf.Clamp(orbitPitch - md.y * 2.5f, -5f, 70f);
                if (g.Mode == PlayerMode.Docked) orbitYaw += dt * 6f;
                orbitDist = Mathf.Clamp(orbitDist - GameInput.Scroll * 2f, 14f, 60f);
                Vector3 up = ship.Rot * Vector3.up;
                var q = ship.Rot * Quaternion.Euler(orbitPitch, orbitYaw, 0);
                Vector3 off = q * new Vector3(0, 0, -orbitDist) + up * 2.5f;
                RefPos = ship.Pos + (Vector3d)off;
                Rot = Quaternion.LookRotation(-off.normalized + up * 0.08f, up);
                KeepAboveGround(g);
                Fov = Mathf.Lerp(Fov, baseFov, dt * 3f);
                lag = ship.Rot;
                return;
            }
            // chase camera with a little lag so turns feel weighty
            float follow = ship.Pulsing ? 6f : 4.5f;
            lag = Quaternion.Slerp(lag, ship.Rot, 1f - Mathf.Exp(-follow * dt));
            float back = 17f + Mathf.Clamp(ship.Speed / 40f, 0f, 6f);
            Vector3 offset = lag * new Vector3(0, 4.2f, -back);
            RefPos = ship.Pos + (Vector3d)offset;
            Vector3 lookAt = ship.Forward * 30f;
            Rot = Quaternion.LookRotation((lookAt - offset).normalized, lag * Vector3.up);
            KeepAboveGround(g);
            float spd = ship.Pulsing ? 22f : Mathf.Clamp(ship.Speed / 25f, 0f, 14f) + (ship.Boosting ? 6f : 0f);
            Fov = Mathf.Lerp(Fov, baseFov + spd, dt * 2.5f);
            if (ship.Pulsing) Shake = Mathf.Max(Shake, 0.15f);
        }

        void KeepAboveGround(Game g)
        {
            var planet = g.View.Ref;
            if (planet == null) return;
            Vector3d up = RefPos.normalized;
            double min = planet.Data.Radius + planet.GroundHeight(up) + 1.5;
            if (planet.Data.HasSea && !planet.Data.SeaIsLava) min = System.Math.Max(min, planet.Data.Radius + planet.Data.SeaLevel + 1.0);
            if (RefPos.magnitude < min) RefPos = up * min;
        }

        /// <summary>A slow cinematic orbit used behind the title screen.</summary>
        public void UpdateTitle(float dt, Game g)
        {
            titleT += dt;
            var view = g.View;
            var planet = view.Planets[0];
            foreach (var p in view.Planets) if (p.Data.Type == PlanetType.Lush) { planet = p; break; }
            Vector3d c = view.PlanetCenterRef(planet);
            double r = planet.Data.Radius * 2.6;
            double a = titleT * 0.012 + 0.6;
            Vector3d sunDir = (view.SysToRef(Vector3d.zero) - c).normalized;
            Vector3d side = Vector3d.Cross(sunDir, Vector3d.up).normalized;
            Vector3d pos = c + (sunDir * System.Math.Cos(a) * 0.55 + side * System.Math.Sin(a) + Vector3d.up * 0.25).normalized * r;
            RefPos = pos;
            Vector3 look = (Vector3)(c - pos + side * planet.Data.Radius * 0.9);
            Rot = Quaternion.LookRotation(look.normalized, Vector3.up);
            Fov = 55f;
        }

        public void Apply(Camera cam, SystemView view, Game g)
        {
            cam.transform.position = view.ToUnity(RefPos);
            cam.transform.rotation = Rot;
            cam.fieldOfView = Fov;
            bool onFoot = g.Mode == PlayerMode.OnFoot && g.State != GameState.Title;
            float near = onFoot ? 0.06f : 0.35f;
            if (view.Ref == null || g.Mode == PlayerMode.InShip && g.Ship.Altitude > 3000f) near = 2f;
            if (g.Mode == PlayerMode.Docked) near = 0.35f;
            cam.nearClipPlane = near;
            cam.farClipPlane = 420000f;
        }
    }
}

using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    public enum ToolMode { Mining, Blaster }

    /// <summary>The hand-held multi-tool: mining beam, blaster, analysis visor
    /// (scan animals, plants and minerals) and the resource scanner pulse.</summary>
    public sealed class MultiTool
    {
        public ToolMode Mode = ToolMode.Mining;
        public bool Visor;
        public float Heat;
        public bool Overheated;
        public bool Firing;
        public float ScanProgress;
        public string ScanName, ScanInfo;
        public object ScanTarget;
        public Vector3d ScanPoint;
        public float MineProgress;
        public string MineLabel;
        public float ScannerCooldown;
        public float BeamTime;
        public Vector3d BeamEnd;
        public bool BeamHit;
        public readonly List<(Vector3d pos, FloraSpecies species)> Revealed = new List<(Vector3d, FloraSpecies)>();
        public float RevealTimer;

        readonly GameObject view;
        readonly Transform muzzle;
        Vector3 sway;
        float recoil, blasterCooldown;
        FloraHit lastHit;
        bool hadHit;

        public MultiTool(Transform camera)
        {
            var livery = new Livery
            {
                Hull = new Color(0.8f, 0.8f, 0.82f),
                Accent = new Color(0.95f, 0.55f, 0.15f),
                Dark = new Color(0.1f, 0.1f, 0.12f),
                Glow = new Color(0.4f, 0.9f, 1f),
                GlowIntensity = 3f,
            };
            view = Models.Spawn("multitool", camera, livery.Pick, false);
            view.transform.localPosition = new Vector3(0.24f, -0.21f, 0.42f);
            view.transform.localRotation = Quaternion.Euler(-2f, -4f, 0f);
            muzzle = Models.Find(view.transform, "Muzzle");
            foreach (var r in view.GetComponentsInChildren<Renderer>()) r.receiveShadows = false;
        }

        public void SetVisible(bool v)
        {
            if (view.activeSelf != v) view.SetActive(v);
        }

        public Vector3 MuzzleWorld => muzzle != null ? muzzle.position : view.transform.position;

        public void Tick(float dt, Game g, bool controls)
        {
            var planet = g.View.Ref;
            ScannerCooldown -= dt;
            blasterCooldown -= dt;
            RevealTimer -= dt;
            if (RevealTimer <= 0f) Revealed.Clear();
            Firing = false;
            MineProgress = 0f;
            MineLabel = null;
            BeamTime -= dt;

            if (controls)
            {
                if (GameInput.AnyDown(KeyCode.Q, KeyCode.Alpha1, KeyCode.Alpha2))
                {
                    Mode = Mode == ToolMode.Mining ? ToolMode.Blaster : ToolMode.Mining;
                    g.Audio.Play(Sfx.Switch);
                }
                if (GameInput.Down(KeyCode.F))
                {
                    Visor = !Visor;
                    g.Audio.Play(Visor ? Sfx.VisorOn : Sfx.VisorOff);
                }
                if (GameInput.Down(KeyCode.C) && ScannerCooldown <= 0f) Pulse(g);
            }

            Vector3d eye = g.Rig.RefPos;
            Vector3d dir = (Vector3d)(g.Rig.Rot * Vector3.forward);

            if (Visor)
            {
                UpdateScan(dt, g, eye, dir, controls);
            }
            else if (Mode == ToolMode.Mining)
            {
                bool want = controls && GameInput.Fire && !Overheated && Profile.Data.ToolCharge > 0f;
                if (want) Mine(dt, g, eye, dir);
            }
            else
            {
                if (controls && GameInput.Fire && blasterCooldown <= 0f && !Overheated)
                {
                    blasterCooldown = 0.22f;
                    Heat += 0.085f;
                    recoil = 1f;
                    Vector3d from = eye + dir * 0.6 + (Vector3d)(g.Rig.Rot * new Vector3(0.18f, -0.15f, 0f));
                    g.Combat.FireBlaster(from, dir);
                    g.Audio.Play(Sfx.Blaster);
                }
            }

            if (!Firing) Heat = Mathf.Max(0f, Heat - dt * (Overheated ? 0.45f : 0.3f));
            if (Heat >= 1f && !Overheated) { Overheated = true; g.Audio.Play(Sfx.Overheat); }
            if (Overheated && Heat <= 0.25f) Overheated = false;

            // weapon sway and recoil
            Vector2 md = GameInput.MouseDelta;
            sway = Vector3.Lerp(sway, new Vector3(-md.x, -md.y, 0) * 0.004f, dt * 8f);
            recoil = Mathf.MoveTowards(recoil, 0f, dt * 6f);
            float bob = g.Player.Bob;
            view.transform.localPosition = new Vector3(0.24f, -0.21f - bob * 0.6f, 0.42f - recoil * 0.05f) + sway;
            view.transform.localRotation = Quaternion.Euler(-2f - recoil * 6f + (Firing ? Random.Range(-0.4f, 0.4f) : 0f), -4f, 0f);
        }

        void Mine(float dt, Game g, Vector3d eye, Vector3d dir)
        {
            var planet = g.View.Ref;
            Firing = true;
            Heat += dt * 0.16f;
            Profile.Data.ToolCharge = Mathf.Max(0f, Profile.Data.ToolCharge - dt * 0.55f);
            double range = 32;
            BeamEnd = eye + dir * range;
            BeamHit = false;
            BeamTime = 0.05f;
            float power = 1f + 0.4f * Profile.Level("tool_mining");
            if (planet?.Flora != null && planet.Flora.Raycast(eye, dir, range, out FloraHit hit))
            {
                BeamEnd = hit.Point;
                BeamHit = true;
                bool same = hadHit && lastHit.Cell == hit.Cell && lastHit.Index == hit.Index;
                lastHit = hit;
                hadHit = true;
                bool broke = planet.Flora.Mine(hit, dt * power);
                MineProgress = planet.Flora.MineProgress(hit);
                MineLabel = hit.Species.Resource != null ? Items.Get(hit.Species.Resource).Name : hit.Species.Name;
                if (Random.value < dt * 30f)
                    g.Effects.Sparks(g.View.ToUnity(hit.Point), (Vector3)(eye - hit.Point).normalized, ResourceColor(hit.Species), 2, 4f);
                if (broke)
                {
                    float sc = planet.Flora.InstanceScale(hit);
                    var sp = hit.Species;
                    if (sp.Resource != null)
                    {
                        int n = Mathf.RoundToInt(Random.Range(sp.YieldMin, sp.YieldMax + 1) * Mathf.Clamp(sc, 0.6f, 2f) * (1f + 0.25f * Profile.Level("tool_mining")));
                        g.Collect(sp.Resource, n);
                        g.Combat.OnResourceMined(planet, n);
                    }
                    g.Effects.Burst(g.View.ToUnity(hit.Point), ResourceColor(sp) * 0.5f, 0.6f * sc, 10, 2f);
                    g.Audio.Play(Sfx.Break);
                    if (sp.Kind == FloraKind.Rock || sp.Kind == FloraKind.Deposit)
                        g.Effects.Dust(g.View.ToUnity(planet.Flora.InstancePos(hit)), (Vector3)hit.Point.normalized, planet.Data.Stone, 1.2f * sc);
                    hadHit = false;
                }
                return;
            }
            hadHit = false;
            // the beam also hurts drones (and annoys them)
            foreach (var d in g.Combat.Drones)
            {
                if (MathUtil.RaySphere(eye, dir, d.Pos, 1.3, out double t0, out double t1) && t0 > 0 && t0 < range)
                {
                    BeamEnd = eye + dir * t0;
                    BeamHit = true;
                    d.Health -= dt * 12f;
                    g.Combat.AddWanted(dt * 0.5f, planet);
                    return;
                }
            }
            // or the ground
            if (planet != null)
            {
                for (double t = 1; t < range; t += 1.0)
                {
                    Vector3d p = eye + dir * t;
                    Vector3d up = p.normalized;
                    if (p.magnitude < planet.Data.Radius + planet.GroundHeight(up))
                    {
                        BeamEnd = p;
                        BeamHit = true;
                        if (Random.value < dt * 20f) g.Effects.Sparks(g.View.ToUnity(p), (Vector3)up, new Color(1f, 0.7f, 0.4f), 1, 3f);
                        break;
                    }
                }
            }
        }

        static Color ResourceColor(FloraSpecies s)
        {
            var def = s.Resource != null ? Items.Get(s.Resource) : null;
            return def != null ? def.Color : new Color(1f, 0.8f, 0.5f);
        }

        void UpdateScan(float dt, Game g, Vector3d eye, Vector3d dir, bool controls)
        {
            var planet = g.View.Ref;
            object target = null;
            string name = null, info = null;
            Vector3d point = eye + dir * 20;
            if (planet?.Fauna != null)
            {
                var c = planet.Fauna.Raycast(eye, dir, 90, out double d);
                if (c != null)
                {
                    target = c.Species;
                    bool known = Profile.IsDiscovered(c.Species.DiscoveryId);
                    name = known ? c.Species.Name : "Unknown creature";
                    info = known ? c.Species.Description : "Hold the left mouse button to scan";
                    point = eye + dir * d;
                }
            }
            if (target == null && planet?.Flora != null && planet.Flora.Raycast(eye, dir, 60, out FloraHit hit))
            {
                var s = hit.Species;
                if (s.Scannable)
                {
                    string kind = s.Kind == FloraKind.Deposit || s.Kind == FloraKind.Crystal ? "Mineral" : "Flora";
                    bool known = Profile.IsDiscovered(s.DiscoveryId);
                    target = s;
                    name = known ? s.Name : "Unknown " + kind.ToLowerInvariant();
                    string res = s.Resource != null ? "Contains " + Items.Get(s.Resource).Name : "";
                    info = known ? res : "Hold the left mouse button to scan";
                    point = hit.Point;
                }
            }
            if (target != ScanTarget) ScanProgress = 0f;
            ScanTarget = target;
            ScanName = name;
            ScanInfo = info;
            ScanPoint = point;
            if (target == null) return;
            bool discovered = target is CreatureSpecies cs ? Profile.IsDiscovered(cs.DiscoveryId) : Profile.IsDiscovered(((FloraSpecies)target).DiscoveryId);
            if (!discovered && controls && GameInput.Fire)
            {
                ScanProgress += dt / 1.4f;
                if (ScanProgress >= 1f)
                {
                    ScanProgress = 0f;
                    if (target is CreatureSpecies sp) g.DiscoverFauna(sp);
                    else g.DiscoverFlora((FloraSpecies)target);
                }
            }
            else if (!GameInput.Fire) ScanProgress = Mathf.Max(0f, ScanProgress - dt * 2f);
        }

        void Pulse(Game g)
        {
            ScannerCooldown = 5f;
            var planet = g.View.Ref;
            g.Audio.Play(Sfx.Scanner);
            Vector3 up = planet != null ? (Vector3)g.Player.Up : Vector3.up;
            g.Effects.ScannerPulse(g.View.ToUnity(g.Player.Pos), 240f, new Color(0.4f, 0.9f, 1f));
            if (planet == null) return;
            planet.Flora?.Resources(g.Player.Pos, 250, Revealed);
            RevealTimer = 25f;
            int found = 0;
            if (planet.Pois != null)
            {
                foreach (var p in planet.Pois.Pois)
                {
                    if ((p.Pos - g.Player.Pos).magnitude < 3500 && !p.Known)
                    {
                        Profile.MarkKnown(p.Id);
                        found++;
                    }
                }
            }
            g.Toast(found > 0 ? $"Scanner: {Revealed.Count} resources nearby, {found} new location{(found == 1 ? "" : "s")} marked" : $"Scanner: {Revealed.Count} resources nearby");
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>The whole interface, drawn with IMGUI at a 1080p reference size.</summary>
    public sealed partial class GameUI : MonoBehaviour
    {
        Game g => Game.I;
        float W, H = 1080f, scale = 1f;
        public bool Capturing;
        public bool Modal => loreOpen;
        string loreTitle, loreText;
        int loreUnits;
        bool loreOpen;
        int menuPage;     // 0 main, 1 settings, 2 controls
        float titleFade;

        public void ShowLore(string title, string text, int units)
        {
            loreTitle = title;
            loreText = text;
            loreUnits = units;
            loreOpen = true;
        }

        void OnGUI()
        {
            if (g == null) return;
            UIKit.Init();
            scale = Screen.height / 1080f;
            W = Screen.width / scale;
            GUI.matrix = Matrix4x4.TRS(Vector3.zero, Quaternion.identity, new Vector3(scale, scale, 1f));
            GUI.skin.font = UIKit.Font;
            Capturing = false;

            switch (g.State)
            {
                case GameState.Title: DrawTitle(); break;
                case GameState.Loading: DrawLoading(); break;
                case GameState.Playing: DrawHud(); break;
                case GameState.Paused: DrawHud(); DrawPause(); break;
                case GameState.Inventory: DrawInventory(); break;
                case GameState.Map: DrawMap(); break;
                case GameState.Log: DrawLog(); break;
                case GameState.Station: DrawStation(); break;
                case GameState.Trade: DrawTrade(); break;
                case GameState.Dead: DrawDeath(); break;
                case GameState.Warping: DrawWarp(); break;
            }
            if (loreOpen) DrawLore();
            if (GameInput.InputBroken)
                UIKit.Text(new Rect(20, H - 70, W - 40, 60), "Input is disabled: Wayfarer uses Unity's classic Input Manager. Set Edit > Project Settings > Player > Active Input Handling to \"Both\" and restart Unity.", UIKit.Label, UIKit.Danger);
            if (Settings.ShowFps) UIKit.Text(new Rect(W - 120, 8, 110, 24), $"{g.Fps:F0} fps", UIKit.LabelSmall);
        }

        // ───────────────────────────── HUD ────────────────────────────────
        void DrawHud()
        {
            DrawMarkers();
            DrawWorldInfo();
            DrawToasts();
            DrawGoal();
            if (g.Mode == PlayerMode.OnFoot) DrawFootHud();
            else DrawShipHud();
            if (!string.IsNullOrEmpty(g.Prompt))
            {
                string key = g.Prompt.Contains("(") ? "" : "<b>E</b>   ";
                var r = new Rect(W / 2 - 260, H * 0.62f, 520, 34);
                UIKit.PanelBox(r, 0.85f);
                UIKit.Text(r, key + g.Prompt, UIKit.LabelCenter, UIKit.Ink);
            }
            if (!string.IsNullOrEmpty(g.Survival.Warning) && Mathf.Repeat(Time.unscaledTime, 1f) < 0.65f)
                UIKit.Text(new Rect(W / 2 - 300, H * 0.25f, 600, 40), g.Survival.Warning, UIKit.LabelCenter, UIKit.Danger);
            if (g.Combat.Wanted >= 1f && g.View.Ref != null)
            {
                string stars = new string('◆', Mathf.Clamp(Mathf.FloorToInt(g.Combat.Wanted), 1, 3));
                UIKit.Text(new Rect(W / 2 - 200, 64, 400, 30), "SENTINELS ALERTED  " + stars, UIKit.LabelCenter, UIKit.Danger);
            }
        }

        void DrawWorldInfo()
        {
            var view = g.View;
            var p = view.Ref;
            float x = 28, y = 22;
            if (p != null && (g.Mode == PlayerMode.OnFoot || g.Ship.Altitude < 5000))
            {
                var d = p.Data;
                UIKit.Text(new Rect(x, y, 600, 34), d.Name.ToUpperInvariant(), UIKit.LabelBig);
                string temp = $"{g.Survival.Temperature:F0}°C";
                Color hz = d.Hazard == HazardType.None || d.HazardLevel < 0.05 ? UIKit.Dim : d.HazardLevel > 0.6 ? UIKit.Danger : UIKit.Warm;
                UIKit.Text(new Rect(x, y + 32, 700, 24), $"{d.TypeLabel}  ·  {temp}  ·  <color=#{UIKit.Hex(hz)}>{d.HazardLabel}</color>", UIKit.LabelSmall);
                UIKit.Text(new Rect(x, y + 54, 700, 24), $"{view.Data.Star.Name}  ·  {DayTime(p)}", UIKit.LabelTiny);
            }
            else
            {
                UIKit.Text(new Rect(x, y, 600, 34), view.Data.Star.Name.ToUpperInvariant(), UIKit.LabelBig);
                var near = view.NearestPlanet(g.Ship.Pos, out double dist);
                string where = near != null ? $"{near.Data.Name}  {MathUtil.FormatDistance(dist)}" : "";
                UIKit.Text(new Rect(x, y + 32, 700, 24), $"{view.Data.Star.ClassLabel} star  ·  {view.Data.Planets.Length} planets  ·  {where}", UIKit.LabelSmall);
            }
        }

        string DayTime(PlanetBody p)
        {
            Vector3d up = g.Mode == PlayerMode.OnFoot ? g.Player.Up : g.Ship.Pos.normalized;
            double s = Vector3d.Dot(up, (Vector3d)g.View.SunDirRef);
            if (s > 0.25) return "Day";
            if (s > 0.02) return "Low sun";
            if (s > -0.12) return "Twilight";
            return "Night";
        }

        void DrawToasts()
        {
            float y = 150;
            for (int i = g.Toasts.Count - 1; i >= 0; i--)
            {
                var (text, time, warn) = g.Toasts[i];
                float age = Time.unscaledTime - time;
                float a = Mathf.Clamp01(Mathf.Min(age * 4f, (6f - age) * 1.5f));
                var r = new Rect(28, y, 520, 30);
                UIKit.Rect(new Rect(r.x, r.y, 4, r.height), new Color(warn ? 1f : 0.43f, warn ? 0.4f : 0.83f, warn ? 0.3f : 1f, a));
                UIKit.Rect(new Rect(r.x + 4, r.y, r.width - 4, r.height), new Color(0.02f, 0.04f, 0.07f, 0.6f * a));
                UIKit.Text(new Rect(r.x + 14, r.y + 5, r.width - 20, r.height), text, UIKit.LabelSmall, new Color(1, 1, 1, a));
                y += 36;
            }
        }

        void DrawGoal()
        {
            var goal = Missions.Current(g);
            var r = new Rect(W - 440, 22, 412, 96);
            UIKit.Text(new Rect(r.x, r.y, r.width, 24), goal.Title.ToUpperInvariant(), UIKit.LabelSmall, UIKit.Warm);
            UIKit.Text(new Rect(r.x, r.y + 24, r.width, 80), goal.Text, UIKit.LabelSmall, UIKit.Ink);
        }

        // ───────────────────────────── on foot ────────────────────────────
        void DrawFootHud()
        {
            var d = Profile.Data;
            var t = g.Tool;
            DrawCompass();

            // crosshair
            float cx = W / 2, cy = H / 2;
            if (t.Visor)
            {
                UIKit.Tex(new Rect(cx - 70, cy - 70, 140, 140), UIKit.Ring, new Color(0.45f, 0.9f, 1f, 0.5f));
                UIKit.Rect(new Rect(0, 0, W, H), new Color(0.1f, 0.35f, 0.45f, 0.08f));
                if (t.ScanTarget != null)
                {
                    UIKit.Text(new Rect(cx + 90, cy - 40, 420, 30), t.ScanName, UIKit.LabelBig, UIKit.Accent);
                    UIKit.Text(new Rect(cx + 90, cy - 8, 420, 60), t.ScanInfo, UIKit.LabelSmall);
                    if (t.ScanProgress > 0f) UIKit.Bar(new Rect(cx - 70, cy + 80, 140, 6), t.ScanProgress, UIKit.Accent);
                }
                UIKit.Text(new Rect(cx - 200, H - 170, 400, 26), "ANALYSIS VISOR  ·  F to close", UIKit.LabelCenter, UIKit.Accent);
            }
            else
            {
                UIKit.Tex(new Rect(cx - 3, cy - 3, 6, 6), UIKit.Dot, new Color(1, 1, 1, 0.85f));
                if (t.MineProgress > 0f)
                {
                    UIKit.Tex(new Rect(cx - 22, cy - 22, 44, 44), UIKit.Ring, new Color(1f, 0.7f, 0.3f, 0.3f + t.MineProgress * 0.7f));
                    UIKit.Bar(new Rect(cx - 50, cy + 30, 100, 5), t.MineProgress, UIKit.Warm);
                    if (t.MineLabel != null) UIKit.Text(new Rect(cx - 150, cy + 38, 300, 24), t.MineLabel, UIKit.LabelCenter);
                }
            }

            // survival (bottom left)
            float x = 28, y = H - 150;
            UIKit.PanelBox(new Rect(x - 12, y - 12, 380, 138), 0.75f);
            StatBar(x, y, "SHIELD", d.Shield / 100f, UIKit.Accent);
            StatBar(x, y + 26, "HEALTH", d.Health / 100f, new Color(1f, 0.45f, 0.45f));
            StatBar(x, y + 52, "LIFE SUPPORT", d.LifeSupport / 100f, d.LifeSupport < 20 ? UIKit.Danger : new Color(1f, 0.55f, 0.4f));
            StatBar(x, y + 78, "HAZARD PROTECTION", d.Hazard / 100f, d.Hazard < 20 ? UIKit.Danger : UIKit.Warm);
            if (g.Survival.Exposure > 0.02f && !g.Survival.Sheltered)
                UIKit.Text(new Rect(x + 200, y + 100, 180, 20), "exposed", UIKit.LabelTiny, UIKit.Warm);
            if (g.Player.Jetpack < 0.99f || g.Player.Jetting)
                UIKit.Bar(new Rect(W / 2 - 60, H / 2 + 60, 120, 4), g.Player.Jetpack, new Color(0.6f, 0.9f, 1f, 0.9f));
            if (g.Player.Stamina < 0.99f)
                UIKit.Bar(new Rect(W / 2 - 60, H / 2 + 68, 120, 3), g.Player.Stamina, new Color(1f, 1f, 1f, 0.6f));

            // multi-tool (bottom right)
            float rx = W - 360, ry = H - 124;
            UIKit.PanelBox(new Rect(rx - 12, ry - 12, 344, 112), 0.75f);
            string mode = t.Mode == ToolMode.Mining ? "MINING BEAM" : "BLASTER";
            UIKit.Text(new Rect(rx, ry, 320, 26), mode, UIKit.Label, t.Mode == ToolMode.Mining ? UIKit.Warm : UIKit.Accent);
            UIKit.Text(new Rect(rx + 170, ry + 3, 150, 22), "Q to switch", UIKit.LabelTiny);
            UIKit.Text(new Rect(rx, ry + 30, 110, 20), "CHARGE", UIKit.LabelTiny);
            UIKit.Bar(new Rect(rx + 80, ry + 36, 230, 6), d.ToolCharge / 100f, d.ToolCharge < 15 ? UIKit.Danger : UIKit.Warm);
            UIKit.Text(new Rect(rx, ry + 50, 110, 20), "HEAT", UIKit.LabelTiny);
            UIKit.Bar(new Rect(rx + 80, ry + 56, 230, 6), t.Heat, t.Overheated ? UIKit.Danger : new Color(1f, 0.5f, 0.2f));
            UIKit.Text(new Rect(rx, ry + 70, 320, 20), $"{d.Inv.Units:N0} units", UIKit.LabelSmall, UIKit.Ink);
            if (t.Overheated) UIKit.Text(new Rect(W / 2 - 100, H / 2 + 40, 200, 24), "OVERHEATED", UIKit.LabelCenter, UIKit.Danger);
        }

        void StatBar(float x, float y, string label, float v, Color c)
        {
            UIKit.Text(new Rect(x, y, 170, 20), label, UIKit.LabelTiny);
            UIKit.Bar(new Rect(x + 170, y + 6, 150, 7), v, c);
            UIKit.Text(new Rect(x + 326, y, 60, 20), $"{v * 100:F0}", UIKit.LabelTiny, UIKit.Ink);
        }

        void DrawCompass()
        {
            var p = g.View.Ref;
            if (p == null) return;
            Vector3d up = g.Player.Up;
            Vector3d north = Vector3d.ProjectOnPlane(Vector3d.up, up);
            if (north.sqrMagnitude < 1e-8) north = Vector3d.ProjectOnPlane(Vector3d.forward, up);
            north = north.normalized;
            Vector3d east = Vector3d.Cross(up, north);
            Vector3 fwd = g.Player.Forward;
            float heading = Mathf.Atan2((float)Vector3d.Dot((Vector3d)fwd, east), (float)Vector3d.Dot((Vector3d)fwd, north)) * Mathf.Rad2Deg;
            float cw = 640, cx = W / 2 - cw / 2, cy = 22;
            UIKit.Rect(new Rect(cx, cy + 26, cw, 1), new Color(1, 1, 1, 0.3f));
            float span = 120f;
            for (int deg = -180; deg < 180; deg += 15)
            {
                float rel = Mathf.DeltaAngle(heading, deg);
                if (Mathf.Abs(rel) > span / 2) continue;
                float px = cx + cw / 2 + rel / span * cw;
                bool major = deg % 90 == 0;
                UIKit.Rect(new Rect(px, cy + (major ? 14 : 20), 1, major ? 12 : 6), new Color(1, 1, 1, major ? 0.8f : 0.4f));
                if (major)
                {
                    string lbl = deg == 0 ? "N" : deg == 90 ? "E" : deg == -180 ? "S" : "W";
                    UIKit.Text(new Rect(px - 20, cy - 8, 40, 22), lbl, UIKit.LabelCenter, UIKit.Ink);
                }
            }
            // markers on the compass
            void Mark(Vector3d pos, Color c, Texture2D tex)
            {
                Vector3d v = Vector3d.ProjectOnPlane(pos - g.Player.Pos, up);
                if (v.sqrMagnitude < 1) return;
                float b = Mathf.Atan2((float)Vector3d.Dot(v, east), (float)Vector3d.Dot(v, north)) * Mathf.Rad2Deg;
                float rel = Mathf.DeltaAngle(heading, b);
                rel = Mathf.Clamp(rel, -span / 2, span / 2);
                float px = cx + cw / 2 + rel / span * cw;
                UIKit.Tex(new Rect(px - 7, cy + 30, 14, 14), tex, c);
            }
            if (g.Ship.State == ShipState.Landed) Mark(g.Ship.Pos, UIKit.Accent, UIKit.Diamond);
            if (p.Pois != null)
                foreach (var poi in p.Pois.Pois)
                    if (poi.Known && !poi.Looted) Mark(poi.Pos, UIKit.Warm, UIKit.Dot);
            var goal = Missions.Current(g);
            if (goal.HasMarker) Mark(goal.Marker, UIKit.Good, UIKit.Diamond);
        }

        // ───────────────────────────── ship ───────────────────────────────
        void DrawShipHud()
        {
            var s = g.Ship;
            float cx = W / 2, cy = H / 2;
            if (s.State == ShipState.Flying)
            {
                UIKit.Tex(new Rect(cx - 28, cy - 28, 56, 56), UIKit.Ring, new Color(0.45f, 0.9f, 1f, 0.55f));
                Vector2 st = s.Stick;
                UIKit.Tex(new Rect(cx + st.x * 90 - 5, cy - st.y * 90 - 5, 10, 10), UIKit.Dot, new Color(0.45f, 0.9f, 1f, 0.8f));
                float heat = g.Combat.GunHeat;
                if (heat > 0.02f) UIKit.Bar(new Rect(cx - 40, cy + 40, 80, 4), heat, heat > 0.9f ? UIKit.Danger : UIKit.Warm);
            }
            // flight panel
            float px = cx - 330, py = H - 132;
            UIKit.PanelBox(new Rect(px, py, 660, 112), 0.8f);
            string spd = s.Pulsing ? MathUtil.FormatSpeed(s.Speed) : $"{s.Speed:F0} m/s";
            UIKit.Text(new Rect(px + 20, py + 10, 220, 40), spd, UIKit.LabelHuge, s.Pulsing ? UIKit.Accent : UIKit.Ink);
            string mode = s.State == ShipState.Landed ? "LANDED" : s.State == ShipState.Landing ? "LANDING" : s.State == ShipState.TakingOff ? "LAUNCHING"
                        : s.State == ShipState.Docking ? "DOCKING" : s.State == ShipState.Undocking ? "LAUNCHING" : s.Pulsing ? "PULSE DRIVE" : s.PulseSpooling ? "PULSE SPOOLING" : s.Boosting ? "BOOST" : "FLIGHT";
            UIKit.Text(new Rect(px + 20, py + 54, 220, 22), mode, UIKit.LabelSmall, UIKit.Warm);
            if (g.View.Ref != null && s.Altitude < 1e7f)
                UIKit.Text(new Rect(px + 20, py + 76, 240, 22), $"ALT {MathUtil.FormatDistance(Mathf.Max(0f, s.Altitude))}", UIKit.LabelSmall);
            // throttle
            UIKit.Text(new Rect(px + 250, py + 12, 90, 20), "THROTTLE", UIKit.LabelTiny);
            UIKit.Bar(new Rect(px + 330, py + 18, 120, 6), s.Throttle, UIKit.Accent);
            UIKit.Text(new Rect(px + 250, py + 30, 90, 20), "BOOST", UIKit.LabelTiny);
            UIKit.Bar(new Rect(px + 330, py + 36, 120, 6), s.BoostEnergy, UIKit.Warm);
            UIKit.Text(new Rect(px + 250, py + 48, 90, 20), "PULSE FUEL", UIKit.LabelTiny);
            UIKit.Bar(new Rect(px + 330, py + 54, 120, 6), s.PulseFuel / 100f, s.PulseFuel < 10 ? UIKit.Danger : new Color(0.6f, 0.95f, 0.9f));
            UIKit.Text(new Rect(px + 250, py + 66, 90, 20), "LAUNCH", UIKit.LabelTiny);
            UIKit.Bar(new Rect(px + 330, py + 72, 120, 6), s.LaunchFuel / 100f, s.LaunchFuel < 20 ? UIKit.Danger : new Color(0.5f, 0.75f, 1f));
            UIKit.Text(new Rect(px + 470, py + 12, 70, 20), "SHIELD", UIKit.LabelTiny);
            UIKit.Bar(new Rect(px + 530, py + 18, 110, 6), s.Shield / 100f, UIKit.Accent);
            UIKit.Text(new Rect(px + 470, py + 30, 70, 20), "HULL", UIKit.LabelTiny);
            UIKit.Bar(new Rect(px + 530, py + 36, 110, 6), s.Hull / 100f, s.Hull < 30 ? UIKit.Danger : new Color(1f, 0.6f, 0.45f));
            UIKit.Text(new Rect(px + 470, py + 52, 180, 20), $"{Profile.Data.Inv.Count("warpcell")} warp cells", UIKit.LabelTiny);
            UIKit.Text(new Rect(px + 470, py + 70, 180, 20), $"{Profile.Data.Inv.Units:N0} units", UIKit.LabelTiny, UIKit.Ink);
            string help = s.State == ShipState.Landed ? "Space take off · E leave · drag mouse to look"
                        : s.State == ShipState.Flying ? "W/S throttle · mouse steer · A/D roll · Shift boost · J pulse · V view · LMB fire" : "";
            UIKit.Text(new Rect(px, py + 116, 660, 20), help, UIKit.LabelTiny);
        }

        // ───────────────────────────── markers ────────────────────────────
        void Marker(Vector3d refPos, string label, Color c, Texture2D icon, float size = 16f, bool distance = true, bool clampToEdge = true)
        {
            var cam = g.Cam;
            Vector3 world = g.View.ToUnity(refPos);
            Vector3 sp = cam.WorldToScreenPoint(world);
            bool behind = sp.z < 0;
            float x = sp.x / scale, y = (Screen.height - sp.y) / scale;
            if (behind) { x = W - x; y = H - y; }
            bool off = behind || x < 30 || x > W - 30 || y < 30 || y > H - 30;
            if (off && !clampToEdge) return;
            if (off)
            {
                Vector2 dir = new Vector2(x - W / 2, y - H / 2);
                if (behind && dir.sqrMagnitude < 1) dir = Vector2.down;
                dir.Normalize();
                float t = Mathf.Min((W / 2 - 40) / Mathf.Max(Mathf.Abs(dir.x), 1e-4f), (H / 2 - 40) / Mathf.Max(Mathf.Abs(dir.y), 1e-4f));
                x = W / 2 + dir.x * t; y = H / 2 + dir.y * t;
            }
            UIKit.Tex(new Rect(x - size / 2, y - size / 2, size, size), icon, c);
            if (!off)
            {
                string text = label;
                if (distance)
                {
                    double d = (refPos - g.Rig.RefPos).magnitude;
                    text += (text.Length > 0 ? "  " : "") + MathUtil.FormatDistance(d);
                }
                if (!string.IsNullOrEmpty(text))
                    UIKit.Text(new Rect(x - 150, y + size / 2 + 2, 300, 22), text, UIKit.LabelTiny, c);
            }
        }

        void DrawMarkers()
        {
            var view = g.View;
            var p = view.Ref;
            var goal = Missions.Current(g);
            if (goal.HasMarker) Marker(goal.Marker, goal.MarkerLabel, UIKit.Good, UIKit.Diamond, 18);

            if (g.Mode == PlayerMode.OnFoot)
            {
                if (g.Ship.State == ShipState.Landed) Marker(g.Ship.Pos + g.Ship.Up * 3, "Ship", UIKit.Accent, UIKit.Diamond);
                if (p?.Pois != null)
                    foreach (var poi in p.Pois.Pois)
                    {
                        double d = (poi.Pos - g.Player.Pos).magnitude;
                        if (poi.Known || d < 350)
                        {
                            if (!poi.Known && d < 350) Profile.MarkKnown(poi.Id);
                            Marker(poi.Pos + poi.Pos.normalized * 4, poi.Looted ? poi.Label : poi.Name, poi.Looted ? UIKit.Dim : UIKit.Warm, UIKit.Dot, 12, true, !poi.Looted);
                        }
                    }
                foreach (var (pos, sp) in g.Tool.Revealed)
                {
                    var def = Items.Get(sp.Resource);
                    if (def == null) continue;
                    Marker(pos + pos.normalized * 1.5, def.Symbol, def.Color, UIKit.Dot, 10, false, false);
                }
                if (g.Tool.Visor && p?.Fauna != null)
                    foreach (var c in p.Fauna.Creatures)
                    {
                        if (c.State == CreatureState.Dead) continue;
                        double d = (c.Pos - g.Player.Pos).magnitude;
                        if (d > 90) continue;
                        bool known = Profile.IsDiscovered(c.Species.DiscoveryId);
                        Marker(c.Pos + c.Pos.normalized * (c.BodyHeight + c.Species.Size * 0.6), known ? c.Species.Name : "?", known ? UIKit.Good : UIKit.Warm, UIKit.Ring, 14, false, false);
                    }
            }
            else
            {
                // bodies in the system
                bool space = p == null || g.Ship.Altitude > 8000;
                if (space)
                {
                    foreach (var pl in view.Planets)
                    {
                        Vector3d c = view.PlanetCenterRef(pl);
                        Marker(c, pl.Data.Name, UIKit.Ink, UIKit.Ring, 14, true, false);
                    }
                    if (view.Station != null) Marker(view.StationPosRef, view.Station.Data.Name, UIKit.Accent, UIKit.Diamond, 14, true, false);
                    foreach (var gg in view.Giants) Marker(view.SysToRef(gg.Data.Position), gg.Data.Name, UIKit.Dim, UIKit.Ring, 14, true, false);
                }
                if (p != null && g.Ship.Altitude < 8000 && p.Pois != null)
                    foreach (var poi in p.Pois.Pois)
                        if (poi.Known && !poi.Looted) Marker(poi.Pos + poi.Pos.normalized * 4, poi.Name, UIKit.Warm, UIKit.Dot, 12, true, false);
            }
            foreach (var pir in g.Combat.Pirates) Marker(pir.Pos, "Pirate", UIKit.Danger, UIKit.Diamond, 14);
            foreach (var d in g.Combat.Drones) if (!d.Patrol) Marker(d.Pos, "", UIKit.Danger, UIKit.Diamond, 10, false, true);
        }
    }
}

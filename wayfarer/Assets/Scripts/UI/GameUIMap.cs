using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>The galaxy map: the stars around you in 3D, your jump range, and hyperspace.</summary>
    public sealed partial class GameUI
    {
        List<StarInfo> mapStars = new List<StarInfo>();
        StarInfo mapSel;
        float mapYaw = 25f, mapPitch = 35f, mapZoom = 1f;
        Vector3d mapFocus;
        Material lineMat;
        const double MapRadius = 220;

        public void OpenMap()
        {
            var cur = g.View.Data.Star;
            mapStars = Galaxy.StarsNear(cur.GalPos, MapRadius);
            mapFocus = cur.GalPos;
            mapSel = null;
        }

        Vector2 Project(Vector3d gal, out float depth)
        {
            Vector3 rel = (Vector3)(gal - mapFocus);
            var rot = Quaternion.Euler(mapPitch, mapYaw, 0);
            Vector3 v = Quaternion.Inverse(rot) * rel;
            float dist = 420f / mapZoom;
            float z = v.z + dist;
            depth = z;
            float f = 900f / Mathf.Max(z, 1f);
            return new Vector2(W / 2 + v.x * f, H / 2 - v.y * f);
        }

        void DrawMap()
        {
            var e = Event.current;
            var cur = g.View.Data.Star;
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0.005f, 0.01f, 0.025f, 0.96f));

            // controls: drag to orbit, wheel to zoom
            var panel = new Rect(W - 480, 110, 440, 560);
            bool overPanel = panel.Contains(e.mousePosition);
            if (e.type == EventType.MouseDrag && !overPanel)
            {
                mapYaw += e.delta.x * 0.3f;
                mapPitch = Mathf.Clamp(mapPitch + e.delta.y * 0.3f, -85f, 85f);
                e.Use();
            }
            if (e.type == EventType.ScrollWheel && !overPanel)
            {
                mapZoom = Mathf.Clamp(mapZoom * (e.delta.y > 0 ? 0.9f : 1.1f), 0.35f, 5f);
                e.Use();
            }
            if (e.type == EventType.KeyDown && e.keyCode == KeyCode.F) { mapFocus = mapSel != null ? mapSel.GalPos : cur.GalPos; }

            // range ring and grid, in the galactic plane through the focus
            if (e.type == EventType.Repaint) DrawMapLines(cur);

            // stars, far to near
            var order = new List<(StarInfo s, Vector2 p, float z)>();
            foreach (var s in mapStars)
            {
                var p = Project(s.GalPos, out float z);
                if (z < 5) continue;
                order.Add((s, p, z));
            }
            order.Sort((a, b) => b.z.CompareTo(a.z));
            StarInfo hover = null;
            float hoverD = 14f;
            foreach (var (s, p, z) in order)
            {
                bool visited = Profile.Data.Visited.Contains(s.Id);
                bool inRange = (s.GalPos - cur.GalPos).magnitude <= Profile.JumpRange;
                float size = Mathf.Clamp((float)(6.0 + s.Luminosity * 5.0) * 420f / z, 3f, 26f);
                Color c = s.Color;
                c.a = inRange ? 1f : 0.45f;
                UIKit.Tex(new Rect(p.x - size, p.y - size, size * 2, size * 2), UIKit.Glow, c * new Color(1, 1, 1, 0.5f));
                UIKit.Tex(new Rect(p.x - size * 0.3f, p.y - size * 0.3f, size * 0.6f, size * 0.6f), UIKit.Dot, Color.Lerp(c, Color.white, 0.5f));
                if (visited) UIKit.Tex(new Rect(p.x - size * 0.8f, p.y - size * 0.8f, size * 1.6f, size * 1.6f), UIKit.Ring, new Color(0.45f, 1f, 0.6f, 0.7f));
                float md = Vector2.Distance(e.mousePosition, p);
                if (md < hoverD && !overPanel) { hoverD = md; hover = s; }
            }
            // current star marker
            var cp = Project(cur.GalPos, out _);
            UIKit.Tex(new Rect(cp.x - 16, cp.y - 16, 32, 32), UIKit.Ring, UIKit.Warm);
            UIKit.Text(new Rect(cp.x - 150, cp.y + 16, 300, 22), "You are here", new GUIStyle(UIKit.LabelTiny) { alignment = TextAnchor.UpperCenter }, UIKit.Warm);
            if (hover != null)
            {
                var hp = Project(hover.GalPos, out _);
                UIKit.Text(new Rect(hp.x + 14, hp.y - 12, 300, 22), hover.Name, UIKit.LabelSmall, UIKit.Ink);
                if (e.type == EventType.MouseDown && e.button == 0) { mapSel = hover; g.Audio.Play(Sfx.Click, 0.5f); e.Use(); }
            }
            if (mapSel != null)
            {
                var sp = Project(mapSel.GalPos, out _);
                UIKit.Tex(new Rect(sp.x - 22, sp.y - 22, 44, 44), UIKit.Ring, UIKit.Accent);
            }

            // header
            UIKit.Text(new Rect(60, 40, 800, 50), "GALAXY MAP", UIKit.LabelHuge);
            double core = Galaxy.DistanceToCore(cur.GalPos);
            UIKit.Text(new Rect(60, 92, 900, 26), $"{cur.Name} · {core:N0} light-years from the galactic core · jump range {Profile.JumpRange:F0} ly · {Profile.Data.Inv.Count("warpcell")} warp cells", UIKit.LabelSmall);
            UIKit.Text(new Rect(60, H - 60, 1000, 24), "Drag to rotate · scroll to zoom · click a star to select · F to centre on selection · M to close", UIKit.LabelTiny);

            // info panel
            UIKit.PanelBox(panel);
            var target = mapSel ?? hover;
            if (target == null)
            {
                UIKit.Text(new Rect(panel.x + 24, panel.y + 24, panel.width - 48, 200),
                    "Select a star to see what's known about it.\n\nStars inside your jump range are bright; green rings mark systems you've visited.",
                    UIKit.Label);
            }
            else
            {
                double dist = (target.GalPos - cur.GalPos).magnitude;
                bool visited = Profile.Data.Visited.Contains(target.Id);
                float y = panel.y + 24;
                UIKit.Text(new Rect(panel.x + 24, y, panel.width - 48, 34), target.Name, UIKit.LabelBig, target.Color);
                y += 44;
                string lines =
                    $"Class {target.ClassLabel} star · {target.Temperature:N0} K\n" +
                    $"Distance {dist:F1} light-years\n" +
                    $"{target.PlanetCount} planets" + (target.HasStation ? " · space station" : "") + "\n" +
                    $"Economy: {target.Economy} · wealth " + new string('★', target.Wealth) + "\n" +
                    $"Sentinels: {(target.SentinelLevel == 0 ? "none" : target.SentinelLevel == 1 ? "low" : target.SentinelLevel == 2 ? "watchful" : "aggressive")}\n" +
                    $"Metal deposits: {target.MetalName}\n" +
                    (visited ? "<color=#7f9>Visited</color>" : "Unexplored");
                UIKit.Text(new Rect(panel.x + 24, y, panel.width - 48, 220), lines, UIKit.Label);
                y += 240;
                string why = g.CanWarp(target);
                if (why == null)
                {
                    if (UIKit.Btn(new Rect(panel.x + 24, y, panel.width - 48, 56), "Engage hyperdrive (1 warp cell)", true))
                    {
                        g.StartWarp(target);
                    }
                }
                else
                {
                    UIKit.Text(new Rect(panel.x + 24, y, panel.width - 48, 60), why, UIKit.Label, UIKit.Warm);
                }
                y += 76;
                if (UIKit.Btn(new Rect(panel.x + 24, y, 190, 40), "Centre view", false, true)) mapFocus = target.GalPos;
                if (UIKit.Btn(new Rect(panel.x + 226, y, 190, 40), "Back to here", false, true)) mapFocus = cur.GalPos;
            }
            if (UIKit.Btn(new Rect(W - 200, H - 80, 140, 44), "Close")) g.State = g.Mode == PlayerMode.Docked ? GameState.Station : GameState.Playing;
        }

        void DrawMapLines(StarInfo cur)
        {
            if (lineMat == null) lineMat = Materials.Additive(Color.white, 1f);
            lineMat.SetPass(0);
            GL.PushMatrix();
            GL.LoadPixelMatrix();
            GL.Begin(GL.LINES);
            void Line(Vector3d a, Vector3d b, Color c)
            {
                var pa = Project(a, out float za);
                var pb = Project(b, out float zb);
                if (za < 5 || zb < 5) return;
                GL.Color(c);
                GL.Vertex3(pa.x * scale, Screen.height - pa.y * scale, 0);
                GL.Vertex3(pb.x * scale, Screen.height - pb.y * scale, 0);
            }
            // jump range circle
            double R = Profile.JumpRange;
            Vector3d prev = cur.GalPos + new Vector3d(R, 0, 0);
            for (int i = 1; i <= 96; i++)
            {
                double a = i * System.Math.PI * 2 / 96;
                var p = cur.GalPos + new Vector3d(System.Math.Cos(a) * R, 0, System.Math.Sin(a) * R);
                Line(prev, p, new Color(1f, 0.7f, 0.3f, 0.5f));
                prev = p;
            }
            // grid
            for (int i = -4; i <= 4; i++)
            {
                double o = i * 50;
                Line(mapFocus + new Vector3d(-200, 0, o), mapFocus + new Vector3d(200, 0, o), new Color(0.3f, 0.6f, 0.9f, 0.12f));
                Line(mapFocus + new Vector3d(o, 0, -200), mapFocus + new Vector3d(o, 0, 200), new Color(0.3f, 0.6f, 0.9f, 0.12f));
            }
            // drop lines from stars to the plane, and a line to the selection
            foreach (var s in mapStars)
            {
                var foot = new Vector3d(s.GalPos.x, cur.GalPos.y, s.GalPos.z);
                Line(s.GalPos, foot, new Color(0.4f, 0.6f, 0.8f, 0.12f));
            }
            if (mapSel != null) Line(cur.GalPos, mapSel.GalPos, new Color(0.43f, 0.83f, 1f, 0.9f));
            // arrow toward the core
            Vector3d toCore = (new Vector3d(-cur.GalPos.x, 0, -cur.GalPos.z)).normalized;
            Line(cur.GalPos, cur.GalPos + toCore * 60, new Color(1f, 0.9f, 0.5f, 0.7f));
            GL.End();
            GL.PopMatrix();
            var cp = Project(cur.GalPos + toCore * 64, out float cz);
            if (cz > 5) UIKit.Text(new Rect(cp.x - 100, cp.y - 10, 200, 20), "galactic core →", new GUIStyle(UIKit.LabelTiny) { alignment = TextAnchor.MiddleCenter }, new Color(1f, 0.9f, 0.5f, 0.8f));
        }
    }
}

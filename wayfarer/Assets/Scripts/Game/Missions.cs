using UnityEngine;

namespace Wayfarer
{
    /// <summary>A gentle chain of goals that teaches the game, then an open-ended journey.</summary>
    public static class Missions
    {
        public struct Goal
        {
            public string Title;
            public string Text;
            public bool HasMarker;
            public Vector3d Marker;     // reference frame
            public string MarkerLabel;
        }

        public static Goal Current(Game g)
        {
            var d = Profile.Data;
            var view = g.View;
            var goal = new Goal();
            switch (d.MissionStage)
            {
                case 0:
                    goal.Title = "Fuel the launch thrusters";
                    goal.Text = d.Inv.Count("hydrogen") < 40 && d.LaunchFuel < 40
                        ? $"Mine Hydrogen from blue crystals ({d.Inv.Count("hydrogen")}/40). Press C to scan for them."
                        : "Open the inventory (Tab) and recharge the Launch Thrusters with Hydrogen.";
                    NearestResource(g, "hydrogen", ref goal);
                    break;
                case 1:
                    goal.Title = "Leave the planet";
                    goal.Text = "Board your ship (E), take off (Space) and fly up into space.";
                    if (g.Mode == PlayerMode.OnFoot && g.Ship != null) { goal.HasMarker = true; goal.Marker = g.Ship.Pos; goal.MarkerLabel = "Your ship"; }
                    break;
                case 2:
                    goal.Title = "Visit the space station";
                    goal.Text = view.Station != null ? $"Fly to {view.Station.Data.Name}. Hold J for the pulse drive, then press E near the station to dock." : "This system has no station. Explore instead.";
                    if (view.Station != null) { goal.HasMarker = true; goal.Marker = view.StationPosRef; goal.MarkerLabel = view.Station.Data.Name; }
                    break;
                case 3:
                    goal.Title = "Mine asteroids";
                    goal.Text = $"Shoot asteroids with the ship's cannons to collect Helium-3 ({d.Inv.Count("helium3")}/40).";
                    AsteroidMarker(g, ref goal);
                    break;
                case 4:
                    goal.Title = "Build a warp cell";
                    goal.Text = "Open the inventory (Tab), go to Crafting and make a Warp Cell (50 Hydrogen, 40 Helium-3, 30 Ferrite).";
                    break;
                case 5:
                    goal.Title = "Jump to another star";
                    goal.Text = "Fly out of the atmosphere, open the galaxy map (M), pick a star in range and engage the hyperdrive.";
                    break;
                default:
                    int fauna = 0;
                    foreach (var x in d.Discoveries) if (x.Kind == "Fauna") fauna++;
                    goal.Title = "The journey";
                    double core = Galaxy.DistanceToCore(view.Data.Star.GalPos);
                    goal.Text = $"Explore freely. {core:N0} light-years to the galactic core. {d.Discoveries.Count} discoveries, {fauna} animal species.";
                    break;
            }
            return goal;
        }

        public static void Check(Game g)
        {
            var d = Profile.Data;
            int before = d.MissionStage;
            switch (d.MissionStage)
            {
                case 0: if (d.LaunchFuel >= 40f) d.MissionStage = 1; break;
                case 1: if (g.Mode == PlayerMode.InShip && (g.View.Ref == null || !g.Ship.InAtmosphere)) d.MissionStage = g.View.Station != null ? 2 : 3; break;
                case 2: if (g.Mode == PlayerMode.Docked) d.MissionStage = 3; break;
                case 3: if (d.Inv.Count("helium3") >= 40 || d.Inv.Count("warpcell") > 0) d.MissionStage = 4; break;
                case 4: if (d.Inv.Count("warpcell") > 0 || d.Jumps > 0) d.MissionStage = 5; break;
                case 5: if (d.Jumps > 0) d.MissionStage = 6; break;
            }
            if (d.MissionStage != before)
            {
                g.Audio.Play(Sfx.Mission);
                g.Toast("Goal complete: " + Current(g).Title.ToLowerInvariant().Replace("the journey", "explore the galaxy"));
                d.Inv.Units += 750;
            }
        }

        static void NearestResource(Game g, string res, ref Missions.Goal goal)
        {
            var planet = g.View.Ref;
            if (planet?.Flora == null || g.Mode != PlayerMode.OnFoot) return;
            double best = double.MaxValue;
            foreach (var (pos, sp) in g.Tool.Revealed)
            {
                if (sp.Resource != res) continue;
                double dd = (pos - g.Player.Pos).magnitude;
                if (dd < best) { best = dd; goal.HasMarker = true; goal.Marker = pos; goal.MarkerLabel = Items.Get(res).Name; }
            }
        }

        static void AsteroidMarker(Game g, ref Missions.Goal goal)
        {
            var view = g.View;
            double best = double.MaxValue;
            foreach (var f in view.Fields)
            {
                var p = view.SysToRef(f.Data.Position);
                double dd = (p - g.Ship.Pos).magnitude;
                if (dd < best) { best = dd; goal.HasMarker = true; goal.Marker = p; goal.MarkerLabel = "Asteroid field"; }
            }
        }
    }
}

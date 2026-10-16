using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>Turns a star from the galaxy map into a full star system:
    /// planets, moons, a gas giant, a space station and asteroid fields.</summary>
    public static class SystemGen
    {
        public static StarSystemData Generate(StarInfo star, bool isStartSystem = false)
        {
            var r = new Rng(Hash.Mix(star.Seed, 0x5157E3));
            var sys = new StarSystemData { Star = star };

            double[] radiusRange;
            switch (star.Class)
            {
                case StarClass.M: radiusRange = new[] { 40000.0, 55000 }; break;
                case StarClass.K: radiusRange = new[] { 52000.0, 68000 }; break;
                case StarClass.G: radiusRange = new[] { 65000.0, 82000 }; break;
                case StarClass.F: radiusRange = new[] { 78000.0, 95000 }; break;
                case StarClass.A: radiusRange = new[] { 90000.0, 110000 }; break;
                case StarClass.B: radiusRange = new[] { 105000.0, 130000 }; break;
                default: radiusRange = new[] { 125000.0, 150000 }; break;
            }
            sys.StarRadius = r.Range(radiusRange[0], radiusRange[1]);
            sys.StarColor = star.Color;
            sys.StarLight = (float)MathUtil.Clamp(0.85 + 0.35 * star.Luminosity, 0.9, 1.7);

            double lum = star.Luminosity;
            double habitable = 1500000 * Math.Sqrt(lum);
            int count = star.PlanetCount;
            var planets = new List<PlanetData>();
            var giants = new List<GasGiantData>();
            double dist = 700000 * Math.Sqrt(lum) * r.Range(0.9, 1.15);
            bool giantPlaced = false;
            int homeIndex = -1;

            for (int i = 0; i < count; i++)
            {
                double ang = r.Range(0.0, Math.PI * 2);
                double incl = r.Range(-0.05, 0.05);
                var pos = new Vector3d(Math.Cos(ang) * dist, Math.Sin(incl) * dist, Math.Sin(ang) * dist);
                double zone = dist / habitable;

                if (!giantPlaced && i >= 2 && r.Chance(0.35))
                {
                    giantPlaced = true;
                    giants.Add(MakeGasGiant(r.NextULong(), star, pos, giants.Count));
                    dist *= r.Range(1.35, 1.6);
                    continue;
                }

                var p = new PlanetData { Seed = r.NextULong(), Index = planets.Count, Position = pos };
                p.Type = PickType(r, zone, false);
                if (isStartSystem && homeIndex < 0 && zone > 0.55 && zone < 1.6)
                {
                    p.Type = PlanetType.Lush;
                    homeIndex = p.Index;
                }
                p.Radius = r.Range(18000, 30000);
                Fill(p, r.Fork(0xF111), star, zone);
                p.Name = NameGen.Planet(p.Seed, star.Name, p.Index);
                planets.Add(p);

                // some planets get a moon
                if (r.Chance(0.3) && planets.Count < 8)
                {
                    var m = new PlanetData { Seed = r.NextULong(), Index = planets.Count, IsMoon = true, ParentIndex = p.Index };
                    Vector3d dir = new Vector3d(r.Range(-1.0, 1.0), r.Range(-0.2, 0.2), r.Range(-1.0, 1.0)).normalized;
                    m.Radius = r.Range(9000, 14000);
                    m.Position = p.Position + dir * (p.Radius * 6.0 + m.Radius * 4.0 + r.Range(0, 40000));
                    m.Type = PickType(r, zone, true);
                    Fill(m, r.Fork(0xF222), star, zone);
                    m.Name = NameGen.Planet(m.Seed, star.Name, m.Index);
                    planets.Add(m);
                }
                dist *= r.Range(1.32, 1.55);
            }

            if (isStartSystem && homeIndex < 0)
            {
                // make sure the very first planet you wake up on is kind to you
                var home = planets[0];
                home.Type = PlanetType.Lush;
                Fill(home, new Rng(Hash.Mix(home.Seed, 0x40E)), star, 1.0);
                homeIndex = 0;
            }
            if (isStartSystem)
            {
                var home = planets[homeIndex];
                home.Hazard = HazardType.None;
                home.HazardLevel = 0;
                home.SentinelLevel = 1;
                home.FaunaDensity = Math.Max(home.FaunaDensity, 0.6);
                home.SpeciesCount = Math.Max(home.SpeciesCount, 4);
            }

            sys.Planets = planets.ToArray();
            sys.GasGiants = giants.ToArray();

            // space station orbiting one of the planets
            if (star.HasStation)
            {
                int pi = homeIndex >= 0 ? homeIndex : r.Int(0, planets.Count - 1);
                var host = planets[pi];
                Vector3d toStar = (-host.Position).normalized;
                Vector3d side = Vector3d.Cross(toStar, Vector3d.up).normalized;
                Vector3d dir = (toStar * 0.6 + side * 0.8 + Vector3d.up * r.Range(-0.2, 0.3)).normalized;
                var st = new StationData
                {
                    Seed = r.NextULong(),
                    OrbitPlanet = pi,
                    Position = host.Position + dir * (host.Radius * 7.0),
                    PriceFactor = r.Range(0.85, 1.2),
                };
                // bay faces the planet so you fly straight in from it
                Vector3d face = (host.Position - st.Position).normalized;
                st.Rotation = QuatD.FromTo(Vector3d.forward, face);
                st.Name = NameGen.Station(st.Seed);
                sys.Station = st;
            }

            // asteroid fields between orbits
            int fields = r.Int(1, 3);
            var af = new List<AsteroidFieldData>();
            for (int i = 0; i < fields; i++)
            {
                var anchor = planets[r.Int(0, planets.Count - 1)];
                Vector3d dir = r.OnSphere();
                dir.y *= 0.3;
                dir = dir.normalized;
                af.Add(new AsteroidFieldData
                {
                    Seed = r.NextULong(),
                    Position = anchor.Position + dir * r.Range(160000, 280000),
                    Radius = r.Range(5000, 9000),
                    Count = r.Int(160, 300),
                    Rich = r.Chance(0.3),
                });
            }
            sys.AsteroidFields = af.ToArray();

            // arrive near the station's planet (or the first planet), looking at it
            var target = planets[homeIndex >= 0 ? homeIndex : (sys.Station != null ? sys.Station.OrbitPlanet : 0)];
            Vector3d fromStar = target.Position.normalized;
            Vector3d perp = Vector3d.Cross(fromStar, Vector3d.up).normalized;
            sys.ArrivalPosition = target.Position + (-fromStar * 0.45 + perp * 0.9).normalized * (target.Radius * 6.5);
            sys.ArrivalLookAt = target.Position;
            return sys;
        }

        static PlanetType PickType(Rng r, double zone, bool moon)
        {
            PlanetType[] types = { PlanetType.Lush, PlanetType.Ocean, PlanetType.Desert, PlanetType.Frozen, PlanetType.Toxic,
                                   PlanetType.Volcanic, PlanetType.Barren, PlanetType.Dead, PlanetType.Exotic, PlanetType.Irradiated };
            double[] w;
            if (moon) w = new double[] { 0.02, 0, 0.05, 0.18, 0.05, 0.06, 0.26, 0.3, 0.05, 0.03 };
            else if (zone < 0.6) w = new double[] { 0.02, 0, 0.3, 0, 0.12, 0.28, 0.12, 0.08, 0.03, 0.05 };
            else if (zone < 1.5) w = new double[] { 0.32, 0.09, 0.11, 0.05, 0.11, 0.03, 0.09, 0.04, 0.07, 0.09 };
            else w = new double[] { 0.02, 0, 0.02, 0.42, 0.05, 0, 0.15, 0.2, 0.08, 0.06 };
            return types[r.Weighted(w)];
        }

        static Color Hsv(Rng r, float h0, float h1, float s0, float s1, float v0, float v1) => r.Hsv(h0, h1, s0, s1, v0, v1);

        static Color Shift(Color c, float dh, float ds, float dv)
        {
            Color.RGBToHSV(c, out float h, out float s, out float v);
            h += dh; h -= Mathf.Floor(h);
            return Color.HSVToRGB(h, Mathf.Clamp01(s + ds), Mathf.Clamp01(v + dv));
        }

        /// <summary>Rayleigh coefficients that give roughly the requested sky colour.</summary>
        static Vector3 RayleighFor(Color sky, float strength)
        {
            // Thin atmospheres scatter in proportion to the coefficients, so a sky of
            // colour c needs coefficients shaped like c; sunsets come out as its complement.
            Vector3 c = new Vector3(Mathf.Pow(sky.r, 2.2f), Mathf.Pow(sky.g, 2.2f), Mathf.Pow(sky.b, 2.2f));
            float m = Mathf.Max(c.x, Mathf.Max(c.y, c.z));
            c /= Mathf.Max(m, 1e-3f);
            c = new Vector3(Mathf.Max(c.x, 0.04f), Mathf.Max(c.y, 0.04f), Mathf.Max(c.z, 0.04f));
            return c * strength;
        }

        public static void Fill(PlanetData p, Rng r, StarInfo star, double zone)
        {
            double R = p.Radius;
            p.Axis = new Vector3d(r.Range(-0.4, 0.4), 1, r.Range(-0.4, 0.4)).normalized;
            p.DayLength = r.Range(1200.0, 2700.0) * (p.IsMoon ? 1.5 : 1.0);
            p.SpinPhase = r.Range(0.0, Math.PI * 2);
            p.Gravity = MathUtil.Clamp(9.81 * Math.Pow(R / 24000.0, 0.6) * r.Range(0.85, 1.15), 4.5, 14.0);

            // default terrain
            p.ContinentFreq = 1.0 / (R * r.Range(0.45, 0.8));
            p.ContinentAmp = r.Range(180, 420);
            p.ContinentBias = r.Range(0.02, 0.18);
            p.WarpAmp = R * r.Range(0.06, 0.16);
            p.MountainAmp = r.Range(380, 1100);
            p.MountainFreq = 1.0 / r.Range(2600, 5500);
            p.MountainCover = r.Range(0.3, 0.75);
            p.MountainSharp = r.Range(1.0, 1.55);
            p.HillAmp = r.Range(40, 120);
            p.DetailAmp = r.Range(2.5, 7);
            p.TerraceStep = 0;
            p.CraterAmount = 0;
            p.DuneAmp = 0;
            p.SpireAmount = 0;

            p.HasSea = false;
            p.SeaLevel = 0;
            p.HasAtmosphere = true;
            p.AtmosphereHeight = R * r.Range(0.09, 0.12);
            p.RayleighHeight = (float)(p.AtmosphereHeight * 0.33);
            p.MieHeight = (float)(p.AtmosphereHeight * 0.12);
            p.Mie = 1.2e-4f;
            p.MieG = 0.76f;
            p.CloudCover = r.Range(0.25f, 0.6f);
            p.CloudDensity = r.Range(0.6f, 1.0f);
            p.CloudColor = Color.white;
            p.SnowLine = 1e9;
            p.Snow = new Color(0.92f, 0.94f, 0.97f);
            p.Sand = Hsv(r, 0.09f, 0.13f, 0.25f, 0.42f, 0.7f, 0.84f);
            p.Stone = Hsv(r, 0.05f, 0.12f, 0.08f, 0.2f, 0.45f, 0.6f);
            p.Crystal = Hsv(r, 0.5f, 0.62f, 0.5f, 0.8f, 0.8f, 1f);
            p.Bark = Hsv(r, 0.05f, 0.09f, 0.35f, 0.55f, 0.2f, 0.32f);
            p.Glow = Hsv(r, 0f, 1f, 0.6f, 0.9f, 0.9f, 1f);
            p.FloraDensity = r.Range(0.3, 0.8);
            p.GrassDensity = 0.6;
            p.FaunaDensity = r.Range(0.3, 0.8);
            p.SpeciesCount = r.Int(3, 6);
            p.ResourceRichness = r.Range(0.7, 1.3);
            p.Metal = star.MetalName;
            p.HasUranium = false;
            p.SentinelLevel = Mathf.Clamp(star.SentinelLevel + r.Int(-1, 1), 0, 3);
            p.PoiDensity = r.Range(0.6, 1.2);
            p.Hazard = HazardType.None;
            p.HazardLevel = 0;
            p.BaseTemperature = 20;
            p.DayNightSwing = r.Range(8, 20);
            p.RockModels = new[] { "rock_boulder_a", "rock_boulder_b", "rock_small" };

            Color sky;
            float rayleighStrength = 2.6e-4f;
            switch (p.Type)
            {
                case PlanetType.Lush:
                case PlanetType.Ocean:
                {
                    bool alien = r.Chance(0.2);
                    float gh = alien ? r.Pick(new[] { 0.08f, 0.12f, 0.78f, 0.85f, 0.5f }) : r.Range(0.22f, 0.36f);
                    p.Ground1 = Hsv(r, gh - 0.02f, gh + 0.02f, 0.45f, 0.75f, 0.28f, 0.45f);
                    p.Ground2 = Shift(p.Ground1, r.Range(-0.06f, 0.06f), r.Range(-0.1f, 0.1f), r.Range(0.05f, 0.15f));
                    p.Dry = Hsv(r, 0.09f, 0.14f, 0.35f, 0.55f, 0.45f, 0.62f);
                    p.Rock1 = Hsv(r, 0.05f, 0.12f, 0.08f, 0.22f, 0.3f, 0.45f);
                    p.Rock2 = Shift(p.Rock1, 0.02f, 0.05f, -0.1f);
                    p.SnowLine = r.Range(700, 1200);
                    sky = alien && r.Chance(0.5) ? Hsv(r, 0f, 1f, 0.35f, 0.55f, 0.9f, 1f) : Hsv(r, 0.54f, 0.62f, 0.45f, 0.65f, 0.9f, 1f);
                    p.HasSea = true;
                    p.SeaColor = Hsv(r, 0.48f, 0.6f, 0.55f, 0.85f, 0.35f, 0.55f);
                    p.SeaDeepColor = Shift(p.SeaColor, 0.02f, 0.1f, -0.25f);
                    p.CloudCover = r.Range(0.25f, 0.55f);
                    p.BaseTemperature = r.Range(12, 28);
                    p.FloraDensity = r.Range(0.65, 1.0);
                    p.FaunaDensity = r.Range(0.55, 1.0);
                    p.GrassDensity = r.Range(0.7, 1.0);
                    var trees = new List<string> { "tree_broadleaf", "tree_conifer" };
                    if (p.BaseTemperature > 20) trees.Add("tree_palm");
                    if (r.Chance(0.35)) trees.Add(r.Pick(new[] { "tree_bulb", "tree_fungal" }));
                    p.TreeModels = trees.ToArray();
                    p.PlantModels = new[] { "bush", "fern", "flower", "grass" };
                    p.Leaf = Shift(p.Ground1, r.Range(-0.04f, 0.04f), r.Range(0.05f, 0.2f), r.Range(-0.05f, 0.08f));
                    p.Leaf2 = Shift(p.Leaf, r.Range(-0.12f, 0.12f), 0, r.Range(0f, 0.15f));
                    if (p.Type == PlanetType.Ocean)
                    {
                        p.ContinentBias = r.Range(-0.32, -0.18);
                        p.MountainAmp *= 0.6;
                        p.TreeModels = new[] { "tree_palm", "tree_broadleaf" };
                    }
                    else p.ContinentBias = r.Range(0.02, 0.2);
                    break;
                }
                case PlanetType.Desert:
                    p.Ground1 = Hsv(r, 0.06f, 0.11f, 0.4f, 0.6f, 0.55f, 0.75f);
                    p.Ground2 = Shift(p.Ground1, -0.02f, 0.1f, -0.1f);
                    p.Dry = Shift(p.Ground1, 0.01f, -0.1f, 0.1f);
                    p.Rock1 = Hsv(r, 0.02f, 0.08f, 0.35f, 0.55f, 0.35f, 0.5f);
                    p.Rock2 = Shift(p.Rock1, 0.01f, 0f, -0.12f);
                    p.Sand = p.Ground1;
                    sky = Hsv(r, 0.05f, 0.12f, 0.25f, 0.45f, 0.85f, 1f);
                    p.Mie = 3.5e-4f;
                    p.CloudCover = r.Range(0f, 0.2f);
                    p.DuneAmp = r.Range(6, 16);
                    if (r.Chance(0.4)) p.TerraceStep = r.Range(25, 60);
                    p.BaseTemperature = r.Range(38, 70);
                    p.Hazard = HazardType.Heat;
                    p.HazardLevel = r.Range(0.3, 0.7);
                    p.FloraDensity = r.Range(0.1, 0.35);
                    p.GrassDensity = 0.1;
                    p.FaunaDensity = r.Range(0.15, 0.45);
                    p.TreeModels = new[] { "cactus", "tree_dead" };
                    p.PlantModels = new[] { "bush", "grass" };
                    p.RockModels = new[] { "rock_boulder_b", "rock_spire", "rock_small" };
                    p.Leaf = Hsv(r, 0.2f, 0.33f, 0.35f, 0.55f, 0.35f, 0.5f);
                    p.Leaf2 = Hsv(r, 0.85f, 1.05f, 0.5f, 0.8f, 0.8f, 1f);
                    p.ContinentBias = 0.4;
                    break;
                case PlanetType.Frozen:
                    p.Ground1 = Hsv(r, 0.55f, 0.62f, 0.03f, 0.1f, 0.86f, 0.95f);
                    p.Ground2 = Hsv(r, 0.52f, 0.6f, 0.12f, 0.25f, 0.75f, 0.88f);
                    p.Dry = p.Ground2;
                    p.Rock1 = Hsv(r, 0.55f, 0.65f, 0.08f, 0.2f, 0.28f, 0.4f);
                    p.Rock2 = Shift(p.Rock1, 0f, 0f, -0.1f);
                    p.Sand = p.Ground2;
                    p.SnowLine = -2000;
                    sky = Hsv(r, 0.5f, 0.72f, 0.2f, 0.45f, 0.9f, 1f);
                    p.HasSea = r.Chance(0.6);
                    p.SeaIsIce = true;
                    p.SeaColor = Hsv(r, 0.52f, 0.58f, 0.15f, 0.3f, 0.85f, 0.95f);
                    p.SeaDeepColor = p.SeaColor;
                    p.CloudCover = r.Range(0.2f, 0.55f);
                    p.BaseTemperature = r.Range(-70, -20);
                    p.Hazard = HazardType.Cold;
                    p.HazardLevel = r.Range(0.3, 0.8);
                    p.FloraDensity = r.Range(0.1, 0.4);
                    p.GrassDensity = 0.15;
                    p.FaunaDensity = r.Range(0.1, 0.4);
                    p.TreeModels = new[] { "tree_conifer", "tree_crystal" };
                    p.PlantModels = new[] { "bush", "grass" };
                    p.Leaf = Hsv(r, 0.38f, 0.5f, 0.35f, 0.6f, 0.2f, 0.35f);
                    p.Leaf2 = Shift(p.Leaf, 0.05f, -0.1f, 0.1f);
                    p.Crystal = Hsv(r, 0.52f, 0.6f, 0.3f, 0.6f, 0.9f, 1f);
                    break;
                case PlanetType.Toxic:
                    p.Ground1 = Hsv(r, 0.14f, 0.24f, 0.45f, 0.75f, 0.35f, 0.55f);
                    p.Ground2 = Shift(p.Ground1, r.Range(-0.08f, 0.08f), 0f, 0.08f);
                    p.Dry = Hsv(r, 0.08f, 0.14f, 0.5f, 0.7f, 0.4f, 0.55f);
                    p.Rock1 = Hsv(r, 0.75f, 0.95f, 0.15f, 0.35f, 0.25f, 0.38f);
                    p.Rock2 = Shift(p.Rock1, 0.05f, 0f, -0.1f);
                    sky = Hsv(r, 0.12f, 0.22f, 0.4f, 0.65f, 0.85f, 1f);
                    p.Mie = 4.5e-4f;
                    p.HasSea = r.Chance(0.6);
                    p.SeaColor = Hsv(r, 0.24f, 0.34f, 0.6f, 0.9f, 0.35f, 0.5f);
                    p.SeaDeepColor = Shift(p.SeaColor, 0f, 0.1f, -0.2f);
                    p.CloudCover = r.Range(0.45f, 0.8f);
                    p.CloudColor = Hsv(r, 0.13f, 0.22f, 0.12f, 0.3f, 0.9f, 1f);
                    p.BaseTemperature = r.Range(15, 50);
                    p.Hazard = HazardType.Toxic;
                    p.HazardLevel = r.Range(0.35, 0.8);
                    p.FloraDensity = r.Range(0.4, 0.8);
                    p.FaunaDensity = r.Range(0.2, 0.6);
                    p.TreeModels = new[] { "tree_fungal", "tree_bulb", "coral_spire" };
                    p.PlantModels = new[] { "fern", "grass", "bush" };
                    p.Leaf = Hsv(r, 0.75f, 1.0f, 0.5f, 0.8f, 0.4f, 0.6f);
                    p.Leaf2 = Hsv(r, 0.1f, 0.2f, 0.6f, 0.9f, 0.6f, 0.85f);
                    p.Glow = Hsv(r, 0.25f, 0.4f, 0.8f, 1f, 1f, 1f);
                    break;
                case PlanetType.Volcanic:
                    p.Ground1 = Hsv(r, 0.02f, 0.08f, 0.15f, 0.35f, 0.12f, 0.2f);
                    p.Ground2 = Hsv(r, 0.0f, 0.06f, 0.4f, 0.6f, 0.18f, 0.28f);
                    p.Dry = p.Ground2;
                    p.Rock1 = Hsv(r, 0.0f, 0.05f, 0.2f, 0.4f, 0.14f, 0.22f);
                    p.Rock2 = Hsv(r, 0.03f, 0.08f, 0.3f, 0.5f, 0.28f, 0.38f);
                    p.Sand = p.Ground1;
                    sky = Hsv(r, 0.0f, 0.07f, 0.45f, 0.7f, 0.7f, 0.9f);
                    p.Mie = 6e-4f;
                    p.HasSea = true;
                    p.SeaIsLava = true;
                    p.SeaColor = Hsv(r, 0.02f, 0.07f, 0.9f, 1f, 1f, 1f);
                    p.SeaDeepColor = p.SeaColor;
                    p.ContinentBias = r.Range(0.1, 0.3);
                    p.CloudCover = r.Range(0.2f, 0.55f);
                    p.CloudColor = new Color(0.45f, 0.42f, 0.4f);
                    p.MountainAmp = r.Range(800, 1500);
                    p.BaseTemperature = r.Range(90, 220);
                    p.Hazard = HazardType.Heat;
                    p.HazardLevel = r.Range(0.7, 1.0);
                    p.FloraDensity = r.Range(0.02, 0.15);
                    p.GrassDensity = 0;
                    p.FaunaDensity = r.Range(0.0, 0.2);
                    p.TreeModels = new[] { "tree_dead" };
                    p.PlantModels = new string[0];
                    p.RockModels = new[] { "rock_spire", "rock_boulder_b", "rock_small" };
                    p.HasUranium = true;
                    p.Stone = Hsv(r, 0.0f, 0.05f, 0.2f, 0.3f, 0.2f, 0.3f);
                    p.Glow = Hsv(r, 0.03f, 0.08f, 0.9f, 1f, 1f, 1f);
                    break;
                case PlanetType.Barren:
                    p.Ground1 = Hsv(r, 0.05f, 0.12f, 0.15f, 0.35f, 0.38f, 0.55f);
                    p.Ground2 = Shift(p.Ground1, 0.02f, 0.05f, -0.08f);
                    p.Dry = p.Ground2;
                    p.Rock1 = Hsv(r, 0.05f, 0.1f, 0.05f, 0.15f, 0.3f, 0.42f);
                    p.Rock2 = Shift(p.Rock1, 0f, 0f, -0.1f);
                    sky = Hsv(r, 0.05f, 0.6f, 0.08f, 0.25f, 0.8f, 0.95f);
                    rayleighStrength *= 0.45f;
                    p.CloudCover = r.Range(0f, 0.15f);
                    p.CraterAmount = r.Range(0.2, 0.6);
                    if (r.Chance(0.3)) p.TerraceStep = r.Range(30, 70);
                    p.BaseTemperature = r.Range(-25, 35);
                    p.DayNightSwing = r.Range(20, 40);
                    p.Hazard = r.Chance(0.5) ? HazardType.Cold : HazardType.None;
                    p.HazardLevel = p.Hazard == HazardType.None ? 0 : r.Range(0.15, 0.4);
                    p.FloraDensity = r.Range(0.05, 0.25);
                    p.GrassDensity = 0.2;
                    p.FaunaDensity = r.Range(0.05, 0.3);
                    p.TreeModels = new[] { "tree_dead" };
                    p.PlantModels = new[] { "bush", "grass" };
                    p.RockModels = new[] { "rock_boulder_a", "rock_boulder_b", "rock_spire", "rock_small" };
                    p.Leaf = Hsv(r, 0.12f, 0.2f, 0.3f, 0.5f, 0.35f, 0.5f);
                    p.Leaf2 = Shift(p.Leaf, 0.05f, 0f, 0.1f);
                    break;
                case PlanetType.Dead:
                    p.Ground1 = Hsv(r, 0f, 1f, 0.02f, 0.1f, 0.35f, 0.55f);
                    p.Ground2 = Shift(p.Ground1, 0f, 0f, -0.08f);
                    p.Dry = p.Ground1;
                    p.Rock1 = Shift(p.Ground1, 0f, 0f, -0.12f);
                    p.Rock2 = Shift(p.Ground1, 0f, 0f, -0.2f);
                    sky = Color.black;
                    p.HasAtmosphere = false;
                    p.AtmosphereHeight = 0;
                    p.CloudCover = 0;
                    p.CraterAmount = r.Range(0.6, 1.0);
                    p.MountainAmp *= 0.6;
                    p.BaseTemperature = r.Range(-120, 90);
                    p.DayNightSwing = r.Range(60, 120);
                    p.Hazard = HazardType.Radiation;
                    p.HazardLevel = r.Range(0.25, 0.5);
                    p.FloraDensity = 0;
                    p.GrassDensity = 0;
                    p.FaunaDensity = 0;
                    p.SpeciesCount = 0;
                    p.TreeModels = new string[0];
                    p.PlantModels = new string[0];
                    p.Stone = p.Rock1;
                    break;
                case PlanetType.Exotic:
                {
                    float h = r.NextF();
                    p.Ground1 = Hsv(r, h, h + 0.05f, 0.5f, 0.85f, 0.4f, 0.7f);
                    p.Ground2 = Shift(p.Ground1, r.Range(0.1f, 0.4f), 0f, 0f);
                    p.Dry = Shift(p.Ground1, 0.5f, -0.2f, 0f);
                    p.Rock1 = Hsv(r, 0f, 1f, 0.2f, 0.5f, 0.3f, 0.5f);
                    p.Rock2 = Shift(p.Rock1, 0.2f, 0f, 0f);
                    sky = Hsv(r, 0f, 1f, 0.4f, 0.7f, 0.9f, 1f);
                    p.HasSea = r.Chance(0.5);
                    p.SeaColor = Hsv(r, 0f, 1f, 0.6f, 0.9f, 0.4f, 0.6f);
                    p.SeaDeepColor = Shift(p.SeaColor, 0f, 0f, -0.2f);
                    p.TerraceStep = r.Chance(0.6) ? r.Range(20, 60) : 0;
                    p.SpireAmount = r.Range(0.3, 1.0);
                    p.BaseTemperature = r.Range(0, 30);
                    p.Hazard = r.Chance(0.5) ? HazardType.Radiation : HazardType.None;
                    p.HazardLevel = p.Hazard == HazardType.None ? 0 : r.Range(0.2, 0.5);
                    p.FloraDensity = r.Range(0.35, 0.7);
                    p.FaunaDensity = r.Range(0.2, 0.6);
                    p.TreeModels = new[] { "coral_spire", "tree_crystal", "tree_bulb" };
                    p.PlantModels = new[] { "fern", "flower", "grass" };
                    p.Leaf = Hsv(r, 0f, 1f, 0.6f, 0.9f, 0.5f, 0.8f);
                    p.Leaf2 = Shift(p.Leaf, 0.3f, 0f, 0f);
                    p.Crystal = Hsv(r, 0f, 1f, 0.5f, 0.8f, 0.9f, 1f);
                    break;
                }
                default: // Irradiated
                    p.Ground1 = Hsv(r, 0.28f, 0.45f, 0.4f, 0.65f, 0.3f, 0.45f);
                    p.Ground2 = Shift(p.Ground1, 0.08f, 0f, 0.05f);
                    p.Dry = Hsv(r, 0.12f, 0.18f, 0.4f, 0.6f, 0.4f, 0.5f);
                    p.Rock1 = Hsv(r, 0.3f, 0.5f, 0.1f, 0.25f, 0.2f, 0.32f);
                    p.Rock2 = Shift(p.Rock1, 0f, 0f, -0.08f);
                    sky = Hsv(r, 0.25f, 0.42f, 0.35f, 0.6f, 0.85f, 1f);
                    p.HasSea = r.Chance(0.4);
                    p.SeaColor = Hsv(r, 0.35f, 0.45f, 0.6f, 0.9f, 0.3f, 0.5f);
                    p.SeaDeepColor = Shift(p.SeaColor, 0f, 0f, -0.2f);
                    p.CloudCover = r.Range(0.3f, 0.6f);
                    p.BaseTemperature = r.Range(-10, 40);
                    p.Hazard = HazardType.Radiation;
                    p.HazardLevel = r.Range(0.4, 0.85);
                    p.FloraDensity = r.Range(0.3, 0.6);
                    p.FaunaDensity = r.Range(0.15, 0.45);
                    p.TreeModels = new[] { "tree_bulb", "tree_fungal", "tree_dead" };
                    p.PlantModels = new[] { "fern", "grass", "bush" };
                    p.Leaf = Hsv(r, 0.18f, 0.32f, 0.6f, 0.9f, 0.5f, 0.75f);
                    p.Leaf2 = Hsv(r, 0.1f, 0.18f, 0.7f, 0.9f, 0.7f, 0.9f);
                    p.Glow = Hsv(r, 0.3f, 0.4f, 0.8f, 1f, 1f, 1f);
                    p.HasUranium = true;
                    break;
            }

            if (p.IsMoon)
            {
                p.FloraDensity *= 0.5;
                p.FaunaDensity *= 0.5;
                p.ContinentAmp *= 0.7;
                p.MountainAmp *= 0.7;
            }

            p.SkyTint = sky;
            if (p.HasAtmosphere)
            {
                p.Rayleigh = RayleighFor(sky, rayleighStrength);
                float thin = p.Type == PlanetType.Barren ? 0.5f : 1f;
                p.Mie *= thin;
                p.CloudAltitude = (float)Math.Min(p.AtmosphereHeight * 0.45, 1400 + p.ContinentAmp * 0.5);
            }
            else
            {
                p.Rayleigh = Vector3.zero;
                p.Mie = 0;
                p.CloudCover = 0;
            }

            if (!p.HasSea) p.ContinentBias = Math.Max(p.ContinentBias, 0.05);
            if (p.TreeModels.Length > 3)
            {
                // keep 3 species so each planet has its own character
                var list = new List<string>(p.TreeModels);
                while (list.Count > 3) list.RemoveAt(r.Int(0, list.Count - 1));
                p.TreeModels = list.ToArray();
            }

            // tie temperature to how far the planet is from its star
            p.BaseTemperature += (1.0 - zone) * 18.0;
            double peak = p.ContinentAmp * 1.2 + p.MountainAmp + p.HillAmp + p.DetailAmp * 2 + p.DuneAmp + p.SpireAmount * 220 + 50;
            p.MaxHeight = peak * 1.45 + 150;
            p.MinHeight = -(p.ContinentAmp * 2.2 + p.HillAmp + p.CraterAmount * 300 + 150);
            if (p.SpeciesCount > 0 && p.FaunaDensity < 0.05) p.SpeciesCount = 0;
        }

        static GasGiantData MakeGasGiant(ulong seed, StarInfo star, Vector3d pos, int index)
        {
            var r = new Rng(seed);
            var g = new GasGiantData
            {
                Seed = seed,
                Name = NameGen.Planet(seed, star.Name, 7 + index),
                Radius = r.Range(150000, 240000),
                Position = pos,
                Axis = new Vector3d(r.Range(-0.3, 0.3), 1, r.Range(-0.3, 0.3)).normalized,
                DayLength = r.Range(1200, 3000),
            };
            float h = r.Pick(new[] { 0.07f, 0.1f, 0.55f, 0.6f, 0.02f, 0.75f, 0.12f });
            g.BandA = r.Hsv(h - 0.02f, h + 0.02f, 0.3f, 0.6f, 0.7f, 0.9f);
            g.BandB = r.Hsv(h - 0.04f, h + 0.06f, 0.2f, 0.5f, 0.45f, 0.65f);
            g.BandC = r.Hsv(h + 0.4f, h + 0.6f, 0.1f, 0.3f, 0.8f, 0.95f);
            g.HasRings = r.Chance(0.55);
            g.RingInner = g.Radius * r.Range(1.3, 1.6);
            g.RingOuter = g.Radius * r.Range(1.9, 2.5);
            g.RingColor = r.Hsv(h - 0.03f, h + 0.03f, 0.1f, 0.3f, 0.6f, 0.85f);
            g.Rayleigh = new Vector3(0.3f, 0.5f, 1f) * 1.5e-5f;
            return g;
        }
    }
}

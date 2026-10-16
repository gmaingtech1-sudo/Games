using System;
using UnityEngine;

namespace Wayfarer
{
    public enum PlanetType { Lush, Ocean, Desert, Frozen, Toxic, Volcanic, Barren, Dead, Exotic, Irradiated }

    public enum HazardType { None, Heat, Cold, Toxic, Radiation }

    /// <summary>Everything that defines a planet. Plain data, safe to read from
    /// the terrain worker threads.</summary>
    public sealed class PlanetData
    {
        public ulong Seed;
        public int Index;
        public string Name;
        public PlanetType Type;
        public bool IsMoon;
        public int ParentIndex = -1;

        // ── orbit & spin (system frame, metres) ─────────────────────────────
        public double Radius;
        public Vector3d Position;
        public Vector3d Axis;
        public double DayLength;      // seconds per rotation
        public double SpinPhase;
        public double Gravity;        // m/s² at the surface

        // ── terrain shape (metres) ─────────────────────────────────────────
        public double ContinentFreq, ContinentAmp, ContinentBias;
        public double WarpAmp;
        public double MountainAmp, MountainFreq, MountainCover, MountainSharp;
        public double HillAmp, DetailAmp;
        public double TerraceStep;    // 0 = none
        public double CraterAmount;   // 0..1
        public double DuneAmp;
        public double SpireAmount;    // exotic rock needles
        public double OceanFloor = 0.6;
        public double MinHeight, MaxHeight; // conservative bounds for culling

        // ── water / lava / ice ─────────────────────────────────────────────
        public bool HasSea;
        public double SeaLevel;       // height above Radius
        public Color SeaColor;
        public Color SeaDeepColor;
        public bool SeaIsLava;
        public bool SeaIsIce;

        // ── atmosphere ─────────────────────────────────────────────────────
        public bool HasAtmosphere;
        public double AtmosphereHeight;
        public Vector3 Rayleigh;      // scattering coefficients per metre at sea level
        public float Mie;
        public float MieG = 0.76f;
        public float RayleighHeight, MieHeight;
        public Color SkyTint;         // representative sky colour for UI / ambient
        public float CloudCover;      // 0..1
        public float CloudAltitude;   // metres above Radius
        public float CloudDensity;
        public Color CloudColor = Color.white;

        // ── surface colours ────────────────────────────────────────────────
        public Color Ground1, Ground2, Dry, Rock1, Rock2, Snow, Sand;
        public double SnowLine;       // metres, very high = none
        public Color Bark, Leaf, Leaf2, Glow, Stone, Crystal;

        // ── climate & hazards ──────────────────────────────────────────────
        public double BaseTemperature;  // °C at the equator, sea level, noon
        public double DayNightSwing;    // °C
        public HazardType Hazard;
        public double HazardLevel;      // 0..1

        // ── life & resources ───────────────────────────────────────────────
        public double FloraDensity;     // 0..1
        public string[] TreeModels = new string[0];
        public string[] PlantModels = new string[0];
        public string[] RockModels = new string[0];
        public double GrassDensity;
        public double FaunaDensity;
        public int SpeciesCount;
        public double ResourceRichness; // 0.5..1.5
        public string Metal;            // Copper / Silver / Gold / Platinum
        public bool HasUranium;
        public int SentinelLevel;
        public double PoiDensity;

        public string TypeLabel
        {
            get
            {
                switch (Type)
                {
                    case PlanetType.Lush: return "Lush";
                    case PlanetType.Ocean: return "Ocean world";
                    case PlanetType.Desert: return "Desert";
                    case PlanetType.Frozen: return "Frozen";
                    case PlanetType.Toxic: return "Toxic";
                    case PlanetType.Volcanic: return "Volcanic";
                    case PlanetType.Barren: return "Barren";
                    case PlanetType.Dead: return "Airless";
                    case PlanetType.Exotic: return "Anomalous";
                    default: return "Irradiated";
                }
            }
        }

        public string HazardLabel
        {
            get
            {
                if (Hazard == HazardType.None || HazardLevel < 0.05) return "No hazards";
                string sev = HazardLevel > 0.75 ? "Extreme" : HazardLevel > 0.4 ? "High" : "Mild";
                switch (Hazard)
                {
                    case HazardType.Heat: return sev + " heat";
                    case HazardType.Cold: return sev + " cold";
                    case HazardType.Toxic: return sev + " toxicity";
                    default: return sev + " radiation";
                }
            }
        }

        public string FaunaLabel => FaunaDensity <= 0.01 ? "None" : FaunaDensity < 0.3 ? "Sparse" : FaunaDensity < 0.65 ? "Typical" : "Abundant";
        public string FloraLabel => FloraDensity <= 0.01 ? "None" : FloraDensity < 0.3 ? "Sparse" : FloraDensity < 0.65 ? "Typical" : "Bountiful";
        public string SentinelLabel => SentinelLevel == 0 ? "None" : SentinelLevel == 1 ? "Low security" : SentinelLevel == 2 ? "Watchful" : "Aggressive";

        public double AtmosphereRadius => Radius + AtmosphereHeight;
    }

    public sealed class GasGiantData
    {
        public ulong Seed;
        public string Name;
        public double Radius;
        public Vector3d Position;
        public Vector3d Axis;
        public double DayLength;
        public Color BandA, BandB, BandC;
        public bool HasRings;
        public double RingInner, RingOuter;
        public Color RingColor;
        public Vector3 Rayleigh;
    }

    public sealed class StationData
    {
        public ulong Seed;
        public string Name;
        public Vector3d Position;
        public QuatD Rotation;
        public int OrbitPlanet;
        public double PriceFactor;
    }

    public sealed class AsteroidFieldData
    {
        public ulong Seed;
        public Vector3d Position;
        public double Radius;
        public int Count;
        public bool Rich;
    }

    public sealed class StarSystemData
    {
        public StarInfo Star;
        public double StarRadius;
        public Color StarColor;
        public float StarLight;        // directional light intensity
        public PlanetData[] Planets;
        public GasGiantData[] GasGiants;
        public StationData Station;
        public AsteroidFieldData[] AsteroidFields;
        public Vector3d ArrivalPosition;
        public Vector3d ArrivalLookAt;
    }
}

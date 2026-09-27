using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    /// <summary>A planet in the running game: its terrain, atmosphere and
    /// materials, plus the plants, animals and places on it while you are near.</summary>
    public sealed class PlanetBody
    {
        public readonly PlanetData Data;
        public readonly PlanetField Field;
        public readonly GameObject Root;
        public readonly PlanetTerrain Terrain;
        public readonly Material TerrainMat;
        public readonly Material AtmoMat;
        public readonly GameObject Atmo;

        public QuatD Rotation = QuatD.identity;     // orientation in the system frame
        public Vector3d AngularVelocity;            // system frame, rad/s
        public float RenderScale = 1f;
        public int MatrixVersion;
        Matrix4x4 lastMatrix;

        public FloraSystem Flora;
        public FaunaSystem Fauna;
        public PoiSystem Pois;

        public double Radius => Data.Radius;
        public double SoiRadius => Data.Radius * 3.0;
        public double AtmoTop => Data.HasAtmosphere ? Data.AtmosphereRadius : Data.Radius + Data.MaxHeight;

        static readonly int IdPlanetPos = Shader.PropertyToID("_PlanetPos");
        static readonly int IdPScale = Shader.PropertyToID("_PScale");
        static readonly int IdPlanetRot = Shader.PropertyToID("_PlanetRot");
        static readonly int IdSunDir = Shader.PropertyToID("_SunDir");
        static readonly int IdSunColor = Shader.PropertyToID("_SunColor");
        static readonly int IdLightColor = Shader.PropertyToID("_LightColor");
        static readonly int IdAmbientSky = Shader.PropertyToID("_AmbientSky");
        static readonly int IdCloudDrift = Shader.PropertyToID("_CloudDrift");
        static readonly int IdSteps = Shader.PropertyToID("_Steps");
        static readonly int IdPlanetCenter = Shader.PropertyToID("_PlanetCenter");
        static readonly int IdSunDirWorld = Shader.PropertyToID("_SunDirWorld");
        static readonly int IdSunDirLocal = Shader.PropertyToID("_SunDirLocal");
        static readonly int IdAmbient = Shader.PropertyToID("_Ambient");
        static readonly int IdNightAmbient = Shader.PropertyToID("_NightAmbient");
        static readonly int IdDetailFade = Shader.PropertyToID("_DetailFade");

        public PlanetBody(PlanetData data, Transform parent, GraphicsQuality q)
        {
            Data = data;
            Field = new PlanetField(data);
            Root = new GameObject("Planet " + data.Name);
            Root.transform.SetParent(parent, false);

            var terrainRoot = new GameObject("Terrain").transform;
            terrainRoot.SetParent(Root.transform, false);

            TerrainMat = Materials.New("Wayfarer/Terrain", "Terrain " + data.Name);
            TerrainMat.SetColor("_Ground1", data.Ground1);
            TerrainMat.SetColor("_Ground2", data.Ground2);
            TerrainMat.SetColor("_Dry", data.Dry);
            TerrainMat.SetColor("_Rock1", data.Rock1);
            TerrainMat.SetColor("_Rock2", data.Rock2);
            TerrainMat.SetColor("_Snow", data.Snow);
            TerrainMat.SetColor("_Sand", data.HasSea ? data.Sand : data.Ground2);
            TerrainMat.SetFloat("_Radius", (float)data.Radius);
            TerrainMat.SetFloat("_SeaLevel", data.HasSea ? (float)data.SeaLevel : -100000f);
            TerrainMat.SetFloat("_SnowLine", (float)data.SnowLine);
            TerrainMat.SetFloat("_CloudCover", data.CloudCover);
            TerrainMat.SetFloat("_CloudRadius", (float)(data.Radius + data.CloudAltitude));
            TerrainMat.SetFloat("_CloudScale", 1f / 2600f);
            if (data.SeaIsLava) TerrainMat.SetVector("_LavaGlow", (Vector4)(data.SeaColor.linear * 3.5f));
            else TerrainMat.SetVector("_LavaGlow", Vector4.zero);

            Terrain = new PlanetTerrain(data, Field, terrainRoot, TerrainMat, q.TerrainSpacing)
            {
                SplitFactor = q.TerrainSplit,
                CastShadows = q.Shadows > 0,
            };

            if (data.HasAtmosphere || data.HasSea)
            {
                AtmoMat = Materials.New("Wayfarer/Atmosphere", "Atmosphere " + data.Name);
                double ra = data.HasAtmosphere ? data.AtmosphereRadius : data.Radius + 50;
                AtmoMat.SetFloat("_R", (float)data.Radius);
                AtmoMat.SetFloat("_Ra", (float)ra);
                AtmoMat.SetFloat("_Rs", data.HasSea ? (float)(data.Radius + data.SeaLevel) : 0f);
                AtmoMat.SetFloat("_Rc", (float)(data.Radius + data.CloudAltitude));
                AtmoMat.SetVector("_BetaR", data.HasAtmosphere ? (Vector4)data.Rayleigh : Vector4.zero);
                AtmoMat.SetFloat("_BetaM", data.HasAtmosphere ? data.Mie : 0f);
                AtmoMat.SetFloat("_HR", data.RayleighHeight > 0 ? data.RayleighHeight : 400f);
                AtmoMat.SetFloat("_HM", data.MieHeight > 0 ? data.MieHeight : 150f);
                AtmoMat.SetFloat("_MieG", data.MieG);
                AtmoMat.SetFloat("_CloudCover", data.CloudCover);
                AtmoMat.SetFloat("_CloudDensity", data.CloudDensity);
                AtmoMat.SetColor("_CloudColor", data.CloudColor);
                AtmoMat.SetFloat("_CloudScale", 1f / 2600f);
                AtmoMat.SetColor("_WaterColor", data.SeaColor);
                AtmoMat.SetColor("_WaterDeep", data.SeaDeepColor);
                AtmoMat.SetFloat("_SeaMode", data.SeaIsLava ? 1f : data.SeaIsIce ? 2f : 0f);
                AtmoMat.SetColor("_GroundColor", Color.Lerp(data.Ground1, data.Rock1, 0.3f));
                AtmoMat.SetFloat("_Steps", q.AtmosphereSteps);

                Atmo = new GameObject("Atmosphere");
                Atmo.transform.SetParent(Root.transform, false);
                Atmo.transform.localScale = Vector3.one * (float)(ra * 1.04);
                Atmo.AddComponent<MeshFilter>().sharedMesh = MeshGen.Sphere;
                var mr = Atmo.AddComponent<MeshRenderer>();
                mr.sharedMaterial = AtmoMat;
                mr.shadowCastingMode = ShadowCastingMode.Off;
                mr.receiveShadows = false;
                mr.lightProbeUsage = LightProbeUsage.Off;
                mr.reflectionProbeUsage = ReflectionProbeUsage.Off;
            }
        }

        public void ApplyQuality(GraphicsQuality q)
        {
            Terrain.SplitFactor = q.TerrainSplit;
            Terrain.CastShadows = q.Shadows > 0;
            Terrain.RefreshShadowModes();
            if (AtmoMat != null) AtmoMat.SetFloat(IdSteps, q.AtmosphereSteps);
            Flora?.ApplyQuality(q);
        }

        public QuatD RotationAt(double t)
        {
            double angle = Data.SpinPhase + t * (System.Math.PI * 2.0 / Data.DayLength);
            return QuatD.FromTo(Vector3d.up, Data.Axis) * QuatD.AngleAxis(angle, Vector3d.up);
        }

        public void UpdateSpin(double t)
        {
            Rotation = RotationAt(t);
            AngularVelocity = Data.Axis * (System.Math.PI * 2.0 / Data.DayLength);
        }

        /// <summary>Planet-local sun direction (unit).</summary>
        public Vector3d SunDirLocal(Vector3d starPosSystem) => Rotation.Inverse() * (starPosSystem - Data.Position).normalized;

        /// <summary>Height of the visible ground under a planet-local direction.</summary>
        public double GroundHeight(Vector3d dir)
        {
            if (Terrain.TryMeshHeight(dir, out double h)) return h;
            return Field.Height(dir);
        }

        public double GroundHeightExact(Vector3d dir) => Field.Height(dir);

        public Vector3d SurfacePoint(Vector3d dir)
        {
            dir = dir.normalized;
            return dir * (Data.Radius + GroundHeight(dir));
        }

        /// <summary>0 at night, 1 in full day, for a planet-local up direction.</summary>
        public float DayFactor(Vector3d up, Vector3d sunLocal) =>
            Mathf.SmoothStep(0f, 1f, (float)MathUtil.Clamp01((Vector3d.Dot(up, sunLocal) + 0.18) / 0.45));

        /// <summary>Called every frame after the root transform is placed.</summary>
        public void UpdateMaterials(Vector3 sunDirWorld, Vector3d sunDirLocal, Color lightLinear, float lightIntensity, double time, GraphicsQuality q)
        {
            var tr = Root.transform;
            Vector3 center = tr.position;
            Matrix4x4 m = tr.localToWorldMatrix;
            if (m != lastMatrix) { lastMatrix = m; MatrixVersion++; }

            Color sky = Data.SkyTint.linear;
            float skyL = Mathf.Max(0.05f, sky.maxColorComponent);
            Color skyN = sky / skyL;
            Color ambient = Data.HasAtmosphere ? skyN * (0.2f * lightIntensity) + new Color(0.02f, 0.02f, 0.02f) : new Color(0.018f, 0.018f, 0.02f);
            Color night = Data.HasAtmosphere ? skyN * 0.012f + new Color(0.006f, 0.007f, 0.012f) : new Color(0.004f, 0.004f, 0.006f);

            TerrainMat.SetVector(IdPlanetCenter, center);
            TerrainMat.SetVector(IdSunDirWorld, sunDirWorld);
            TerrainMat.SetVector(IdSunDirLocal, (Vector3)sunDirLocal);
            TerrainMat.SetVector(IdAmbient, (Vector4)ambient);
            TerrainMat.SetVector(IdNightAmbient, (Vector4)night);
            TerrainMat.SetFloat(IdDetailFade, q.DetailDistance);
            float drift = (float)((time * 0.00035) % (System.Math.PI * 2));
            TerrainMat.SetFloat(IdCloudDrift, drift);

            if (AtmoMat != null)
            {
                AtmoMat.SetVector(IdPlanetPos, center);
                AtmoMat.SetFloat(IdPScale, RenderScale);
                AtmoMat.SetMatrix(IdPlanetRot, Matrix4x4.Rotate(Quaternion.Inverse(tr.rotation)));
                AtmoMat.SetVector(IdSunDir, sunDirWorld);
                AtmoMat.SetVector(IdSunColor, (Vector4)(lightLinear * (20f * lightIntensity)));
                AtmoMat.SetVector(IdLightColor, (Vector4)(lightLinear * lightIntensity));
                AtmoMat.SetVector(IdAmbientSky, (Vector4)(ambient * 1.4f));
                AtmoMat.SetFloat(IdCloudDrift, drift);
            }
        }

        public void Dispose()
        {
            Flora?.Dispose();
            Fauna?.Dispose();
            Pois?.Dispose();
            Terrain.Dispose();
            Object.Destroy(Root);
            Object.Destroy(TerrainMat);
            if (AtmoMat != null) Object.Destroy(AtmoMat);
        }
    }
}

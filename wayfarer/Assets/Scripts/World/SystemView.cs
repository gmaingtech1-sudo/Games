using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    /// <summary>
    /// The star system you are in, as live objects, plus the coordinate
    /// bookkeeping that makes a universe-sized world work in Unity:
    ///
    ///  • Reference frame. Out in space everything is simulated in the system
    ///    frame (star at the origin). Near a planet the game switches to that
    ///    planet's rotating frame, so the ground stays still under your feet
    ///    while the sun and sky wheel overhead.
    ///  • Floating origin. Positions are doubles; Unity only ever sees them
    ///    relative to an origin that follows the camera.
    ///  • Scaled space. Far-away bodies are drawn closer and proportionally
    ///    smaller, so they look identical but stay inside the depth range.
    /// </summary>
    public sealed class SystemView
    {
        public readonly StarSystemData Data;
        public readonly GameObject Root;
        public readonly List<PlanetBody> Planets = new List<PlanetBody>();
        public readonly List<GasGiantBody> Giants = new List<GasGiantBody>();
        public readonly List<AsteroidField> Fields = new List<AsteroidField>();
        public readonly StarBody Star;
        public readonly StationBody Station;
        public readonly Light Sun;
        public readonly RenderTexture SkyCube;
        readonly Material skyMat;
        readonly Cubemap reflection;
        float reflectionTimer;

        public double Time;
        public PlanetBody Ref { get; private set; }
        public Vector3d Origin;
        public Vector3d CameraRef;
        public Vector3 SunDirRef;          // unit, toward the star, in the reference frame
        public float LightIntensity;
        public Color LightColor;           // linear
        public PlanetBody ActivePlanet => Ref;

        public event Action<PlanetBody, PlanetBody> FrameChanged; // old, new
        public event Action OriginShifted;

        const double ScaledStart = 110000;
        const double ScaledMax = 260000;
        const double ScaledFalloff = 700000;
        const double RebaseDistance = 1500;

        public SystemView(StarSystemData data, double time, GraphicsQuality q)
        {
            Data = data;
            Time = time;
            Root = new GameObject("System " + data.Star.Name);

            Star = new StarBody(data, Root.transform);
            foreach (var p in data.Planets) Planets.Add(new PlanetBody(p, Root.transform, q));
            foreach (var g in data.GasGiants) Giants.Add(new GasGiantBody(g, Root.transform));
            if (data.Station != null) Station = new StationBody(data.Station, Root.transform);
            foreach (var f in data.AsteroidFields) Fields.Add(new AsteroidField(f, Root.transform));

            var sunGo = new GameObject("Sunlight");
            sunGo.transform.SetParent(Root.transform, false);
            Sun = sunGo.AddComponent<Light>();
            Sun.type = LightType.Directional;
            Sun.shadows = LightShadows.Soft;
            Sun.shadowStrength = 0.92f;
            Sun.shadowBias = 0.06f;
            Sun.shadowNormalBias = 0.5f;
            Sun.shadowNearPlane = 0.2f;
            LightColor = data.StarColor;
            LightIntensity = data.StarLight;
            Sun.color = data.StarColor;
            Sun.intensity = data.StarLight;
            RenderSettings.sun = Sun;

            SkyCube = SkyBaker.Bake(data, q.SkyResolution);
            skyMat = Materials.New("Wayfarer/Skybox", "Sky");
            skyMat.SetTexture("_Tex", SkyCube);
            skyMat.SetFloat("_Exposure", 1f);
            RenderSettings.skybox = skyMat;

            reflection = new Cubemap(16, TextureFormat.RGBAHalf, true);
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            RenderSettings.customReflection = reflection;
            RenderSettings.reflectionIntensity = 1f;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.fog = false;

            foreach (var p in Planets) p.UpdateSpin(Time);
            foreach (var g in Giants) g.UpdateSpin(Time);
        }

        // ───────────────────────────── frames ─────────────────────────────
        public QuatD RefRotation => Ref == null ? QuatD.identity : Ref.Rotation;
        public Vector3d RefPosition => Ref == null ? Vector3d.zero : Ref.Data.Position;

        public Vector3d SysToRef(Vector3d p) => Ref == null ? p : Ref.Rotation.Inverse() * (p - Ref.Data.Position);
        public Vector3d RefToSys(Vector3d p) => Ref == null ? p : Ref.Data.Position + Ref.Rotation * p;
        public Quaternion SysToRef(Quaternion q) => Ref == null ? q : Ref.Rotation.Inverse().ToQuaternion() * q;
        public Quaternion RefToSys(Quaternion q) => Ref == null ? q : Ref.Rotation.ToQuaternion() * q;

        public Vector3d VelRefToSys(Vector3d pRef, Vector3d vRef)
        {
            if (Ref == null) return vRef;
            Vector3d r = Ref.Rotation * pRef;
            return Ref.Rotation * vRef + Vector3d.Cross(Ref.AngularVelocity, r);
        }

        public Vector3d VelSysToRef(Vector3d pSys, Vector3d vSys)
        {
            if (Ref == null) return vSys;
            Vector3d r = pSys - Ref.Data.Position;
            return Ref.Rotation.Inverse() * (vSys - Vector3d.Cross(Ref.AngularVelocity, r));
        }

        public Vector3 ToUnity(Vector3d pRef) => (Vector3)(pRef - Origin);
        public Vector3d FromUnity(Vector3 u) => Origin + (Vector3d)u;

        /// <summary>Converts a moving thing from the current frame into another planet's frame (or space).</summary>
        public struct Motion
        {
            public Vector3d Pos, Vel;
            public Quaternion Rot;
        }

        /// <summary>Switches the reference frame. Every simulated thing must be converted by its owner
        /// using the FrameChanged event (see ConvertToNewFrame).</summary>
        public void SetReference(PlanetBody planet)
        {
            if (planet == Ref) return;
            var old = Ref;
            Ref = planet;
            Origin = Vector3d.zero;
            FrameChanged?.Invoke(old, planet);
        }

        /// <summary>A rotating frame: where it is, how it is turned and how fast it spins.</summary>
        public struct Frame
        {
            public Vector3d Position;
            public QuatD Rotation;
            public Vector3d AngularVelocity;
            public static Frame Of(PlanetBody p) => new Frame { Position = p.Data.Position, Rotation = p.Rotation, AngularVelocity = p.AngularVelocity };
        }

        /// <summary>Converts a state expressed in `from`'s frame into `to`'s frame (null = system frame).</summary>
        public static Motion Convert(Motion m, PlanetBody from, PlanetBody to) =>
            Convert(m, from != null ? Frame.Of(from) : (Frame?)null, to != null ? Frame.Of(to) : (Frame?)null);

        public static Motion Convert(Motion m, Frame? from, Frame? to)
        {
            // into the system frame
            Vector3d pS = m.Pos, vS = m.Vel;
            Quaternion rS = m.Rot;
            if (from.HasValue)
            {
                var f = from.Value;
                Vector3d r = f.Rotation * m.Pos;
                pS = f.Position + r;
                vS = f.Rotation * m.Vel + Vector3d.Cross(f.AngularVelocity, r);
                rS = f.Rotation.ToQuaternion() * m.Rot;
            }
            if (!to.HasValue) return new Motion { Pos = pS, Vel = vS, Rot = rS };
            var t = to.Value;
            Vector3d rel = pS - t.Position;
            return new Motion
            {
                Pos = t.Rotation.Inverse() * rel,
                Vel = t.Rotation.Inverse() * (vS - Vector3d.Cross(t.AngularVelocity, rel)),
                Rot = t.Rotation.Inverse().ToQuaternion() * rS,
            };
        }

        /// <summary>The planet whose sphere of influence contains a point (reference frame), with hysteresis.</summary>
        public PlanetBody PlanetForFrame(Vector3d posRef)
        {
            Vector3d pS = RefToSys(posRef);
            if (Ref != null && (pS - Ref.Data.Position).magnitude < Ref.SoiRadius * 1.1) return Ref;
            foreach (var p in Planets)
                if ((pS - p.Data.Position).magnitude < p.SoiRadius) return p;
            return null;
        }

        public PlanetBody NearestPlanet(Vector3d posRef, out double distanceToSurface)
        {
            Vector3d pS = RefToSys(posRef);
            PlanetBody best = null;
            distanceToSurface = double.MaxValue;
            foreach (var p in Planets)
            {
                double d = (pS - p.Data.Position).magnitude - p.Data.Radius;
                if (d < distanceToSurface) { distanceToSurface = d; best = p; }
            }
            return best;
        }

        /// <summary>Position of a system-frame point expressed in the current reference frame.</summary>
        public Vector3d PlanetCenterRef(PlanetBody p) => SysToRef(p.Data.Position);

        public Vector3d StationPosRef => Station == null ? Vector3d.zero : SysToRef(Station.Data.Position);
        public Quaternion StationRotRef => Station == null ? Quaternion.identity : SysToRef(Station.Data.Rotation.ToQuaternion());

        // ─────────────────────────── per frame ────────────────────────────
        public void Tick(double dt)
        {
            Time += dt;
            foreach (var p in Planets) p.UpdateSpin(Time);
            foreach (var g in Giants) g.UpdateSpin(Time);
        }

        /// <summary>Places every body for this frame. Call after the camera's reference position is known.</summary>
        public void UpdateRender(Vector3d cameraRef, Camera cam, GraphicsQuality q, float dt)
        {
            CameraRef = cameraRef;
            if ((cameraRef - Origin).magnitude > RebaseDistance)
            {
                Origin = new Vector3d(Math.Round(cameraRef.x), Math.Round(cameraRef.y), Math.Round(cameraRef.z));
                OriginShifted?.Invoke();
            }
            Vector3 camUnity = ToUnity(cameraRef);
            Vector3d camSys = RefToSys(cameraRef);

            // sunlight: from the star toward the camera
            Vector3d toStarSys = (-camSys).normalized;
            Vector3d toStarRef = Ref == null ? toStarSys : Ref.Rotation.Inverse() * toStarSys;
            SunDirRef = ((Vector3)toStarRef).normalized;
            Sun.transform.rotation = Quaternion.LookRotation(-SunDirRef, Mathf.Abs(SunDirRef.y) < 0.95f ? Vector3.up : Vector3.forward);
            Color lightLin = LightColor.linear;

            // star
            Place(Star.Root.transform, SysToRef(Vector3d.zero), Quaternion.identity, Star.Radius, cameraRef, camUnity, out float starScale);
            Star.Glow.rotation = cam.transform.rotation;
            Star.Glow.localScale = Vector3.one * 18f;

            // planets
            foreach (var p in Planets)
            {
                Vector3d cRef = SysToRef(p.Data.Position);
                Quaternion rRef = SysToRef(p.Rotation.ToQuaternion());
                Place(p.Root.transform, cRef, rRef, 1.0, cameraRef, camUnity, out float s);
                p.RenderScale = s;
                Vector3 sunW = ((Vector3)((SysToRef(Vector3d.zero) - cRef).normalized));
                p.UpdateMaterials(sunW, p.SunDirLocal(Vector3d.zero), lightLin, LightIntensity, Time, q);
            }

            foreach (var g in Giants)
            {
                Vector3d cRef = SysToRef(g.Data.Position);
                Place(g.Root.transform, cRef, SysToRef(g.Rotation.ToQuaternion()), g.Data.Radius, cameraRef, camUnity, out float s);
                Vector3 sunW = (Vector3)((SysToRef(Vector3d.zero) - cRef).normalized);
                g.Mat.SetVector("_SunDir", sunW);
                g.Mat.SetVector("_LightColor", (Vector4)(lightLin * LightIntensity));
                g.Mat.SetColor("_Rim", g.Data.BandC);
                if (g.RingMat != null)
                {
                    var rt = g.Root.transform.Find("Rings");
                    g.RingMat.SetVector("_PlanetPos", g.Root.transform.position);
                    g.RingMat.SetFloat("_PlanetRadius", g.Root.transform.lossyScale.x);
                    g.RingMat.SetVector("_SunDir", sunW);
                    g.RingMat.SetVector("_LightColor", (Vector4)(lightLin * LightIntensity));
                    if (rt != null) rt.localRotation = Quaternion.identity;
                }
            }

            if (Station != null)
            {
                Place(Station.Root.transform, StationPosRef, StationRotRef, 1.0, cameraRef, camUnity, out _);
                Station.Animate(Time);
            }

            foreach (var f in Fields)
            {
                Vector3d cRef = SysToRef(f.Data.Position);
                double d = (cRef - cameraRef).magnitude;
                f.Visible = d < f.Data.Radius + 40000;
                if (f.Visible)
                {
                    f.Root.transform.position = ToUnity(cRef);
                    f.Root.transform.rotation = SysToRef(Quaternion.identity);
                    f.Root.transform.localScale = Vector3.one;
                }
                f.Draw(dt, cam);
            }

            UpdateAtmosphereGlobals(cameraRef);
            UpdateAmbient(cameraRef, dt);

            skyMat.SetMatrix("_SkyRot", Matrix4x4.Rotate(RefRotation.ToQuaternion()));
        }

        void Place(Transform t, Vector3d posRef, Quaternion rotRef, double baseScale, Vector3d camRef, Vector3 camUnity, out float scale)
        {
            Vector3d rel = posRef - camRef;
            double d = rel.magnitude;
            double s = 1;
            if (d > ScaledStart)
            {
                double compressed = ScaledStart + (ScaledMax - ScaledStart) * (1 - Math.Exp(-(d - ScaledStart) / ScaledFalloff));
                s = compressed / d;
                t.position = camUnity + (Vector3)(rel * s);
            }
            else
            {
                t.position = ToUnity(posRef);
            }
            t.rotation = rotRef;
            t.localScale = Vector3.one * (float)(baseScale * s);
            scale = (float)s;
        }

        /// <summary>Tells the sun and glow shaders which atmosphere the camera is looking out of.</summary>
        void UpdateAtmosphereGlobals(Vector3d cameraRef)
        {
            PlanetBody inside = null;
            foreach (var p in Planets)
            {
                if (!p.Data.HasAtmosphere) continue;
                double d = (cameraRef - SysToRef(p.Data.Position)).magnitude;
                if (d < p.Data.AtmosphereRadius * 1.02) { inside = p; break; }
            }
            if (inside == null)
            {
                Shader.SetGlobalFloat("_WF_AtmoOn", 0f);
                return;
            }
            var d0 = inside.Data;
            Shader.SetGlobalFloat("_WF_AtmoOn", 1f);
            Shader.SetGlobalVector("_WF_AtmoPos", inside.Root.transform.position);
            Shader.SetGlobalFloat("_WF_AtmoScale", inside.RenderScale);
            Shader.SetGlobalFloat("_WF_AtmoR", (float)d0.Radius);
            Shader.SetGlobalFloat("_WF_AtmoRa", (float)d0.AtmosphereRadius);
            Shader.SetGlobalFloat("_WF_AtmoHR", d0.RayleighHeight);
            Shader.SetGlobalFloat("_WF_AtmoHM", d0.MieHeight);
            Shader.SetGlobalVector("_WF_AtmoBetaR", d0.Rayleigh);
            Shader.SetGlobalFloat("_WF_AtmoBetaM", d0.Mie);
        }

        /// <summary>Sky-coloured ambient light and a tiny reflection cubemap for shiny things.</summary>
        void UpdateAmbient(Vector3d cameraRef, float dt)
        {
            Color sky, horizon, ground;
            float day = 0f;
            var p = Ref;
            if (p != null && (cameraRef.magnitude < p.Data.AtmosphereRadius || !p.Data.HasAtmosphere && cameraRef.magnitude < p.Radius * 1.5))
            {
                Vector3d up = cameraRef.normalized;
                day = p.DayFactor(up, (Vector3d)SunDirRef);
                Color tint = p.Data.HasAtmosphere ? p.Data.SkyTint : new Color(0.05f, 0.05f, 0.06f);
                Color night = new Color(0.02f, 0.025f, 0.04f);
                sky = Color.Lerp(night, tint * 0.55f, day);
                horizon = Color.Lerp(night, Color.Lerp(tint, Color.white, 0.4f) * 0.45f, day);
                ground = Color.Lerp(night * 0.5f, p.Data.Ground1 * 0.35f, day);
                // sunsets warm the light
                float low = Mathf.Clamp01(1f - Mathf.Abs(Vector3.Dot((Vector3)up, SunDirRef)) * 4f) * day;
                horizon = Color.Lerp(horizon, new Color(0.9f, 0.5f, 0.3f) * 0.45f, low * 0.6f);
            }
            else
            {
                sky = new Color(0.05f, 0.055f, 0.07f);
                horizon = sky;
                ground = new Color(0.03f, 0.03f, 0.035f);
                day = 1f;
            }
            RenderSettings.ambientSkyColor = sky;
            RenderSettings.ambientEquatorColor = horizon;
            RenderSettings.ambientGroundColor = ground;

            // sunlight fades at night on the surface (the planet itself blocks it) and reddens at sunset
            float sunVis = 1f;
            Color lc = LightColor;
            if (p != null && cameraRef.magnitude < p.Radius + p.Data.MaxHeight + 3000)
            {
                Vector3d up = cameraRef.normalized;
                float elev = (float)Vector3d.Dot(up, (Vector3d)SunDirRef);
                sunVis = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(-0.06f, 0.04f, elev));
                if (p.Data.HasAtmosphere)
                {
                    float red = Mathf.Clamp01(1f - elev * 5f);
                    lc = Color.Lerp(lc, lc * new Color(1f, 0.62f, 0.35f), red * 0.8f);
                }
            }
            Sun.color = lc;
            Sun.intensity = LightIntensity * sunVis;
            Sun.shadowStrength = 0.92f;

            reflectionTimer -= dt;
            if (reflectionTimer <= 0f)
            {
                reflectionTimer = 0.5f;
                FillReflection(sky, horizon, ground);
            }
        }

        readonly Color[] facePixels = new Color[16 * 16];

        void FillReflection(Color sky, Color horizon, Color ground)
        {
            // gradient by the direction's "up" component in the reference frame's local up
            Vector3 up = Ref != null ? ((Vector3)CameraRef).normalized : Vector3.up;
            for (int f = 0; f < 6; f++)
            {
                var face = (CubemapFace)f;
                for (int y = 0; y < 16; y++)
                    for (int x = 0; x < 16; x++)
                    {
                        Vector3 d = FaceDir(face, (x + 0.5f) / 16f * 2f - 1f, (y + 0.5f) / 16f * 2f - 1f);
                        float u = Vector3.Dot(d, up);
                        Color c = u > 0 ? Color.Lerp(horizon, sky, Mathf.Pow(u, 0.6f)) : Color.Lerp(horizon, ground, Mathf.Pow(-u, 0.4f));
                        facePixels[y * 16 + x] = c * 1.6f;
                    }
                reflection.SetPixels(facePixels, face);
            }
            reflection.Apply(true);
        }

        static Vector3 FaceDir(CubemapFace f, float u, float v)
        {
            switch (f)
            {
                case CubemapFace.PositiveX: return new Vector3(1, -v, -u).normalized;
                case CubemapFace.NegativeX: return new Vector3(-1, -v, u).normalized;
                case CubemapFace.PositiveY: return new Vector3(u, 1, v).normalized;
                case CubemapFace.NegativeY: return new Vector3(u, -1, -v).normalized;
                case CubemapFace.PositiveZ: return new Vector3(u, -v, 1).normalized;
                default: return new Vector3(-u, -v, -1).normalized;
            }
        }

        public void ApplyQuality(GraphicsQuality q)
        {
            foreach (var p in Planets) p.ApplyQuality(q);
        }

        public void Dispose()
        {
            foreach (var p in Planets) p.Dispose();
            UnityEngine.Object.Destroy(Root);
            if (SkyCube != null) { SkyCube.Release(); UnityEngine.Object.Destroy(SkyCube); }
            UnityEngine.Object.Destroy(skyMat);
            UnityEngine.Object.Destroy(reflection);
        }
    }
}

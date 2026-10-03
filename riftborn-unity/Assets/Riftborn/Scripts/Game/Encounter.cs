// Riftborn — catching a creature in AR. The phone's camera shows the real
// world (AR Foundation: ARCore on Android, ARKit on iPhone); the creature
// steps out of a Rift onto your floor, lit to match the room and casting a
// shadow. Dart it for DNA (it calms down and gets easier to catch), then
// flick an orb at it while the ring is small. Without AR (a PC, or a phone
// that can't do it) it happens on a generated patch of ground instead.
using System;
using System.Collections;
using System.Collections.Generic;
using Unity.XR.CoreUtils;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace Riftborn
{
    public class Encounter : MonoBehaviour
    {
        enum Phase { Starting, Placing, Appear, Free, Absorb, Fall, Wobble, Caught, Flee, Result }
        Phase phase; float phaseT;
        Spawn spawn; Species sp; int lvl; Action<Result> done; bool wantAR;
        bool dartMode;
        int dna, hits, bonusXP; float sed;   // sed: how calm it is (0..0.6)
        float timeLeft;
        string hint, resultTitle, resultBody; bool caughtIt, fledIt;
        Result finished;

        // AR rig (built once) and the fallback scene.
        static bool? arOk;
        GameObject arSession, arOrigin;
        Camera arCam;
        ARCameraManager camMgr;
        ARRaycastManager rays;
        readonly List<ARRaycastHit> rayHits = new List<ARRaycastHit>();
        GameObject fake; Camera fakeCam; float lookYaw, lookPitch = 8; Vector2 lookFrom; bool lookDrag;
        Camera cam; bool ar;

        // What's in the scene.
        Transform stage;
        Light sun;
        GameObject reticle, shadow, ground, rift, ring, target;
        Transform portalRoot;
        BeastInstance beast; BoxCollider body;
        Vector3 home, pos, walkTo; float scale, H, mouth, walkWait, roarT, hurt, speedK = 1;
        float floorY;
        List<Transform> targets; int tgt; float tgtT;

        class Dart { public GameObject go; public Vector3 from, to; public float t; public int result; public Vector3 at; }
        readonly List<Dart> darts = new List<Dart>();
        GameObject orb, heldOrb; Rigidbody orbBody; float orbLife; Vector3 orbRest; int wob, wobbles; bool willCatch; float ringK = 1;
        Vector2 swipeFrom; float swipeT; bool swiping;

        class Spark { public Transform tr; public Vector3 v; public float life, max, size; }
        readonly List<Spark> sparks = new List<Spark>();
        class Float { public Vector3 p; public string text; public Color c; public float life; public bool big; }
        readonly List<Float> floats = new List<Float>();
        static readonly Dictionary<Color, Material> glowMats = new Dictionary<Color, Material>();

        // Saved map lighting, restored afterwards.
        bool fogWas; float shadowDistWas; UnityEngine.Rendering.AmbientMode ambWas; Color ambSky, ambEq, ambGround;

        /* ------------------ Start & end ------------------ */

        public void Begin(Spawn s, bool useAR, Action<Result> onDone)
        {
            spawn = s; done = onDone; wantAR = useAR;
            sp = Species.ById(s.sp);
            lvl = GameState.SpawnLevel(s);
            dna = hits = bonusXP = 0; sed = 0; hurt = 0; speedK = 1; mouth = 0;
            timeLeft = 90; caughtIt = fledIt = false; finished = null;
            dartMode = GameState.save.items.darts > 0 && GameState.save.items.orbs == 0;
            phase = Phase.Starting; phaseT = 0;
            hint = "Opening the Rift…";
            fogWas = RenderSettings.fog; shadowDistWas = QualitySettings.shadowDistance; ambWas = RenderSettings.ambientMode;
            ambSky = RenderSettings.ambientSkyColor; ambEq = RenderSettings.ambientEquatorColor; ambGround = RenderSettings.ambientGroundColor;
            RenderSettings.fog = false;
            QualitySettings.shadowDistance = 25;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.55f, 0.6f, 0.65f);
            RenderSettings.ambientEquatorColor = new Color(0.4f, 0.4f, 0.4f);
            RenderSettings.ambientGroundColor = new Color(0.2f, 0.18f, 0.16f);
            stage = new GameObject("EncounterStage").transform;
            sun = new GameObject("Light").AddComponent<Light>();
            sun.transform.SetParent(stage, false);
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.8f;
            sun.intensity = 1.1f;
            sun.transform.rotation = Quaternion.Euler(50, -35, 0);
            sun.cullingMask = ~(1 << Preview.LAYER);
            StartCoroutine(Setup());
        }

        IEnumerator Setup()
        {
            if (arOk == null)
            {
                if (ARSession.state == ARSessionState.None || ARSession.state == ARSessionState.CheckingAvailability)
                    yield return ARSession.CheckAvailability();
                if (ARSession.state == ARSessionState.NeedsInstall)
                {
                    hint = "Installing AR services…";
                    yield return ARSession.Install();
                }
                arOk = ARSession.state >= ARSessionState.Ready;
            }
            ar = arOk == true && wantAR;
            if (ar)
            {
                if (arSession == null) BuildAR();
                arSession.SetActive(true);
                arOrigin.SetActive(true);
                cam = arCam;
                hint = "Point your camera at the floor.";
                phase = Phase.Placing; phaseT = 0;
                reticle = Props.Mesh("reticle", Props.Quad, Mats.Glow(Color.white, Tex.Ring), stage, false);
                reticle.transform.localScale = Vector3.one * 0.5f;
                reticle.SetActive(false);
            }
            else
            {
                BuildFake();
                cam = fakeCam;
                floorY = 0;
                Place(new Vector3(0, 0, 0), new Vector3(0, 0, 1));
            }
        }

        void BuildAR()
        {
            arSession = new GameObject("AR Session");
            arSession.SetActive(false);
            DontDestroyOnLoad(arSession);
            arSession.AddComponent<ARSession>();
            arSession.AddComponent<ARInputManager>();

            arOrigin = new GameObject("XR Origin");
            arOrigin.SetActive(false);
            DontDestroyOnLoad(arOrigin);
            var offset = new GameObject("Camera Offset");
            offset.transform.SetParent(arOrigin.transform, false);
            var camGo = new GameObject("AR Camera");
            camGo.transform.SetParent(offset.transform, false);
            camGo.tag = "MainCamera";
            arCam = camGo.AddComponent<Camera>();
            arCam.clearFlags = CameraClearFlags.SolidColor;
            arCam.backgroundColor = Color.black;
            arCam.nearClipPlane = 0.05f; arCam.farClipPlane = 200;
            arCam.cullingMask = ~(1 << Preview.LAYER);
            camMgr = camGo.AddComponent<ARCameraManager>();
            camMgr.requestedLightEstimation = LightEstimation.AmbientIntensity | LightEstimation.AmbientColor | LightEstimation.MainLightDirection | LightEstimation.MainLightIntensity | LightEstimation.AmbientSphericalHarmonics;
            camMgr.frameReceived += OnFrame;
            camGo.AddComponent<ARCameraBackground>();
            // The phone's position and rotation drive the camera.
            var posAction = new InputAction("Position", InputActionType.Value, expectedControlType: "Vector3");
            posAction.AddBinding("<XRHMD>/centerEyePosition");
            posAction.AddBinding("<HandheldARInputDevice>/devicePosition");
            var rotAction = new InputAction("Rotation", InputActionType.Value, expectedControlType: "Quaternion");
            rotAction.AddBinding("<XRHMD>/centerEyeRotation");
            rotAction.AddBinding("<HandheldARInputDevice>/deviceRotation");
            var tpd = camGo.AddComponent<TrackedPoseDriver>();
            tpd.positionInput = new InputActionProperty(posAction);
            tpd.rotationInput = new InputActionProperty(rotAction);
            tpd.ignoreTrackingState = true;

            var origin = arOrigin.AddComponent<XROrigin>();
            origin.Camera = arCam;
            origin.CameraFloorOffsetObject = offset;
            var planes = arOrigin.AddComponent<ARPlaneManager>();
            planes.requestedDetectionMode = PlaneDetectionMode.Horizontal;
            rays = arOrigin.AddComponent<ARRaycastManager>();
        }

        // Match the real room's light: brightness, colour, the main light's
        // direction and the ambient light all around.
        void OnFrame(ARCameraFrameEventArgs args)
        {
            if (sun == null) return;
            var le = args.lightEstimation;
            if (le.averageBrightness.HasValue) sun.intensity = Mathf.Clamp(le.averageBrightness.Value * 2.2f, 0.25f, 2f);
            if (le.mainLightIntensityLumens.HasValue) sun.intensity = Mathf.Clamp(le.mainLightIntensityLumens.Value / 800f, 0.25f, 2f);
            if (le.colorCorrection.HasValue) sun.color = le.colorCorrection.Value;
            if (le.mainLightColor.HasValue) sun.color = le.mainLightColor.Value;
            if (le.mainLightDirection.HasValue) sun.transform.rotation = Quaternion.LookRotation(le.mainLightDirection.Value);
            if (le.ambientSphericalHarmonics.HasValue)
            {
                RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Skybox;
                RenderSettings.ambientProbe = le.ambientSphericalHarmonics.Value;
            }
        }

        // No AR: a patch of wild ground with rocks, under an open sky.
        void BuildFake()
        {
            if (fake == null)
            {
                fake = new GameObject("EncounterScene");
                DontDestroyOnLoad(fake);
                var camGo = new GameObject("EncounterCamera");
                camGo.transform.SetParent(fake.transform, false);
                fakeCam = camGo.AddComponent<Camera>();
                fakeCam.clearFlags = CameraClearFlags.SolidColor;
                fakeCam.backgroundColor = new Color(0.55f, 0.68f, 0.8f);
                fakeCam.nearClipPlane = 0.05f; fakeCam.farClipPlane = 300;
                fakeCam.fieldOfView = 60;
                fakeCam.cullingMask = ~(1 << Preview.LAYER);
                var dirt = Tex.Make(256, 256, (x, y) =>
                {
                    float n = Tex.Fbm(x / 32f, y / 32f, 11, 8), g = Tex.Fbm(x / 9f, y / 9f, 12, 28);
                    var grass = Color.Lerp(new Color(0.2f, 0.3f, 0.12f), new Color(0.36f, 0.45f, 0.2f), g);
                    var soil = Color.Lerp(new Color(0.3f, 0.24f, 0.17f), new Color(0.42f, 0.35f, 0.25f), g);
                    return Color.Lerp(soil, grass, Mathf.SmoothStep(0.35f, 0.65f, n));
                });
                var m = Mats.Solid(Color.white, 0.1f);
                m.mainTexture = dirt;
                m.mainTextureScale = new Vector2(30, 30);
                var g0 = Props.Mesh("ground", Props.Quad, m, fake.transform, false);
                g0.GetComponent<Renderer>().receiveShadows = true;
                g0.transform.localRotation = Quaternion.Euler(90, 0, 0);
                g0.transform.localScale = Vector3.one * 200;
                var rnd = new System.Random(5);
                for (int i = 0; i < 26; i++)
                {
                    var rock = Props.Rock(i % 6, fake.transform);
                    float a = (float)rnd.NextDouble() * Mathf.PI * 2, d = 7 + (float)rnd.NextDouble() * 40;
                    rock.transform.localPosition = new Vector3(Mathf.Sin(a) * d, 0, Mathf.Cos(a) * d);
                    rock.transform.localScale = Vector3.one * (0.3f + (float)rnd.NextDouble() * (d / 12));
                    rock.transform.localRotation = Quaternion.Euler(0, (float)rnd.NextDouble() * 360, 0);
                }
            }
            fake.SetActive(true);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = fakeCam.backgroundColor;
            RenderSettings.fogStartDistance = 25; RenderSettings.fogEndDistance = 120;
            lookYaw = 0; lookPitch = 8;
            fakeCam.transform.position = new Vector3(0, 1.5f, 0);
        }

        // Put the creature down in front of the camera, on the floor.
        void Place(Vector3 camPos, Vector3 fwd)
        {
            fwd.y = 0;
            fwd = fwd.sqrMagnitude < 1e-4f ? Vector3.forward : fwd.normalized;
            beast = new BeastInstance(sp.id);
            scale = Mathf.Clamp(sp.size, 0.5f, 2.6f);
            float dist = 1.4f + scale * 1.4f;
            home = new Vector3(camPos.x, floorY, camPos.z) + fwd * dist;
            pos = home; walkTo = home;
            beast.root.transform.SetParent(stage, false);
            beast.root.transform.position = home;
            beast.root.transform.rotation = Quaternion.LookRotation(-fwd);
            beast.root.transform.localScale = Vector3.one * 0.001f;
            beast.SetLayer(0);
            var b = beast.asset.bounds;
            body = beast.root.AddComponent<BoxCollider>();
            body.center = b.center; body.size = b.size * 0.9f;
            beast.root.transform.localScale = Vector3.one * scale;
            H = beast.Height;
            beast.root.transform.localScale = Vector3.one * 0.001f;
            targets = new List<Transform> { beast.Head };
            foreach (var n in new[] { "f1", "hip", "t1" }) if (beast.bones.TryGetValue(n, out var t)) targets.Add(t);

            // An invisible floor that shows the shadow and stops orbs.
            shadow = Props.Mesh("shadow", Props.Quad, ar ? Mats.ShadowCatcher(0.5f) : Mats.ShadowCatcher(0f), stage, false);
            shadow.GetComponent<Renderer>().receiveShadows = true;
            shadow.transform.position = new Vector3(home.x, floorY + 0.002f, home.z);
            shadow.transform.rotation = Quaternion.Euler(90, 0, 0);
            shadow.transform.localScale = Vector3.one * (scale * 6 + 4);
            if (!ar) shadow.GetComponent<Renderer>().enabled = false;
            ground = new GameObject("floor");
            ground.transform.SetParent(stage, false);
            ground.transform.position = new Vector3(home.x, floorY - 0.5f, home.z);
            ground.AddComponent<BoxCollider>().size = new Vector3(60, 1, 60);

            rift = Props.Glow(Species.Elements[sp.el].color, 0.1f, stage);
            rift.transform.position = home + Vector3.up * scale * 0.6f;
            // An imported portal opens behind the creature (see AssetLinks).
            var portalPrefab = AssetLinks.Portal(spawn.id);
            if (portalPrefab != null)
            {
                portalRoot = new GameObject("portalRoot").transform;
                portalRoot.SetParent(stage, false);
                portalRoot.position = home + fwd * scale * 0.7f;
                portalRoot.rotation = Quaternion.LookRotation(-fwd);
                if (Props.PortalModel(portalPrefab, portalRoot, Mathf.Max(1.6f, H * 1.9f)) == null) { Destroy(portalRoot.gameObject); portalRoot = null; }
                else portalRoot.localScale = Vector3.one * 0.001f;
            }
            Fx.Play(AssetLinks.I?.appear, home + Vector3.up * H * 0.4f, Mathf.Max(0.6f, scale * 0.8f), Species.Elements[sp.el].color, stage);
            ring = Props.Mesh("ring", Props.Quad, Mats.Glow(Color.green, Tex.Ring), stage, false);
            ring.AddComponent<Billboard>();
            ring.SetActive(false);
            target = Props.Mesh("target", Props.Quad, Mats.Glow(new Color(1, 0.85f, 0.2f), Tex.Ring), stage, false);
            target.AddComponent<Billboard>();
            target.SetActive(false);
            phase = Phase.Appear; phaseT = 0;
            hint = null;
            Sfx.Play("absorb", 0.6f);
        }

        void Finish()
        {
            StopAllCoroutines();
            if (beast != null) { beast.Destroy(); beast = null; }
            if (stage) Destroy(stage.gameObject);
            if (orb) Destroy(orb);
            if (heldOrb) Destroy(heldOrb);
            foreach (var d in darts) Destroy(d.go);
            darts.Clear(); sparks.Clear(); floats.Clear();
            if (arSession) arSession.SetActive(false);
            if (arOrigin) arOrigin.SetActive(false);
            if (fake) fake.SetActive(false);
            RenderSettings.fog = fogWas;
            QualitySettings.shadowDistance = shadowDistWas;
            RenderSettings.ambientMode = ambWas;
            RenderSettings.ambientSkyColor = ambSky; RenderSettings.ambientEquatorColor = ambEq; RenderSettings.ambientGroundColor = ambGround;
            var res = finished;
            done?.Invoke(res);
            if (res != null && res.levelUp > 0) UI.I.LevelUp(res.levelUp);
        }

        /* ------------------ Rules ------------------ */

        float TargetR => new[] { 0.17f, 0.14f, 0.12f, 0.1f }[sp.rar] * (1 + sed * 0.5f);

        float CatchChance(float bonus)
        {
            var rar = Species.Rarities[sp.rar];
            float p = (float)rar.catchRate * (1 + bonus) * (1 + sed * 1.6f) * (1 - lvl / 70f);
            return Mathf.Clamp(p, 0.03f, 0.97f);
        }

        Vector3 Chest => body != null ? body.bounds.center : home + Vector3.up * H * 0.5f;

        void Say(string text, Vector3 at, Color c, bool big = false) => floats.Add(new Float { p = at, text = text, c = c, life = 1.3f, big = big });

        void Burst(Vector3 at, Color c, int n, float speed = 1.5f, float size = 0.08f)
        {
            if (!glowMats.TryGetValue(c, out var m)) glowMats[c] = m = Mats.Glow(c);
            for (int i = 0; i < n; i++)
            {
                var go = Props.Mesh("spark", Props.Quad, m, stage, false);
                go.AddComponent<Billboard>();
                go.transform.position = at;
                float s = size * UnityEngine.Random.Range(0.6f, 1.4f) * Mathf.Max(0.6f, scale);
                go.transform.localScale = Vector3.one * s;
                sparks.Add(new Spark { tr = go.transform, v = UnityEngine.Random.insideUnitSphere * speed * Mathf.Max(0.6f, scale) + Vector3.up * 0.6f, life = 0, max = UnityEngine.Random.Range(0.4f, 0.9f), size = s });
            }
        }

        public void FireDart()
        {
            if (phase != Phase.Free || darts.Count > 1) return;
            var items = GameState.save.items;
            if (items.darts <= 0) { UI.I.Toast("Out of darts. Hack Rifts or open caches for more."); Sfx.Play("error"); return; }
            items.darts--;
            GameState.save.stats.darts++;
            var ray = cam.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0));
            var d = new Dart { from = cam.transform.position + cam.transform.right * 0.05f - cam.transform.up * 0.08f, t = 0 };
            var tp = targets[tgt].position;
            float R = H * TargetR, off = Vector3.Cross(ray.direction, tp - ray.origin).magnitude;
            if (off < R) { d.result = off < R * 0.4f ? 2 : 1; d.to = tp; }
            else if (body.Raycast(ray, out var hit, 100)) { d.result = 0; d.to = hit.point; }
            else { d.result = -1; d.to = ray.origin + ray.direction * (Vector3.Distance(cam.transform.position, home) + 2); }
            d.at = d.to;
            d.go = Props.Mesh("dart", Shapes.Sphere(8, 6), Mats.Emissive(new Color(1, 0.85f, 0.3f), new Color(1, 0.7f, 0.2f)), stage, false);
            d.go.transform.localScale = new Vector3(0.012f, 0.012f, 0.09f);
            d.go.transform.position = d.from;
            d.go.transform.rotation = Quaternion.LookRotation(d.to - d.from);
            darts.Add(d);
            Sfx.Play("throw", 0.5f);
        }

        void DartLanded(Dart d)
        {
            Destroy(d.go);
            if (d.result > 0)
            {
                bool bull = d.result == 2;
                int n = Mathf.RoundToInt(Species.Rarities[sp.rar].dna * (bull ? 2 : 1) * (1 + lvl / 40f));
                dna += n; hits++;
                sed = Mathf.Min(0.6f, sed + (bull ? 0.12f : 0.07f));
                hurt = 1; speedK = 1.8f; tgtT = 0; mouth = Mathf.Max(mouth, 0.7f);
                Say(bull ? $"Bullseye! +{n} DNA" : $"+{n} DNA", d.at + Vector3.up * 0.1f, bull ? new Color(1, 0.88f, 0.3f) : new Color(0.5f, 0.95f, 0.8f), bull);
                Burst(d.at, Species.Elements[sp.el].color, bull ? 16 : 9);
                var L = AssetLinks.I;
                Fx.Play(bull && L?.bullseye != null ? L.bullseye : L?.dartHit, d.at, bull ? 0.5f : 0.35f, Species.Elements[sp.el].color, stage);
                beast.Act("hit");
                Sfx.Play(bull ? "bull" : "hit");
                NextTarget();
            }
            else
            {
                Say(d.result == 0 ? "Off target" : "Miss", d.at, new Color(0.8f, 0.78f, 0.9f));
                if (d.result == 0) speedK = 1.4f;
                Sfx.Play("miss");
            }
        }

        void NextTarget() { int n = targets.Count; tgt = (tgt + 1 + UnityEngine.Random.Range(0, n - 1)) % n; tgtT = 0; }

        void Throw(Vector2 swipe, float secs)
        {
            var items = GameState.save.items;
            if (items.orbs <= 0) { UI.I.Toast("Out of orbs. Hack Rifts or open caches for more."); Sfx.Play("error"); return; }
            items.orbs--;
            float k = Mathf.Clamp(swipe.magnitude / (Screen.height * 0.3f) * Mathf.Clamp(0.35f / Mathf.Max(0.05f, secs), 0.7f, 1.4f), 0.35f, 1.6f);
            float side = Mathf.Clamp(swipe.x / Mathf.Max(1, swipe.y), -1, 1);
            var p0 = cam.transform.position - cam.transform.up * 0.12f + cam.transform.forward * 0.25f;
            var toChest = Chest - p0;
            var right = Vector3.Cross(Vector3.up, toChest).normalized;
            var aim = p0 + toChest * Mathf.Clamp(k, 0.45f, 1.3f) + right * side * toChest.magnitude * 0.45f;
            float T = 0.45f + toChest.magnitude * 0.05f;
            var v = (aim - p0) / T - 0.5f * Physics.gravity * T;
            orb = Props.Orb(GameState.Me.color);
            orb.transform.SetParent(stage, false);
            orb.transform.position = p0;
            orb.transform.localScale = Vector3.one * 0.055f;
            var col = orb.AddComponent<SphereCollider>(); col.radius = 1;
            orbBody = orb.AddComponent<Rigidbody>();
            orbBody.mass = 0.2f;
            orbBody.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
#if UNITY_6000_0_OR_NEWER
            orbBody.linearVelocity = v;
#else
            orbBody.velocity = v;
#endif
            orbBody.angularVelocity = cam.transform.right * -20;
            orb.AddComponent<OrbHit>().enc = this;
            orbLife = 0;
            Sfx.Play("throw");
        }

        public void OrbTouched(Collider c)
        {
            if (orb == null || phase != Phase.Free) return;
            if (c != body) return;
            float r = ringK;
            float bonus = 0; string label = null;
            if (r < 0.45f) { bonus = 1; label = "Excellent!"; bonusXP = 100; }
            else if (r < 0.65f) { bonus = 0.6f; label = "Great!"; bonusXP = 50; }
            else if (r < 0.85f) { bonus = 0.3f; label = "Nice!"; bonusXP = 10; }
            else bonusXP = 0;
            willCatch = UnityEngine.Random.value < CatchChance(bonus);
            wobbles = willCatch ? 3 : UnityEngine.Random.Range(0, 3);
            wob = 0;
            Destroy(orbBody);
            Destroy(orb.GetComponent<SphereCollider>());
            orbRest = orb.transform.position;
            if (label != null) Say(label, orbRest + Vector3.up * 0.2f, new Color(1, 0.88f, 0.3f), true);
            Burst(orbRest, Color.white, 18);
            Fx.Play(AssetLinks.I?.dartHit, orbRest, 0.4f, Color.white, stage);
            phase = Phase.Absorb; phaseT = 0;
            ring.SetActive(false); target.SetActive(false);
            Sfx.Play("absorb");
        }

        void Caught()
        {
            phase = Phase.Caught; phaseT = 0;
            caughtIt = true;
            Sfx.Play("caught");
            for (int i = 0; i < 2; i++) Burst(orb.transform.position, i == 0 ? new Color(1, 0.88f, 0.3f) : Species.Elements[sp.el].color, 16, 1.2f);
            Fx.Play(AssetLinks.I?.catchBurst, orb.transform.position, 0.6f, null, stage);
        }

        void Breakout()
        {
            Burst(orb.transform.position, Species.Elements[sp.el].color, 20);
            Fx.Play(AssetLinks.I?.breakout, orb.transform.position, Mathf.Max(0.5f, scale * 0.6f), Species.Elements[sp.el].color, stage);
            Destroy(orb); orb = null;
            beast.root.SetActive(true);
            beast.root.transform.position = pos;
            beast.root.transform.localScale = Vector3.one * scale;
            beast.SetTint(Color.white, 0);
            hurt = 1; mouth = 1;
            Sfx.Play("roar", 0.8f);
            if (UnityEngine.Random.value < Species.Rarities[sp.rar].flee) Flee("It broke free and fled back into the Rift!");
            else { phase = Phase.Free; Say("It broke free!", Chest + Vector3.up * H * 0.6f, new Color(1, 0.55f, 0.55f), true); }
        }

        void Flee(string why)
        {
            phase = Phase.Flee; phaseT = 0;
            fledIt = true;
            resultBody = why;
            ring.SetActive(false); target.SetActive(false);
            Sfx.Play("flee");
        }

        void ShowResult()
        {
            phase = Phase.Result;
            var rc = Species.Rarities[sp.rar];
            finished = GameState.FinishEncounter(spawn, caughtIt, fledIt, dna, hits, bonusXP);
            if (caughtIt)
            {
                var c = finished.creature;
                resultTitle = $"{sp.name} caught!";
                resultBody = $"{UI.Col(rc.name, rc.color)} · Level {c.lvl} · Power {c.Power}\n+{dna + 25} {sp.name} DNA · +{rc.xp + bonusXP + finished.weatherXP} XP{(finished.weatherXP > 0 ? " (weather boost)" : "")}";
            }
            else
            {
                resultTitle = "It got away";
                resultBody = (resultBody ?? "") + "\n" + (dna > 0 ? $"You kept +{dna} {sp.name} DNA." : "Dart it next time to keep some DNA.");
            }
        }

        public void Run()
        {
            if (phase == Phase.Result) return;
            resultBody = "You left it alone.";
            if (dna > 0 || phase >= Phase.Appear) ShowResult();
            else Finish();
        }

        /* ------------------ Frame ------------------ */

        void Update()
        {
            if (stage == null) return;
            float dt = Time.deltaTime;
            phaseT += dt;
            if (!ar && fakeCam) LookAround(dt);
            switch (phase)
            {
                case Phase.Placing: Placing(); break;
                case Phase.Appear:
                    {
                        float k = Mathf.Clamp01(phaseT / 0.9f);
                        rift.transform.localScale = Vector3.one * scale * 2.2f * Mathf.Sin(Mathf.Min(1, phaseT / 1.4f) * Mathf.PI);
                        if (portalRoot) portalRoot.localScale = Vector3.one * Mathf.Max(0.001f, Mathf.Sin(Mathf.Min(1, phaseT / 1.4f) * Mathf.PI));
                        beast.root.transform.localScale = Vector3.one * scale * Mathf.Max(0.001f, Mathf.SmoothStep(0, 1, k));
                        if (phaseT > 0.5f && roarT == 0) { mouth = 1; roarT = 6; Sfx.Play("roar"); }
                        if (phaseT > 1.4f) { phase = Phase.Free; phaseT = 0; rift.SetActive(false); ring.SetActive(true); target.SetActive(true); hint = null; }
                        break;
                    }
                case Phase.Free:
                    timeLeft -= dt;
                    if (timeLeft <= 0) Flee("Time ran out. It slipped back into the Rift.");
                    break;
                case Phase.Absorb:
                    {
                        float k = Mathf.Clamp01(phaseT / 0.6f);
                        beast.SetTint(Color.white, k * 2);
                        beast.root.transform.localScale = Vector3.one * Mathf.Max(0.001f, scale * (1 - k));
                        beast.root.transform.position = Vector3.Lerp(pos, orbRest - Vector3.up * H * 0.3f, k);
                        orb.transform.position = orbRest + Vector3.up * 0.1f * Mathf.Sin(k * Mathf.PI);
                        if (k >= 1) { beast.root.SetActive(false); phase = Phase.Fall; phaseT = 0; orbRest = orb.transform.position; }
                        break;
                    }
                case Phase.Fall:
                    {
                        float y = orbRest.y + 1.2f * phaseT - 4.9f * phaseT * phaseT;
                        float bottom = floorY + 0.055f;
                        if (y <= bottom) { y = bottom; phase = Phase.Wobble; phaseT = 0; Sfx.Play("wobble"); }
                        orb.transform.position = new Vector3(orbRest.x, y, orbRest.z);
                        break;
                    }
                case Phase.Wobble:
                    {
                        float w = Mathf.Sin(phaseT / 0.9f * Mathf.PI * 2) * 22 * (wob < wobbles ? 1 : 0);
                        orb.transform.rotation = Quaternion.LookRotation(cam.transform.position - orb.transform.position) * Quaternion.Euler(0, 0, w);
                        if (phaseT > 0.9f)
                        {
                            phaseT = 0; wob++;
                            if (wob >= wobbles) { if (willCatch) Caught(); else Breakout(); }
                            else Sfx.Play("wobble");
                        }
                        break;
                    }
                case Phase.Caught:
                    if (phaseT > 1.1f) ShowResult();
                    break;
                case Phase.Flee:
                    {
                        float k = Mathf.Clamp01(phaseT / 0.9f);
                        if (beast.root.activeSelf) beast.root.transform.localScale = Vector3.one * Mathf.Max(0.001f, scale * (1 - k));
                        rift.SetActive(true);
                        rift.transform.position = Chest;
                        rift.transform.localScale = Vector3.one * scale * 2 * Mathf.Sin(k * Mathf.PI);
                        if (portalRoot) portalRoot.localScale = Vector3.one * Mathf.Max(0.001f, Mathf.Sin(k * Mathf.PI));
                        if (k >= 1) ShowResult();
                        break;
                    }
            }
            if (beast != null && beast.root.activeSelf && phase >= Phase.Appear && phase != Phase.Absorb) Animate(dt);
            if (phase == Phase.Free) Aim(dt);
            UpdateDarts(dt);
            UpdateOrb(dt);
            UpdateFx(dt);
        }

        void Placing()
        {
            var center = new Vector2(Screen.width / 2f, Screen.height * 0.45f);
            bool found = rays != null && rays.Raycast(center, rayHits, TrackableType.PlaneWithinPolygon);
            if (found)
            {
                var p = rayHits[0].pose.position;
                reticle.SetActive(true);
                reticle.transform.position = p + Vector3.up * 0.005f;
                reticle.transform.rotation = Quaternion.Euler(90, 0, 0);
                hint = "Floor found. Tap to open the Rift here.";
            }
            else if (phaseT > 3) hint = "Move your phone slowly to find the floor, or tap to place it anyway.";
            bool tap = Inp.Up && !UI.OverHud;
            if ((found && (tap || phaseT > 5)) || (!found && (tap || phaseT > 9)))
            {
                var ct = cam.transform;
                floorY = found ? rayHits[0].pose.position.y : ct.position.y - 1.3f;
                Destroy(reticle);
                Place(ct.position, ct.forward);
            }
        }

        void LookAround(float dt)
        {
            if (Inp.Down) { lookFrom = Inp.Pos; lookDrag = !UI.OverHud && (dartMode || phase != Phase.Free); }
            if (lookDrag && Inp.Held)
            {
                var p = Inp.Pos;
                var d = p - lookFrom; lookFrom = p;
                lookYaw += d.x * 90f / Screen.width; lookPitch -= d.y * 60f / Screen.height;
            }
            var ww = Inp.Walk;
            lookYaw += ww.x * 60 * dt; lookPitch -= ww.y * 40 * dt;
            lookYaw = Mathf.Clamp(lookYaw, -50, 50); lookPitch = Mathf.Clamp(lookPitch, -10, 35);
            float aimPitch = Mathf.Atan2(1.5f - H * 0.5f, 1.4f + scale * 1.4f) * Mathf.Rad2Deg;
            fakeCam.transform.rotation = Quaternion.Euler(aimPitch + lookPitch - 8, lookYaw, 0);
        }

        void Animate(float dt)
        {
            var root = beast.root.transform;
            var toCam = cam.transform.position - root.position; toCam.y = 0;
            float speed = 0;
            if (phase == Phase.Free)
            {
                walkWait -= dt;
                if (walkWait <= 0 && (walkTo - pos).sqrMagnitude < 0.01f)
                {
                    walkWait = UnityEngine.Random.Range(3f, 7f) / speedK;
                    var side = Vector3.Cross(Vector3.up, toCam.normalized);
                    walkTo = home + side * UnityEngine.Random.Range(-0.7f, 0.7f) * scale;
                }
                var d = walkTo - pos;
                if (d.magnitude > 0.02f)
                {
                    speed = 0.45f * scale * speedK;
                    pos += d.normalized * Mathf.Min(d.magnitude, speed * dt);
                    root.rotation = Quaternion.Slerp(root.rotation, Quaternion.LookRotation(d.normalized), dt * 3);
                }
                else if (toCam.sqrMagnitude > 0.01f)
                    root.rotation = Quaternion.Slerp(root.rotation, Quaternion.LookRotation(toCam.normalized), dt * 1.5f);
                roarT -= dt;
                if (roarT <= 0) { roarT = UnityEngine.Random.Range(7f, 13f); mouth = 1; Sfx.Play("roar", 0.5f); }
            }
            root.position = pos;
            speedK = Mathf.MoveTowards(speedK, 1, dt * 0.3f);
            mouth = Mathf.MoveTowards(mouth, 0, dt * 0.8f);
            hurt = Mathf.MoveTowards(hurt, 0, dt * 3);
            var local = root.InverseTransformPoint(cam.transform.position);
            float look = Mathf.Clamp(Mathf.Atan2(local.x, local.z), -0.9f, 0.9f);
            beast.Update(dt, speed, Mathf.SmoothStep(0, 1, mouth), look, 0.3f);
            if (phase == Phase.Free) beast.SetTint(new Color(1, 0.3f, 0.3f), hurt * 0.8f);
        }

        void Aim(float dt)
        {
            // Target marker (darts) hops between body parts.
            tgtT += dt;
            if (tgtT > 2.6f) NextTarget();
            target.SetActive(dartMode);
            if (dartMode)
            {
                target.transform.position = targets[tgt].position;
                target.transform.localScale = Vector3.one * H * TargetR * 2 * (1 + Mathf.Sin(Time.time * 6) * 0.08f);
            }
            // Catch ring (orbs) shrinks and resets.
            ring.SetActive(!dartMode);
            ringK = 1 - Mathf.Repeat(Time.time, 1.8f) / 1.8f * 0.72f;
            ring.transform.position = Chest;
            ring.transform.localScale = Vector3.one * H * 1.25f * ringK;
            float p = CatchChance(0);
            var c = p > 0.4f ? new Color(0.3f, 1, 0.45f) : p > 0.2f ? new Color(1, 0.8f, 0.2f) : new Color(1, 0.35f, 0.3f);
            ring.GetComponent<Renderer>().sharedMaterial.color = c * (0.6f + (1 - ringK) * 0.6f);

            // Swipe up to throw.
            if (dartMode || orb != null) { if (heldOrb) heldOrb.SetActive(false); return; }
            if (Inp.Down && !UI.OverHud && Inp.Pos.y < Screen.height * 0.6f) { swiping = true; swipeFrom = Inp.Pos; swipeT = 0; }
            if (swiping)
            {
                swipeT += dt;
                if (Inp.Up)
                {
                    swiping = false;
                    var s = Inp.Pos - swipeFrom;
                    if (s.y > Screen.height * 0.06f) Throw(s, swipeT);
                }
                else if (!Inp.Held) swiping = false;
            }
            if (GameState.save.items.orbs > 0)
            {
                if (heldOrb == null)
                {
                    heldOrb = Props.Orb(GameState.Me.color);
                    heldOrb.transform.localScale = Vector3.one * 0.035f;
                    foreach (var r in heldOrb.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                }
                heldOrb.SetActive(true);
                var sp2 = swiping ? Inp.Pos : new Vector2(Screen.width / 2f, Screen.height * 0.14f);
                heldOrb.transform.position = cam.ScreenToWorldPoint(new Vector3(sp2.x, sp2.y, 0.4f));
                heldOrb.transform.rotation = Quaternion.LookRotation(cam.transform.forward) * Quaternion.Euler(-20, Time.time * 40, 0);
            }
            else if (heldOrb) heldOrb.SetActive(false);
        }

        void UpdateDarts(float dt)
        {
            for (int i = darts.Count - 1; i >= 0; i--)
            {
                var d = darts[i];
                d.t += dt / 0.18f;
                d.go.transform.position = Vector3.Lerp(d.from, d.to, d.t);
                if (d.t >= 1) { darts.RemoveAt(i); DartLanded(d); }
            }
        }

        void UpdateOrb(float dt)
        {
            if (orb == null || orbBody == null) return;
            orbLife += dt;
            if (orbLife > 3 || orb.transform.position.y < floorY - 3)
            {
                Burst(orb.transform.position, new Color(0.7f, 0.7f, 0.8f), 6, 0.6f);
                Destroy(orb); orb = null;
                Say("Missed", Chest, new Color(0.8f, 0.78f, 0.9f));
            }
        }

        void UpdateFx(float dt)
        {
            for (int i = sparks.Count - 1; i >= 0; i--)
            {
                var s = sparks[i];
                s.life += dt;
                if (s.life >= s.max || s.tr == null) { if (s.tr) Destroy(s.tr.gameObject); sparks.RemoveAt(i); continue; }
                s.v += Physics.gravity * dt * 0.3f;
                s.tr.position += s.v * dt;
                s.tr.localScale = Vector3.one * s.size * (1 - s.life / s.max);
            }
            for (int i = floats.Count - 1; i >= 0; i--) { floats[i].life -= dt; floats[i].p += Vector3.up * dt * 0.25f; if (floats[i].life <= 0) floats.RemoveAt(i); }
        }

        /* ------------------ Interface ------------------ */

        public void DrawGUI()
        {
            float W = UI.W, top = UI.Safe.y + 8;
            var items = GameState.save.items;
            var rc = Species.Rarities[sp.rar]; var el = Species.Elements[sp.el];
            var card = new Rect(UI.Safe.x + 8, top, Mathf.Min(260, W - 110), 58);
            UI.Panel(card, UI.Ink);
            UI.Label(new Rect(card.x + 12, card.y + 8, card.width - 20, 22), UI.Col(sp.name, rc.color) + $"  <size={Mathf.RoundToInt(12 * UI.Scale)}>Lv {lvl}</size>", UI.H2);
            UI.Label(new Rect(card.x + 12, card.y + 32, card.width - 20, 18), $"{UI.Col(el.name, el.color)} · {rc.name} · DNA +{dna}{(spawn.boost ? UI.Col(" · weather boost", new Color(0.5f, 0.83f, 1f)) : "")}", UI.Small);
            var timer = new Rect(UI.Safe.xMax - 92, top, 84, 58);
            UI.Panel(timer, UI.Ink);
            UI.Label(new Rect(timer.x, timer.y + 8, timer.width, 22), phase == Phase.Free ? UI.Clock((long)(timeLeft * 1000)) : "–", new GUIStyle(UI.H2) { alignment = TextAnchor.UpperCenter });
            UI.Label(new Rect(timer.x, timer.y + 32, timer.width, 18), ar ? "AR" : "3D view", new GUIStyle(UI.Small) { alignment = TextAnchor.UpperCenter });

            // Floating messages
            foreach (var f in floats)
            {
                var sp3 = cam.WorldToScreenPoint(f.p);
                if (sp3.z < 0) continue;
                var at = new Vector2(sp3.x / UI.Scale, (Screen.height - sp3.y) / UI.Scale);
                var old = GUI.color; GUI.color = new Color(1, 1, 1, Mathf.Clamp01(f.life * 2));
                UI.Label(new Rect(at.x - 120, at.y - 14, 240, 28), UI.Col(f.big ? $"<b>{f.text}</b>" : f.text, f.c), f.big ? new GUIStyle(UI.H2) { alignment = TextAnchor.MiddleCenter } : UI.Mid);
                GUI.color = old;
            }

            if (phase == Phase.Result) { ResultPanel(); return; }

            if (hint != null)
            {
                float w = Mathf.Min(W - 24, 340), h = UI.HeightOf(hint, UI.Mid, w - 20) + 16;
                var r = new Rect((W - w) / 2, card.yMax + 12, w, h);
                UI.Panel(r, new Color(0, 0, 0, 0.6f));
                UI.Label(new Rect(r.x + 10, r.y + 8, w - 20, h - 12), hint, UI.Mid);
            }

            if (phase == Phase.Free && dartMode)
            {
                float cx = W / 2, cy = UI.H / 2;
                var c = new Color(1, 1, 1, 0.85f);
                UI.Fill(new Rect(cx - 14, cy - 1, 10, 2), c); UI.Fill(new Rect(cx + 4, cy - 1, 10, 2), c);
                UI.Fill(new Rect(cx - 1, cy - 14, 2, 10), c); UI.Fill(new Rect(cx - 1, cy + 4, 2, 10), c);
            }

            float by = UI.Safe.yMax - 64, bw = Mathf.Min(110, (UI.Safe.width - 40) / 3), bx = UI.Safe.x + 8;
            if (UI.Button(new Rect(bx, by, bw, 52), $"Orb ({items.orbs})", !dartMode ? GameState.Me.color * 0.7f : UI.Ink)) dartMode = false;
            if (UI.Button(new Rect(bx + bw + 6, by, bw, 52), $"Dart ({items.darts})", dartMode ? new Color(0.75f, 0.6f, 0.15f) : UI.Ink)) dartMode = true;
            if (UI.Button(new Rect(UI.Safe.xMax - 8 - 80, by, 80, 52), "Run", new Color(1, 1, 1, 0.14f))) Run();
            if (phase == Phase.Free)
            {
                if (dartMode && UI.Button(new Rect(W / 2 - 60, by - 76, 120, 64), "FIRE", new Color(0.8f, 0.5f, 0.1f))) FireDart();
                if (dartMode && Inp.KeyDown(Key.Space)) FireDart();
                if (!dartMode && hint == null)
                {
                    string h = items.orbs > 0 ? "Swipe up to throw. Throw when the ring is small." : "Out of orbs — switch to darts.";
                    UI.Label(new Rect(0, by - 34, W, 24), h, UI.Mid);
                }
                else if (dartMode) UI.Label(new Rect(0, by - 104, W, 24), "Line up the gold target and fire.", UI.Mid);
            }
        }

        void ResultPanel()
        {
            float w = Mathf.Min(UI.W - 32, 380);
            float bh = UI.HeightOf(resultBody, UI.Body, w - 40);
            float h = 90 + bh + 70 + (caughtIt ? 180 : 0);
            var r = new Rect((UI.W - w) / 2, (UI.H - h) / 2, w, h);
            UI.Panel(r, UI.Ink);
            UI.Label(new Rect(r.x + 20, r.y + 18, w - 40, 30), resultTitle, UI.Big);
            float y = r.y + 56;
            if (caughtIt)
            {
                GUI.DrawTexture(UI.P(new Rect(r.x + (w - 170) / 2, y, 170, 170)), Preview.Show(sp.id), ScaleMode.ScaleToFit, true);
                y += 180;
            }
            UI.Label(new Rect(r.x + 20, y, w - 40, bh + 4), resultBody, UI.Body);
            if (UI.Button(new Rect(r.x + 20, r.yMax - 66, w - 40, 50), "Continue")) Finish();
        }
    }

    // Reports orb collisions to the encounter.
    public class OrbHit : MonoBehaviour
    {
        public Encounter enc;
        void OnCollisionEnter(Collision c) { if (enc) enc.OrbTouched(c.collider); }
    }
}

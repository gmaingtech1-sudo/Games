using UnityEngine;

namespace BodyOS
{
    /// <summary>Animated holographic backdrop for the main menu: a rotating figure inside orbit rings.</summary>
    public sealed class MainMenuBackdrop : MonoBehaviour
    {
        Transform rings, figure;

        public static void Build()
        {
            WorldLighting.SetBase(new Color(0.15f, 0.18f, 0.24f), false, Color.black, 0f);
            var root = new GameObject("MainMenuBackdrop");
            var b = root.AddComponent<MainMenuBackdrop>();

            var camGo = new GameObject("MenuCamera");
            camGo.transform.SetParent(root.transform, false);
            camGo.transform.position = new Vector3(0f, 1.2f, -6.5f);
            camGo.transform.rotation = Quaternion.Euler(4f, 0f, 0f);
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.01f, 0.015f, 0.035f);
            cam.fieldOfView = 50f;

            b.rings = new GameObject("Rings").transform;
            b.rings.SetParent(root.transform, false);
            b.rings.position = new Vector3(1.8f, 1.2f, 0f);
            var glow = Art.Glow("menu_ring", new Color(0.1f, 0.8f, 1f, 0.5f));
            var glow2 = Art.Glow("menu_ring2", new Color(0.3f, 0.4f, 1f, 0.4f));
            for (int i = 0; i < 3; i++)
            {
                var ring = new GameObject("Ring" + i).transform;
                ring.SetParent(b.rings, false);
                ring.localRotation = Quaternion.Euler(70f + i * 25f, i * 60f, 0f);
                const int segments = 40;
                float r = 1.6f + i * 0.35f;
                for (int s = 0; s < segments; s++)
                {
                    if (s % 5 == 4) continue; // gaps make it read as a HUD element
                    float a = s / (float)segments * Mathf.PI * 2f;
                    var seg = LevelKit.Primitive(PrimitiveType.Cube, ring, "Seg", new Vector3(Mathf.Cos(a) * r, 0f, Mathf.Sin(a) * r),
                        new Vector3(0.22f, 0.03f, 0.03f), i == 1 ? glow2 : glow);
                    seg.transform.localRotation = Quaternion.Euler(0f, -a * Mathf.Rad2Deg + 90f, 0f);
                }
            }

            // Holographic figure.
            b.figure = new GameObject("Figure").transform;
            b.figure.SetParent(root.transform, false);
            b.figure.position = new Vector3(1.8f, 0.2f, 0f);
            var holo = Art.Glow("menu_holo", new Color(0.1f, 0.7f, 1f, 0.35f));
            LevelKit.Primitive(PrimitiveType.Capsule, b.figure, "Torso", new Vector3(0f, 1.35f, 0f), new Vector3(0.55f, 0.45f, 0.35f), holo);
            LevelKit.Primitive(PrimitiveType.Sphere, b.figure, "Head", new Vector3(0f, 2.0f, 0f), new Vector3(0.36f, 0.4f, 0.36f), holo);
            LevelKit.Primitive(PrimitiveType.Capsule, b.figure, "LegL", new Vector3(-0.15f, 0.5f, 0f), new Vector3(0.18f, 0.5f, 0.18f), holo);
            LevelKit.Primitive(PrimitiveType.Capsule, b.figure, "LegR", new Vector3(0.15f, 0.5f, 0f), new Vector3(0.18f, 0.5f, 0.18f), holo);
            LevelKit.Primitive(PrimitiveType.Capsule, b.figure, "ArmL", new Vector3(-0.42f, 1.3f, 0f), new Vector3(0.14f, 0.4f, 0.14f), holo);
            LevelKit.Primitive(PrimitiveType.Capsule, b.figure, "ArmR", new Vector3(0.42f, 1.3f, 0f), new Vector3(0.14f, 0.4f, 0.14f), holo);
            LevelKit.Primitive(PrimitiveType.Sphere, b.figure, "Core", new Vector3(0f, 1.45f, 0.1f), new Vector3(0.18f, 0.18f, 0.18f), LevelKit.GlowCyan);
            LevelKit.Primitive(PrimitiveType.Cylinder, root.transform, "Platform", new Vector3(1.8f, 0f, 0f), new Vector3(2.6f, 0.02f, 2.6f), glow2);
        }

        void Update()
        {
            float t = Time.unscaledTime;
            rings.rotation = Quaternion.Euler(0f, t * 12f, 0f);
            for (int i = 0; i < rings.childCount; i++) rings.GetChild(i).Rotate(0f, (i % 2 == 0 ? 20f : -14f) * Time.unscaledDeltaTime, 0f, Space.Self);
            figure.rotation = Quaternion.Euler(0f, t * 20f, 0f);
        }
    }
}

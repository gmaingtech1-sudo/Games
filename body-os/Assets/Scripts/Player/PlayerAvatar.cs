using UnityEngine;

namespace BodyOS
{
    /// <summary>Procedural humanoid in an exo-suit with a glowing BODY.OS core, plus a simple walk cycle.</summary>
    public sealed class PlayerAvatar : MonoBehaviour
    {
        Transform hips, legL, legR, armL, armR, torso;
        Material coreMat;
        float cycle;

        public static PlayerAvatar Build(Transform player)
        {
            var root = new GameObject("Avatar");
            root.transform.SetParent(player, false);
            var a = root.AddComponent<PlayerAvatar>();
            var suit = Art.Lit("suit", new Color(0.2f, 0.22f, 0.26f), 0.55f, 0.6f);
            var plate = Art.Lit("suit_plate", new Color(0.75f, 0.8f, 0.86f), 0.6f, 0.4f);
            var visor = Art.Lit("visor", new Color(0.05f, 0.3f, 0.4f), 0.95f, 0f, Art.Cyan * 1.8f);
            a.coreMat = new Material(LevelKit.GlowCyan);

            a.hips = new GameObject("Hips").transform;
            a.hips.SetParent(root.transform, false);
            a.hips.localPosition = new Vector3(0f, 0.95f, 0f);

            a.torso = LevelKit.Primitive(PrimitiveType.Capsule, a.hips, "Torso", new Vector3(0f, 0.38f, 0f), new Vector3(0.52f, 0.42f, 0.34f), suit).transform;
            LevelKit.Primitive(PrimitiveType.Cube, a.torso, "ChestPlate", new Vector3(0f, 0.25f, 0.33f), new Vector3(0.8f, 0.6f, 0.3f), plate);
            LevelKit.Primitive(PrimitiveType.Cube, a.torso, "Pack", new Vector3(0f, 0.15f, -0.55f), new Vector3(0.7f, 0.9f, 0.4f), suit);
            var core = LevelKit.Primitive(PrimitiveType.Sphere, a.torso, "Core", new Vector3(0f, 0.2f, -0.78f), new Vector3(0.3f, 0.3f, 0.12f), a.coreMat);
            core.GetComponent<Renderer>().sharedMaterial = a.coreMat;

            var head = LevelKit.Primitive(PrimitiveType.Sphere, a.hips, "Helmet", new Vector3(0f, 0.92f, 0f), new Vector3(0.34f, 0.36f, 0.36f), plate).transform;
            LevelKit.Primitive(PrimitiveType.Cube, head, "Visor", new Vector3(0f, 0.05f, 0.38f), new Vector3(0.8f, 0.35f, 0.3f), visor);

            a.armL = Limb(a.hips, "ArmL", new Vector3(-0.34f, 0.68f, 0f), 0.62f, 0.13f, suit, plate);
            a.armR = Limb(a.hips, "ArmR", new Vector3(0.34f, 0.68f, 0f), 0.62f, 0.13f, suit, plate);
            a.legL = Limb(a.hips, "LegL", new Vector3(-0.13f, 0f, 0f), 0.9f, 0.16f, suit, plate);
            a.legR = Limb(a.hips, "LegR", new Vector3(0.13f, 0f, 0f), 0.9f, 0.16f, suit, plate);

            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false;
            vt.heat = 0.75f;
            return a;
        }

        static Transform Limb(Transform parent, string name, Vector3 pivot, float length, float width, Material mat, Material plate)
        {
            var p = new GameObject(name).transform;
            p.SetParent(parent, false);
            p.localPosition = pivot;
            LevelKit.Primitive(PrimitiveType.Capsule, p, "Segment", new Vector3(0f, -length * 0.5f, 0f), new Vector3(width, length * 0.5f, width), mat);
            LevelKit.Primitive(PrimitiveType.Cube, p, "Plate", new Vector3(0f, -length * 0.35f, width * 0.45f), new Vector3(width * 0.9f, length * 0.3f, width * 0.3f), plate);
            return p;
        }

        public void Animate(float speed, bool grounded, float verticalVelocity, float dt)
        {
            float amount = Mathf.Clamp01(speed / 5f);
            if (grounded) cycle += dt * (4f + speed * 1.4f);
            float swing = grounded ? Mathf.Sin(cycle) * 38f * amount : 18f;
            legL.localRotation = Quaternion.Euler(swing, 0f, 0f);
            legR.localRotation = Quaternion.Euler(grounded ? -swing : -10f, 0f, 0f);
            armL.localRotation = Quaternion.Euler(-swing * 0.8f, 0f, grounded ? 6f : 30f);
            armR.localRotation = Quaternion.Euler(swing * 0.8f, 0f, grounded ? -6f : -30f);
            float bob = grounded ? Mathf.Abs(Mathf.Sin(cycle)) * 0.05f * amount : 0f;
            hips.localPosition = new Vector3(0f, 0.95f + bob, 0f);
            torso.localRotation = Quaternion.Euler(amount * 8f, 0f, 0f);

            // The BODY.OS core reflects remaining energy.
            var g = Game.I;
            if (g != null && g.Vitals != null)
            {
                float e = g.Vitals.EnergyFraction;
                Color c = e < VitalsSystem.LowEnergyFraction ? Art.Warning : Art.Cyan;
                Art.SetEmission(coreMat, c * (0.6f + 1.4f * e));
            }
        }

        void OnDestroy() { if (coreMat != null) Destroy(coreMat); }
    }
}

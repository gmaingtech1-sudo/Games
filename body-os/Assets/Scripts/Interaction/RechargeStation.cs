using UnityEngine;

namespace BodyOS
{
    /// <summary>Restores energy and suit reserve, heals a little and becomes the respawn checkpoint.</summary>
    public sealed class RechargeStation : Interactable
    {
        public float cooldown = 12f;
        float ready;
        Material ringMat;
        Vector3 spawnOffset = new Vector3(0f, 0.1f, 1.4f);

        public override string Prompt => Time.time < ready ? "CHARGING" : "RECHARGE";

        public static RechargeStation Create(Transform parent, string id, Vector3 pos, float yaw)
        {
            var root = new GameObject("Recharge_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            var s = root.AddComponent<RechargeStation>();
            s.id = "recharge_" + id; s.displayName = "Recharge Station";
            s.ringMat = new Material(LevelKit.GlowCyan);
            LevelKit.Box(root.transform, "Pillar", new Vector3(0f, 1.2f, -0.2f), new Vector3(0.8f, 2.4f, 0.4f), LevelKit.HullLight, true, false);
            LevelKit.Primitive(PrimitiveType.Cylinder, root.transform, "Pad", new Vector3(0f, 0.03f, 0.6f), new Vector3(1.3f, 0.03f, 1.3f), s.ringMat);
            LevelKit.Box(root.transform, "Coil", new Vector3(0f, 1.4f, 0.02f), new Vector3(0.5f, 1.4f, 0.06f), s.ringMat, false, false);
            LevelKit.PointLight(root.transform, new Vector3(0f, 1.6f, 0.8f), Art.Cyan, 5f, 1.2f);
            s.scanText = "Standard crew recharge cradle. Restores BODY.OS energy and suit reserve. Registers as your emergency reboot point.";
            s.focusOffset = new Vector3(0f, 1.1f, 0.4f);
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false; vt.heat = 0.8f; vt.scan = ScanCategory.Interactable;
            return s;
        }

        public override bool CanInteract(out string reason)
        {
            reason = "Recharge cycle in progress (" + Mathf.CeilToInt(ready - Time.time) + "s).";
            return Time.time >= ready;
        }

        protected override void OnInteract()
        {
            var g = Game.I;
            ready = Time.time + cooldown;
            g.Vitals.RefillAll();
            AudioManager.I?.Play(Sfx.Recharge);
            UIRoot.I?.Fx.Flash(Art.Cyan, 0.35f);
            WorldBuilders.SetCheckpoint(new SpawnPoint { position = transform.TransformPoint(spawnOffset), yaw = transform.eulerAngles.y });
            GameEvents.Notify("Energy and suit restored. Reboot point updated.", NoticeType.Success);
            g.SetFlag("recharged");
        }

        void Update()
        {
            if (ringMat == null) return;
            float k = Time.time < ready ? 0.4f : 1f + 0.3f * Mathf.Sin(Time.time * 3f);
            Art.SetEmission(ringMat, Art.Cyan * k);
        }

        void OnDestroy() { if (ringMat != null) Destroy(ringMat); }
    }
}

using UnityEngine;

namespace BodyOS
{
    /// <summary>A dormant spatial fold. While Spatial Anomaly is active it can be traversed to its partner.</summary>
    public sealed class SpatialPortal : Interactable
    {
        public SpatialPortal partner;
        public Vector3 exitOffset = new Vector3(0f, 0.1f, 1.6f);
        Material mat;
        Transform disc;

        bool Active => Game.I != null && Game.I.Reality != null && Game.I.Reality.SpatialActive;
        public override string Prompt => "TRAVERSE";

        public static SpatialPortal Create(Transform parent, string id, Vector3 pos, float yaw)
        {
            var root = new GameObject("Portal_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            var p = root.AddComponent<SpatialPortal>();
            p.id = "portal_" + id; p.displayName = "Spatial Fold";
            p.interactRange = 2.6f;
            p.focusOffset = new Vector3(0f, 1.4f, 0f);
            p.mat = new Material(Art.Glow("portal", new Color(0.4f, 1f, 0.7f, 0.6f)));
            p.disc = LevelKit.Primitive(PrimitiveType.Cylinder, root.transform, "Disc", new Vector3(0f, 1.4f, 0f), new Vector3(2.2f, 0.02f, 2.2f), p.mat).transform;
            p.disc.localRotation = Quaternion.Euler(90f, 0f, 0f);
            LevelKit.Box(root.transform, "FrameL", new Vector3(-1.25f, 1.4f, 0f), new Vector3(0.15f, 2.8f, 0.3f), LevelKit.GlowViolet, true, false);
            LevelKit.Box(root.transform, "FrameR", new Vector3(1.25f, 1.4f, 0f), new Vector3(0.15f, 2.8f, 0.3f), LevelKit.GlowViolet, true, false);
            p.scanText = "A stable fold in local space, dormant. A sufficiently strong spatial field (SPATIAL ANOMALY) would let a body pass through to wherever the fold leads.";
            p.scanXp = 25;
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false; vt.anomaly = true; vt.scan = ScanCategory.Clue;
            return p;
        }

        public override bool CanInteract(out string reason)
        {
            reason = "The fold is dormant. It needs a spatial field to open.";
            return Active && partner != null;
        }

        protected override void OnInteract()
        {
            var g = Game.I;
            Vector3 exit = partner.transform.TransformPoint(partner.exitOffset);
            g.Player.Teleport(exit, partner.transform.eulerAngles.y);
            AudioManager.I?.Play(Sfx.Reality);
            UIRoot.I?.Fx.RealityFlash(new Color(0.4f, 1f, 0.7f));
            g.SetFlag("portal.used");
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f || disc == null) return;
            bool a = Active;
            disc.Rotate(0f, (a ? 180f : 20f) * dt, 0f, Space.Self);
            float k = a ? 0.8f + 0.2f * Mathf.Sin(Time.time * 6f) : 0.15f;
            Art.SetColor(mat, new Color(0.4f, 1f, 0.7f, 0.6f) * k);
        }

        void OnDestroy() { if (mat != null) Destroy(mat); }
    }
}

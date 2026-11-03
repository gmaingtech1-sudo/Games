using UnityEngine;

namespace BodyOS
{
    /// <summary>An object out of phase with normal matter. Only Matter Interaction lets you open it.</summary>
    public sealed class PhaseLockedContainer : Interactable
    {
        public string itemId = "phase_core";
        public string openedFlag = "phase.opened";
        Material mat;
        Transform core;

        bool Opened => Game.I != null && Game.I.HasFlag(openedFlag);
        public override string Prompt => "EXTRACT";
        public override bool HasUseAction => !Opened;

        public static PhaseLockedContainer Create(Transform parent, string id, Vector3 pos)
        {
            var root = new GameObject("PhaseLocked_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            var c = root.AddComponent<PhaseLockedContainer>();
            c.id = id; c.displayName = "Phase-Locked Containment";
            c.focusOffset = new Vector3(0f, 1.1f, 0f);
            LevelKit.Box(root.transform, "Plinth", new Vector3(0f, 0.4f, 0f), new Vector3(1.2f, 0.8f, 1.2f), LevelKit.HullDark, true, false);
            c.mat = new Material(Art.Glow("phase", new Color(1f, 0.4f, 0.75f, 0.5f)));
            LevelKit.Primitive(PrimitiveType.Cube, root.transform, "Field", new Vector3(0f, 1.3f, 0f), new Vector3(1f, 1f, 1f), c.mat);
            c.core = LevelKit.Primitive(PrimitiveType.Sphere, root.transform, "Core", new Vector3(0f, 1.3f, 0f), new Vector3(0.4f, 0.4f, 0.4f), LevelKit.GlowViolet).transform;
            c.scanText = "Containment cube holding a vibrating core. The field and core exist slightly out of phase with this reality: ordinary hands pass straight through. MATTER INTERACTION could synchronise with it.";
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false; vt.anomaly = true; vt.heat = 0.5f; vt.scan = ScanCategory.Clue;
            return c;
        }

        void Start() { if (Opened && core != null) core.gameObject.SetActive(false); }

        public override bool CanInteract(out string reason)
        {
            if (Opened) { reason = "Empty."; return false; }
            if (!Game.I.Reality.MatterActive) { reason = "Your hand passes straight through it. It is phase-locked."; return false; }
            reason = "";
            return true;
        }

        protected override void OnInteract()
        {
            var g = Game.I;
            g.SetFlag(openedFlag);
            g.Inventory.Add(itemId, 1);
            g.Progression.AddXp(50, "puzzle solved");
            AudioManager.I?.Play(Sfx.Success);
            if (core != null) core.gameObject.SetActive(false);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f || mat == null) return;
            bool matter = Game.I != null && Game.I.Reality != null && Game.I.Reality.MatterActive;
            float k = matter ? 1f : 0.4f + 0.3f * Mathf.Sin(Time.time * 9f) * Mathf.Sin(Time.time * 2.3f);
            Art.SetColor(mat, new Color(1f, 0.4f, 0.75f, 0.5f) * Mathf.Abs(k));
            if (core != null) core.Rotate(30f * dt, 80f * dt, 0f);
        }

        void OnDestroy() { if (mat != null) Destroy(mat); }
    }
}

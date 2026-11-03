using UnityEngine;

namespace BodyOS
{
    /// <summary>Power socket puzzle: insert a power cell, then pass a timed calibration (Reaction Speed).</summary>
    public sealed class PowerSocket : Interactable
    {
        public string powerFlag = "power.socket";
        public string requiredItem = "power_cell";
        Material lightMat;

        bool Powered => Game.I != null && Game.I.HasFlag(powerFlag);
        public override string Prompt => Powered ? "POWERED" : "INSTALL CELL";

        public static PowerSocket Create(Transform parent, string id, string flag, Vector3 pos, float yaw)
        {
            var root = new GameObject("Socket_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            var s = root.AddComponent<PowerSocket>();
            s.id = id; s.displayName = "Power Coupling"; s.powerFlag = flag;
            s.focusOffset = new Vector3(0f, 1.2f, 0.1f);
            s.lightMat = new Material(LevelKit.GlowRed);
            LevelKit.Box(root.transform, "Housing", new Vector3(0f, 1.2f, 0f), new Vector3(0.7f, 1.0f, 0.3f), LevelKit.HullDark, true, false);
            LevelKit.Box(root.transform, "Slot", new Vector3(0f, 1.2f, 0.16f), new Vector3(0.3f, 0.5f, 0.04f), LevelKit.HullLight, false, false);
            var ring = LevelKit.Box(root.transform, "Status", new Vector3(0f, 1.8f, 0.16f), new Vector3(0.5f, 0.08f, 0.04f), s.lightMat, false, false);
            ring.GetComponent<Renderer>().sharedMaterial = s.lightMat;
            s.scanText = "Bulkhead power coupling. Accepts a Class-C power cell. The phase regulator is damaged: the coupling must be calibrated by hand when the cell is seated.";
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false; vt.scan = ScanCategory.Interactable;
            return s;
        }

        void Start() { UpdateLight(); }

        void UpdateLight()
        {
            Color c = Powered ? Art.Success : Art.Danger;
            Art.SetColor(lightMat, c * 0.4f);
            Art.SetEmission(lightMat, c * 1.5f);
        }

        public override bool CanInteract(out string reason)
        {
            var g = Game.I;
            if (Powered) { reason = "The coupling is already powered."; return false; }
            if (g.Inventory.Count(requiredItem) <= 0) { reason = "Requires a " + g.Content.ItemName(requiredItem) + "."; return false; }
            reason = "";
            return true;
        }

        protected override void OnInteract()
        {
            UIRoot.I.ShowCalibration("POWER COUPLING CALIBRATION", OnSuccess, OnFail);
        }

        void OnSuccess()
        {
            var g = Game.I;
            g.Inventory.Remove(requiredItem, 1);
            g.SetFlag(powerFlag);
            UpdateLight();
            AudioManager.I?.Play(Sfx.Success);
            Game.Vibrate();
            GameEvents.Notify("Coupling calibrated. Power restored.", NoticeType.Success);
            g.Progression.AddXp(50, "puzzle solved");
            g.Log("Restored power to " + displayName + ".");
        }

        void OnFail()
        {
            var g = Game.I;
            g.Vitals.AddEnergy(-5f);
            AudioManager.I?.Play(Sfx.Denied);
            GameEvents.Notify("Calibration failed (-5 energy). Higher Reaction Speed widens the window.", NoticeType.Warning);
        }

        void OnDestroy() { if (lightMat != null) Destroy(lightMat); }
    }
}

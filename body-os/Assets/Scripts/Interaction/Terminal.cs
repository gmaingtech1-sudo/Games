using UnityEngine;

namespace BodyOS
{
    /// <summary>Computer terminal: shows logs, can grant technology schematics, set story flags,
    /// play a transmission or open a BODY.OS section.</summary>
    public sealed class Terminal : Interactable
    {
        public string title = "TERMINAL";
        [TextArea] public string body = "";
        [Tooltip("Flags set after the player reads the terminal.")]
        public string[] setFlags = new string[0];
        public string[] schematicFlags = new string[0];
        public string[] schematicNames = new string[0];
        [Tooltip("BODY.OS section offered after reading (-1 = none).")]
        public int openSection = -1;
        public string openSectionLabel = "OPEN BODY.OS";
        public bool transmission;
        public int firstUseXp = 20;
        public string prompt = "ACCESS";
        [Tooltip("Optional flag required before the terminal responds.")]
        public string requiredFlag = "";
        public string lockedReason = "";

        public override string Prompt => prompt;

        public static Terminal Create(Transform parent, string id, string name, Vector3 pos, float yaw, Material screenMat = null)
        {
            var root = new GameObject("Terminal_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            root.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            LevelKit.Box(root.transform, "Base", new Vector3(0f, 0.5f, 0f), new Vector3(0.9f, 1.0f, 0.6f), LevelKit.HullLight, true, false);
            var screen = LevelKit.Box(root.transform, "Screen", new Vector3(0f, 1.35f, 0.05f), new Vector3(0.85f, 0.6f, 0.06f), screenMat != null ? screenMat : LevelKit.Screen, false, false);
            screen.transform.localRotation = Quaternion.Euler(-15f, 0f, 0f);
            LevelKit.Box(root.transform, "Glow", new Vector3(0f, 1.02f, 0.31f), new Vector3(0.8f, 0.04f, 0.02f), LevelKit.GlowCyan, false, false);
            var t = root.AddComponent<Terminal>();
            t.id = id; t.displayName = name; t.title = name.ToUpperInvariant();
            t.focusOffset = new Vector3(0f, 1.2f, 0f);
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false; vt.heat = 0.4f; vt.scan = ScanCategory.Interactable;
            return t;
        }

        public override bool CanInteract(out string reason)
        {
            reason = "";
            if (!string.IsNullOrEmpty(requiredFlag) && Game.I != null && !Game.I.HasFlag(requiredFlag)) { reason = lockedReason; return false; }
            return true;
        }

        protected override void OnInteract()
        {
            var g = Game.I;
            string useFlag = "interact." + id;
            bool first = !g.HasFlag(useFlag);
            g.SetFlag(useFlag);
            if (first && firstUseXp > 0) g.Progression.AddXp(firstUseXp, "terminal");
            for (int i = 0; i < schematicFlags.Length; i++)
                Discover(schematicFlags[i], i < schematicNames.Length ? schematicNames[i] : schematicFlags[i]);

            System.Action finish = () => { foreach (var f in setFlags) g.SetFlag(f); };
            if (transmission) UIRoot.I.ShowTransmission(title, body, finish);
            else if (openSection >= 0) UIRoot.I.ShowDialog(title, body, openSectionLabel, () => { finish(); UIRoot.I.OpenBodyOS(openSection); }, "CLOSE", finish);
            else UIRoot.I.ShowDialog(title, body, "CLOSE", finish);
        }
    }
}

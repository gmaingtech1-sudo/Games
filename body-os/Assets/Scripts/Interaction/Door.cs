using UnityEngine;

namespace BodyOS
{
    /// <summary>Sliding double door. Opens automatically when unlocked and the player is near.
    /// Locked doors explain why (and can be scanned for details).</summary>
    public sealed class Door : Interactable
    {
        public string requiredFlag = "";
        public string lockedReason = "Locked.";
        Transform left, right;
        Vector3 leftClosed, rightClosed, slide;
        Material lightMat;
        float open01, pollTimer;
        bool wantOpen, wasUnlocked;

        public bool IsUnlocked => string.IsNullOrEmpty(requiredFlag) || (Game.I != null && Game.I.HasFlag(requiredFlag));
        public override string Prompt => IsUnlocked ? "OPEN" : "LOCKED";
        public override bool HasUseAction => !IsUnlocked;

        /// <summary>Builds a door in an opening. alongX: the wall runs along the X axis.</summary>
        public static Door Create(Transform parent, string id, string name, Vector3 pos, bool alongX, float width = 2.4f, float height = 3f)
        {
            var root = new GameObject("Door_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            root.transform.localRotation = Quaternion.Euler(0f, alongX ? 0f : 90f, 0f);
            var d = root.AddComponent<Door>();
            d.id = id; d.displayName = name;
            d.interactRange = 2.8f;
            d.focusOffset = new Vector3(0f, 1.4f, 0f);
            float half = width * 0.5f;
            var panelMat = LevelKit.HullLight;
            d.left = LevelKit.Box(root.transform, "PanelL", new Vector3(-half * 0.5f, height * 0.5f, 0f), new Vector3(half, height, 0.2f), panelMat, true, false).transform;
            d.right = LevelKit.Box(root.transform, "PanelR", new Vector3(half * 0.5f, height * 0.5f, 0f), new Vector3(half, height, 0.2f), panelMat, true, false).transform;
            d.lightMat = new Material(LevelKit.GlowCyan);
            var stripL = LevelKit.Box(d.left, "Light", new Vector3(half * 0.5f - 0.05f, 0f, 0.11f), new Vector3(0.06f, height * 0.8f, 0.03f), d.lightMat, false, false);
            var stripR = LevelKit.Box(d.right, "Light", new Vector3(-half * 0.5f + 0.05f, 0f, 0.11f), new Vector3(0.06f, height * 0.8f, 0.03f), d.lightMat, false, false);
            stripL.GetComponent<Renderer>().sharedMaterial = d.lightMat;
            stripR.GetComponent<Renderer>().sharedMaterial = d.lightMat;
            d.leftClosed = d.left.localPosition;
            d.rightClosed = d.right.localPosition;
            d.slide = new Vector3(half * 0.95f, 0f, 0f);
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = true;
            vt.scan = ScanCategory.Interactable;
            return d;
        }

        void Start() { UpdateLight(); wasUnlocked = IsUnlocked; }

        void Update()
        {
            var g = Game.I;
            if (g == null || !g.InGame || g.Player == null) return;
            float dt = Time.deltaTime;
            if (dt <= 0f) return;
            pollTimer -= dt;
            if (pollTimer <= 0f)
            {
                pollTimer = 0.2f;
                bool unlocked = IsUnlocked;
                if (unlocked != wasUnlocked) { wasUnlocked = unlocked; UpdateLight(); if (unlocked) GameEvents.Notify(displayName + " unlocked.", NoticeType.Success); }
                bool near = (g.Player.transform.position - transform.position).sqrMagnitude < 3.4f * 3.4f;
                bool next = unlocked && near;
                if (next && !wantOpen) AudioManager.I?.Play(Sfx.DoorOpen, 0.7f);
                wantOpen = next;
            }
            float target = wantOpen ? 1f : 0f;
            if (!Mathf.Approximately(open01, target))
            {
                open01 = Mathf.MoveTowards(open01, target, dt * 2.5f);
                float k = Mathf.SmoothStep(0f, 1f, open01);
                left.localPosition = leftClosed - slide * k;
                right.localPosition = rightClosed + slide * k;
            }
        }

        void UpdateLight()
        {
            Color c = IsUnlocked ? Art.Cyan : Art.Danger;
            Art.SetColor(lightMat, c * 0.4f);
            Art.SetEmission(lightMat, c * 1.5f);
        }

        public override bool CanInteract(out string reason)
        {
            reason = IsUnlocked ? "" : lockedReason;
            return IsUnlocked;
        }

        protected override void OnInteract() { }

        void OnDestroy() { if (lightMat != null) Destroy(lightMat); }
    }
}

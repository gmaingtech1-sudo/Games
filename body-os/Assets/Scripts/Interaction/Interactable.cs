using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Base class for everything the player can use or analyse. Provides one consistent interaction
    /// interface: a prompt, availability with a reason, an action, and optional scan/analysis data.
    /// </summary>
    public abstract class Interactable : MonoBehaviour
    {
        [Tooltip("Stable id used for save flags (scanned.<id>, used.<id>...).")]
        public string id = "object";
        public string displayName = "Object";
        public float interactRange = 2.4f;
        public Vector3 focusOffset = new Vector3(0f, 1f, 0f);

        [Header("Scan / analysis")]
        public string scanTitle = "";
        [TextArea] public string scanText = "";
        [Tooltip("Scan difficulty. Scales analysis time and energy cost.")]
        public float scanDifficulty = 1f;
        public int scanXp = 15;
        [Range(0f, 1f), Tooltip("Electromagnetic interference that can interrupt scanning (resisted by Concentration).")]
        public float interference;

        VisionTarget visionTarget;
        bool visionTargetChecked;

        public Vector3 FocusPoint => transform.position + transform.rotation * focusOffset;
        public bool HasScanData => !string.IsNullOrEmpty(scanText);
        string scanFlag;
        public string ScanFlag => scanFlag ?? (scanFlag = "scanned." + id);
        public bool Scanned => Game.I != null && Game.I.HasFlag(ScanFlag);
        public virtual string Prompt => "USE";
        /// <summary>Whether the object currently exists for the player (hidden objects need dimensional perception).</summary>
        public virtual bool IsAvailable
        {
            get
            {
                if (!visionTargetChecked) { visionTargetChecked = true; visionTarget = GetComponent<VisionTarget>(); }
                return visionTarget == null || !visionTarget.hidden || visionTarget.IsRevealed;
            }
        }
        /// <summary>Objects without a use action (pure clues) can still be scanned.</summary>
        public virtual bool HasUseAction => true;

        protected virtual void OnEnable() { Registry<Interactable>.Add(this); }
        protected virtual void OnDisable() { Registry<Interactable>.Remove(this); }

        public virtual bool CanInteract(out string reason) { reason = ""; return true; }
        protected abstract void OnInteract();

        public void TryInteract()
        {
            if (!CanInteract(out string reason))
            {
                AudioManager.I?.Play(Sfx.Denied);
                if (!string.IsNullOrEmpty(reason)) GameEvents.Notify(reason, NoticeType.Warning);
                return;
            }
            AudioManager.I?.Play(Sfx.Confirm, 0.6f);
            OnInteract();
        }

        /// <summary>Called by the scanner when analysis completes.</summary>
        public void CompleteScan()
        {
            var g = Game.I;
            bool first = !Scanned;
            g.SetFlag(ScanFlag);
            AudioManager.I?.Play(Sfx.ScanComplete);
            UIRoot.I?.Hud.ShowScan(string.IsNullOrEmpty(scanTitle) ? displayName : scanTitle, scanText);
            if (first)
            {
                g.Progression.AddXp(scanXp, "analysis");
                g.Log("Analysed " + displayName + ".");
            }
            OnScanned(first);
        }

        protected virtual void OnScanned(bool first) { }

        protected static void Discover(string schematicFlag, string name)
        {
            var g = Game.I;
            if (g.HasFlag(schematicFlag)) return;
            g.SetFlag(schematicFlag);
            AudioManager.I?.Play(Sfx.Discovery);
            GameEvents.Notify("TECHNOLOGY DISCOVERED: " + name, NoticeType.Success);
            g.Progression.AddXp(40, "technology");
        }
    }
}

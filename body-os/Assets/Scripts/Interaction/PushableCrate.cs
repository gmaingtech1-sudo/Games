using UnityEngine;

namespace BodyOS
{
    /// <summary>A heavy object the player can push if their Strength meets its mass class.</summary>
    public sealed class PushableCrate : Interactable
    {
        public int massClass = 7;
        BoxCollider box;
        static readonly int Mask = ~(1 << PlayerController.PlayerLayer);

        public override bool HasUseAction => false;

        public static PushableCrate Create(Transform parent, string id, Vector3 pos, Vector3 size, int massClass)
        {
            var go = LevelKit.Box(parent, "Crate_" + id, pos, size, Art.Lit("crate", new Color(0.35f, 0.3f, 0.22f), 0.3f, 0.5f, null, Art.PanelTexture), true, false);
            LevelKit.Box(go.transform, "Band", new Vector3(0f, 0f, 0f), new Vector3(size.x + 0.04f, 0.12f, size.z + 0.04f), LevelKit.GlowAmber, false, false);
            var c = go.AddComponent<PushableCrate>();
            c.id = id; c.displayName = "Cargo Container"; c.massClass = massClass;
            c.box = go.GetComponent<BoxCollider>();
            c.focusOffset = new Vector3(0f, size.y * 0.5f, 0f);
            c.interactRange = 3f;
            c.scanText = "Sealed cargo container, mass class " + massClass + ". Pushing it requires Strength " + massClass + " or higher. It is tall enough to climb on.";
            var vt = go.GetComponent<VisionTarget>();
            if (vt == null) vt = go.AddComponent<VisionTarget>();
            vt.environment = false; vt.scan = ScanCategory.Clue;
            return c;
        }

        public bool TryPush(Vector3 dir, float playerSpeed, int strength, out string reason)
        {
            reason = "";
            if (strength < massClass)
            {
                reason = "Too heavy: mass class " + massClass + ". Strength " + massClass + " required (current " + strength + ").";
                return false;
            }
            // Snap to the dominant axis so crates move predictably in puzzles.
            dir = Mathf.Abs(dir.x) > Mathf.Abs(dir.z) ? new Vector3(Mathf.Sign(dir.x), 0f, 0f) : new Vector3(0f, 0f, Mathf.Sign(dir.z));
            float step = Mathf.Clamp(playerSpeed, 0.5f, 2f) * 0.8f * Time.deltaTime;
            Vector3 half = Vector3.Scale(box.size, transform.lossyScale) * 0.5f;
            Vector3 center = transform.TransformPoint(box.center) + Vector3.up * 0.05f;
            box.enabled = false;
            bool blocked = Physics.BoxCast(center, half * 0.96f, dir, transform.rotation, step + 0.05f, Mask, QueryTriggerInteraction.Ignore);
            box.enabled = true;
            if (blocked) return true; // pushing against a wall is not a strength problem
            transform.position += dir * step;
            Game.I?.SetFlag("crate.pushed");
            return true;
        }

        protected override void OnInteract() { }
    }
}

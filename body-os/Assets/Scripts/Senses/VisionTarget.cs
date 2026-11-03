using UnityEngine;

namespace BodyOS
{
    public enum ScanCategory { None, Interactable, Collectable, Clue, Hostile }

    /// <summary>
    /// Marks renderers that react to vision modes. Original materials are cached once; switching modes
    /// only swaps sharedMaterial references (no allocations, no per-frame work).
    /// </summary>
    public sealed class VisionTarget : MonoBehaviour
    {
        [Tooltip("Static structure (walls, floors). Turns cold blue in thermal vision.")]
        public bool environment = true;
        [Range(0f, 1f), Tooltip("Heat signature for thermal vision. 0 = none.")]
        public float heat;
        public ScanCategory scan = ScanCategory.None;
        [Tooltip("Only visible and tangible while dimensional perception is active.")]
        public bool hidden;
        [Tooltip("Dimensional anomaly: glows in dimensional vision.")]
        public bool anomaly;

        Renderer[] renderers;
        Material[] originals;
        Collider[] colliders;
        bool initialised;

        public bool IsRevealed { get; private set; } = true;

        void Init()
        {
            if (initialised) return;
            initialised = true;
            renderers = GetComponentsInChildren<Renderer>(true);
            originals = new Material[renderers.Length];
            for (int i = 0; i < renderers.Length; i++) originals[i] = renderers[i].sharedMaterial;
            colliders = hidden ? GetComponentsInChildren<Collider>(true) : new Collider[0];
        }

        /// <summary>Re-reads materials, e.g. after a script changes an object's look (door unlocked).</summary>
        public void RefreshOriginals()
        {
            initialised = false;
            Init();
            if (Game.I != null && Game.I.Vision != null) Apply(Game.I.Vision.Current, Game.I.Vision.HiddenRevealed);
        }

        void OnEnable()
        {
            Init();
            Registry<VisionTarget>.Add(this);
            var g = Game.I;
            if (g != null && g.Vision != null && g.InGame) Apply(g.Vision.Current, g.Vision.HiddenRevealed);
            else if (hidden) SetRevealed(false);
        }

        void OnDisable() { Registry<VisionTarget>.Remove(this); }

        public void Apply(VisionModeId mode, bool revealHidden)
        {
            Init();
            if (hidden) SetRevealed(revealHidden);
            for (int i = 0; i < renderers.Length; i++)
            {
                if (renderers[i] == null) continue;
                var m = MaterialFor(mode, revealHidden, originals[i]);
                if (renderers[i].sharedMaterial != m) renderers[i].sharedMaterial = m;
            }
        }

        Material MaterialFor(VisionModeId mode, bool revealHidden, Material original)
        {
            if (hidden && revealHidden) return VisionMaterials.DimReveal;
            switch (mode)
            {
                case VisionModeId.Thermal:
                    if (heat > 0.66f) return VisionMaterials.Hot;
                    if (heat > 0.01f) return VisionMaterials.Warm;
                    return environment ? VisionMaterials.Cold : VisionMaterials.ColdDim;
                case VisionModeId.Scanner:
                    return scan != ScanCategory.None ? VisionMaterials.Scan(scan) : original;
                case VisionModeId.Dimensional:
                    if (anomaly) return VisionMaterials.DimReveal;
                    return environment ? VisionMaterials.DimEnv : original;
                default:
                    return original;
            }
        }

        void SetRevealed(bool revealed)
        {
            IsRevealed = revealed;
            for (int i = 0; i < renderers.Length; i++) if (renderers[i] != null) renderers[i].enabled = revealed;
            for (int i = 0; i < colliders.Length; i++) if (colliders[i] != null) colliders[i].enabled = revealed;
        }
    }
}

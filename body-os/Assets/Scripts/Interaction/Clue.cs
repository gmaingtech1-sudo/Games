using UnityEngine;

namespace BodyOS
{
    /// <summary>A scan-only object: evidence, markings or residue that reveals information when analysed.</summary>
    public sealed class Clue : Interactable
    {
        public string[] flagsOnScan = new string[0];
        public override bool HasUseAction => false;

        protected override void OnInteract() { }

        protected override void OnScanned(bool first)
        {
            foreach (var f in flagsOnScan) Game.I.SetFlag(f);
        }
    }
}

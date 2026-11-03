using UnityEngine;

namespace BodyOS
{
    public enum ItemKind { Resource, KeyItem, Consumable, DataLog }

    [CreateAssetMenu(menuName = "BODY.OS/Item", fileName = "Item")]
    public class ItemDefinition : ScriptableObject
    {
        public string id;
        public string displayName;
        [TextArea] public string description;
        public ItemKind kind;
        public int maxStack = 999;
        public Color color = Color.cyan;
    }
}

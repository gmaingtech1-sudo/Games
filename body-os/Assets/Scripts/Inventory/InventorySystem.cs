using UnityEngine;

namespace BodyOS
{
    /// <summary>Collected resources, key items and consumables.</summary>
    public sealed class InventorySystem
    {
        readonly Game game;
        public InventorySystem(Game game) { this.game = game; }

        InventoryData D => game.Data.inventory;

        public int Count(string id)
        {
            var s = D.items.Find(x => x.id == id);
            return s != null ? s.amount : 0;
        }

        public void Add(string id, int amount, bool notify = true)
        {
            if (amount <= 0) return;
            var def = game.Content.Item(id);
            var s = D.items.Find(x => x.id == id);
            if (s == null) { s = new ItemStack { id = id, amount = 0 }; D.items.Add(s); }
            s.amount = Mathf.Min(s.amount + amount, def != null ? def.maxStack : 9999);
            if (notify) GameEvents.Notify("+" + amount + " " + game.Content.ItemName(id), NoticeType.Reward);
            game.SetFlag("item." + id);
            GameEvents.RaiseInventory();
        }

        public bool Remove(string id, int amount)
        {
            var s = D.items.Find(x => x.id == id);
            if (s == null || s.amount < amount) return false;
            s.amount -= amount;
            if (s.amount <= 0) D.items.Remove(s);
            GameEvents.RaiseInventory();
            return true;
        }

        /// <summary>Uses a consumable. Returns false (with a reason notice) if it cannot be used now.</summary>
        public bool Use(string id)
        {
            if (Count(id) <= 0) return false;
            var v = game.Vitals;
            switch (id)
            {
                case "energy_capsule":
                    if (v.Energy >= v.MaxEnergy - 0.5f) { GameEvents.Notify("Energy already full.", NoticeType.Info); return false; }
                    v.AddEnergy(50f);
                    break;
                case "medigel":
                    if (v.Health >= v.MaxHealth - 0.5f) { GameEvents.Notify("Health already full.", NoticeType.Info); return false; }
                    v.Heal(40f);
                    break;
                default:
                    GameEvents.Notify("That item can't be used directly.", NoticeType.Info);
                    return false;
            }
            Remove(id, 1);
            AudioManager.I?.Play(Sfx.Recharge);
            GameEvents.Notify("Used " + game.Content.ItemName(id) + ".", NoticeType.Success);
            return true;
        }
    }
}

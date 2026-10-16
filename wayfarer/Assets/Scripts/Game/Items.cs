using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    public enum ItemKind { Resource, Crafted, Valuable }

    public sealed class ItemDef
    {
        public string Id, Name, Symbol, Description;
        public ItemKind Kind;
        public int Value;          // base price in units
        public Color Color;
        public int MaxStackSuit = 250;
        public int MaxStackShip = 500;
    }

    public sealed class Recipe
    {
        public string Result;
        public int Amount = 1;
        public (string id, int n)[] Inputs;
        public string Description;
    }

    public static class Items
    {
        public static readonly Dictionary<string, ItemDef> All = new Dictionary<string, ItemDef>();
        public static readonly List<Recipe> Recipes = new List<Recipe>();

        static void Add(string id, string name, string sym, ItemKind kind, int value, string hex, string desc, int stackSuit = 250, int stackShip = 500)
        {
            All[id] = new ItemDef
            {
                Id = id, Name = name, Symbol = sym, Kind = kind, Value = value, Color = MathUtil.Hex(hex), Description = desc,
                MaxStackSuit = stackSuit, MaxStackShip = stackShip,
            };
        }

        static Items()
        {
            Add("carbon", "Carbon", "C", ItemKind.Resource, 7, "#5a5a5a", "Harvested from any plant life. Powers the mining beam.");
            Add("ferrite", "Ferrite", "Fe", ItemKind.Resource, 14, "#a07058", "Iron-rich dust from rocks. Used to craft plating and warp cells.");
            Add("sodium", "Sodium", "Na", ItemKind.Resource, 22, "#e8c23a", "From glowing yellow plants. Recharges hazard protection.");
            Add("oxygen", "Oxygen", "O₂", ItemKind.Resource, 34, "#e0503e", "From broad red-leafed plants. Recharges life support.");
            Add("hydrogen", "Hydrogen", "H", ItemKind.Resource, 18, "#4fa4e8", "Mined from blue crystals. Fuels launch thrusters.");
            Add("helium3", "Helium-3", "He³", ItemKind.Resource, 30, "#9fe0d8", "Mined from asteroids. Fuels the pulse engine.");
            Add("uranium", "Uranium", "U", ItemKind.Resource, 48, "#a8e04a", "Radioactive ore from hot worlds. An alternative launch fuel.");
            Add("copper", "Copper", "Cu", ItemKind.Valuable, 110, "#d98a4a", "A metal found in deposits around yellow and orange stars.");
            Add("silver", "Silver", "Ag", ItemKind.Valuable, 150, "#c8d0d8", "A metal found in deposits around red dwarfs.");
            Add("gold", "Gold", "Au", ItemKind.Valuable, 240, "#f0c850", "A metal found in deposits around white stars.");
            Add("platinum", "Platinum", "Pt", ItemKind.Valuable, 330, "#bfe8ff", "A rare metal found around blue giants.");
            Add("warpcell", "Warp Cell", "WC", ItemKind.Crafted, 2600, "#7a6cff", "Powers one hyperspace jump.", 10, 20);
            Add("plating", "Hull Plating", "HP", ItemKind.Crafted, 700, "#8898a8", "Repairs a quarter of your ship's hull.", 20, 40);
            Add("lifegel", "Life Support Gel", "LS", ItemKind.Crafted, 420, "#ff7a6a", "Restores 60% life support.", 20, 40);
            Add("ionbattery", "Ion Battery", "IB", ItemKind.Crafted, 380, "#6ae0ff", "Restores 60% hazard protection.", 20, 40);
            Add("salvage", "Salvaged Data", "SD", ItemKind.Valuable, 900, "#90a0ff", "Recovered technology. Sell it at a station.", 50, 100);

            Recipes.Add(new Recipe { Result = "warpcell", Inputs = new[] { ("hydrogen", 50), ("helium3", 40), ("ferrite", 30) }, Description = "Fuel for one hyperspace jump." });
            Recipes.Add(new Recipe { Result = "plating", Inputs = new[] { ("ferrite", 50), ("carbon", 25) }, Description = "Repairs 25% hull." });
            Recipes.Add(new Recipe { Result = "lifegel", Inputs = new[] { ("oxygen", 20), ("carbon", 20) }, Description = "Restores 60% life support." });
            Recipes.Add(new Recipe { Result = "ionbattery", Inputs = new[] { ("sodium", 20), ("ferrite", 15) }, Description = "Restores 60% hazard protection." });
        }

        public static ItemDef Get(string id) => All.TryGetValue(id, out var d) ? d : null;

        public static string MetalId(string metalName)
        {
            switch (metalName)
            {
                case "Silver": return "silver";
                case "Gold": return "gold";
                case "Platinum": return "platinum";
                default: return "copper";
            }
        }
    }

    [Serializable]
    public sealed class ItemStack
    {
        public string Id;
        public int Count;
    }

    /// <summary>Exosuit and ship cargo slots.</summary>
    [Serializable]
    public sealed class Inventory
    {
        public List<ItemStack> Suit = new List<ItemStack>();
        public List<ItemStack> Ship = new List<ItemStack>();
        public int SuitSlots = 24;
        public int ShipSlots = 20;
        public long Units = 1500;

        public int Count(string id)
        {
            int n = 0;
            foreach (var s in Suit) if (s.Id == id) n += s.Count;
            foreach (var s in Ship) if (s.Id == id) n += s.Count;
            return n;
        }

        /// <summary>Adds items, suit first, then the ship's hold. Returns how many didn't fit.</summary>
        public int Add(string id, int n)
        {
            var def = Items.Get(id);
            if (def == null || n <= 0) return n;
            n = AddTo(Suit, SuitSlots, def.MaxStackSuit, id, n);
            if (n > 0) n = AddTo(Ship, ShipSlots, def.MaxStackShip, id, n);
            return n;
        }

        static int AddTo(List<ItemStack> list, int slots, int max, string id, int n)
        {
            foreach (var s in list)
            {
                if (s.Id != id || s.Count >= max) continue;
                int take = Math.Min(n, max - s.Count);
                s.Count += take;
                n -= take;
                if (n == 0) return 0;
            }
            while (n > 0 && list.Count < slots)
            {
                int take = Math.Min(n, max);
                list.Add(new ItemStack { Id = id, Count = take });
                n -= take;
            }
            return n;
        }

        public bool Remove(string id, int n)
        {
            if (Count(id) < n) return false;
            n = RemoveFrom(Suit, id, n);
            if (n > 0) RemoveFrom(Ship, id, n);
            return true;
        }

        static int RemoveFrom(List<ItemStack> list, string id, int n)
        {
            for (int i = list.Count - 1; i >= 0 && n > 0; i--)
            {
                var s = list[i];
                if (s.Id != id) continue;
                int take = Math.Min(n, s.Count);
                s.Count -= take;
                n -= take;
                if (s.Count <= 0) list.RemoveAt(i);
            }
            return n;
        }

        public bool CanCraft(Recipe r)
        {
            foreach (var (id, n) in r.Inputs) if (Count(id) < n) return false;
            return true;
        }

        public bool Craft(Recipe r)
        {
            if (!CanCraft(r)) return false;
            foreach (var (id, n) in r.Inputs) Remove(id, n);
            Add(r.Result, r.Amount);
            return true;
        }

        public int FreeSpaceFor(string id)
        {
            var def = Items.Get(id);
            if (def == null) return 0;
            int free = 0;
            foreach (var s in Suit) if (s.Id == id) free += def.MaxStackSuit - s.Count;
            foreach (var s in Ship) if (s.Id == id) free += def.MaxStackShip - s.Count;
            free += (SuitSlots - Suit.Count) * def.MaxStackSuit + (ShipSlots - Ship.Count) * def.MaxStackShip;
            return free;
        }

        public void MoveStack(bool fromSuit, int index)
        {
            var src = fromSuit ? Suit : Ship;
            if (index < 0 || index >= src.Count) return;
            var s = src[index];
            var def = Items.Get(s.Id);
            src.RemoveAt(index);
            int left = fromSuit
                ? AddTo(Ship, ShipSlots, def.MaxStackShip, s.Id, s.Count)
                : AddTo(Suit, SuitSlots, def.MaxStackSuit, s.Id, s.Count);
            if (left > 0) AddTo(src, fromSuit ? SuitSlots : ShipSlots, fromSuit ? def.MaxStackSuit : def.MaxStackShip, s.Id, left);
        }
    }
}

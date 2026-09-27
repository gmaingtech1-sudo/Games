using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    public sealed partial class GameUI
    {
        int invTab;             // 0 inventory, 1 crafting
        bool selSuit = true;
        int selIndex = -1;

        void DrawInventory()
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0.01f, 0.02f, 0.04f, 0.78f));
            var d = Profile.Data;
            UIKit.Text(new Rect(60, 40, 600, 50), invTab == 0 ? "INVENTORY" : "CRAFTING", UIKit.LabelHuge);
            UIKit.Text(new Rect(W - 460, 50, 400, 30), $"{d.Inv.Units:N0} units", new GUIStyle(UIKit.LabelBig) { alignment = TextAnchor.UpperRight }, UIKit.Warm);
            if (UIKit.Btn(new Rect(60, 104, 180, 40), "Inventory", invTab == 0)) invTab = 0;
            if (UIKit.Btn(new Rect(250, 104, 180, 40), "Crafting", invTab == 1)) invTab = 1;
            if (UIKit.Btn(new Rect(W - 200, H - 80, 140, 44), "Close")) g.State = g.Mode == PlayerMode.Docked ? GameState.Station : GameState.Playing;

            if (invTab == 1) { DrawCrafting(new Rect(60, 170, W - 120, H - 280)); return; }

            float gridW = Mathf.Min(760f, W * 0.52f);
            DrawSlots(new Rect(60, 170, gridW, 360), "EXOSUIT", d.Inv.Suit, d.Inv.SuitSlots, true);
            DrawSlots(new Rect(60, 560, gridW, 330), "STARSHIP CARGO", d.Inv.Ship, d.Inv.ShipSlots, false);
            DrawTech(new Rect(60 + gridW + 40, 170, W - gridW - 160, 720));
        }

        void DrawSlots(Rect r, string title, List<ItemStack> list, int slots, bool suit)
        {
            UIKit.Text(new Rect(r.x, r.y, r.width, 24), $"{title}  <color=#8aa>{list.Count}/{slots}</color>", UIKit.LabelSmall, UIKit.Warm);
            const float size = 84f, gap = 8f;
            int cols = Mathf.Max(1, (int)((r.width + gap) / (size + gap)));
            for (int i = 0; i < slots; i++)
            {
                int cx = i % cols, cy = i / cols;
                var sr = new Rect(r.x + cx * (size + gap), r.y + 30 + cy * (size + gap), size, size);
                if (sr.yMax > r.yMax + 40) break;
                if (i < list.Count)
                {
                    var s = list[i];
                    var def = Items.Get(s.Id);
                    bool sel = selSuit == suit && selIndex == i;
                    if (GUI.Button(sr, "", UIKit.Slot)) { selSuit = suit; selIndex = i; g.Audio.Play(Sfx.Click, 0.4f); }
                    UIKit.Rect(new Rect(sr.x + 6, sr.y + 6, sr.width - 12, 4), def != null ? def.Color : Color.white);
                    UIKit.Text(new Rect(sr.x, sr.y + 16, sr.width, 34), def?.Symbol ?? "?", new GUIStyle(UIKit.LabelBig) { alignment = TextAnchor.MiddleCenter }, def != null ? Color.Lerp(def.Color, Color.white, 0.4f) : Color.white);
                    UIKit.Text(new Rect(sr.x + 4, sr.y + 50, sr.width - 8, 16), def?.Name ?? s.Id, new GUIStyle(UIKit.LabelTiny) { alignment = TextAnchor.MiddleCenter, wordWrap = false, clipping = TextClipping.Clip });
                    UIKit.Text(new Rect(sr.x + 4, sr.y + 64, sr.width - 8, 16), s.Count.ToString(), new GUIStyle(UIKit.LabelTiny) { alignment = TextAnchor.MiddleCenter }, UIKit.Ink);
                    if (sel) UIKit.Tex(sr, UIKit.RoundLine, UIKit.Accent);
                }
                else UIKit.Tex(sr, UIKit.RoundLine, new Color(1, 1, 1, 0.1f));
            }
        }

        void DrawTech(Rect r)
        {
            var d = Profile.Data;
            var ship = g.Ship;
            float y = r.y;
            // selected item
            List<ItemStack> list = selSuit ? d.Inv.Suit : d.Inv.Ship;
            if (selIndex >= 0 && selIndex < list.Count)
            {
                var s = list[selIndex];
                var def = Items.Get(s.Id);
                UIKit.PanelBox(new Rect(r.x, y, r.width, 190), 0.9f);
                UIKit.Text(new Rect(r.x + 20, y + 14, r.width - 40, 30), $"{def.Name}  ×{s.Count}", UIKit.LabelBig, def.Color);
                UIKit.Text(new Rect(r.x + 20, y + 48, r.width - 40, 60), def.Description, UIKit.LabelSmall);
                UIKit.Text(new Rect(r.x + 20, y + 100, r.width - 40, 24), $"Worth about {def.Value:N0} units each", UIKit.LabelTiny);
                float bx = r.x + 20, by = y + 134;
                if (UIKit.Btn(new Rect(bx, by, 170, 38), selSuit ? "Move to ship" : "Move to suit", false, true))
                {
                    d.Inv.MoveStack(selSuit, selIndex);
                    selIndex = -1;
                }
                bx += 180;
                if (s.Id == "lifegel" || s.Id == "ionbattery" || s.Id == "plating")
                {
                    if (UIKit.Btn(new Rect(bx, by, 120, 38), "Use", true, true)) UseItem(s.Id);
                    bx += 130;
                }
                if (UIKit.Btn(new Rect(bx, by, 150, 38), "Discard 10", false, true))
                {
                    d.Inv.Remove(s.Id, Mathf.Min(10, s.Count));
                    if (selIndex >= list.Count) selIndex = -1;
                }
                y += 206;
            }

            UIKit.Text(new Rect(r.x, y, r.width, 24), "TECHNOLOGY", UIKit.LabelSmall, UIKit.Warm);
            y += 30;
            TechRow(r.x, ref y, r.width, "Life support", d.LifeSupport, "oxygen", 1.5f, v => d.LifeSupport = v);
            TechRow(r.x, ref y, r.width, "Hazard protection", d.Hazard, "sodium", 1.5f, v => d.Hazard = v);
            TechRow(r.x, ref y, r.width, "Mining beam", d.ToolCharge, "carbon", 2f, v => d.ToolCharge = v);
            TechRow(r.x, ref y, r.width, "Launch thrusters", ship.LaunchFuel, d.Inv.Count("hydrogen") > 0 || d.Inv.Count("uranium") == 0 ? "hydrogen" : "uranium", 1.25f, v => ship.LaunchFuel = v);
            TechRow(r.x, ref y, r.width, "Pulse engine", ship.PulseFuel, "helium3", 1.5f, v => ship.PulseFuel = v);
            TechRow(r.x, ref y, r.width, "Hull", ship.Hull, "plating", 25f, v => ship.Hull = v);
            y += 10;
            UIKit.Text(new Rect(r.x, y, r.width, 60),
                $"Hyperdrive range {Profile.JumpRange:F0} light-years  ·  {d.Inv.Count("warpcell")} warp cells", UIKit.LabelSmall);
        }

        void TechRow(float x, ref float y, float w, string name, float value, string fuel, float perUnit, System.Action<float> set)
        {
            var d = Profile.Data;
            var def = Items.Get(fuel);
            UIKit.Text(new Rect(x, y, 220, 24), name, UIKit.Label, UIKit.Ink);
            UIKit.Bar(new Rect(x + 220, y + 9, w - 480, 8), value / 100f, value < 20 ? UIKit.Danger : UIKit.Accent);
            UIKit.Text(new Rect(x + w - 250, y, 60, 24), $"{value:F0}%", UIKit.LabelSmall, UIKit.Ink);
            int have = d.Inv.Count(fuel);
            string label = $"Recharge ({def.Name} {have})";
            bool can = value < 99.5f && have > 0;
            GUI.enabled = can;
            if (UIKit.Btn(new Rect(x + w - 180, y - 4, 180, 32), label, can, true))
            {
                int need = Mathf.CeilToInt((100f - value) / perUnit);
                int use = Mathf.Min(need, have);
                d.Inv.Remove(fuel, use);
                set(Mathf.Min(100f, value + use * perUnit));
                g.Audio.Play(Sfx.Craft, 0.6f);
            }
            GUI.enabled = true;
            y += 42;
        }

        void UseItem(string id)
        {
            var d = Profile.Data;
            if (!d.Inv.Remove(id, 1)) return;
            switch (id)
            {
                case "lifegel": d.LifeSupport = Mathf.Min(100f, d.LifeSupport + 60f); break;
                case "ionbattery": d.Hazard = Mathf.Min(100f, d.Hazard + 60f); break;
                case "plating": g.Ship.Hull = Mathf.Min(100f, g.Ship.Hull + 25f); break;
            }
            g.Audio.Play(Sfx.Craft);
        }

        void DrawCrafting(Rect r)
        {
            var d = Profile.Data;
            float y = r.y;
            foreach (var rec in Items.Recipes)
            {
                var def = Items.Get(rec.Result);
                var row = new Rect(r.x, y, Mathf.Min(r.width, 1100), 110);
                UIKit.PanelBox(row, 0.85f);
                UIKit.Rect(new Rect(row.x + 16, row.y + 16, 6, 78), def.Color);
                UIKit.Text(new Rect(row.x + 36, row.y + 14, 400, 30), def.Name, UIKit.LabelBig, UIKit.Ink);
                UIKit.Text(new Rect(row.x + 36, row.y + 48, 400, 50), rec.Description + $"\nYou have {d.Inv.Count(rec.Result)}.", UIKit.LabelSmall);
                float ix = row.x + 460;
                foreach (var (id, n) in rec.Inputs)
                {
                    var idef = Items.Get(id);
                    int have = d.Inv.Count(id);
                    Color c = have >= n ? UIKit.Good : UIKit.Danger;
                    UIKit.Text(new Rect(ix, row.y + 22, 170, 26), idef.Name, UIKit.Label, UIKit.Ink);
                    UIKit.Text(new Rect(ix, row.y + 52, 170, 26), $"{have} / {n}", UIKit.Label, c);
                    ix += 170;
                }
                bool can = d.Inv.CanCraft(rec);
                GUI.enabled = can;
                if (UIKit.Btn(new Rect(row.xMax - 170, row.y + 32, 150, 46), "Craft", can))
                {
                    if (d.Inv.Craft(rec)) { g.Audio.Play(Sfx.Craft); g.Toast($"Crafted {def.Name}"); }
                }
                GUI.enabled = true;
                y += 124;
            }
        }
    }
}

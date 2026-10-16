using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>Space station services, trading, and the discoveries log.</summary>
    public sealed partial class GameUI
    {
        int stationTab;
        int logTab;
        Vector2 logScroll, tradeScroll;
        string renameBuffer;

        static readonly string[] Market = { "carbon", "ferrite", "sodium", "oxygen", "hydrogen", "helium3", "plating", "lifegel", "ionbattery", "warpcell" };

        float PriceFactor => g.Mode == PlayerMode.Docked && g.View.Station != null ? (float)g.View.Station.Data.PriceFactor : 1.1f;

        void DrawStation()
        {
            var st = g.View.Station;
            if (st == null) { g.State = GameState.Playing; return; }
            UIKit.Rect(new Rect(0, 0, W * 0.6f, H), new Color(0.01f, 0.02f, 0.04f, 0.7f));
            UIKit.Text(new Rect(60, 40, 900, 50), st.Data.Name.ToUpperInvariant(), UIKit.LabelHuge);
            UIKit.Text(new Rect(60, 92, 900, 26), $"{g.View.Data.Star.Name} · {g.View.Data.Star.Economy} economy · {Profile.Data.Inv.Units:N0} units", UIKit.LabelSmall, UIKit.Warm);
            string[] tabs = { "Trade", "Upgrades", "Services", "Your ship" };
            for (int i = 0; i < tabs.Length; i++)
                if (UIKit.Btn(new Rect(60 + i * 190, 130, 180, 42), tabs[i], stationTab == i)) stationTab = i;
            var area = new Rect(60, 196, Mathf.Min(W * 0.6f - 100, 1000), H - 300);
            switch (stationTab)
            {
                case 0: DrawTradeLists(area); break;
                case 1: DrawUpgrades(area); break;
                case 2: DrawServices(area); break;
                case 3: DrawShipCustomize(area); break;
            }
            if (UIKit.Btn(new Rect(60, H - 90, 260, 54), "Launch", true)) g.Undock();
            if (UIKit.Btn(new Rect(330, H - 90, 200, 54), "Inventory")) g.State = GameState.Inventory;
            if (UIKit.Btn(new Rect(540, H - 90, 200, 54), "Galaxy map")) { g.State = GameState.Map; OpenMap(); }
            if (UIKit.Btn(new Rect(750, H - 90, 160, 54), "Save")) { g.SaveGame(); g.Toast("Game saved"); }
        }

        void DrawTrade()
        {
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0.01f, 0.02f, 0.04f, 0.8f));
            string name = g.TradePoi != null ? g.TradePoi.Name : "Trade terminal";
            UIKit.Text(new Rect(60, 40, 900, 50), name.ToUpperInvariant(), UIKit.LabelHuge);
            UIKit.Text(new Rect(60, 92, 900, 26), $"{Profile.Data.Inv.Units:N0} units", UIKit.LabelSmall, UIKit.Warm);
            DrawTradeLists(new Rect(60, 140, Mathf.Min(W - 120, 1000), H - 240));
            if (UIKit.Btn(new Rect(W - 200, H - 80, 140, 44), "Close")) g.State = g.Mode == PlayerMode.Docked ? GameState.Station : GameState.Playing;
        }

        void DrawTradeLists(Rect r)
        {
            var d = Profile.Data;
            float half = (r.width - 30) / 2;
            UIKit.Text(new Rect(r.x, r.y, half, 24), "SELL", UIKit.LabelSmall, UIKit.Warm);
            UIKit.Text(new Rect(r.x + half + 30, r.y, half, 24), "BUY", UIKit.LabelSmall, UIKit.Warm);
            // sell: everything you carry
            var owned = new List<string>();
            foreach (var s in d.Inv.Suit) if (!owned.Contains(s.Id)) owned.Add(s.Id);
            foreach (var s in d.Inv.Ship) if (!owned.Contains(s.Id)) owned.Add(s.Id);
            float y = r.y + 30;
            foreach (var id in owned)
            {
                var def = Items.Get(id);
                int have = d.Inv.Count(id);
                int price = Mathf.Max(1, Mathf.RoundToInt(def.Value * PriceFactor * 0.9f));
                var row = new Rect(r.x, y, half, 40);
                UIKit.Rect(row, new Color(1, 1, 1, 0.04f));
                UIKit.Rect(new Rect(row.x, row.y, 4, row.height), def.Color);
                UIKit.Text(new Rect(row.x + 14, row.y + 9, 200, 24), $"{def.Name} <color=#8aa>×{have}</color>", UIKit.Label, UIKit.Ink);
                UIKit.Text(new Rect(row.x + 210, row.y + 11, 110, 24), $"{price:N0} u", UIKit.LabelSmall, UIKit.Warm);
                if (UIKit.Btn(new Rect(row.xMax - 170, row.y + 5, 70, 30), "1", false, true)) Sell(id, 1, price);
                if (UIKit.Btn(new Rect(row.xMax - 92, row.y + 5, 88, 30), "All", false, true)) Sell(id, have, price);
                y += 46;
                if (y > r.yMax - 40) break;
            }
            if (owned.Count == 0) UIKit.Text(new Rect(r.x, y, half, 30), "You have nothing to sell.", UIKit.LabelSmall);
            // buy: the station's market
            y = r.y + 30;
            foreach (var id in Market)
            {
                var def = Items.Get(id);
                int price = Mathf.RoundToInt(def.Value * PriceFactor * 1.3f);
                var row = new Rect(r.x + half + 30, y, half, 40);
                UIKit.Rect(row, new Color(1, 1, 1, 0.04f));
                UIKit.Rect(new Rect(row.x, row.y, 4, row.height), def.Color);
                UIKit.Text(new Rect(row.x + 14, row.y + 9, 200, 24), def.Name, UIKit.Label, UIKit.Ink);
                UIKit.Text(new Rect(row.x + 210, row.y + 11, 110, 24), $"{price:N0} u", UIKit.LabelSmall, UIKit.Warm);
                int n10 = def.Kind == ItemKind.Crafted ? 1 : 25;
                GUI.enabled = d.Inv.Units >= price;
                if (UIKit.Btn(new Rect(row.xMax - 170, row.y + 5, 70, 30), "1", false, true)) Buy(id, 1, price);
                GUI.enabled = d.Inv.Units >= price * n10;
                if (n10 > 1 && UIKit.Btn(new Rect(row.xMax - 92, row.y + 5, 88, 30), "25", false, true)) Buy(id, n10, price);
                GUI.enabled = true;
                y += 46;
            }
        }

        void Sell(string id, int n, int price)
        {
            var d = Profile.Data;
            n = Mathf.Min(n, d.Inv.Count(id));
            if (n <= 0 || !d.Inv.Remove(id, n)) return;
            d.Inv.Units += (long)n * price;
            g.Audio.Play(Sfx.Sell);
        }

        void Buy(string id, int n, int price)
        {
            var d = Profile.Data;
            long cost = (long)n * price;
            if (d.Inv.Units < cost) { g.Audio.Play(Sfx.Error); return; }
            int left = d.Inv.Add(id, n);
            int bought = n - left;
            if (left > 0) g.Toast("Not enough room for all of that", true);
            d.Inv.Units -= (long)bought * price;
            g.Audio.Play(Sfx.Sell);
        }

        void DrawUpgrades(Rect r)
        {
            var d = Profile.Data;
            float y = r.y;
            string cat = null;
            foreach (var u in Profile.UpgradeDefs)
            {
                if (u.Category != cat)
                {
                    cat = u.Category;
                    UIKit.Text(new Rect(r.x, y, r.width, 24), cat.ToUpperInvariant(), UIKit.LabelSmall, UIKit.Warm);
                    y += 28;
                }
                int lvl = Profile.Level(u.Id);
                var row = new Rect(r.x, y, r.width, 56);
                UIKit.Rect(row, new Color(1, 1, 1, 0.04f));
                UIKit.Text(new Rect(row.x + 14, row.y + 6, 360, 24), $"{u.Name}  <color=#8cf>{new string('■', lvl)}{new string('□', u.MaxLevel - lvl)}</color>", UIKit.Label, UIKit.Ink);
                UIKit.Text(new Rect(row.x + 14, row.y + 30, 520, 22), u.Description, UIKit.LabelTiny);
                if (lvl < u.MaxLevel)
                {
                    int price = u.Prices[lvl];
                    string mat = u.Materials[lvl];
                    int matN = 10 + lvl * 15;
                    bool can = d.Inv.Units >= price && d.Inv.Count(mat) >= matN;
                    UIKit.Text(new Rect(row.xMax - 470, row.y + 16, 280, 24), $"{price:N0} u + {matN} {Items.Get(mat).Name}", UIKit.LabelSmall, can ? UIKit.Good : UIKit.Dim);
                    GUI.enabled = can;
                    if (UIKit.Btn(new Rect(row.xMax - 150, row.y + 10, 140, 36), "Install", can, true))
                    {
                        d.Inv.Units -= price;
                        d.Inv.Remove(mat, matN);
                        Profile.SetLevel(u.Id, lvl + 1);
                        g.Audio.Play(Sfx.Craft);
                        g.Toast($"{u.Name} upgraded to level {lvl + 1}");
                    }
                    GUI.enabled = true;
                }
                else UIKit.Text(new Rect(row.xMax - 150, row.y + 16, 140, 24), "Maxed", UIKit.LabelSmall, UIKit.Good);
                y += 62;
                if (y > r.yMax) break;
            }
        }

        void DrawServices(Rect r)
        {
            var d = Profile.Data;
            var ship = g.Ship;
            float y = r.y;
            void Service(string name, float value, float perPct, System.Action apply)
            {
                int cost = Mathf.CeilToInt((100f - value) * perPct);
                var row = new Rect(r.x, y, r.width, 50);
                UIKit.Rect(row, new Color(1, 1, 1, 0.04f));
                UIKit.Text(new Rect(row.x + 14, row.y + 13, 260, 24), name, UIKit.Label, UIKit.Ink);
                UIKit.Bar(new Rect(row.x + 280, row.y + 21, 260, 8), value / 100f, UIKit.Accent);
                bool can = cost > 0 && d.Inv.Units >= cost;
                GUI.enabled = can;
                if (UIKit.Btn(new Rect(row.xMax - 240, row.y + 8, 230, 34), cost > 0 ? $"Refill for {cost:N0} u" : "Full", can, true))
                {
                    d.Inv.Units -= cost;
                    apply();
                    g.Audio.Play(Sfx.Craft);
                }
                GUI.enabled = true;
                y += 58;
            }
            Service("Hull repair", ship.Hull, 30f, () => ship.Hull = 100f);
            Service("Launch thruster fuel", ship.LaunchFuel, 12f, () => ship.LaunchFuel = 100f);
            Service("Pulse engine fuel", ship.PulseFuel, 14f, () => ship.PulseFuel = 100f);
            Service("Mining beam charge", d.ToolCharge, 5f, () => d.ToolCharge = 100f);
            y += 20;
            UIKit.Text(new Rect(r.x, y, r.width, 80),
                "Your exosuit's life support and hazard protection were recharged when you docked.\nPirates rarely attack within 20 km of a station.",
                UIKit.LabelSmall);
        }

        static readonly Color[] Paints =
        {
            new Color(0.84f, 0.86f, 0.88f), new Color(0.18f, 0.2f, 0.24f), new Color(0.85f, 0.22f, 0.18f), new Color(0.95f, 0.55f, 0.12f),
            new Color(0.95f, 0.82f, 0.2f), new Color(0.3f, 0.7f, 0.35f), new Color(0.2f, 0.55f, 0.9f), new Color(0.45f, 0.3f, 0.8f),
            new Color(0.9f, 0.4f, 0.7f), new Color(0.5f, 0.85f, 0.85f), new Color(0.55f, 0.4f, 0.28f), new Color(0.95f, 0.95f, 0.95f),
        };

        void DrawShipCustomize(Rect r)
        {
            var d = Profile.Data;
            float y = r.y;
            UIKit.Text(new Rect(r.x, y, 200, 24), "SHIP NAME", UIKit.LabelSmall, UIKit.Warm);
            y += 28;
            if (renameBuffer == null) renameBuffer = d.ShipName;
            GUI.SetNextControlName("shipname");
            renameBuffer = GUI.TextField(new Rect(r.x, y, 380, 40), renameBuffer, 24, UIKit.TextField);
            if (GUI.GetNameOfFocusedControl() == "shipname") Capturing = true;
            if (UIKit.Btn(new Rect(r.x + 390, y, 140, 40), "Rename", false, true) && renameBuffer.Trim().Length > 0) { d.ShipName = renameBuffer.Trim(); g.Toast("Ship renamed " + d.ShipName); }
            y += 64;
            for (int part = 0; part < 2; part++)
            {
                UIKit.Text(new Rect(r.x, y, 300, 24), part == 0 ? "HULL PAINT" : "ACCENT PAINT", UIKit.LabelSmall, UIKit.Warm);
                y += 28;
                for (int i = 0; i < Paints.Length; i++)
                {
                    var sw = new Rect(r.x + i * 58, y, 50, 50);
                    UIKit.Tex(sw, UIKit.Round, Paints[i]);
                    if (GUI.Button(sw, "", GUIStyle.none))
                    {
                        var c = Paints[i];
                        if (part == 0) d.ShipHull = new[] { c.r, c.g, c.b }; else d.ShipAccent = new[] { c.r, c.g, c.b };
                        g.Ship.Recolor(new Color(d.ShipHull[0], d.ShipHull[1], d.ShipHull[2]), new Color(d.ShipAccent[0], d.ShipAccent[1], d.ShipAccent[2]));
                        g.Audio.Play(Sfx.Click);
                    }
                }
                y += 72;
            }
            UIKit.Text(new Rect(r.x, y, r.width, 60), "Painting is free. The hangar camera shows your ship on the right.", UIKit.LabelSmall);
        }

        // ───────────────────────────── log ────────────────────────────────
        void DrawLog()
        {
            var d = Profile.Data;
            UIKit.Rect(new Rect(0, 0, W, H), new Color(0.01f, 0.02f, 0.04f, 0.85f));
            UIKit.Text(new Rect(60, 40, 900, 50), "DISCOVERIES", UIKit.LabelHuge);
            string[] kinds = { "All", "System", "Planet", "Fauna", "Flora", "Mineral", "Place" };
            for (int i = 0; i < kinds.Length; i++)
                if (UIKit.Btn(new Rect(60 + i * 150, 110, 140, 40), kinds[i], logTab == i, true)) logTab = i;
            var list = new List<Discovery>();
            foreach (var x in d.Discoveries)
                if (logTab == 0 || x.Kind == kinds[logTab] || (logTab == 3 && x.Kind == "Milestone")) list.Add(x);
            list.Reverse();
            var view = new Rect(60, 170, Mathf.Min(W - 120, 1300), H - 280);
            var content = new Rect(0, 0, view.width - 20, list.Count * 64 + 10);
            logScroll = GUI.BeginScrollView(view, logScroll, content);
            float y = 0;
            foreach (var x in list)
            {
                var row = new Rect(0, y, content.width, 58);
                UIKit.Rect(row, new Color(1, 1, 1, 0.04f));
                Color c = x.Kind == "Fauna" ? UIKit.Good : x.Kind == "Flora" ? new Color(0.6f, 0.95f, 0.5f) : x.Kind == "Planet" ? UIKit.Accent : x.Kind == "System" ? UIKit.Warm : UIKit.Dim;
                UIKit.Rect(new Rect(row.x, row.y, 4, row.height), c);
                UIKit.Text(new Rect(row.x + 16, row.y + 6, 520, 26), x.Name, UIKit.Label, UIKit.Ink);
                UIKit.Text(new Rect(row.x + 16, row.y + 32, 820, 22), $"{x.Kind} · {x.Where}" + (string.IsNullOrEmpty(x.Details) ? "" : " · " + x.Details), UIKit.LabelTiny);
                UIKit.Text(new Rect(row.xMax - 200, row.y + 16, 180, 26), $"+{x.Reward:N0} u", new GUIStyle(UIKit.LabelSmall) { alignment = TextAnchor.UpperRight }, UIKit.Warm);
                y += 64;
            }
            GUI.EndScrollView();
            int fauna = 0, flora = 0, planets = 0, systems = 0;
            foreach (var x in d.Discoveries)
            {
                if (x.Kind == "Fauna") fauna++;
                else if (x.Kind == "Flora") flora++;
                else if (x.Kind == "Planet") planets++;
                else if (x.Kind == "System") systems++;
            }
            UIKit.Text(new Rect(60, H - 90, 1200, 30), $"{systems} systems · {planets} planets · {fauna} animal species · {flora} plants · {d.Jumps} jumps", UIKit.Label, UIKit.Ink);
            if (UIKit.Btn(new Rect(W - 200, H - 80, 140, 44), "Close")) g.State = g.Mode == PlayerMode.Docked ? GameState.Station : GameState.Playing;
        }
    }
}

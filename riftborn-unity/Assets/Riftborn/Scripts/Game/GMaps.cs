// Riftborn — Google Maps street tiles, through Google's Map Tiles API (a
// port of the web game's js/gmaps.js). With a key (Menu → Google Maps, or
// Config.cs) the map lays Google's roadmap tiles on the ground in a day,
// night or scanner style, or Google's aerial photos for satellite. Each
// style needs a session from createSession; tiles are then fetched by
// z/x/y. Without a key, or if Google refuses it, the free map is used.
using System;
using System.Collections.Generic;
using System.Globalization;

namespace Riftborn
{
    public static class GMaps
    {
        const string API = "https://tile.googleapis.com";

        static List<object> Rule(string feature, string element, params (string k, object v)[] stylers)
        {
            var r = new Dictionary<string, object>();
            if (feature != null) r["featureType"] = feature;
            if (element != null) r["elementType"] = element;
            var list = new List<object>();
            foreach (var (k, v) in stylers) list.Add(new Dictionary<string, object> { { k, v } });
            r["stylers"] = list;
            return new List<object> { r };
        }
        static List<object> Rules(params List<object>[] rs) { var l = new List<object>(); foreach (var r in rs) l.AddRange(r); return l; }

        // Game look: keep streets, parks and water; drop shop and transit
        // labels so creatures and Rifts stand out.
        static List<object> Clean() => Rules(
            Rule("poi", "labels", ("visibility", "off")),
            Rule("poi.business", null, ("visibility", "off")),
            Rule("transit", "labels.icon", ("visibility", "off")));

        static List<object> StyleRules(string style)
        {
            switch (style)
            {
                case "day":
                    return Rules(Clean(),
                        Rule("landscape", "geometry", ("color", "#CFE3B8")), Rule("poi.park", "geometry", ("color", "#9ED08A")),
                        Rule("water", "geometry", ("color", "#7CC4F0")), Rule("road", "geometry", ("color", "#FFFFFF")),
                        Rule("road.highway", "geometry", ("color", "#FFE3A0")));
                case "scanner":
                    // Ingress-style scanner: black, faint teal roads, no labels.
                    return Rules(
                        Rule(null, "labels", ("visibility", "off")), Rule("poi", null, ("visibility", "off")),
                        Rule("transit", null, ("visibility", "off")), Rule("administrative", "geometry", ("visibility", "off")),
                        Rule(null, "geometry", ("color", "#050809")), Rule("landscape.man_made", "geometry", ("color", "#0A1113")),
                        Rule("poi.park", "geometry", ("visibility", "on"), ("color", "#07130F")), Rule("road", "geometry", ("color", "#1E3A3A")),
                        Rule("road.arterial", "geometry", ("color", "#27504D")), Rule("road.highway", "geometry", ("color", "#2F6660")),
                        Rule("water", "geometry", ("color", "#021018")));
                default:   // night
                    return Rules(Clean(),
                        Rule(null, "geometry", ("color", "#1C1733")), Rule(null, "labels.text.fill", ("color", "#8E86B8")),
                        Rule(null, "labels.text.stroke", ("color", "#120E22")), Rule("poi.park", "geometry", ("color", "#1E2E2A")),
                        Rule("road", "geometry", ("color", "#3A3160")), Rule("road.highway", "geometry", ("color", "#5A4486")),
                        Rule("water", "geometry", ("color", "#0C1830")));
            }
        }

        class Session { public string token; public long expires; public bool pending; }
        static readonly Dictionary<string, Session> sessions = new Dictionary<string, Session>();
        public static string State = "off", Status = "";
        static int failures;
        public static string Copyright = "";
        static string lastViewport = "";

        public static string Key
        {
            get
            {
                string mine = GameState.save?.settings?.googleKey;
                return (!string.IsNullOrEmpty(mine) ? mine : Config.GoogleMapsKey ?? "").Trim();
            }
        }

        // Google is in use when there's a key and it hasn't been refused.
        public static bool Active => Key != "" && State != "error" && failures < 12;

        static async void CreateSession(string style)
        {
            sessions[style] = new Session { pending = true };
            State = "loading"; Status = "Connecting to Google Maps…";
            try
            {
                string lang = CultureInfo.CurrentCulture.Name;
                if (string.IsNullOrEmpty(lang)) lang = "en-US";
                string region = lang.Contains("-") ? lang.Split('-')[1].ToUpperInvariant() : "US";
                var req = style == "satellite"
                    ? new Dictionary<string, object> { { "mapType", "satellite" }, { "language", lang }, { "region", region } }
                    : new Dictionary<string, object> { { "mapType", "roadmap" }, { "language", lang }, { "region", region }, { "scale", "scaleFactor2x" }, { "highDpi", true }, { "styles", StyleRules(style) } };
                var res = await Net.Request("POST", $"{API}/v1/createSession?key={Uri.EscapeDataString(Key)}", Json.Write(req));
                object body = null;
                try { body = Json.Parse(res.text); } catch (Exception) { }
                string token = Json.Str(body, "session");
                if (res.status != 200 || token == null) throw new Exception(Json.Str(body, "error", "message") ?? $"HTTP {res.status}");
                long.TryParse(Json.Str(body, "expiry") ?? "0", out long exp);
                sessions[style] = new Session { token = token, expires = exp > 0 ? exp * 1000 : Rng.NowMs() + 12 * 3600000L };
                State = "ok"; Status = "Google Maps is on.";
                failures = 0;
            }
            catch (Exception e)
            {
                sessions.Remove(style);
                State = "error"; Status = "Google refused the key: " + e.Message;
            }
        }

        // A tile URL, or null while the session is being set up.
        public static string TileUrl(string style, int z, int x, int y)
        {
            if (sessions.TryGetValue(style, out var s) && s.token != null && s.expires > Rng.NowMs() + 60000)
                return $"{API}/v1/2dtiles/{z}/{x}/{y}?session={s.token}&key={Uri.EscapeDataString(Key)}";
            if (s == null || !s.pending) CreateSession(style);
            return null;
        }

        public static void TileLoaded() { failures = 0; }
        public static void TileFailed() { failures++; if (failures >= 12) { State = "error"; Status = "Google Maps tiles are not loading. Using the free map for now."; } }

        // Google's copyright line for the area in view, as Google requires.
        public static async void UpdateCopyright(string style, double lat, double lng)
        {
            if (!sessions.TryGetValue(style, out var s) || s.token == null) return;
            double d = 0.01;
            string q = $"{lat:0.00}/{lng:0.00}";
            if (q == lastViewport) return;
            lastViewport = q;
            var ci = CultureInfo.InvariantCulture;
            string url = $"{API}/tile/v1/viewport?session={s.token}&key={Uri.EscapeDataString(Key)}&zoom=16" +
                $"&north={(lat + d).ToString(ci)}&south={(lat - d).ToString(ci)}&east={(lng + d).ToString(ci)}&west={(lng - d).ToString(ci)}";
            try
            {
                var res = await Net.Request("GET", url);
                if (Json.Str(Json.Parse(res.text), "copyright") is string c) Copyright = c;
            }
            catch (Exception) { }
        }

        // Forget sessions (after the key changes).
        public static void Reset()
        {
            sessions.Clear();
            State = Key != "" ? "loading" : "off";
            Status = Key != "" ? "Connecting to Google Maps…" : "";
            failures = 0;
            Copyright = "";
            lastViewport = "";
        }
    }
}

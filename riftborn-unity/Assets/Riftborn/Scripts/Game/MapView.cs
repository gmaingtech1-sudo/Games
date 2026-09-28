// Riftborn — the 3D map. Real street tiles (Esri: the dark "scanner" look
// like Ingress, or satellite photos) laid on the ground, your agent in the
// middle with a glowing reach circle, and the Rifts, caches and creatures
// around you. The camera trails you; drag to turn it, pinch or scroll to
// zoom, tap things to use them.
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Riftborn
{
    public class MapView : MonoBehaviour
    {
        public const double SIGHT = 300;   // creatures further than this aren't shown
        public System.Action<object> OnTap;

        Camera cam;
        Light sun;
        Transform world;
        Props.Avatar agent;
        GameObject reach;
        public double lat, lng;            // where you are (smoothed)
        public float heading;
        public float moving;
        float yaw, dist = 140;
        const float PITCH = 34;

        readonly Dictionary<string, Props.RiftProp> rifts = new Dictionary<string, Props.RiftProp>();
        readonly Dictionary<string, Props.CrateProp> caches = new Dictionary<string, Props.CrateProp>();
        class Wild { public BeastInstance b; public Spawn s; public Vector3 home, pos, target; public float wait, scale; public bool fly; public float dir; }
        readonly Dictionary<string, Wild> wild = new Dictionary<string, Wild>();
        Around ents = new Around();

        GameObject grid;

        public static MapView Create()
        {
            var go = new GameObject("Map");
            return go.AddComponent<MapView>();
        }

        void Awake()
        {
            world = new GameObject("World").transform;
            world.SetParent(transform, false);
            var camGo = new GameObject("MapCamera");
            camGo.transform.SetParent(transform, false);
            cam = camGo.AddComponent<Camera>();
            cam.fieldOfView = 50;
            cam.nearClipPlane = 1; cam.farClipPlane = 2500;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.01f, 0.03f, 0.035f);
            camGo.tag = "MainCamera";
            cam.cullingMask = ~(1 << Preview.LAYER);
            var sunGo = new GameObject("Sun");
            sunGo.transform.SetParent(transform, false);
            sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.1f;
            sun.color = new Color(0.85f, 0.93f, 1f);
            sun.shadows = LightShadows.Soft;
            sun.cullingMask = ~(1 << Preview.LAYER);
            sun.transform.rotation = Quaternion.Euler(55, -30, 0);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.35f, 0.55f, 0.55f);
            RenderSettings.ambientEquatorColor = new Color(0.12f, 0.2f, 0.2f);
            RenderSettings.ambientGroundColor = new Color(0.02f, 0.04f, 0.04f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = new Color(0.02f, 0.08f, 0.09f);
            RenderSettings.fogStartDistance = 300; RenderSettings.fogEndDistance = 1000;
            QualitySettings.shadowDistance = 400;

            // Ground under the tiles (and instead of them offline): a faint grid.
            var grid = Tex.Make(128, 128, (x, y) => (x % 64 < 2 || y % 64 < 2) ? new Color(0.12f, 0.35f, 0.33f) : new Color(0.02f, 0.05f, 0.05f));
            var ground = Props.Mesh("ground", Props.Quad, Mats.Unlit(grid, Color.white), world, false);
            this.grid = ground;
            ground.transform.localRotation = Quaternion.Euler(90, 0, 0);
            ground.transform.localScale = Vector3.one * 4000;
            ground.transform.localPosition = new Vector3(0, -0.2f, 0);
            ground.GetComponent<Renderer>().sharedMaterial.mainTextureScale = new Vector2(80, 80);

            agent = new Props.Avatar(GameState.MyColor);
            agent.root.transform.SetParent(world, false);
            agent.root.transform.localScale = Vector3.one * 5;
            reach = Props.Ring(GameState.MyColor, (float)GameState.RANGE * 1.05f, world);
            reach.transform.localPosition = new Vector3(0, 0.4f, 0);
        }

        public void Recolor()
        {
            var old = agent.root;
            agent = new Props.Avatar(GameState.MyColor);
            agent.root.transform.SetParent(world, false);
            agent.root.transform.localScale = Vector3.one * 5;
            agent.root.transform.localPosition = old.transform.localPosition;
            Destroy(old);
            reach.GetComponent<Renderer>().sharedMaterial.color = GameState.MyColor;
        }

        // The world origin moved (you travelled far): drop everything placed.
        public void Rebase()
        {
            foreach (var r in rifts.Values) Destroy(r.root);
            foreach (var c in caches.Values) Destroy(c.root);
            foreach (var w in wild.Values) w.b.Destroy();
            foreach (var b in apexes.Values) b.Destroy();
            rifts.Clear(); caches.Clear(); wild.Clear(); apexes.Clear();
            if (linkRoot) Destroy(linkRoot);
            linkKey = "";
            ChangedStyle();
        }

        public void Show(bool on) { gameObject.SetActive(on); }

        Vector3 ToV(double la, double ln) { var (x, y) = World.ToXY(la, ln); return new Vector3((float)x, 0, (float)y); }

        /* ------------------ Entities ------------------ */

        public void SetEntities(Around a)
        {
            ents = a;
            var seen = new HashSet<string>();
            foreach (var r in a.rifts)
            {
                seen.Add(r.id);
                if (!rifts.TryGetValue(r.id, out var o))
                {
                    o = new Props.RiftProp();
                    o.root.transform.SetParent(world, false);
                    o.root.transform.localPosition = ToV(r.lat, r.lng);
                    o.root.AddComponent<Pickable>().target = r;
                    rifts[r.id] = o;
                }
                var st = GameState.State(r);
                o.Set(st, GameState.RiftColor(st), World.Dist(lat, lng, r.lat, r.lng) <= GameState.RANGE && GameState.HackWait(r) == 0);
            }
            Prune(rifts, seen, (o) => Destroy(o.root));
            seen.Clear();
            foreach (var c in a.caches)
            {
                seen.Add(c.id);
                if (!caches.TryGetValue(c.id, out var o))
                {
                    o = new Props.CrateProp();
                    o.root.transform.SetParent(world, false);
                    o.root.transform.localPosition = ToV(c.lat, c.lng);
                    o.root.transform.localScale = Vector3.one * 1.5f;
                    o.root.transform.localRotation = Quaternion.Euler(0, (float)(c.lat * 1e5 % 360), 0);
                    o.root.AddComponent<Pickable>().target = c;
                    caches[c.id] = o;
                }
                o.Set(GameState.CacheWait(c) == 0);
            }
            Prune(caches, seen, (o) => Destroy(o.root));
            SyncWild();
            SyncApex();
        }

        // Apex creatures stand beside the Rift they've taken over, huge, on a
        // red ring. Tapping one opens its Rift.
        readonly Dictionary<string, BeastInstance> apexes = new Dictionary<string, BeastInstance>();
        static readonly Color ApexRed = new Color(1, 0.23f, 0.36f);

        void SyncApex()
        {
            var seen = new HashSet<string>();
            foreach (var r in ents.rifts)
            {
                var a = GameState.ApexAt(r);
                if (a == null || a.beaten || World.Dist(lat, lng, r.lat, r.lng) > SIGHT * 1.5) continue;
                seen.Add(r.id);
                if (apexes.ContainsKey(r.id)) continue;
                var b = new BeastInstance(a.boss.sp);
                float scale = Mathf.Clamp(b.sp.size * 5.5f, 14, 34);
                b.root.transform.SetParent(world, false);
                b.root.transform.localScale = Vector3.one * scale;
                b.root.transform.localPosition = ToV(r.lat, r.lng) + new Vector3(14, 0, -6);
                b.root.transform.localRotation = Quaternion.Euler(0, -0.6f * Mathf.Rad2Deg, 0);
                var ring = Props.Ring(ApexRed, 0.6f, b.root.transform);
                ring.transform.localPosition = new Vector3(0, 0.3f / scale, 0);
                var aura = Props.Glow(new Color(1, 0.23f, 0.36f, 0.45f), 2.2f, b.root.transform);
                aura.transform.localPosition = new Vector3(0, 0.5f, 0);
                var col = b.root.AddComponent<SphereCollider>();
                col.radius = 0.6f; col.center = new Vector3(0, 0.5f, 0);
                b.root.AddComponent<Pickable>().target = r;
                apexes[r.id] = b;
            }
            Prune(apexes, seen, (b) => b.Destroy());
        }

        static void Prune<T>(Dictionary<string, T> map, HashSet<string> seen, System.Action<T> kill)
        {
            foreach (var id in map.Keys.Where((k) => !seen.Contains(k)).ToList()) { kill(map[id]); map.Remove(id); }
        }

        // Creatures within sight get a live model that wanders near its spot.
        void SyncWild()
        {
            var seen = new HashSet<string>();
            foreach (var s in ents.spawns)
            {
                if (GameState.IsGone(s) || World.Dist(lat, lng, s.lat, s.lng) > SIGHT) continue;
                seen.Add(s.id);
                if (wild.ContainsKey(s.id)) continue;
                var b = new BeastInstance(s.sp);
                float scale = Mathf.Clamp(b.sp.size * 3.6f, 7, 22);
                b.root.transform.SetParent(world, false);
                b.root.transform.localScale = Vector3.one * scale;
                var home = ToV(s.lat, s.lng);
                b.root.transform.localPosition = home;
                var ring = Props.Ring(Species.Rarities[b.sp.rar].color, scale * 0.55f, b.root.transform);
                ring.transform.localPosition = new Vector3(0, 0.3f / scale, 0);
                ring.transform.localScale = Vector3.one * 1.1f;
                var col = b.root.AddComponent<SphereCollider>();
                col.radius = 0.8f; col.center = new Vector3(0, 0.5f, 0);
                b.root.AddComponent<Pickable>().target = s;
                if (s.boost)
                {
                    var tag = Props.Glow(new Color(0.5f, 0.83f, 1f, 0.8f), 0.5f, b.root.transform);
                    tag.transform.localPosition = new Vector3(0, b.asset.bounds.max.y + 0.35f, 0);
                }
                wild[s.id] = new Wild { b = b, s = s, home = home, pos = home, scale = scale, fly = b.sp.plan == Plan.Flyer, wait = Random.value * 3, dir = Random.value * 6 };
            }
            Prune(wild, seen, (w) => w.b.Destroy());
        }

        void UpdateWild(Wild o, float dt)
        {
            float speed = 0;
            if (o.fly)
            {
                o.dir += dt * 0.35f;
                o.pos = o.home + new Vector3(Mathf.Cos(o.dir) * 12, o.scale * 0.8f + Mathf.Sin(Time.time * 1.3f + o.scale) * 1.5f, Mathf.Sin(o.dir) * 12);
                o.b.root.transform.localRotation = Quaternion.Euler(0, -o.dir * Mathf.Rad2Deg, 0);
            }
            else
            {
                if (o.target == Vector3.zero) { o.wait -= dt; if (o.wait <= 0) o.target = o.home + new Vector3(Random.Range(-14f, 14f), 0, Random.Range(-14f, 14f)); }
                else
                {
                    var d = o.target - o.pos; d.y = 0;
                    speed = Mathf.Min(2.2f, 0.6f + o.scale * 0.12f);
                    if (d.magnitude < 0.3f) { o.target = Vector3.zero; o.wait = 2 + Random.value * 5; speed = 0; }
                    else
                    {
                        o.pos += d.normalized * Mathf.Min(d.magnitude, speed * dt);
                        var want = Quaternion.LookRotation(d.normalized);
                        o.b.root.transform.localRotation = Quaternion.Slerp(o.b.root.transform.localRotation, want, Mathf.Min(1, dt * 4));
                    }
                }
            }
            o.b.root.transform.localPosition = o.pos;
            o.b.Update(dt, speed, 0, null, o.fly ? 0.3f : 0);
        }

        /* ------------------ Map tiles ------------------ */

        // Street tiles laid on the ground: Google Maps (with a key), or the
        // free Esri and OpenStreetMap tiles. The style is the Ingress-like
        // scanner, satellite photos, day or night (or both, following your
        // clock), or no street map at all.
        const string ESRI = "https://services.arcgisonline.com/ArcGIS/rest/services";
        class Tile { public GameObject go; public bool done; }
        readonly Dictionary<string, Tile> tiles = new Dictionary<string, Tile>();
        float tileTimer;
        int tileFails, freeIndex;
        string style = "scanner";
        public string Style => style;

        public static string StyleFor(string setting)
        {
            if (setting == "grid" || setting == "scanner" || setting == "satellite" || setting == "day" || setting == "night") return setting;
            float h = System.DateTime.Now.Hour + System.DateTime.Now.Minute / 60f;
            return h >= 6.5f && h < 19.5f ? "day" : "night";
        }

        // Settings changed (or a new agent): pick the style and source again.
        public void ApplySettings()
        {
            var st = GameState.save?.settings;
            string want = StyleFor(st != null ? st.map : "scanner");
            if (want != style) { style = want; ChangedStyle(); }
            ApplyLook();
        }

        string FreeProvider()
        {
            string pick = GameState.save?.settings.tiles ?? "auto";
            if (pick == "esri" || pick == "osm") return pick;
            return freeIndex == 0 ? "esri" : "osm";
        }
        public string SourceName => GMaps.Active ? "Google Maps" : FreeProvider() == "esri" ? "Esri" : "OpenStreetMap";
        public string Attribution => style == "grid" ? "" : GMaps.Active ? "Map data ©Google" + (GMaps.Copyright != "" ? " · " + GMaps.Copyright : "")
            : FreeProvider() == "osm" ? "© OpenStreetMap contributors"
            : style == "satellite" ? "Powered by Esri · Esri, Maxar, Earthstar Geographics" : "Powered by Esri · Esri, HERE, Garmin, © OpenStreetMap contributors";

        static (int x, int y) TileOf(double la, double ln, int z)
        {
            double n = 1 << z;
            int x = (int)System.Math.Floor((ln + 180) / 360 * n);
            double r = la * System.Math.PI / 180;
            int y = (int)System.Math.Floor((1 - System.Math.Log(System.Math.Tan(r) + 1 / System.Math.Cos(r)) / System.Math.PI) / 2 * n);
            return (x, y);
        }
        static (double lat, double lng) TileCorner(int x, int y, int z)
        {
            double n = 1 << z;
            double ln = x / n * 360 - 180;
            double la = System.Math.Atan(System.Math.Sinh(System.Math.PI * (1 - 2 * y / n))) * 180 / System.Math.PI;
            return (la, ln);
        }

        string TileUrl(int z, int x, int y)
        {
            if (GMaps.Active) return GMaps.TileUrl(style, z, x, y);   // null while connecting
            if (FreeProvider() == "osm") return $"https://tile.openstreetmap.org/{z}/{x}/{y}.png";
            return style == "satellite" ? $"{ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                : style == "day" ? $"{ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                : $"{ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
        }

        Color TileTint()
        {
            if (GMaps.Active || style == "satellite") return Color.white;
            bool osm = FreeProvider() == "osm";
            if (style == "day") return new Color(0.96f, 1f, 0.94f);
            if (style == "scanner") return osm ? new Color(0.18f, 0.42f, 0.39f) : new Color(0.55f, 1.2f, 1.1f);
            return osm ? new Color(0.29f, 0.27f, 0.44f) : new Color(0.85f, 0.8f, 1.15f);   // night
        }

        void UpdateTiles()
        {
            if (style == "grid") return;
            if (!GMaps.Active && tileFails > 10 && GameState.save?.settings.tiles == "auto" && freeIndex == 0) { freeIndex = 1; tileFails = 0; ChangedStyle(); return; }
            if (tileFails > 14) return;   // offline: the grid does
            int z = dist < 150 ? 17 : 16;
            string key0 = (GMaps.Active ? "g" : FreeProvider()) + style;
            var (cx, cy) = TileOf(lat, lng, z);
            int R = z == 17 ? 3 : 2;
            var want = new HashSet<string>();
            for (int dy = -R; dy <= R; dy++)
                for (int dx = -R; dx <= R; dx++)
                {
                    int x = cx + dx, y = cy + dy;
                    string key = $"{key0}/{z}/{x}/{y}";
                    want.Add(key);
                    if (tiles.ContainsKey(key)) continue;
                    string url = TileUrl(z, x, y);
                    if (url == null) continue;   // Google session still connecting
                    var t = new Tile();
                    tiles[key] = t;
                    StartCoroutine(LoadTile(t, url, x, y, z));
                }
            bool covered = want.All((k) => tiles.TryGetValue(k, out var t) && t.done);
            foreach (var k in tiles.Keys.Where((k) => !want.Contains(k) && (covered || !k.StartsWith(key0))).ToList())
            {
                if (tiles[k].go) { Destroy(tiles[k].go.GetComponent<Renderer>().sharedMaterial.mainTexture); Destroy(tiles[k].go); }
                tiles.Remove(k);
            }
        }

        IEnumerator LoadTile(Tile t, string url, int x, int y, int z)
        {
            using (var req = UnityWebRequestTexture.GetTexture(url))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) { tileFails++; if (GMaps.Active) GMaps.TileFailed(); yield break; }
                tileFails = 0;
                if (GMaps.Active) GMaps.TileLoaded();
                var tex = DownloadHandlerTexture.GetContent(req);
                tex.wrapMode = TextureWrapMode.Clamp;
                tex.anisoLevel = 8;
                var (la0, ln0) = TileCorner(x, y, z);
                var (la1, ln1) = TileCorner(x + 1, y + 1, z);
                Vector3 a = ToV(la0, ln0), b = ToV(la1, ln1);
                var go = Props.Mesh("tile", Props.Quad, Mats.Unlit(tex, TileTint()), world, false);
                go.transform.localRotation = Quaternion.Euler(90, 0, 0);
                go.transform.localPosition = new Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
                go.transform.localScale = new Vector3(b.x - a.x, a.z - b.z, 1);
                t.go = go;
                t.done = true;
            }
        }

        public void ChangedStyle()
        {
            foreach (var t in tiles.Values) if (t.go) { Destroy(t.go.GetComponent<Renderer>().sharedMaterial.mainTexture); Destroy(t.go); }
            tiles.Clear();
            tileFails = 0;
            ApplyLook();
        }

        // A new Google key, or the map source changed.
        public void SourceChanged() { freeIndex = 0; ChangedStyle(); }

        float sunBase = 1.1f; Color ambBase;
        void ApplyLook()
        {
            bool light = style == "day" || style == "satellite";
            Color horizon = style == "scanner" || style == "grid" ? new Color(0.02f, 0.08f, 0.09f) : style == "night" ? new Color(0.14f, 0.09f, 0.22f) : new Color(0.72f, 0.82f, 0.9f);
            RenderSettings.fogColor = horizon;
            cam.backgroundColor = style == "scanner" || style == "grid" ? new Color(0.01f, 0.03f, 0.035f) : horizon;
            sunBase = light ? 1.35f : style == "night" ? 0.75f : 1.1f;
            sun.color = style == "night" ? new Color(0.7f, 0.72f, 1f) : light ? new Color(1f, 0.97f, 0.9f) : new Color(0.85f, 0.93f, 1f);
            ambBase = light ? new Color(0.7f, 0.78f, 0.9f) : style == "night" ? new Color(0.3f, 0.26f, 0.5f) : new Color(0.35f, 0.55f, 0.55f);
            RenderSettings.ambientSkyColor = ambBase;
            if (grid) grid.SetActive(true);
        }

        /* ------------------ Links & control fields ------------------ */

        GameObject linkRoot;
        string linkKey = "";
        static Mesh BoxMesh()
        {
            var v = new List<Vector3>(); var t = new List<int>(); var uv = new List<Vector2>();
            for (int f = 0; f < 6; f++)
            {
                var n = new[] { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back }[f];
                var u = Mathf.Abs(n.y) > 0.5f ? Vector3.right : Vector3.up;
                var w = Vector3.Cross(n, u);
                int b0 = v.Count;
                v.Add((n - u - w) * 0.5f); v.Add((n + u - w) * 0.5f); v.Add((n + u + w) * 0.5f); v.Add((n - u + w) * 0.5f);
                uv.Add(Vector2.zero); uv.Add(Vector2.up); uv.Add(Vector2.one); uv.Add(Vector2.right);
                t.AddRange(new[] { b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3 });
            }
            return Shapes.Build(v, uv, t, "box", true);
        }
        static Mesh box;

        void SyncLinks()
        {
            var s = GameState.save;
            if (s == null) return;
            string key = string.Join(",", s.links.Select((l) => l.a + l.b)) + "|" + s.fields.Count + "|" + s.agent.faction;
            if (key == linkKey) return;
            linkKey = key;
            if (linkRoot) Destroy(linkRoot);
            linkRoot = new GameObject("Links");
            linkRoot.transform.SetParent(world, false);
            box ??= BoxMesh();
            var col = GameState.MyColor;
            var lm = Mats.Glow(col * 0.85f, Texture2D.whiteTexture);
            var gm = Mats.Glow(col * 0.25f, Texture2D.whiteTexture);
            foreach (var l in s.links)
            {
                Vector3 a = ToV(l.al[0], l.al[1]) + Vector3.up * 3, b = ToV(l.bl[0], l.bl[1]) + Vector3.up * 3;
                float len = Vector3.Distance(a, b);
                if (len < 0.01f) continue;
                var m = Props.Mesh("link", box, lm, linkRoot.transform, false);
                m.transform.localPosition = (a + b) / 2;
                m.transform.localRotation = Quaternion.LookRotation(b - a);
                m.transform.localScale = new Vector3(1.2f, 1.2f, len);
                var g = Props.Mesh("linkglow", box, gm, linkRoot.transform, false);
                g.transform.localPosition = (a + b) / 2 + Vector3.down * 2.4f;
                g.transform.localRotation = m.transform.localRotation;
                g.transform.localScale = new Vector3(5, 0.2f, len);
            }
            var fm = Mats.Glow(col * 0.2f, Texture2D.whiteTexture);
            foreach (var f in s.fields)
            {
                var pts = f.ll.Select((ll) => ToV(ll[0], ll[1]) + Vector3.up * 0.6f).ToList();
                var mesh = Shapes.Build(pts, new List<Vector2> { Vector2.zero, Vector2.up, Vector2.one }, new List<int> { 0, 1, 2 }, "field", true);
                Props.Mesh("field", mesh, fm, linkRoot.transform, false);
            }
        }

        /* ------------------ Weather ------------------ */

        // The real weather over the map: rain streaks, drifting snow, fog
        // rolling in, darker skies under cloud, and lightning in a storm.
        const float BOX = 360, TOP = 170;
        GameObject rain, snow;
        string wx;
        float flash, nextFlash = 4;

        static GameObject Precip(string name, int n, Vector2 size, Color c, string seed)
        {
            var r = new Seeded(seed);
            var v = new List<Vector3>(); var uv = new List<Vector2>(); var t = new List<int>();
            for (int i = 0; i < n; i++)
            {
                var p = new Vector3(((float)r.Next() - 0.5f) * BOX, (float)r.Next() * TOP, ((float)r.Next() - 0.5f) * BOX);
                float yaw = (float)r.Next() * Mathf.PI;
                var side = new Vector3(Mathf.Cos(yaw), 0, Mathf.Sin(yaw)) * size.x / 2;
                int b = v.Count;
                v.Add(p - side); v.Add(p + side); v.Add(p + side + Vector3.up * size.y); v.Add(p - side + Vector3.up * size.y);
                uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(1, 0)); uv.Add(new Vector2(1, 1)); uv.Add(new Vector2(0, 1));
                t.AddRange(new[] { b, b + 1, b + 2, b, b + 2, b + 3 });
            }
            var mesh = Shapes.Build(v, uv, t, name, true);
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 2000);
            var root = new GameObject(name);
            var tex = name == "snow" ? Tex.Glow : Texture2D.whiteTexture;
            for (int k = 0; k < 2; k++)
            {
                var go = Props.Mesh(name, mesh, Mats.Glow(c, tex), root.transform, false);
                go.transform.localPosition = new Vector3(0, k * TOP, 0);
            }
            return root;
        }

        public void SetWeather(WeatherNow w)
        {
            wx = w?.kind;
            bool rainy = wx == "rain" || wx == "storm";
            if (rainy && rain == null) { rain = Precip("rain", 1600, new Vector2(0.25f, 7), new Color(0.72f, 0.82f, 1f, 0.35f), "rain"); rain.transform.SetParent(transform, false); }
            if (wx == "snow" && snow == null) { snow = Precip("snow", 1800, new Vector2(2.2f, 2.2f), new Color(1, 1, 1, 0.8f), "snow"); snow.transform.SetParent(transform, false); }
            if (rain) rain.SetActive(rainy);
            if (snow) snow.SetActive(wx == "snow");
        }

        void UpdateWeather(float dt, Vector3 me)
        {
            void Fall(GameObject layer, float speed)
            {
                float y = -Mathf.Repeat(Time.time * speed, TOP);
                layer.transform.position = new Vector3(Mathf.Round(me.x / 40) * 40, y, Mathf.Round(me.z / 40) * 40);
            }
            if (rain && rain.activeSelf) Fall(rain, wx == "storm" ? 150 : 110);
            if (snow && snow.activeSelf) Fall(snow, 9);
            float dim = wx == "cloudy" ? 0.6f : wx == "rain" ? 0.5f : wx == "storm" ? 0.35f : wx == "snow" ? 0.7f : wx == "fog" ? 0.55f : wx == "partly" ? 0.85f : 1;
            sun.intensity = sunBase * dim;
            float near = wx == "fog" ? 60 : wx == "rain" || wx == "storm" || wx == "snow" ? 180 : 300;
            float far = wx == "fog" ? 330 : wx == "rain" || wx == "storm" || wx == "snow" ? 620 : 1000;
            RenderSettings.fogStartDistance += (near - RenderSettings.fogStartDistance) * Mathf.Min(1, dt);
            RenderSettings.fogEndDistance += (far - RenderSettings.fogEndDistance) * Mathf.Min(1, dt);
            float f = 0;
            if (wx == "storm")
            {
                nextFlash -= dt;
                if (nextFlash <= 0) { flash = 0.35f; nextFlash = 5 + Random.value * 9; Sfx.Play("strike", 0.3f); }
                flash = Mathf.Max(0, flash - dt);
                f = flash > 0 ? (Mathf.Sin(flash * 60) > 0 ? 3 : 0.5f) : 0;
            }
            RenderSettings.ambientSkyColor = ambBase * (0.75f + 0.25f * dim) + Color.white * f * 0.3f;
        }

        /* ------------------ Frame ------------------ */

        Vector2? dragFrom; float pinch;

        public float CamDist => dist;
        public void Zoom(float f) { dist = Mathf.Clamp(dist * f, 70, 340); }
        public float RadiusM => Mathf.Clamp(dist * 6, 400, 1400);

        void Update()
        {
            float dt = Time.deltaTime;
            var me = ToV(lat, lng);
            agent.root.transform.localPosition = me;
            reach.transform.localPosition = me + new Vector3(0, 0.4f, 0);
            agent.root.transform.localRotation = Quaternion.Slerp(agent.root.transform.localRotation, Quaternion.Euler(0, heading, 0), Mathf.Min(1, dt * 6));
            agent.Update(dt, moving > 0 ? 1.6f : 0);
            foreach (var r in rifts.Values) r.Update(dt);
            foreach (var c in caches.Values) c.Update(dt);
            foreach (var w in wild.Values) UpdateWild(w, dt);
            // Apex creatures stand their ground and roar now and then.
            float t = Time.time;
            foreach (var b in apexes.Values) b.Update(dt, 0, Mathf.Max(0, Mathf.Sin(t * 0.8f) - 0.8f) * 5, null);
            tileTimer -= dt;
            if (tileTimer <= 0) { tileTimer = 0.5f; if (StyleFor(GameState.save?.settings.map ?? "scanner") != style) ApplySettings(); UpdateTiles(); SyncLinks(); if (GMaps.Active) GMaps.UpdateCopyright(style, lat, lng); }
            UpdateWeather(dt, me);
            HandleInput();
            var look = me + new Vector3(0, 4, 0);
            var off = Quaternion.Euler(PITCH, yaw, 0) * new Vector3(0, 0, -dist);
            cam.transform.position = Vector3.Lerp(cam.transform.position, look + off, 1 - Mathf.Exp(-dt * 8));
            cam.transform.LookAt(look);
        }

        // Drag turns the camera, pinch or scroll zooms, a tap picks things.
        void HandleInput()
        {
            if (UI.Blocking) { dragFrom = null; pinch = 0; return; }
            float scroll = Inp.Scroll;
            if (scroll != 0) Zoom(scroll > 0 ? 0.88f : 1.14f);
            if (Inp.Touches >= 2)
            {
                float d = Inp.PinchSpan;
                if (pinch > 0 && d > 0) Zoom(pinch / d);
                pinch = d;
                dragFrom = null;
                tapMoved = 999;
                return;
            }
            pinch = 0;
            if (Inp.Down) { dragFrom = Inp.Pos; tapStart = dragFrom.Value; tapMoved = 0; }
            else if (Inp.Held && dragFrom.HasValue)
            {
                Vector2 p = Inp.Pos;
                float dx = p.x - dragFrom.Value.x;
                tapMoved += Vector2.Distance(p, dragFrom.Value);
                yaw += dx * 0.25f * 1000f / Mathf.Max(600, Screen.width);
                dragFrom = p;
            }
            else if (Inp.Up && dragFrom.HasValue)
            {
                dragFrom = null;
                if (tapMoved < 14 * UI.Scale) Pick(tapStart);
            }
        }
        Vector2 tapStart; float tapMoved;

        void Pick(Vector2 screen)
        {
            var ray = cam.ScreenPointToRay(screen);
            var hits = Physics.RaycastAll(ray, 3000);
            var best = hits.OrderBy((h) => h.distance).Select((h) => h.collider.GetComponentInParent<Pickable>()).Where((p) => p != null).FirstOrDefault();
            if (best != null) OnTap?.Invoke(best.target);
        }

        public float Yaw { get => yaw; set => yaw = value; }
    }

    public class Pickable : MonoBehaviour { public object target; }
}

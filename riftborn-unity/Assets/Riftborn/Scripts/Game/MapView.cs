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

        const string ESRI = "https://services.arcgisonline.com/ArcGIS/rest/services";
        class Tile { public GameObject go; public bool done; }
        readonly Dictionary<string, Tile> tiles = new Dictionary<string, Tile>();
        float tileTimer;
        public bool satellite;
        int tileFails;

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

        void UpdateTiles()
        {
            if (tileFails > 12) return;   // offline: the grid does
            int z = dist < 150 ? 17 : 16;
            string style = satellite ? "sat" : "dark";
            var (cx, cy) = TileOf(lat, lng, z);
            int R = z == 17 ? 3 : 2;
            var want = new HashSet<string>();
            for (int dy = -R; dy <= R; dy++)
                for (int dx = -R; dx <= R; dx++)
                {
                    int x = cx + dx, y = cy + dy;
                    string key = $"{style}/{z}/{x}/{y}";
                    want.Add(key);
                    if (tiles.ContainsKey(key)) continue;
                    var t = new Tile();
                    tiles[key] = t;
                    StartCoroutine(LoadTile(t, x, y, z));
                }
            bool covered = want.All((k) => tiles.TryGetValue(k, out var t) && t.done);
            foreach (var k in tiles.Keys.Where((k) => !want.Contains(k) && (covered || !k.StartsWith(style))).ToList())
            {
                if (tiles[k].go) { Destroy(tiles[k].go.GetComponent<Renderer>().sharedMaterial.mainTexture); Destroy(tiles[k].go); }
                tiles.Remove(k);
            }
        }

        IEnumerator LoadTile(Tile t, int x, int y, int z)
        {
            string url = satellite ? $"{ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}" : $"{ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
            using (var req = UnityWebRequestTexture.GetTexture(url))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) { tileFails++; yield break; }
                tileFails = 0;
                var tex = DownloadHandlerTexture.GetContent(req);
                tex.wrapMode = TextureWrapMode.Clamp;
                tex.anisoLevel = 8;
                var (la0, ln0) = TileCorner(x, y, z);
                var (la1, ln1) = TileCorner(x + 1, y + 1, z);
                Vector3 a = ToV(la0, ln0), b = ToV(la1, ln1);
                // The scanner look: the dark map tinted teal, like Ingress.
                var go = Props.Mesh("tile", Props.Quad, Mats.Unlit(tex, satellite ? Color.white : new Color(0.55f, 1.2f, 1.1f)), world, false);
                go.transform.localRotation = Quaternion.Euler(90, 0, 0);
                go.transform.localPosition = new Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
                go.transform.localScale = new Vector3(b.x - a.x, a.z - b.z, 1);
                t.go = go;
                t.done = true;
            }
        }

        public void ChangedStyle()
        {
            foreach (var t in tiles.Values) if (t.go) Destroy(t.go);
            tiles.Clear();
            tileFails = 0;
            ApplyLook();
        }

        void ApplyLook()
        {
            RenderSettings.fogColor = satellite ? new Color(0.62f, 0.72f, 0.8f) : new Color(0.02f, 0.08f, 0.09f);
            cam.backgroundColor = satellite ? new Color(0.55f, 0.7f, 0.9f) : new Color(0.01f, 0.03f, 0.035f);
            sun.intensity = satellite ? 1.35f : 1.1f;
            RenderSettings.ambientSkyColor = satellite ? new Color(0.7f, 0.78f, 0.9f) : new Color(0.35f, 0.55f, 0.55f);
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
            if (tileTimer <= 0) { tileTimer = 0.5f; UpdateTiles(); }
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

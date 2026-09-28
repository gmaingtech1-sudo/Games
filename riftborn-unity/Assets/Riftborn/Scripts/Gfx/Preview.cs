// Riftborn — a turntable for menus: renders one creature (slowly turning,
// breathing, looking around) into a texture that the UI draws.
using UnityEngine;

namespace Riftborn
{
    public class Preview : MonoBehaviour
    {
        public const int LAYER = 30;
        static Preview inst;
        Camera cam;
        RenderTexture rt;
        BeastInstance beast;
        string shown;
        float spin, idle;

        static Preview Get()
        {
            if (inst) return inst;
            var go = new GameObject("Preview");
            DontDestroyOnLoad(go);
            go.transform.position = new Vector3(0, -500, 0);
            inst = go.AddComponent<Preview>();
            return inst;
        }

        void Awake()
        {
            rt = new RenderTexture(512, 512, 24) { antiAliasing = 4 };
            var camGo = new GameObject("PreviewCamera");
            camGo.transform.SetParent(transform, false);
            cam = camGo.AddComponent<Camera>();
            cam.targetTexture = rt;
            cam.cullingMask = 1 << LAYER;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0, 0, 0, 0);
            cam.fieldOfView = 30;
            cam.nearClipPlane = 0.05f; cam.farClipPlane = 50;
            cam.enabled = false;
            foreach (var (rot, i, c) in new[] { (new Vector3(35, -40, 0), 1.15f, new Color(1, 0.96f, 0.9f)), (new Vector3(10, 150, 0), 0.6f, new Color(0.5f, 0.8f, 1f)) })
            {
                var l = new GameObject("light").AddComponent<Light>();
                l.transform.SetParent(transform, false);
                l.type = LightType.Directional;
                l.transform.rotation = Quaternion.Euler(rot);
                l.intensity = i; l.color = c;
                l.cullingMask = 1 << LAYER;
            }
        }

        // Returns the texture showing this species (null hides it).
        public static Texture Show(string speciesId)
        {
            var p = Get();
            p.Set(speciesId);
            p.idle = 0;
            return p.rt;
        }

        void Set(string id)
        {
            if (id == shown) return;
            shown = id;
            if (beast != null) { beast.Destroy(); beast = null; }
            if (id == null) { cam.enabled = false; return; }
            beast = new BeastInstance(id);
            beast.root.transform.SetParent(transform, false);
            var b = beast.asset.bounds;
            float span = Mathf.Max(b.size.x, b.size.y * 1.3f, b.size.z);
            float k = 1.6f / span;
            beast.root.transform.localScale = Vector3.one * k;
            beast.root.transform.localPosition = new Vector3(0, -b.center.y * k, 0) - new Vector3(0, 0, b.center.z * k);
            beast.SetLayer(LAYER);
            cam.transform.localPosition = new Vector3(0, 0.5f, -3.6f);
            cam.transform.LookAt(transform.position + new Vector3(0, 0.05f, 0));
            cam.enabled = true;
            spin = 200;
        }

        void Update()
        {
            // Stop rendering when no menu has asked for it lately.
            idle += Time.unscaledDeltaTime;
            if (idle > 0.5f && shown != null) Set(null);
            if (beast == null) return;
            spin += Time.deltaTime * 18;
            beast.root.transform.localRotation = Quaternion.Euler(0, spin, 0);
            beast.Update(Time.deltaTime, 0, 0, null);
        }
    }
}

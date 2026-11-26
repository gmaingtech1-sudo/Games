using System.Collections.Generic;
using UnityEngine;

// Small helpers for building the whole game out of Unity's primitive shapes.
public static class Shapes
{
    static readonly Dictionary<Color, Material> cache = new Dictionary<Color, Material>();
    static Material template;

    // One shared material per colour. Copies the default primitive material so it
    // works in the Built-in pipeline and in URP.
    public static Material Mat(Color c)
    {
        Material m;
        if (cache.TryGetValue(c, out m) && m != null) return m;
        if (template == null)
        {
            var tmp = GameObject.CreatePrimitive(PrimitiveType.Cube);
            template = tmp.GetComponent<Renderer>().sharedMaterial;
            Object.DestroyImmediate(tmp);
        }
        m = new Material(template);
        m.color = c;
        cache[c] = m;
        return m;
    }

    public static GameObject Make(PrimitiveType type, Transform parent, Vector3 localPos, Vector3 scale, Color color, bool collider = true)
    {
        var g = GameObject.CreatePrimitive(type);
        g.name = type.ToString();
        g.transform.SetParent(parent, false);
        g.transform.localPosition = localPos;
        g.transform.localScale = scale;
        g.GetComponent<Renderer>().sharedMaterial = Mat(color);
        if (!collider) Object.DestroyImmediate(g.GetComponent<Collider>());
        return g;
    }

    public static GameObject Rot(this GameObject g, float x, float y, float z)
    {
        g.transform.localRotation = Quaternion.Euler(x, y, z);
        return g;
    }

    public static Transform Empty(string name, Transform parent, Vector3 localPos)
    {
        var t = new GameObject(name).transform;
        t.SetParent(parent, false);
        t.localPosition = localPos;
        return t;
    }

    public static void NoShadows(GameObject root)
    {
        foreach (var r in root.GetComponentsInChildren<Renderer>(true))
        {
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
        }
    }
}

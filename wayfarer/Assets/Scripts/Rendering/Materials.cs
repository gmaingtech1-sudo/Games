using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    /// <summary>Loads the game's shaders and makes materials from them.</summary>
    public static class Materials
    {
        static readonly Dictionary<string, Shader> shaders = new Dictionary<string, Shader>();
        static readonly Dictionary<string, Material> shared = new Dictionary<string, Material>();

        public static Shader Get(string name)
        {
            if (shaders.TryGetValue(name, out var s) && s != null) return s;
            s = Shader.Find(name);
            if (s == null)
            {
                Debug.LogError($"Wayfarer: shader '{name}' not found. Make sure Assets/Resources/Shaders was imported.");
                s = Shader.Find("Standard");
            }
            shaders[name] = s;
            return s;
        }

        public static Material New(string shader, string name = null)
        {
            var m = new Material(Get(shader)) { name = name ?? shader };
            return m;
        }

        public static Material Prop(Color color, float metallic = 0.1f, float smoothness = 0.45f, float grime = 0.3f, float panels = 0f)
        {
            var m = New("Wayfarer/Prop");
            m.SetColor("_Color", color);
            m.SetFloat("_Metallic", metallic);
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_Grime", grime);
            m.SetFloat("_Panels", panels);
            m.enableInstancing = true;
            return m;
        }

        public static Material Glow(Color color, float intensity)
        {
            var m = New("Wayfarer/Prop");
            m.SetColor("_Color", color * 0.2f);
            m.SetFloat("_Metallic", 0f);
            m.SetFloat("_Smoothness", 0.6f);
            m.SetFloat("_Grime", 0f);
            m.SetVector("_Emission", (Vector4)(color.linear * intensity));
            m.enableInstancing = true;
            return m;
        }

        public static Material Additive(Color color, float intensity, float soft = 0f, float beam = 0f)
        {
            var m = New("Wayfarer/Additive");
            m.SetVector("_Color", (Vector4)(color.linear * intensity));
            m.SetFloat("_Soft", soft);
            m.SetFloat("_Beam", beam);
            return m;
        }

        public static Material Foliage(Color color, Color emission, float wind, float translucency = 0.3f)
        {
            var m = New("Wayfarer/Foliage");
            m.SetColor("_Color", color);
            m.SetVector("_Emission", (Vector4)emission.linear);
            m.SetFloat("_Wind", wind);
            m.SetFloat("_Translucency", translucency);
            m.enableInstancing = true;
            return m;
        }

        /// <summary>A material shared by name, created once.</summary>
        public static Material Shared(string key, System.Func<Material> make)
        {
            if (shared.TryGetValue(key, out var m) && m != null) return m;
            m = make();
            shared[key] = m;
            return m;
        }
    }

    /// <summary>Procedural meshes the game needs that don't come from Blender.</summary>
    public static class MeshGen
    {
        static Mesh sphere, quad, beam, ring;

        public static Mesh Sphere
        {
            get
            {
                if (sphere != null) return sphere;
                const int lat = 48, lon = 96;
                var verts = new List<Vector3>();
                var norms = new List<Vector3>();
                var uvs = new List<Vector2>();
                var tris = new List<int>();
                for (int y = 0; y <= lat; y++)
                {
                    float v = (float)y / lat;
                    float th = v * Mathf.PI;
                    for (int x = 0; x <= lon; x++)
                    {
                        float u = (float)x / lon;
                        float ph = u * Mathf.PI * 2;
                        var p = new Vector3(Mathf.Sin(th) * Mathf.Cos(ph), Mathf.Cos(th), Mathf.Sin(th) * Mathf.Sin(ph));
                        verts.Add(p); norms.Add(p); uvs.Add(new Vector2(u, 1 - v));
                    }
                }
                for (int y = 0; y < lat; y++)
                    for (int x = 0; x < lon; x++)
                    {
                        int a = y * (lon + 1) + x, b = a + 1, c = a + lon + 1, d = c + 1;
                        tris.Add(a); tris.Add(b); tris.Add(c);
                        tris.Add(b); tris.Add(d); tris.Add(c);
                    }
                sphere = new Mesh { name = "wf sphere" };
                sphere.SetVertices(verts);
                sphere.SetNormals(norms);
                sphere.SetUVs(0, uvs);
                sphere.SetTriangles(tris, 0);
                sphere.RecalculateBounds();
                return sphere;
            }
        }

        public static Mesh Quad
        {
            get
            {
                if (quad != null) return quad;
                quad = new Mesh { name = "wf quad" };
                quad.vertices = new[] { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(-0.5f, 0.5f, 0), new Vector3(0.5f, 0.5f, 0) };
                quad.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1) };
                quad.colors = new[] { Color.white, Color.white, Color.white, Color.white };
                quad.triangles = new[] { 0, 2, 1, 2, 3, 1 };
                quad.RecalculateNormals();
                quad.bounds = new Bounds(Vector3.zero, Vector3.one);
                return quad;
            }
        }

        /// <summary>A unit beam along +Z (0..1), two crossed quads, U across the beam.</summary>
        public static Mesh Beam
        {
            get
            {
                if (beam != null) return beam;
                beam = new Mesh { name = "wf beam" };
                beam.vertices = new[]
                {
                    new Vector3(-0.5f, 0, 0), new Vector3(0.5f, 0, 0), new Vector3(-0.5f, 0, 1), new Vector3(0.5f, 0, 1),
                    new Vector3(0, -0.5f, 0), new Vector3(0, 0.5f, 0), new Vector3(0, -0.5f, 1), new Vector3(0, 0.5f, 1),
                };
                beam.uv = new[]
                {
                    new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1),
                    new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1),
                };
                var c = Color.white;
                beam.colors = new[] { c, c, c, c, c, c, c, c };
                beam.triangles = new[] { 0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5 };
                beam.bounds = new Bounds(new Vector3(0, 0, 0.5f), new Vector3(1, 1, 1));
                return beam;
            }
        }

        /// <summary>A flat annulus in the XZ plane from radius 1 to 2.6 (the shader trims it).</summary>
        public static Mesh Ring
        {
            get
            {
                if (ring != null) return ring;
                const int seg = 128;
                var v = new Vector3[(seg + 1) * 2];
                var uv = new Vector2[v.Length];
                var t = new int[seg * 6];
                for (int i = 0; i <= seg; i++)
                {
                    float a = i * Mathf.PI * 2 / seg;
                    var d = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                    v[i * 2] = d * 1.0f; v[i * 2 + 1] = d * 2.6f;
                    uv[i * 2] = new Vector2(0, i); uv[i * 2 + 1] = new Vector2(1, i);
                }
                for (int i = 0; i < seg; i++)
                {
                    int a = i * 2;
                    t[i * 6] = a; t[i * 6 + 1] = a + 1; t[i * 6 + 2] = a + 2;
                    t[i * 6 + 3] = a + 1; t[i * 6 + 4] = a + 3; t[i * 6 + 5] = a + 2;
                }
                ring = new Mesh { name = "wf ring", vertices = v, uv = uv, triangles = t };
                ring.RecalculateNormals();
                ring.RecalculateBounds();
                return ring;
            }
        }
    }
}

using System.Collections.Generic;
using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Procedural level-building toolkit. Boxes get world-scaled UVs so textures don't stretch, all
    /// structural pieces are registered for vision modes, and meshes are cached and shared.
    /// </summary>
    public static class LevelKit
    {
        static readonly Dictionary<Vector3, Mesh> boxMeshes = new Dictionary<Vector3, Mesh>();

        public static Material Hull => Art.Lit("hull", Art.Hull, 0.35f, 0.4f, null, Art.PanelTexture);
        public static Material HullDark => Art.Lit("hull_dark", Art.HullDark, 0.3f, 0.5f, null, Art.PanelTexture);
        public static Material HullLight => Art.Lit("hull_light", Art.HullLight, 0.45f, 0.3f, null, Art.PanelTexture);
        public static Material Floor => Art.Lit("floor", new Color(0.13f, 0.15f, 0.18f), 0.5f, 0.5f, null, Art.GridTexture);
        public static Material GlowCyan => Art.Lit("glow_cyan", Art.Cyan * 0.4f, 0.8f, 0f, Art.Cyan * 1.6f);
        public static Material GlowBlue => Art.Lit("glow_blue", Art.ElectricBlue * 0.4f, 0.8f, 0f, Art.ElectricBlue * 1.4f);
        public static Material GlowAmber => Art.Lit("glow_amber", Art.Warning * 0.4f, 0.8f, 0f, Art.Warning * 1.4f);
        public static Material GlowRed => Art.Lit("glow_red", Art.Danger * 0.4f, 0.8f, 0f, Art.Danger * 1.3f);
        public static Material GlowViolet => Art.Lit("glow_violet", Art.Violet * 0.4f, 0.8f, 0f, Art.Violet * 1.4f);
        public static Material Screen => Art.Unlit("screen", new Color(0.05f, 0.35f, 0.45f));
        public static Material Glass => Art.Glow("glass", new Color(0.1f, 0.4f, 0.6f, 0.25f));

        public static GameObject Group(string name, Transform parent)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            return go;
        }

        /// <summary>A box with collider and world-scaled UVs.</summary>
        public static GameObject Box(Transform parent, string name, Vector3 center, Vector3 size, Material mat, bool collider = true, bool environment = true)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = center;
            go.AddComponent<MeshFilter>().sharedMesh = BoxMesh(size);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            if (collider) go.AddComponent<BoxCollider>().size = size;
            if (environment) go.AddComponent<VisionTarget>().environment = true;
            return go;
        }

        /// <summary>A Unity primitive with its collider removed unless requested.</summary>
        public static GameObject Primitive(PrimitiveType type, Transform parent, string name, Vector3 pos, Vector3 scale, Material mat, bool collider = false)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            if (!collider) Object.DestroyImmediate(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = scale;
            var r = go.GetComponent<Renderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        public static Light PointLight(Transform parent, Vector3 pos, Color color, float range, float intensity)
        {
            var go = new GameObject("Light");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            var l = go.AddComponent<Light>();
            l.type = LightType.Point;
            l.color = color;
            l.range = range;
            l.intensity = intensity;
            l.shadows = LightShadows.None;
            l.renderMode = LightRenderMode.Auto;
            return l;
        }

        /// <summary>A room shell: floor, ceiling and four walls. <paramref name="openings"/> cut doorways.</summary>
        public static GameObject Room(Transform parent, string name, Vector3 min, Vector3 max, float height, params Opening[] openings)
        {
            return Room(parent, name, min, max, height, true, openings);
        }

        public static GameObject Room(Transform parent, string name, Vector3 min, Vector3 max, float height, bool lightStrips, params Opening[] openings)
        {
            var root = Group(name, parent);
            var t = root.transform;
            Vector3 size = max - min;
            Vector3 c = (min + max) * 0.5f;
            Box(t, "Floor", new Vector3(c.x, min.y - 0.1f, c.z), new Vector3(size.x, 0.2f, size.z), Floor);
            Box(t, "Ceiling", new Vector3(c.x, min.y + height + 0.1f, c.z), new Vector3(size.x, 0.2f, size.z), HullDark);
            Wall(t, Side.South, min, max, height, openings);
            Wall(t, Side.North, min, max, height, openings);
            Wall(t, Side.West, min, max, height, openings);
            Wall(t, Side.East, min, max, height, openings);
            // Light strips along the top of the long walls.
            if (!lightStrips) return root;
            if (size.x >= size.z)
            {
                Box(t, "Strip", new Vector3(c.x, min.y + height - 0.3f, min.z + 0.12f), new Vector3(size.x * 0.8f, 0.08f, 0.05f), GlowBlue, false, false);
                Box(t, "Strip", new Vector3(c.x, min.y + height - 0.3f, max.z - 0.12f), new Vector3(size.x * 0.8f, 0.08f, 0.05f), GlowBlue, false, false);
            }
            else
            {
                Box(t, "Strip", new Vector3(min.x + 0.12f, min.y + height - 0.3f, c.z), new Vector3(0.05f, 0.08f, size.z * 0.8f), GlowBlue, false, false);
                Box(t, "Strip", new Vector3(max.x - 0.12f, min.y + height - 0.3f, c.z), new Vector3(0.05f, 0.08f, size.z * 0.8f), GlowBlue, false, false);
            }
            return root;
        }

        public enum Side { North, South, East, West }

        public struct Opening
        {
            public Side side;
            /// <summary>Centre of the opening along the wall (world x for N/S walls, world z for E/W walls).</summary>
            public float center;
            public float width;
            public float height;
            public Opening(Side side, float center, float width = 2.4f, float height = 3f) { this.side = side; this.center = center; this.width = width; this.height = height; }
        }

        static void Wall(Transform t, Side side, Vector3 min, Vector3 max, float height, Opening[] openings)
        {
            const float thick = 0.3f;
            bool alongX = side == Side.North || side == Side.South;
            float a0 = alongX ? min.x : min.z, a1 = alongX ? max.x : max.z;
            float fixedCoord = side == Side.North ? max.z : side == Side.South ? min.z : side == Side.East ? max.x : min.x;
            // Nudge walls slightly into their own room so two rooms sharing a boundary never produce
            // coplanar (z-fighting) faces.
            const float inset = 0.02f;
            fixedCoord += side == Side.North || side == Side.East ? -inset : inset;
            float y0 = min.y;

            // Collect openings on this side, sorted.
            var cuts = new List<Opening>();
            if (openings != null) foreach (var o in openings) if (o.side == side) cuts.Add(o);
            cuts.Sort((p, q) => p.center.CompareTo(q.center));

            float cursor = a0;
            foreach (var o in cuts)
            {
                float s = o.center - o.width * 0.5f, e = o.center + o.width * 0.5f;
                if (s > cursor) WallPiece(t, alongX, fixedCoord, cursor, s, y0, y0 + height, thick);
                // Lintel above the opening.
                if (o.height < height) WallPiece(t, alongX, fixedCoord, s, e, y0 + o.height, y0 + height, thick);
                // Glowing door frame.
                FramePost(t, alongX, fixedCoord, s, y0, o.height);
                FramePost(t, alongX, fixedCoord, e, y0, o.height);
                cursor = e;
            }
            if (cursor < a1) WallPiece(t, alongX, fixedCoord, cursor, a1, y0, y0 + height, thick);
        }

        static void WallPiece(Transform t, bool alongX, float fixedCoord, float a, float b, float y0, float y1, float thick)
        {
            float len = b - a;
            if (len < 0.01f) return;
            Vector3 center = alongX ? new Vector3((a + b) * 0.5f, (y0 + y1) * 0.5f, fixedCoord) : new Vector3(fixedCoord, (y0 + y1) * 0.5f, (a + b) * 0.5f);
            Vector3 size = alongX ? new Vector3(len, y1 - y0, thick) : new Vector3(thick, y1 - y0, len);
            Box(t, "Wall", center, size, Hull);
        }

        static void FramePost(Transform t, bool alongX, float fixedCoord, float a, float y0, float h)
        {
            Vector3 center = alongX ? new Vector3(a, y0 + h * 0.5f, fixedCoord) : new Vector3(fixedCoord, y0 + h * 0.5f, a);
            Vector3 size = alongX ? new Vector3(0.12f, h, 0.42f) : new Vector3(0.42f, h, 0.12f);
            Box(t, "Frame", center, size, GlowCyan, false, false);
        }

        /// <summary>A world-space sign using a TextMesh. <paramref name="yaw"/> is the direction the sign faces
        /// (towards the reader); TextMesh text is readable when viewed along its +Z, hence the 180° turn.</summary>
        public static TextMesh Sign(Transform parent, string text, Vector3 pos, float yaw, Color color, float size = 0.12f)
        {
            var go = new GameObject("Sign");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localRotation = Quaternion.Euler(0f, yaw + 180f, 0f);
            var tm = go.AddComponent<TextMesh>();
            tm.text = text;
            tm.font = Art.UIFont;
            tm.fontSize = 64;
            tm.characterSize = size * 0.25f;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.alignment = TextAlignment.Center;
            tm.color = color;
            var r = go.GetComponent<MeshRenderer>();
            if (r != null && Art.UIFont != null) r.sharedMaterial = Art.UIFont.material;
            return tm;
        }

        public static Mesh BoxMesh(Vector3 size)
        {
            Vector3 key = new Vector3(Mathf.Round(size.x * 100f), Mathf.Round(size.y * 100f), Mathf.Round(size.z * 100f));
            if (boxMeshes.TryGetValue(key, out var cached) && cached != null) return cached;

            Vector3 h = size * 0.5f;
            const float tile = 2f; // metres per texture repeat
            var v = new List<Vector3>(24); var n = new List<Vector3>(24); var uv = new List<Vector2>(24); var tri = new List<int>(36);
            void Face(Vector3 normal, Vector3 u, Vector3 w, float uLen, float wLen)
            {
                int start = v.Count;
                Vector3 c = Vector3.Scale(normal, h);
                Vector3 hu = u * (uLen * 0.5f), hw = w * (wLen * 0.5f);
                v.Add(c - hu - hw); v.Add(c + hu - hw); v.Add(c + hu + hw); v.Add(c - hu + hw);
                for (int i = 0; i < 4; i++) n.Add(normal);
                uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(uLen / tile, 0)); uv.Add(new Vector2(uLen / tile, wLen / tile)); uv.Add(new Vector2(0, wLen / tile));
                // u x w == normal for every face, so (0,1,2)/(0,2,3) is clockwise seen from outside (Unity front face).
                tri.Add(start); tri.Add(start + 1); tri.Add(start + 2);
                tri.Add(start); tri.Add(start + 2); tri.Add(start + 3);
            }
            Face(Vector3.up, Vector3.right, Vector3.back, size.x, size.z);
            Face(Vector3.down, Vector3.right, Vector3.forward, size.x, size.z);
            Face(Vector3.forward, Vector3.right, Vector3.up, size.x, size.y);
            Face(Vector3.back, Vector3.left, Vector3.up, size.x, size.y);
            Face(Vector3.right, Vector3.back, Vector3.up, size.z, size.y);
            Face(Vector3.left, Vector3.forward, Vector3.up, size.z, size.y);

            var mesh = new Mesh { name = "Box" };
            mesh.SetVertices(v); mesh.SetNormals(n); mesh.SetUVs(0, uv); mesh.SetTriangles(tri, 0);
            mesh.RecalculateBounds();
            boxMeshes[key] = mesh;
            return mesh;
        }
    }
}

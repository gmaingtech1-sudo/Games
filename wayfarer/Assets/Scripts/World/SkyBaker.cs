using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    /// <summary>Paints a star system's sky into a cubemap on arrival.</summary>
    public static class SkyBaker
    {
        public static RenderTexture Bake(StarSystemData sys, int resolution)
        {
            var mat = Materials.New("Wayfarer/SkyBake", "Sky bake");
            var star = sys.Star;
            var r = new Rng(Hash.Mix(star.Seed, 0x5CEE));
            Vector3d core = new Vector3d(-star.GalPos.x, 0, -star.GalPos.z).normalized;
            mat.SetVector("_GalUp", new Vector4(0, 1, 0, 0));
            mat.SetVector("_CoreDir", (Vector3)core);
            mat.SetColor("_Neb1", r.Hsv(0f, 1f, 0.5f, 0.85f, 0.6f, 1f));
            mat.SetColor("_Neb2", r.Hsv(0f, 1f, 0.5f, 0.85f, 0.6f, 1f));
            mat.SetFloat("_NebAmount", r.Range(0.15f, 1.0f));
            mat.SetFloat("_Band", 1f);
            mat.SetFloat("_Seed", r.Range(0f, 100f));

            // the neighbouring stars from the galaxy map, where they really are
            var near = Galaxy.StarsNear(star.GalPos, 400);
            near.Sort((a, b) => Brightness(star, b).CompareTo(Brightness(star, a)));
            var dirs = new Vector4[128];
            var cols = new Vector4[128];
            int n = 0;
            foreach (var s in near)
            {
                if (s == star || n >= 128) continue;
                Vector3d d = (s.GalPos - star.GalPos).normalized;
                float b = Mathf.Clamp((float)Brightness(star, s), 0.05f, 9f);
                dirs[n] = new Vector4((float)d.x, (float)d.y, (float)d.z, b);
                Color c = s.Color.linear;
                cols[n] = new Vector4(c.r, c.g, c.b, 1);
                n++;
            }
            mat.SetVectorArray("_NearStars", dirs);
            mat.SetVectorArray("_NearStarColors", cols);
            mat.SetFloat("_StarCount", n);

            var rt = new RenderTexture(resolution, resolution, 0, RenderTextureFormat.ARGBHalf)
            {
                dimension = TextureDimension.Cube,
                useMipMap = true,
                autoGenerateMips = true,
                name = "Sky " + star.Name,
                filterMode = FilterMode.Trilinear,
            };
            rt.Create();

            var go = new GameObject("Sky baker");
            var cam = go.AddComponent<Camera>();
            cam.enabled = false;
            cam.clearFlags = CameraClearFlags.Skybox;
            cam.cullingMask = 0;
            cam.allowHDR = true;
            cam.allowMSAA = false;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 10f;
            var previous = RenderSettings.skybox;
            RenderSettings.skybox = mat;
            cam.RenderToCubemap(rt, 63);
            RenderSettings.skybox = previous;
            Object.Destroy(go);
            Object.Destroy(mat);
            return rt;
        }

        static double Brightness(StarInfo from, StarInfo s)
        {
            double d = (s.GalPos - from.GalPos).magnitude;
            return s.Luminosity * 2.2 / Mathf.Max(0.5f, (float)(d / 25.0) * (float)(d / 25.0));
        }
    }
}

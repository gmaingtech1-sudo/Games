using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    public sealed class TerrainNode
    {
        public PlanetTerrain Owner;
        public int Face, Level;
        public double A0, B0, Size;
        public Vector3d CenterDir;
        public double CenterHeight;
        public double Arc;
        public TerrainNode Parent;
        public TerrainNode[] Children;

        public GameObject Go;
        public Mesh Mesh;
        public MeshRenderer Renderer;
        public ChunkData Data;
        public ChunkJob Job;
        public bool Shown;
        public int WantedFrame;
        public float LeafSince = -1f;

        public bool Ready => Mesh != null;

        public Vector3d SurfacePos(double radius) => CenterDir * (radius + CenterHeight);
    }

    public sealed class ChunkJob : BackgroundJob
    {
        readonly TerrainNode node;
        readonly PlanetField field;
        ChunkData result;

        public ChunkJob(TerrainNode node, PlanetField field, double priority)
        {
            this.node = node;
            this.field = field;
            Priority = priority;
        }

        public override bool StillWanted() =>
            !Cancelled && !node.Owner.Disposed && node.WantedFrame >= node.Owner.Frame - 3;

        public override void Execute() => result = ChunkBuilder.Build(field, node.Face, node.A0, node.B0, node.Size);

        public override void Complete()
        {
            node.Job = null;
            if (node.Owner.Disposed || result == null) return;
            node.Owner.Attach(node, result);
        }
    }

    /// <summary>A planet's surface as a cube-sphere quadtree. Chunks near the
    /// camera split into finer ones; distant chunks merge back. All chunk
    /// meshes are built on worker threads.</summary>
    public sealed class PlanetTerrain
    {
        public readonly PlanetData Data;
        public readonly PlanetField Field;
        public readonly Transform Root;
        public readonly Material Material;
        public bool Disposed { get; private set; }
        public int Frame { get; private set; }
        public int MaxLevel { get; private set; }
        public double SplitFactor = 2.4;
        public int ShadowLevels = 4;
        public int ChunkCount { get; private set; }
        public bool CastShadows = true;

        readonly TerrainNode[] roots = new TerrainNode[6];
        readonly Stack<GameObject> pool = new Stack<GameObject>();
        readonly MaterialPropertyBlock mpb = new MaterialPropertyBlock();
        Vector3d cam;
        double occluderR, camR, horizonCam, horizonPeak;
        float now;
        static readonly int ChunkCenterId = Shader.PropertyToID("_ChunkCenter");

        public PlanetTerrain(PlanetData data, PlanetField field, Transform root, Material material, double targetSpacing = 0.9)
        {
            Data = data;
            Field = field;
            Root = root;
            Material = material;
            double faceArc = Math.PI * 0.5 * data.Radius;
            MaxLevel = Math.Max(4, (int)Math.Ceiling(Math.Log(faceArc / (CubeSphere.Segments * targetSpacing), 2)));
            for (int f = 0; f < 6; f++) roots[f] = MakeNode(null, f, 0, -1, -1, 2);
        }

        public bool RootsReady
        {
            get
            {
                foreach (var r in roots) if (!r.Ready) return false;
                return true;
            }
        }

        TerrainNode MakeNode(TerrainNode parent, int face, int level, double a0, double b0, double size)
        {
            var n = new TerrainNode
            {
                Owner = this, Parent = parent, Face = face, Level = level, A0 = a0, B0 = b0, Size = size,
                CenterDir = CubeSphere.Direction(face, a0 + size * 0.5, b0 + size * 0.5),
                Arc = CubeSphere.NodeArc(size, Data.Radius),
            };
            n.CenterHeight = parent != null && parent.Data != null ? parent.Data.MinHeight * 0.5 + parent.Data.MaxHeight * 0.5 : 0;
            return n;
        }

        /// <summary>Refine the quadtree around a camera position in planet-local metres.</summary>
        public void Update(Vector3d cameraLocal)
        {
            if (Disposed) return;
            Frame++;
            now = Time.time;
            cam = cameraLocal;
            camR = cam.magnitude;
            occluderR = Data.Radius + Math.Max(Data.MinHeight * 0.35, -500);
            horizonCam = camR > occluderR ? Math.Acos(occluderR / camR) : Math.PI;
            horizonPeak = Math.Acos(Math.Min(1, occluderR / (Data.Radius + Data.MaxHeight)));
            for (int f = 0; f < 6; f++) Visit(roots[f]);
        }

        double Distance(TerrainNode n) => (cam - n.SurfacePos(Data.Radius)).magnitude;

        bool AboveHorizon(TerrainNode n)
        {
            if (camR <= occluderR) return true;
            double c = Vector3d.Dot(cam / camR, n.CenterDir);
            double ang = Math.Acos(MathUtil.Clamp(c, -1, 1));
            double half = n.Arc / Data.Radius * 0.75;
            return ang - half < horizonCam + horizonPeak;
        }

        bool ShouldSplit(TerrainNode n)
        {
            if (n.Level >= MaxLevel) return false;
            double d = Distance(n) - n.Arc * 0.5;
            if (d > n.Arc * SplitFactor) return false;
            return AboveHorizon(n);
        }

        void Visit(TerrainNode n)
        {
            n.WantedFrame = Frame;
            if (ShouldSplit(n))
            {
                if (n.Children == null)
                {
                    double h = n.Size * 0.5;
                    n.Children = new[]
                    {
                        MakeNode(n, n.Face, n.Level + 1, n.A0, n.B0, h),
                        MakeNode(n, n.Face, n.Level + 1, n.A0 + h, n.B0, h),
                        MakeNode(n, n.Face, n.Level + 1, n.A0, n.B0 + h, h),
                        MakeNode(n, n.Face, n.Level + 1, n.A0 + h, n.B0 + h, h),
                    };
                }
                bool allReady = true;
                foreach (var c in n.Children)
                {
                    if (!c.Ready)
                    {
                        allReady = false;
                        c.WantedFrame = Frame;
                        Request(c);
                    }
                }
                if (allReady)
                {
                    SetShown(n, false);
                    n.LeafSince = -1f;
                    foreach (var c in n.Children) Visit(c);
                    return;
                }
            }

            if (n.Ready)
            {
                SetShown(n, true);
                if (n.LeafSince < 0) n.LeafSince = now;
                if (n.Children != null)
                {
                    bool busy = false;
                    foreach (var c in n.Children) if (c.Job != null) busy = true;
                    // children we haven't needed for a while are freed
                    if (!busy && now - n.LeafSince > 12f && !ShouldSplit(n))
                    {
                        foreach (var c in n.Children) Release(c);
                        n.Children = null;
                    }
                    else if (n.Children != null)
                    {
                        foreach (var c in n.Children) HideSubtree(c);
                    }
                }
            }
            else
            {
                Request(n);
            }
        }

        void HideSubtree(TerrainNode n)
        {
            SetShown(n, false);
            if (n.Children != null) foreach (var c in n.Children) HideSubtree(c);
        }

        void SetShown(TerrainNode n, bool shown)
        {
            if (n.Shown == shown) return;
            n.Shown = shown;
            if (n.Renderer != null) n.Renderer.enabled = shown;
        }

        void Request(TerrainNode n)
        {
            if (n.Job != null || n.Ready) return;
            double pri = n.Level * 1e7 + Distance(n);
            n.Job = new ChunkJob(n, Field, pri);
            TerrainJobs.Submit(n.Job);
        }

        internal void Attach(TerrainNode n, ChunkData data)
        {
            n.Data = data;
            n.CenterHeight = (data.Center.magnitude - Data.Radius);
            GameObject go = pool.Count > 0 ? pool.Pop() : null;
            Mesh mesh;
            MeshRenderer mr;
            if (go == null)
            {
                go = new GameObject("chunk");
                go.transform.SetParent(Root, false);
                mesh = new Mesh { name = "terrain chunk" };
                mesh.MarkDynamic();
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = Material;
                mr.receiveShadows = true;
                mr.lightProbeUsage = LightProbeUsage.Off;
                mr.reflectionProbeUsage = ReflectionProbeUsage.Off;
            }
            else
            {
                go.SetActive(true);
                mesh = go.GetComponent<MeshFilter>().sharedMesh;
                mesh.Clear();
                mr = go.GetComponent<MeshRenderer>();
            }
            mesh.vertices = data.Vertices;
            mesh.normals = data.Normals;
            mesh.tangents = data.Tangents;
            mesh.colors32 = data.Colors;
            mesh.triangles = CubeSphere.Triangles;
            mesh.bounds = data.Bounds;
            go.transform.localPosition = (Vector3)data.Center;
            go.transform.localRotation = Quaternion.identity;
            go.transform.localScale = Vector3.one;
            mr.shadowCastingMode = CastShadows && n.Level >= MaxLevel - ShadowLevels ? ShadowCastingMode.On : ShadowCastingMode.Off;
            mpb.SetVector(ChunkCenterId, new Vector4((float)data.Center.x, (float)data.Center.y, (float)data.Center.z, 0));
            mr.SetPropertyBlock(mpb);
            mr.enabled = false;
            n.Shown = false;
            n.Go = go;
            n.Mesh = mesh;
            n.Renderer = mr;
            ChunkCount++;
        }

        void Release(TerrainNode n)
        {
            if (n.Children != null)
            {
                foreach (var c in n.Children) Release(c);
                n.Children = null;
            }
            if (n.Job != null) { n.Job.Cancelled = true; n.Job = null; }
            if (n.Go != null)
            {
                n.Renderer.enabled = false;
                n.Go.SetActive(false);
                if (pool.Count < 256) pool.Push(n.Go);
                else
                {
                    UnityEngine.Object.Destroy(n.Mesh);
                    UnityEngine.Object.Destroy(n.Go);
                }
                ChunkCount--;
            }
            n.Go = null; n.Mesh = null; n.Renderer = null; n.Data = null; n.Shown = false;
        }

        /// <summary>Re-evaluates which chunks cast shadows after a settings change.</summary>
        public void RefreshShadowModes()
        {
            void Walk(TerrainNode n)
            {
                if (n.Renderer != null)
                    n.Renderer.shadowCastingMode = CastShadows && n.Level >= MaxLevel - ShadowLevels ? ShadowCastingMode.On : ShadowCastingMode.Off;
                if (n.Children != null) foreach (var c in n.Children) Walk(c);
            }
            foreach (var r in roots) Walk(r);
        }

        /// <summary>Finds the finest ready chunk under a direction and returns the mesh
        /// height there (interpolated), so feet line up with what is drawn.</summary>
        public bool TryMeshHeight(Vector3d dir, out double height)
        {
            height = 0;
            CubeSphere.FaceCoords(dir, out int face, out double a, out double b);
            TerrainNode n = roots[face];
            if (!n.Ready) return false;
            while (n.Children != null)
            {
                double h = n.Size * 0.5;
                int ci = (a >= n.A0 + h ? 1 : 0) + (b >= n.B0 + h ? 2 : 0);
                var c = n.Children[ci];
                if (!c.Ready || !c.Shown && !AnyShownBelow(c)) break;
                n = c;
            }
            var data = n.Data;
            if (data == null) return false;
            const int S = CubeSphere.Segments;
            double fx = (a - n.A0) / n.Size * S, fy = (b - n.B0) / n.Size * S;
            int ix = Mathf.Clamp((int)Math.Floor(fx), 0, S - 1), iy = Mathf.Clamp((int)Math.Floor(fy), 0, S - 1);
            double tx = MathUtil.Clamp01(fx - ix), ty = MathUtil.Clamp01(fy - iy);
            int k = iy * CubeSphere.Side + ix;
            Vector3d p00 = data.Center + (Vector3d)data.Vertices[k];
            Vector3d p10 = data.Center + (Vector3d)data.Vertices[k + 1];
            Vector3d p01 = data.Center + (Vector3d)data.Vertices[k + CubeSphere.Side];
            Vector3d p11 = data.Center + (Vector3d)data.Vertices[k + CubeSphere.Side + 1];
            // same diagonal split as the triangles (a, b, c) / (a, c, d)
            double r;
            if (tx >= ty) r = p00.magnitude + (p10.magnitude - p00.magnitude) * tx + (p11.magnitude - p10.magnitude) * ty;
            else r = p00.magnitude + (p01.magnitude - p00.magnitude) * ty + (p11.magnitude - p01.magnitude) * tx;
            height = r - Data.Radius;
            return true;
        }

        static bool AnyShownBelow(TerrainNode n)
        {
            if (n.Shown) return true;
            if (n.Children == null) return false;
            foreach (var c in n.Children) if (AnyShownBelow(c)) return true;
            return false;
        }

        public void Dispose()
        {
            if (Disposed) return;
            Disposed = true;
            TerrainJobs.CancelWhere(j => j is ChunkJob cj && cj.StillWanted() == false);
            foreach (var r in roots) Release(r);
            while (pool.Count > 0)
            {
                var go = pool.Pop();
                var mf = go.GetComponent<MeshFilter>();
                if (mf != null) UnityEngine.Object.Destroy(mf.sharedMesh);
                UnityEngine.Object.Destroy(go);
            }
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Wayfarer
{
    public enum FloraKind { Tree, Rock, SmallRock, Plant, Grass, Deposit, Crystal, ResourcePlant }

    /// <summary>A kind of plant or rock on one planet.</summary>
    public sealed class FloraSpecies
    {
        public int Index;
        public string Model;
        public FloraKind Kind;
        public Models.MeshPart Lod0, Lod1;
        public Material[] Mats;
        public float ScaleMin = 0.8f, ScaleMax = 1.2f;
        public float Radius;          // collision radius at scale 1
        public float Height;          // model height at scale 1
        public string Resource;
        public int YieldMin, YieldMax;
        public float Toughness;       // seconds of mining at scale 1
        public bool Collides;
        public string Name;           // procedural species name
        public string DiscoveryId;
        public bool Scannable;
        public float Weight = 1f;
    }

    public struct FloraHit
    {
        public FloraSystem.Cell Cell;
        public int Index;
        public FloraSpecies Species;
        public double Distance;
        public Vector3d Point;        // planet-local
    }

    public struct Obstacle
    {
        public Vector3d Base;          // planet-local
        public Vector3d Up;
        public float Radius;
        public float Height;
    }

    /// <summary>Plants, trees, rocks and resource deposits around the player,
    /// scattered by worker threads and drawn with GPU instancing.</summary>
    public sealed class FloraSystem
    {
        public sealed class Instance
        {
            public int Species;
            public Vector3 Pos;       // relative to cell centre (planet-local axes)
            public Quaternion Rot;
            public float Scale;
            public Color Tint;
            public bool Alive = true;
            public float Damage;
        }

        public sealed class Cell
        {
            public long Key;
            public int Layer;
            public int Face;
            public double A0, B0, Size;
            public Vector3d Center;   // planet-local
            public float Radius;
            public List<Instance> Items;
            public BackgroundJob Job;
            public int WantedFrame;
            public bool Ready => Items != null;
            public Matrix4x4[] World0, World1;
            public int Version = -1;
        }

        readonly PlanetBody planet;
        readonly PlanetData data;
        readonly PlanetField field;
        public readonly List<FloraSpecies> Species = new List<FloraSpecies>();
        readonly Dictionary<long, Cell> cells = new Dictionary<long, Cell>();
        readonly int[] layerLevel = new int[3];
        readonly float[] layerRange = new float[3];
        float density;
        int frame;
        bool disposed;
        GraphicsQuality quality;

        // draw lists: [species][lod] -> matrices, with and without shadows
        List<Matrix4x4>[,] drawLists;
        List<Matrix4x4>[,] drawListsNoShadow;
        readonly Matrix4x4[] buffer = new Matrix4x4[1023];
        readonly MaterialPropertyBlock[] blocks;
        readonly List<Vector4>[] tintLists;
        readonly List<Vector4>[] tintListsNoShadow;
        readonly Vector4[] tintBuffer = new Vector4[1023];
        readonly Plane[] frustum = new Plane[6];
        static readonly int TintId = Shader.PropertyToID("_Tint");

        public int InstanceCount { get; private set; }

        public FloraSystem(PlanetBody planet, GraphicsQuality q)
        {
            this.planet = planet;
            data = planet.Data;
            field = planet.Field;
            BuildSpecies();
            int n = Species.Count;
            drawLists = new List<Matrix4x4>[n, 2];
            drawListsNoShadow = new List<Matrix4x4>[n, 2];
            blocks = new MaterialPropertyBlock[n * 4];
            tintLists = new List<Vector4>[n * 2];
            tintListsNoShadow = new List<Vector4>[n * 2];
            for (int i = 0; i < n; i++)
                for (int l = 0; l < 2; l++)
                {
                    drawLists[i, l] = new List<Matrix4x4>();
                    drawListsNoShadow[i, l] = new List<Matrix4x4>();
                    tintLists[i * 2 + l] = new List<Vector4>();
                    tintListsNoShadow[i * 2 + l] = new List<Vector4>();
                }
            for (int i = 0; i < blocks.Length; i++) blocks[i] = new MaterialPropertyBlock();
            double faceArc = Math.PI * 0.5 * data.Radius;
            layerLevel[0] = Mathf.Clamp((int)Math.Round(Math.Log(faceArc / 300.0, 2)), 1, 20);
            layerLevel[1] = Mathf.Clamp((int)Math.Round(Math.Log(faceArc / 75.0, 2)), 1, 20);
            layerLevel[2] = Mathf.Clamp((int)Math.Round(Math.Log(faceArc / 36.0, 2)), 1, 20);
            ApplyQuality(q);
        }

        public void ApplyQuality(GraphicsQuality q)
        {
            quality = q;
            layerRange[0] = q.FloraDistance;
            layerRange[1] = q.SmallFloraDistance;
            layerRange[2] = q.GrassDistance;
            density = q.FloraDensity;
        }

        // ───────────────────────────── species ─────────────────────────────
        void BuildSpecies()
        {
            var r = new Rng(Hash.Mix(data.Seed, 0xF10A));
            void Add(string model, FloraKind kind, float weight, string resource, int ymin, int ymax, float tough, float smin, float smax)
            {
                var lod0 = Models.Part(model, 0);
                if (lod0 == null) return;
                var lod1 = Models.Part(model, 1) ?? lod0;
                var b = Models.PartBounds(lod0);
                var s = new FloraSpecies
                {
                    Index = Species.Count, Model = model, Kind = kind, Lod0 = lod0, Lod1 = lod1,
                    ScaleMin = smin, ScaleMax = smax, Resource = resource, YieldMin = ymin, YieldMax = ymax, Toughness = tough,
                    Height = b.size.y,
                    Weight = weight,
                };
                switch (kind)
                {
                    case FloraKind.Tree: s.Radius = Mathf.Max(0.35f, Mathf.Min(b.size.x, b.size.z) * 0.07f); s.Collides = true; break;
                    case FloraKind.Rock: s.Radius = Mathf.Min(b.size.x, b.size.z) * 0.42f; s.Collides = true; break;
                    case FloraKind.Deposit: s.Radius = Mathf.Min(b.size.x, b.size.z) * 0.45f; s.Collides = true; break;
                    case FloraKind.Crystal: s.Radius = Mathf.Min(b.size.x, b.size.z) * 0.4f; s.Collides = true; break;
                    default: s.Radius = Mathf.Max(0.25f, Mathf.Min(b.size.x, b.size.z) * 0.35f); s.Collides = false; break;
                }
                var sr = new Rng(Hash.Mix(data.Seed, Hash.String(model)));
                s.Name = NameGen.Species(Hash.Mix(data.Seed, Hash.String(model)));
                s.DiscoveryId = "flora:" + data.Seed + ":" + model;
                s.Scannable = kind == FloraKind.Tree || kind == FloraKind.Plant || kind == FloraKind.ResourcePlant || kind == FloraKind.Crystal || kind == FloraKind.Deposit;
                s.Mats = new Material[lod0.Slots.Length];
                for (int i = 0; i < s.Mats.Length; i++) s.Mats[i] = MaterialFor(model, kind, lod0.Slots[i], sr);
                Species.Add(s);
            }

            foreach (var m in data.TreeModels) Add(m, FloraKind.Tree, 1f, "carbon", 18, 32, 2.2f, 0.65f, 1.35f);
            foreach (var m in data.RockModels)
            {
                if (m == "rock_small") Add(m, FloraKind.SmallRock, 1f, "ferrite", 6, 12, 0.8f, 0.6f, 1.5f);
                else Add(m, FloraKind.Rock, 1f, "ferrite", 22, 45, 2.8f, 0.5f, 2.4f);
            }
            foreach (var m in data.PlantModels)
            {
                if (m == "grass") Add(m, FloraKind.Grass, 1f, null, 0, 0, 0.3f, 0.7f, 1.35f);
                else Add(m, FloraKind.Plant, m == "flower" ? 0.6f : 1f, "carbon", 3, 7, 0.6f, 0.7f, 1.35f);
            }
            string metal = data.HasUranium && r.Chance(0.6) ? "uranium" : Items.MetalId(data.Metal);
            Add("ore_deposit", FloraKind.Deposit, 1f, metal, 16, 30, 4.5f, 0.8f, 1.5f);
            Add("crystal_hydrogen", FloraKind.Crystal, 1f, "hydrogen", 20, 36, 2.0f, 0.8f, 1.6f);
            Add("plant_sodium", FloraKind.ResourcePlant, 1f, "sodium", 10, 20, 1.0f, 0.8f, 1.3f);
            Add("plant_oxygen", FloraKind.ResourcePlant, 1f, "oxygen", 10, 18, 1.0f, 0.8f, 1.3f);
        }

        Material MaterialFor(string model, FloraKind kind, string slot, Rng r)
        {
            float wind = kind == FloraKind.Tree ? 1f : kind == FloraKind.Grass ? 6f : kind == FloraKind.Plant || kind == FloraKind.ResourcePlant ? 3f : 0f;
            Color c; Color emit = Color.black;
            switch (slot)
            {
                case "Bark": c = data.Bark; break;
                case "Leaf": c = data.Leaf; break;
                case "Leaf2": c = data.Leaf2; break;
                case "Stone": c = kind == FloraKind.Deposit ? data.Rock2 * 0.8f : data.Stone; break;
                case "Crystal":
                    c = model == "crystal_hydrogen" ? new Color(0.35f, 0.62f, 1f) : data.Crystal;
                    emit = c * 0.9f;
                    break;
                case "Glow":
                    if (model == "plant_sodium") c = new Color(1f, 0.82f, 0.2f);
                    else if (model == "plant_oxygen") c = new Color(1f, 0.32f, 0.18f);
                    else if (kind == FloraKind.Deposit)
                    {
                        var metal = Items.Get(data.HasUranium ? "uranium" : Items.MetalId(data.Metal));
                        c = metal != null ? metal.Color : Color.white;
                    }
                    else c = data.Glow;
                    emit = c * 2.2f;
                    break;
                default: c = data.Leaf; break;
            }
            if (model == "plant_oxygen" && slot == "Leaf2") c = new Color(0.78f, 0.16f, 0.12f);
            var m = Materials.Foliage(c, emit, wind, kind == FloraKind.Tree || kind == FloraKind.Plant || kind == FloraKind.Grass ? 0.35f : 0f);
            m.SetFloat("_Smoothness", slot == "Crystal" ? 0.85f : slot == "Stone" ? 0.12f : 0.22f);
            return m;
        }

        // ───────────────────────────── cells ──────────────────────────────
        static long MakeKey(int face, int level, long i, long j) => ((long)face << 60) | ((long)level << 54) | (i << 27) | j;

        /// <summary>Call every frame with the camera position in planet-local metres.</summary>
        public void Update(Vector3d camLocal, Camera cam, Matrix4x4 planetToWorld)
        {
            if (disposed) return;
            frame++;
            if (frame % 8 == 1)
            {
                for (int layer = 0; layer < 3; layer++)
                {
                    if (layerRange[layer] <= 1f) continue;
                    for (int f = 0; f < 6; f++) Visit(camLocal, layer, f, 0, -1, -1, 2);
                }
                // drop cells nobody wants any more
                List<long> dead = null;
                foreach (var kv in cells)
                    if (kv.Value.WantedFrame < frame - 40)
                    {
                        (dead ??= new List<long>()).Add(kv.Key);
                        if (kv.Value.Job != null) kv.Value.Job.Cancelled = true;
                    }
                if (dead != null) foreach (var k in dead) cells.Remove(k);
            }
            Draw(camLocal, cam, planetToWorld);
        }

        void Visit(Vector3d cam, int layer, int face, int level, double a0, double b0, double size)
        {
            var dir = CubeSphere.Direction(face, a0 + size * 0.5, b0 + size * 0.5);
            double arc = CubeSphere.NodeArc(size, data.Radius);
            Vector3d center = dir * data.Radius;
            double reach = layerRange[layer] + arc * 0.8 + Math.Max(data.MaxHeight, 200);
            if ((center - cam).magnitude > reach) return;
            if (level < layerLevel[layer])
            {
                double h = size * 0.5;
                Visit(cam, layer, face, level + 1, a0, b0, h);
                Visit(cam, layer, face, level + 1, a0 + h, b0, h);
                Visit(cam, layer, face, level + 1, a0, b0 + h, h);
                Visit(cam, layer, face, level + 1, a0 + h, b0 + h, h);
                return;
            }
            // leaf: a scatter cell
            double exactCenterH = 0;
            long cells1 = 1L << level;
            long i = (long)Math.Floor((a0 + 1) / 2 * cells1 + 0.5), j = (long)Math.Floor((b0 + 1) / 2 * cells1 + 0.5);
            long key = MakeKey(face, level, i, j) ^ ((long)layer << 52);
            if (!cells.TryGetValue(key, out var cell))
            {
                cell = new Cell { Key = key, Layer = layer, Face = face, A0 = a0, B0 = b0, Size = size, Center = dir * (data.Radius + exactCenterH), Radius = (float)(arc * 0.75) };
                cells[key] = cell;
            }
            double dist = (cell.Center - cam).magnitude - arc * 0.6;
            if (dist > layerRange[layer]) return;
            cell.WantedFrame = frame;
            if (cell.Items == null && cell.Job == null)
            {
                var job = new ScatterJob(this, cell, dist + layer * 50);
                cell.Job = job;
                TerrainJobs.Submit(job);
            }
        }

        sealed class ScatterJob : BackgroundJob
        {
            readonly FloraSystem owner;
            readonly Cell cell;
            List<Instance> result;
            Vector3d center;

            public ScatterJob(FloraSystem owner, Cell cell, double priority)
            {
                this.owner = owner;
                this.cell = cell;
                Priority = 5e6 + priority;
            }

            public override bool StillWanted() => !Cancelled && !owner.disposed && cell.WantedFrame >= owner.frame - 24;

            public override void Execute() => result = owner.Scatter(cell, out center);

            public override void Complete()
            {
                cell.Job = null;
                if (owner.disposed) return;
                cell.Center = center;
                cell.Items = result;
            }
        }

        /// <summary>Worker thread: pick points in a cell and decide what grows there.</summary>
        List<Instance> Scatter(Cell cell, out Vector3d center)
        {
            var d = data;
            var list = new List<Instance>();
            var rng = new Rng(Hash.Mix(d.Seed, (ulong)cell.Key));
            int grid = cell.Layer == 0 ? 15 : cell.Layer == 1 ? 13 : 18;
            var cdir = CubeSphere.Direction(cell.Face, cell.A0 + cell.Size * 0.5, cell.B0 + cell.Size * 0.5);
            center = cdir * (d.Radius + field.Height(cdir));
            double step = cell.Size / grid;
            double sea = d.HasSea ? d.SeaLevel : -1e9;
            float dens = density;
            double rich = d.ResourceRichness;

            // which species belong to this layer
            var pool = new List<FloraSpecies>();
            foreach (var s in Species)
            {
                bool big = s.Kind == FloraKind.Tree || s.Kind == FloraKind.Rock || s.Kind == FloraKind.Deposit || s.Kind == FloraKind.Crystal;
                bool grass = s.Kind == FloraKind.Grass;
                int layer = big ? 0 : grass ? 2 : 1;
                if (layer == cell.Layer) pool.Add(s);
            }
            if (pool.Count == 0) return list;

            for (int gy = 0; gy < grid; gy++)
                for (int gx = 0; gx < grid; gx++)
                {
                    double a = cell.A0 + (gx + rng.Next()) * step;
                    double b = cell.B0 + (gy + rng.Next()) * step;
                    var dir = CubeSphere.Direction(cell.Face, a, b);
                    double roll = rng.Next();
                    double pick = rng.Next();
                    // cheap early-out before touching the height field
                    if (roll > 0.72) continue;
                    double h = field.Height(dir.x, dir.y, dir.z);
                    field.Climate(dir.x, dir.y, dir.z, h, out double moist, out double temp, out double vari);
                    Vector3d normal = dir;
                    double slope = 0;
                    if (cell.Layer != 2)
                    {
                        normal = field.Normal(dir);
                        slope = 1.0 - Vector3d.Dot(normal, dir);
                    }
                    bool under = h < sea + 0.4;
                    bool snow = h > d.SnowLine + 60;
                    double forest = MathUtil.SmoothStep(0.3, 0.72, moist + (vari - 0.5) * 0.7);
                    double dry = MathUtil.SmoothStep(0.1, 0.55, temp - moist + 0.2);

                    FloraSpecies chosen = null;
                    double p = 0;
                    // weigh each candidate species for this spot, then roll
                    double total = 0;
                    var weights = new double[pool.Count];
                    for (int k = 0; k < pool.Count; k++)
                    {
                        var s = pool[k];
                        double w = 0;
                        switch (s.Kind)
                        {
                            case FloraKind.Tree:
                                if (under || slope > 0.32) break;
                                w = s.Model == "cactus" || s.Model == "tree_dead" ? 0.1 + 0.25 * dry : 0.45 * forest;
                                if (s.Model == "tree_palm") w *= MathUtil.SmoothStep(0.45, 0.75, temp) * (1.0 - MathUtil.SmoothStep(20, 160, h - sea) * 0.7);
                                if (s.Model == "tree_conifer") w *= 0.4 + 0.8 * (1 - temp);
                                if (snow) w *= 0.15;
                                w *= d.FloraDensity * dens;
                                break;
                            case FloraKind.Rock:
                                w = (0.035 + slope * 0.3) * (under ? 0.4 : 1.0);
                                if (s.Model == "rock_spire") w *= 0.35;
                                break;
                            case FloraKind.Deposit:
                                w = under ? 0 : 0.0065 * rich;
                                break;
                            case FloraKind.Crystal:
                                w = under ? 0 : 0.011 * rich * (d.Type == PlanetType.Frozen ? 1.6 : 1.0);
                                break;
                            case FloraKind.SmallRock:
                                w = 0.05 + slope * 0.1;
                                break;
                            case FloraKind.Plant:
                                if (under || snow || slope > 0.4) break;
                                w = 0.32 * MathUtil.SmoothStep(0.15, 0.6, moist) * d.FloraDensity * dens * s.Weight;
                                break;
                            case FloraKind.ResourcePlant:
                                if (under || slope > 0.45) break;
                                w = (s.Model == "plant_oxygen" ? 0.011 * (0.4 + moist) : 0.012) * rich;
                                break;
                            case FloraKind.Grass:
                                if (under || snow || slope > 0.35) break;
                                w = 0.95 * MathUtil.SmoothStep(0.18, 0.55, moist) * d.GrassDensity * (1 - dry * 0.6);
                                break;
                        }
                        weights[k] = w;
                        total += w;
                    }
                    if (total <= 1e-6) continue;
                    // probability that anything grows here = min(1, total); which one is proportional to weight
                    if (roll > Math.Min(0.72, total)) continue;
                    double acc = 0;
                    for (int k = 0; k < pool.Count; k++)
                    {
                        acc += weights[k] / total;
                        if (pick <= acc) { chosen = pool[k]; break; }
                    }
                    if (chosen == null) continue;
                    p = rng.Next();

                    Vector3d pos = dir * (d.Radius + h);
                    Vector3d upv = chosen.Kind == FloraKind.Rock || chosen.Kind == FloraKind.SmallRock || chosen.Kind == FloraKind.Deposit
                        ? (normal * 0.7 + dir * 0.3).normalized
                        : (dir * 0.92 + normal * 0.08).normalized;
                    var up = (Vector3)upv;
                    var rot = Quaternion.AngleAxis((float)(p * 360.0), up) * Quaternion.FromToRotation(Vector3.up, up);
                    float scale = Mathf.Lerp(chosen.ScaleMin, chosen.ScaleMax, (float)Math.Pow(rng.Next(), chosen.Kind == FloraKind.Rock ? 2.2 : 1.0));
                    float tv = (float)(0.85 + 0.3 * vari);
                    var tint = new Color(tv * (float)(0.95 + 0.1 * rng.Next()), tv, tv * (float)(0.95 + 0.1 * rng.Next()), 1);
                    list.Add(new Instance
                    {
                        Species = chosen.Index,
                        Pos = (Vector3)(pos - center) - up * (chosen.Kind == FloraKind.Tree ? 0.25f : 0.05f) * scale,
                        Rot = rot,
                        Scale = scale,
                        Tint = tint,
                    });
                }
            return list;
        }

        // ───────────────────────────── drawing ────────────────────────────
        void Draw(Vector3d camLocal, Camera cam, Matrix4x4 planetToWorld)
        {
            int n = Species.Count;
            for (int i = 0; i < n; i++)
                for (int l = 0; l < 2; l++)
                {
                    drawLists[i, l].Clear(); drawListsNoShadow[i, l].Clear();
                    tintLists[i * 2 + l].Clear(); tintListsNoShadow[i * 2 + l].Clear();
                }
            GeometryUtility.CalculateFrustumPlanes(cam, frustum);
            float shadowDist = quality.Shadows > 0 ? quality.ShadowDistance * 0.8f : -1f;
            int count = 0;
            foreach (var cell in cells.Values)
            {
                if (cell.Items == null || cell.WantedFrame < frame - 16) continue;
                double dist = (cell.Center - camLocal).magnitude;
                if (dist - cell.Radius > layerRange[cell.Layer]) continue;
                Vector3 wc = planetToWorld.MultiplyPoint3x4((Vector3)cell.Center);
                float r = cell.Radius + 30f;
                if (!GeometryUtility.TestPlanesAABB(frustum, new Bounds(wc, new Vector3(r, r, r) * 2f))) continue;
                int lod = cell.Layer == 0 && dist > 380 ? 1 : 0;
                bool shadows = dist - cell.Radius < shadowDist && cell.Layer != 2;
                if (cell.Version != planet.MatrixVersion || cell.World0 == null || cell.World0.Length != cell.Items.Count)
                    RebuildMatrices(cell, planetToWorld);
                var arr = lod == 1 ? cell.World1 : cell.World0;
                var items = cell.Items;
                for (int k = 0; k < items.Count; k++)
                {
                    var it = items[k];
                    if (!it.Alive) continue;
                    if (shadows) { drawLists[it.Species, lod].Add(arr[k]); tintLists[it.Species * 2 + lod].Add(it.Tint); }
                    else { drawListsNoShadow[it.Species, lod].Add(arr[k]); tintListsNoShadow[it.Species * 2 + lod].Add(it.Tint); }
                    count++;
                }
            }
            InstanceCount = count;
            for (int i = 0; i < n; i++)
            {
                var s = Species[i];
                for (int l = 0; l < 2; l++)
                {
                    var part = l == 1 ? s.Lod1 : s.Lod0;
                    Submit(part, s, drawLists[i, l], tintLists[i * 2 + l], ShadowCastingMode.On, cam, i * 4 + l * 2);
                    Submit(part, s, drawListsNoShadow[i, l], tintListsNoShadow[i * 2 + l], ShadowCastingMode.Off, cam, i * 4 + l * 2 + 1);
                }
            }
        }

        void RebuildMatrices(Cell cell, Matrix4x4 planetToWorld)
        {
            int n = cell.Items.Count;
            cell.World0 = new Matrix4x4[n];
            cell.World1 = new Matrix4x4[n];
            Matrix4x4 cellM = planetToWorld * Matrix4x4.Translate((Vector3)cell.Center);
            for (int k = 0; k < n; k++)
            {
                var it = cell.Items[k];
                var s = Species[it.Species];
                var trs = cellM * Matrix4x4.TRS(it.Pos, it.Rot, new Vector3(it.Scale, it.Scale, it.Scale));
                cell.World0[k] = trs * s.Lod0.Local;
                cell.World1[k] = trs * s.Lod1.Local;
            }
            cell.Version = planet.MatrixVersion;
        }

        void Submit(Models.MeshPart part, FloraSpecies s, List<Matrix4x4> list, List<Vector4> tints, ShadowCastingMode shadows, Camera cam, int blockIndex)
        {
            if (list.Count == 0) return;
            var mpb = blocks[blockIndex];
            int subs = Mathf.Min(part.Mesh.subMeshCount, s.Mats.Length);
            for (int i = 0; i < list.Count; i += 1023)
            {
                int c = Mathf.Min(1023, list.Count - i);
                list.CopyTo(i, buffer, 0, c);
                tints.CopyTo(i, tintBuffer, 0, c);
                mpb.SetVectorArray(TintId, tintBuffer);
                for (int sm = 0; sm < subs; sm++)
                    Graphics.DrawMeshInstanced(part.Mesh, sm, s.Mats[sm], buffer, c, mpb, shadows, true, 0, cam);
            }
        }

        // ──────────────────────────── queries ─────────────────────────────
        /// <summary>Things you can bump into near a point (planet-local).</summary>
        public void Obstacles(Vector3d pos, double radius, List<Obstacle> result)
        {
            result.Clear();
            foreach (var cell in cells.Values)
            {
                if (cell.Items == null || cell.Layer == 2) continue;
                if ((cell.Center - pos).magnitude > cell.Radius + radius + 20) continue;
                foreach (var it in cell.Items)
                {
                    if (!it.Alive) continue;
                    var s = Species[it.Species];
                    if (!s.Collides) continue;
                    Vector3d b = cell.Center + (Vector3d)it.Pos;
                    double rr = s.Radius * it.Scale + radius;
                    if ((b - pos).sqrMagnitude > (rr + s.Height * it.Scale) * (rr + s.Height * it.Scale)) continue;
                    result.Add(new Obstacle { Base = b, Up = (Vector3d)(it.Rot * Vector3.up), Radius = s.Radius * it.Scale, Height = s.Height * it.Scale });
                }
            }
        }

        /// <summary>First plant or rock hit by a ray (planet-local).</summary>
        public bool Raycast(Vector3d origin, Vector3d dir, double maxDist, out FloraHit hit, bool includeSmall = true)
        {
            hit = default;
            double best = maxDist;
            bool found = false;
            foreach (var cell in cells.Values)
            {
                if (cell.Items == null || cell.Layer == 2) continue;
                if (!includeSmall && cell.Layer == 1) continue;
                // cell bounding sphere vs ray
                Vector3d oc = cell.Center - origin;
                double t = Vector3d.Dot(oc, dir);
                double dsq = oc.sqrMagnitude - t * t;
                double cr = cell.Radius + 30;
                if (dsq > cr * cr || t < -cr || t - cr > maxDist) continue;
                for (int i = 0; i < cell.Items.Count; i++)
                {
                    var it = cell.Items[i];
                    if (!it.Alive) continue;
                    var s = Species[it.Species];
                    Vector3d b = cell.Center + (Vector3d)it.Pos;
                    Vector3d up = (Vector3d)(it.Rot * Vector3.up);
                    double h = s.Height * it.Scale;
                    double r = s.Kind == FloraKind.Tree ? Math.Max(s.Radius * it.Scale * 2.2, 0.5) : Math.Max(s.Radius * it.Scale, 0.3);
                    if (s.Kind == FloraKind.Tree) h *= 0.55; // trunk and lower canopy
                    if (RayCapsule(origin, dir, b, b + up * Math.Max(h - r, 0.01), r, out double tt) && tt < best)
                    {
                        best = tt;
                        found = true;
                        hit = new FloraHit { Cell = cell, Index = i, Species = s, Distance = tt, Point = origin + dir * tt };
                    }
                }
            }
            return found;
        }

        static bool RayCapsule(Vector3d ro, Vector3d rd, Vector3d a, Vector3d b, double r, out double t)
        {
            // closest approach between the ray and segment ab, refined with a sphere test
            Vector3d ab = b - a;
            Vector3d ao = ro - a;
            double abab = Vector3d.Dot(ab, ab);
            double abrd = Vector3d.Dot(ab, rd);
            double abao = Vector3d.Dot(ab, ao);
            double rdao = Vector3d.Dot(rd, ao);
            double denom = abab - abrd * abrd;
            double s = denom > 1e-9 ? MathUtil.Clamp01((abao - abrd * rdao) / denom) : 0.0;
            // iterate once: best ray t for that point, then best segment point for that t
            Vector3d p = a + ab * s;
            double tr = Vector3d.Dot(p - ro, rd);
            if (abab > 1e-9) s = MathUtil.Clamp01(Vector3d.Dot(ro + rd * tr - a, ab) / abab);
            p = a + ab * s;
            if (!MathUtil.RaySphere(ro, rd, p, r, out t, out double t1)) return false;
            if (t >= 0) return true;
            if (t1 >= 0) { t = 0; return true; } // starting inside
            return false;
        }

        /// <summary>Mine an instance. Returns true when it breaks.</summary>
        public bool Mine(FloraHit hit, float amount)
        {
            if (hit.Cell?.Items == null || hit.Index >= hit.Cell.Items.Count) return false;
            var it = hit.Cell.Items[hit.Index];
            if (!it.Alive) return false;
            it.Damage += amount;
            if (it.Damage >= hit.Species.Toughness * Mathf.Max(0.6f, it.Scale))
            {
                it.Alive = false;
                return true;
            }
            return false;
        }

        public float MineProgress(FloraHit hit)
        {
            if (hit.Cell?.Items == null || hit.Index >= hit.Cell.Items.Count) return 0f;
            var it = hit.Cell.Items[hit.Index];
            return Mathf.Clamp01(it.Damage / (hit.Species.Toughness * Mathf.Max(0.6f, it.Scale)));
        }

        public Vector3d InstancePos(FloraHit hit) => hit.Cell.Center + (Vector3d)hit.Cell.Items[hit.Index].Pos;
        public float InstanceScale(FloraHit hit) => hit.Cell.Items[hit.Index].Scale;

        /// <summary>Nearby resources for the scanner (planet-local positions).</summary>
        public void Resources(Vector3d pos, double radius, List<(Vector3d pos, FloraSpecies species)> result)
        {
            result.Clear();
            foreach (var cell in cells.Values)
            {
                if (cell.Items == null || cell.Layer == 2) continue;
                if ((cell.Center - pos).magnitude > radius + cell.Radius) continue;
                foreach (var it in cell.Items)
                {
                    if (!it.Alive) continue;
                    var s = Species[it.Species];
                    if (s.Kind != FloraKind.Deposit && s.Kind != FloraKind.Crystal && s.Kind != FloraKind.ResourcePlant) continue;
                    var p = cell.Center + (Vector3d)it.Pos;
                    if ((p - pos).magnitude <= radius) result.Add((p, s));
                }
            }
        }

        public int CellCount => cells.Count;

        public void Dispose()
        {
            disposed = true;
            foreach (var c in cells.Values) if (c.Job != null) c.Job.Cancelled = true;
            cells.Clear();
            foreach (var s in Species) foreach (var m in s.Mats) if (m != null) UnityEngine.Object.Destroy(m);
        }
    }
}

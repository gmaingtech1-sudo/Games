using UnityEngine;

namespace BodyOS
{
    /// <summary>Collectable resource or item. Resources are collected on contact; key items via INTERACT.</summary>
    public sealed class Pickup : Interactable
    {
        public string itemId = "nanites";
        public int amount = 5;
        public bool autoCollect = true;
        public int xp;
        Transform visual;
        Vector3 basePos;
        float phase;

        public override string Prompt => "COLLECT";
        string PickedFlag => "picked." + id;

        public static Pickup Create(Transform parent, string id, string itemId, int amount, Vector3 pos, bool autoCollect = true, bool hidden = false)
        {
            var root = new GameObject("Pickup_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            var p = root.AddComponent<Pickup>();
            p.id = id; p.itemId = itemId; p.amount = amount; p.autoCollect = autoCollect;
            p.interactRange = 2.2f;
            p.focusOffset = new Vector3(0f, 0.5f, 0f);
            var def = Game.I != null ? Game.I.Content.Item(itemId) : null;
            p.displayName = def != null ? def.displayName : itemId;
            Color c = def != null ? def.color : Art.Cyan;
            var mat = Art.Lit("pickup_" + itemId, c * 0.5f, 0.8f, 0.2f, c * 1.6f);
            if (itemId == "power_cell")
            {
                p.visual = LevelKit.Primitive(PrimitiveType.Cylinder, root.transform, "Cell", new Vector3(0f, 0.5f, 0f), new Vector3(0.28f, 0.3f, 0.28f), mat).transform;
                LevelKit.Primitive(PrimitiveType.Cube, p.visual, "Cap", new Vector3(0f, 1.05f, 0f), new Vector3(0.8f, 0.15f, 0.8f), LevelKit.HullLight);
                LevelKit.PointLight(root.transform, new Vector3(0f, 0.8f, 0f), c, 3.5f, 1.2f);
            }
            else
            {
                p.visual = LevelKit.Primitive(PrimitiveType.Cube, root.transform, "Shard", new Vector3(0f, 0.5f, 0f), new Vector3(0.25f, 0.4f, 0.25f), mat).transform;
                p.visual.localRotation = Quaternion.Euler(45f, 0f, 45f);
            }
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false; vt.heat = itemId == "power_cell" ? 0.9f : 0.2f;
            vt.scan = ScanCategory.Collectable;
            vt.hidden = hidden;
            if (hidden) { vt.anomaly = true; }
            p.basePos = p.visual.localPosition;
            p.phase = Random.value * 6f;
            return p;
        }

        void Start()
        {
            if (Game.I != null && Game.I.HasFlag(PickedFlag)) Destroy(gameObject);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f || visual == null) return;
            phase += dt;
            visual.localPosition = basePos + Vector3.up * (Mathf.Sin(phase * 2f) * 0.08f);
            visual.Rotate(0f, 60f * dt, 0f, Space.World);

            var g = Game.I;
            if (autoCollect && g != null && g.InGame && g.Player != null && IsAvailable &&
                (g.Player.transform.position + Vector3.up * 0.5f - transform.position).sqrMagnitude < 1.3f * 1.3f)
                Collect();
        }

        protected override void OnInteract() { Collect(); }

        void Collect()
        {
            var g = Game.I;
            if (g.HasFlag(PickedFlag)) return;
            g.SetFlag(PickedFlag);
            g.Inventory.Add(itemId, amount);
            if (xp > 0) g.Progression.AddXp(xp, "discovery");
            AudioManager.I?.Play(Sfx.Pickup);
            Destroy(gameObject);
        }
    }
}

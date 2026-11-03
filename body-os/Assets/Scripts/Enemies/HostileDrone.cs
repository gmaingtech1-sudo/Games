using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Malfunctioning maintenance drone. Patrols, chases nearby players, and deals contact damage.
    /// Detected by Threat Detection, glows in thermal vision and can be slowed by Time Distortion.
    /// </summary>
    public sealed class HostileDrone : Interactable, IThreat, ITimeScalable
    {
        public Vector3[] patrol = new Vector3[0];
        public float speed = 2.4f;
        public float chaseRadius = 6f;
        public float leash = 10f;
        public float damage = 12f;
        int patrolIndex;
        float hitCooldown, bob;
        Vector3 home;
        Transform ring;

        public Vector3 Position => transform.position;
        public string ThreatName => "Maintenance Drone MK-II";
        public bool IsActiveThreat => isActiveAndEnabled;
        public float LocalTimeScale { get; set; } = 1f;
        public override bool HasUseAction => false;

        public static HostileDrone Create(Transform parent, string id, Vector3 pos, Vector3[] patrol)
        {
            var root = new GameObject("Drone_" + id);
            root.transform.SetParent(parent, false);
            root.transform.localPosition = pos;
            var d = root.AddComponent<HostileDrone>();
            d.id = id; d.displayName = "Maintenance Drone";
            d.patrol = patrol; d.home = pos;
            d.focusOffset = Vector3.zero;
            d.interactRange = 6f;
            d.interference = 0.5f;
            d.scanDifficulty = 1.2f;
            d.scanXp = 25;
            d.scanText = "Maintenance Drone MK-II. Firmware corrupted by an unknown signal; it treats organic life as debris. Contact discharge: 12 damage. Its servos can be slowed by temporal distortion.";
            var shell = Art.Lit("drone_shell", new Color(0.5f, 0.52f, 0.55f), 0.6f, 0.7f);
            LevelKit.Primitive(PrimitiveType.Sphere, root.transform, "Body", Vector3.zero, new Vector3(0.7f, 0.55f, 0.7f), shell);
            LevelKit.Primitive(PrimitiveType.Sphere, root.transform, "Eye", new Vector3(0f, 0.02f, 0.3f), new Vector3(0.25f, 0.25f, 0.12f), LevelKit.GlowRed);
            d.ring = LevelKit.Primitive(PrimitiveType.Cylinder, root.transform, "Ring", Vector3.zero, new Vector3(1.1f, 0.02f, 1.1f), LevelKit.GlowRed).transform;
            LevelKit.PointLight(root.transform, new Vector3(0f, 0.3f, 0.4f), Art.Danger, 3.5f, 1.2f);
            var vt = root.AddComponent<VisionTarget>();
            vt.environment = false; vt.heat = 1f; vt.scan = ScanCategory.Hostile;
            return d;
        }

        protected override void OnEnable() { base.OnEnable(); Registry<IThreat>.Add(this); Registry<ITimeScalable>.Add(this); }
        protected override void OnDisable() { base.OnDisable(); Registry<IThreat>.Remove(this); Registry<ITimeScalable>.Remove(this); }

        protected override void OnInteract() { }

        void Update()
        {
            var g = Game.I;
            if (g == null || !g.InGame || g.Player == null) return;
            float dt = Time.deltaTime * LocalTimeScale;
            if (dt <= 0f) return;
            bob += dt;
            ring.Rotate(0f, 240f * dt, 0f);

            Vector3 pos = transform.position;
            Vector3 player = g.Player.transform.position + Vector3.up * 1.0f;
            Vector3 target;
            bool chasing = (player - pos).sqrMagnitude < chaseRadius * chaseRadius && (player - home).sqrMagnitude < leash * leash;
            if (chasing) target = player;
            else if (patrol.Length > 0)
            {
                target = patrol[patrolIndex];
                if ((target - pos).sqrMagnitude < 0.3f) patrolIndex = (patrolIndex + 1) % patrol.Length;
            }
            else target = home;

            target.y = home.y + Mathf.Sin(bob * 2f) * 0.15f;
            Vector3 next = Vector3.MoveTowards(pos, target, speed * (chasing ? 1.15f : 1f) * dt);
            Vector3 look = target - pos; look.y = 0f;
            if (look.sqrMagnitude > 0.01f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(look), 5f * dt);
            transform.position = next;

            if (hitCooldown > 0f) hitCooldown -= dt;
            else if ((player - next).sqrMagnitude < 1.2f * 1.2f)
            {
                hitCooldown = 1.3f;
                Vector3 push = (player - next); push.y = 0f;
                push = push.sqrMagnitude > 0.01f ? push.normalized * 7f : Vector3.forward * 7f;
                g.Player.Knockback(push + Vector3.up * 4f);
                AudioManager.I?.Play(Sfx.Damage);
                Game.Vibrate();
                g.Vitals.Damage(damage, "drone discharge");
            }
        }
    }
}

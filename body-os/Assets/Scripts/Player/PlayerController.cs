using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Third-person CharacterController movement driven by BODY.OS stats:
    /// speed and jump height come from BodySystem, gravity from the environment and reality abilities.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerController : MonoBehaviour
    {
        public const int PlayerLayer = 2; // built-in "Ignore Raycast": keeps the camera and scans from hitting the player
        const float BaseGravity = 20f;
        const float CoyoteTime = 0.12f;
        const float JumpBuffer = 0.15f;

        CharacterController cc;
        PlayerAvatar avatar;
        public ThirdPersonCamera Cam { get; private set; }
        public PlayerInteractor Interactor { get; private set; }

        Vector3 planarVelocity;
        float verticalVelocity;
        float coyote;
        bool wasGrounded;
        float stepDistance;
        Vector3 spawnPoint;
        float pushNoticeCooldown;

        public float Yaw { get; private set; }
        public bool IsGrounded => cc != null && cc.isGrounded;
        public Vector3 SafePosition { get; private set; }
        public float PlanarSpeed => planarVelocity.magnitude;

        public static PlayerController Spawn(Vector3 position, float yaw)
        {
            var go = new GameObject("Player");
            go.layer = PlayerLayer;
            go.transform.position = position;
            var cc = go.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0f, 0.9f, 0f);
            cc.stepOffset = 0.35f;
            cc.slopeLimit = 50f;
            cc.skinWidth = 0.04f;
            cc.minMoveDistance = 0f;

            var pc = go.AddComponent<PlayerController>();
            pc.avatar = PlayerAvatar.Build(go.transform);
            pc.Interactor = go.AddComponent<PlayerInteractor>();
            pc.Cam = ThirdPersonCamera.Create(pc.transform, yaw);
            pc.Yaw = yaw;
            pc.spawnPoint = position;
            pc.SafePosition = position;
            go.transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            return pc;
        }

        void Awake() { cc = GetComponent<CharacterController>(); }

        void OnDestroy()
        {
            if (Cam != null) Destroy(Cam.gameObject);
        }

        void Update()
        {
            var g = Game.I;
            if (g == null || !g.InGame) return;
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            // ----- Horizontal movement relative to the camera
            Vector2 input = MobileInput.Move;
            Vector3 fwd = Cam != null ? Cam.PlanarForward : Vector3.forward;
            Vector3 right = new Vector3(fwd.z, 0f, -fwd.x);
            Vector3 wish = fwd * input.y + right * input.x;
            float mag = Mathf.Clamp01(wish.magnitude);
            if (mag > 0.001f) wish /= wish.magnitude;

            float speed = g.Body.BaseMoveSpeed * g.Vitals.LowPowerSpeedMultiplier * g.Environment.SpeedMultiplier;
            Vector3 target = wish * speed * mag;
            float accel = cc.isGrounded ? 12f : 4f;
            planarVelocity = Vector3.Lerp(planarVelocity, target, 1f - Mathf.Exp(-accel * dt));

            // ----- Gravity and jumping
            float gravity = BaseGravity * Mathf.Max(0.05f, g.Environment.Gravity) * g.Reality.GravityMultiplier;
            bool grounded = cc.isGrounded;
            if (grounded)
            {
                coyote = CoyoteTime;
                if (verticalVelocity < 0f) verticalVelocity = -2f;
            }
            else coyote -= dt;

            if (MobileInput.ConsumeJump(JumpBuffer) && coyote > 0f)
            {
                // v = sqrt(2 g0 h): the BODY.OS jump height is defined at standard gravity, so low gravity
                // (zones or the Reduced Gravity ability) naturally lets the player jump higher.
                verticalVelocity = Mathf.Sqrt(2f * BaseGravity * g.Body.BaseJumpHeight);
                coyote = 0f;
                MobileInput.ClearJump();
                g.Vitals.AddEnergy(-0.4f * g.Body.ConsumptionMultiplier);
                AudioManager.I?.Play(Sfx.Jump, 0.6f);
                g.SetFlag("jumped");
            }

            verticalVelocity = Mathf.Max(verticalVelocity - gravity * dt, -40f);

            Vector3 motion = (planarVelocity + g.Environment.Drift) * dt + Vector3.up * verticalVelocity * dt;
            var flags = cc.Move(motion);
            if ((flags & CollisionFlags.Above) != 0 && verticalVelocity > 0f) verticalVelocity = 0f;

            bool nowGrounded = cc.isGrounded;
            if (nowGrounded && !wasGrounded && verticalVelocity < -1f) AudioManager.I?.Play(Sfx.Land, 0.5f);
            wasGrounded = nowGrounded;

            // ----- Facing
            float planar = planarVelocity.magnitude;
            if (planar > 0.2f)
            {
                float targetYaw = Mathf.Atan2(planarVelocity.x, planarVelocity.z) * Mathf.Rad2Deg;
                Yaw = Mathf.MoveTowardsAngle(Yaw, targetYaw, 720f * dt);
                transform.rotation = Quaternion.Euler(0f, Yaw, 0f);
            }

            // ----- Bookkeeping
            g.Vitals.PlayerMoving = planar > 0.5f && mag > 0.05f;
            if (nowGrounded && !g.Environment.IsDamaging) SafePosition = transform.position;
            if (!g.HasFlag("moved") && (transform.position - spawnPoint).sqrMagnitude > 9f) g.SetFlag("moved");

            if (nowGrounded && planar > 0.5f)
            {
                stepDistance += planar * dt;
                if (stepDistance > 2.1f) { stepDistance = 0f; AudioManager.I?.Play(Sfx.Footstep, 0.35f, Random.Range(0.9f, 1.1f)); }
            }

            if (transform.position.y < -15f)
            {
                Teleport(SafePosition + Vector3.up * 0.2f, Yaw);
                g.Vitals.Damage(10f, "fall");
            }

            if (pushNoticeCooldown > 0f) pushNoticeCooldown -= dt;
            avatar?.Animate(planar, nowGrounded, verticalVelocity, dt);
        }

        void OnControllerColliderHit(ControllerColliderHit hit)
        {
            if (hit.moveDirection.y < -0.3f) return; // standing on top
            var crate = hit.collider.GetComponent<PushableCrate>();
            if (crate == null || Game.I == null) return;
            Vector3 dir = new Vector3(hit.moveDirection.x, 0f, hit.moveDirection.z);
            if (!crate.TryPush(dir, planarVelocity.magnitude, Game.I.Body.Strength, out string reason) && pushNoticeCooldown <= 0f)
            {
                pushNoticeCooldown = 3f;
                if (!string.IsNullOrEmpty(reason)) GameEvents.Notify(reason, NoticeType.Warning);
            }
        }

        public void Teleport(Vector3 position, float yaw)
        {
            cc.enabled = false;
            transform.position = position;
            cc.enabled = true;
            planarVelocity = Vector3.zero;
            verticalVelocity = 0f;
            Yaw = yaw;
            transform.rotation = Quaternion.Euler(0f, yaw, 0f);
            SafePosition = position;
            if (Cam != null) Cam.Snap(yaw);
        }

        public void Knockback(Vector3 impulse)
        {
            planarVelocity = new Vector3(impulse.x, 0f, impulse.z);
            verticalVelocity = Mathf.Max(verticalVelocity, impulse.y);
        }
    }
}

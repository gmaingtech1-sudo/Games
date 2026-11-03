using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Smooth orbiting third-person camera. A sphere cast from the pivot pulls the camera in front of
    /// walls (fast in, slow out) so it doesn't clip through geometry.
    /// </summary>
    public sealed class ThirdPersonCamera : MonoBehaviour
    {
        public Camera Camera { get; private set; }
        Transform target;
        float yaw, pitch = 14f;
        float distance = 4.2f, currentDistance = 4.2f;
        Vector3 pivot, pivotVelocity;
        const float MinPitch = -35f, MaxPitch = 65f;
        const float PivotHeight = 1.55f;
        const float ShoulderOffset = 0.35f;
        static readonly int CollisionMask = ~((1 << PlayerController.PlayerLayer) | (1 << 5));

        public Vector3 PlanarForward
        {
            get
            {
                var f = transform.forward; f.y = 0f;
                return f.sqrMagnitude > 0.0001f ? f.normalized : Vector3.forward;
            }
        }

        public static ThirdPersonCamera Create(Transform target, float yaw)
        {
            var go = new GameObject("PlayerCamera");
            go.tag = "MainCamera";
            var cam = go.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.01f, 0.015f, 0.03f);
            cam.nearClipPlane = 0.08f;
            cam.farClipPlane = 140f;
            cam.fieldOfView = 62f;
            cam.allowHDR = false;
            var tpc = go.AddComponent<ThirdPersonCamera>();
            tpc.Camera = cam;
            tpc.target = target;
            tpc.Snap(yaw);
            return tpc;
        }

        public void Snap(float newYaw)
        {
            yaw = newYaw;
            pitch = 14f;
            pivot = target.position + Vector3.up * PivotHeight;
            pivotVelocity = Vector3.zero;
            currentDistance = distance;
            Place(1f);
        }

        void LateUpdate()
        {
            if (target == null) return;
            var g = Game.I;
            float dt = Time.deltaTime;
            if (g == null || dt <= 0f) return;

            Vector2 look = MobileInput.ConsumeLook();
            float sens = 0.16f * g.Settings.cameraSensitivity;
            yaw += look.x * sens;
            pitch += (g.Settings.invertCamera ? 1f : -1f) * look.y * sens;
            pitch = Mathf.Clamp(pitch, MinPitch, MaxPitch);

            pivot = Vector3.SmoothDamp(pivot, target.position + Vector3.up * PivotHeight, ref pivotVelocity, 0.06f, Mathf.Infinity, dt);
            Place(dt);
        }

        void Place(float dt)
        {
            Quaternion rot = Quaternion.Euler(pitch, yaw, 0f);
            Vector3 offset = rot * new Vector3(ShoulderOffset, 0f, -distance);
            float wanted = offset.magnitude;
            Vector3 dir = offset / wanted;

            float allowed = wanted;
            if (Physics.SphereCast(pivot, 0.22f, dir, out RaycastHit hit, wanted, CollisionMask, QueryTriggerInteraction.Ignore))
                allowed = Mathf.Max(0.4f, hit.distance - 0.05f);

            // Pull in immediately when blocked, ease back out smoothly.
            currentDistance = allowed < currentDistance ? allowed : Mathf.MoveTowards(currentDistance, allowed, 5f * dt);
            transform.position = pivot + dir * currentDistance;
            transform.rotation = Quaternion.LookRotation(pivot + rot * new Vector3(ShoulderOffset, 0f, 0f) - transform.position, Vector3.up);
        }
    }
}

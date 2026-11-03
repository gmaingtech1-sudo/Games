using UnityEngine;

namespace BodyOS
{
    /// <summary>Slow drifting motion for debris in low-gravity areas.</summary>
    public sealed class FloatingDebris : MonoBehaviour
    {
        Vector3 basePos;
        float phase;
        void Start() { basePos = transform.localPosition; phase = basePos.x * 1.7f + basePos.z; }
        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f) return;
            phase += dt * 0.6f;
            transform.localPosition = basePos + new Vector3(0f, Mathf.Sin(phase) * 0.25f, 0f);
            transform.Rotate(8f * dt, 12f * dt, 0f);
        }
    }
}

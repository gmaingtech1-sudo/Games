using UnityEngine;
using UnityEngine.EventSystems;

namespace BodyOS
{
    /// <summary>Drag anywhere on the right side of the screen to orbit the camera.</summary>
    public sealed class TouchLookArea : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        int pointerId = int.MinValue;

        public void OnPointerDown(PointerEventData e)
        {
            if (pointerId == int.MinValue) pointerId = e.pointerId;
        }

        public void OnDrag(PointerEventData e)
        {
            if (e.pointerId != pointerId) return;
            // Normalise by screen height so sensitivity feels the same on every resolution.
            float scale = 900f / Mathf.Max(1f, Screen.height);
            MobileInput.AddLook(e.delta * scale);
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (e.pointerId == pointerId) pointerId = int.MinValue;
        }

        void OnDisable() { pointerId = int.MinValue; }
    }
}

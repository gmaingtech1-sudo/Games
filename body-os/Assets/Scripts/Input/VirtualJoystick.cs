using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;

namespace BodyOS
{
    /// <summary>
    /// Floating virtual joystick: the base appears where the thumb touches inside the zone. Supports
    /// multi-touch alongside the look area because each control tracks its own pointer id.
    /// </summary>
    public sealed class VirtualJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        static readonly List<VirtualJoystick> all = new List<VirtualJoystick>();

        public RectTransform baseRect;
        public RectTransform knob;
        public float radius = 110f;
        public float deadZone = 0.12f;

        RectTransform zone;
        int pointerId = int.MinValue;
        Vector2 restPosition;
        bool hasRest;

        void Awake() { zone = (RectTransform)transform; }

        /// <summary>Captures the resting position lazily (fields are assigned after AddComponent).</summary>
        void EnsureRest()
        {
            if (hasRest || baseRect == null) return;
            restPosition = baseRect.anchoredPosition;
            hasRest = true;
        }

        void OnEnable() { all.Add(this); }
        void OnDisable() { all.Remove(this); Release(); }

        public static void ReleaseAll() { for (int i = 0; i < all.Count; i++) all[i].Release(); }

        public void OnPointerDown(PointerEventData e)
        {
            if (pointerId != int.MinValue || MobileInput.Blocked) return;
            EnsureRest();
            pointerId = e.pointerId;
            if (RectTransformUtility.ScreenPointToLocalPointInRectangle(zone, e.position, e.pressEventCamera, out var local))
                baseRect.anchoredPosition = local;
            knob.anchoredPosition = Vector2.zero;
            SetAlpha(1f);
            OnDrag(e);
        }

        public void OnDrag(PointerEventData e)
        {
            if (e.pointerId != pointerId) return;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(zone, e.position, e.pressEventCamera, out var local)) return;
            Vector2 offset = Vector2.ClampMagnitude(local - baseRect.anchoredPosition, radius);
            knob.anchoredPosition = offset;
            Vector2 v = offset / radius;
            float mag = v.magnitude;
            float sens = Game.I != null ? Game.I.Settings.controlSensitivity : 1f;
            if (mag < deadZone) v = Vector2.zero;
            else
            {
                // Remap past the dead zone, then apply the control sensitivity curve.
                float m = Mathf.Clamp01((mag - deadZone) / (1f - deadZone));
                m = Mathf.Clamp01(Mathf.Pow(m, 1f / sens));
                v = v / mag * m;
            }
            MobileInput.JoystickMove = v;
        }

        public void OnPointerUp(PointerEventData e)
        {
            if (e.pointerId == pointerId) Release();
        }

        void Release()
        {
            EnsureRest();
            pointerId = int.MinValue;
            MobileInput.JoystickMove = Vector2.zero;
            if (knob != null) knob.anchoredPosition = Vector2.zero;
            if (baseRect != null) baseRect.anchoredPosition = restPosition;
            SetAlpha(0.45f);
        }

        void SetAlpha(float a)
        {
            var g = baseRect != null ? baseRect.GetComponent<CanvasGroup>() : null;
            if (g != null) g.alpha = a;
        }
    }
}

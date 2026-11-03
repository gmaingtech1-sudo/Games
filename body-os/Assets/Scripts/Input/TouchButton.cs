using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace BodyOS
{
    /// <summary>Gameplay button that fires on press (not release) for responsive mobile controls.</summary>
    public sealed class TouchButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        public Action onPress;
        public Action onRelease;
        public bool interactable = true;
        Vector3 baseScale = Vector3.one;
        bool held;

        void Awake() { baseScale = transform.localScale; }

        public void OnPointerDown(PointerEventData e)
        {
            if (!interactable) return;
            held = true;
            transform.localScale = baseScale * 0.92f;
            onPress?.Invoke();
        }

        public void OnPointerUp(PointerEventData e) { Up(); }

        void Up()
        {
            if (!held) return;
            held = false;
            transform.localScale = baseScale;
            onRelease?.Invoke();
        }

        void OnDisable() { Up(); }
    }
}

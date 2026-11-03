using UnityEngine;

namespace BodyOS
{
    /// <summary>Keeps its RectTransform inside Screen.safeArea (notches, rounded corners, gesture bars).</summary>
    [RequireComponent(typeof(RectTransform))]
    public sealed class SafeArea : MonoBehaviour
    {
        Rect last;
        Vector2Int lastSize;
        float timer;

        void OnEnable() { Apply(); }

        void Update()
        {
            timer -= Time.unscaledDeltaTime;
            if (timer > 0f) return;
            timer = 0.5f;
            if (Screen.safeArea != last || lastSize.x != Screen.width || lastSize.y != Screen.height) Apply();
        }

        void Apply()
        {
            var rt = (RectTransform)transform;
            Rect safe = Screen.safeArea;
            last = safe;
            lastSize = new Vector2Int(Screen.width, Screen.height);
            if (Screen.width <= 0 || Screen.height <= 0) return;
            // Keep a small minimum margin even on screens without cut-outs.
            const float minMargin = 12f;
            float xMin = Mathf.Max(safe.xMin, minMargin), yMin = Mathf.Max(safe.yMin, minMargin * 0.5f);
            float xMax = Mathf.Min(safe.xMax, Screen.width - minMargin), yMax = Mathf.Min(safe.yMax, Screen.height - minMargin * 0.5f);
            rt.anchorMin = new Vector2(xMin / Screen.width, yMin / Screen.height);
            rt.anchorMax = new Vector2(xMax / Screen.width, yMax / Screen.height);
            rt.offsetMin = rt.offsetMax = Vector2.zero;
        }
    }
}

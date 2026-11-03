using UnityEngine;

namespace BodyOS
{
    /// <summary>Small unscaled-time tweens (menus animate while gameplay is paused).</summary>
    public sealed class UIAnim : MonoBehaviour
    {
        float t, duration = 0.18f;
        CanvasGroup group;
        Vector3 from = new Vector3(0.94f, 0.94f, 1f);

        public static void PopIn(RectTransform rt, float duration = 0.18f)
        {
            var a = rt.GetComponent<UIAnim>();
            if (a == null) a = rt.gameObject.AddComponent<UIAnim>();
            a.duration = duration;
            a.t = 0f;
            a.group = rt.GetComponent<CanvasGroup>();
            if (a.group == null) a.group = rt.gameObject.AddComponent<CanvasGroup>();
            a.enabled = true;
            a.Step();
        }

        void Update()
        {
            t += Time.unscaledDeltaTime;
            Step();
            if (t >= duration) enabled = false;
        }

        void Step()
        {
            float k = Mathf.Clamp01(t / duration);
            float e = 1f - (1f - k) * (1f - k);
            transform.localScale = Vector3.LerpUnclamped(from, Vector3.one, e);
            if (group != null) group.alpha = e;
        }
    }
}

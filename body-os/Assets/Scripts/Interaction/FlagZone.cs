using UnityEngine;

namespace BodyOS
{
    /// <summary>Position-polled trigger volume that sets a story flag and/or discovers a location.</summary>
    public sealed class FlagZone : MonoBehaviour
    {
        public Vector3 size = new Vector3(4, 4, 4);
        public string flag = "";
        public string locationId = "";
        public string message = "";
        bool done;

        public static FlagZone Create(Transform parent, string name, Vector3 center, Vector3 size, string flag, string location = "", string message = "")
        {
            var go = new GameObject("Zone_" + name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = center;
            var z = go.AddComponent<FlagZone>();
            z.size = size; z.flag = flag; z.locationId = location; z.message = message;
            return z;
        }

        void OnEnable() { Registry<FlagZone>.Add(this); }
        void OnDisable() { Registry<FlagZone>.Remove(this); }

        public void Check(Vector3 p)
        {
            if (done) return;
            if (!new Bounds(transform.position, size).Contains(p)) return;
            var g = Game.I;
            done = true;
            if (!string.IsNullOrEmpty(locationId)) g.Progression.Discover(locationId);
            if (!string.IsNullOrEmpty(flag) && !g.HasFlag(flag))
            {
                g.SetFlag(flag);
                if (!string.IsNullOrEmpty(message)) GameEvents.Notify(message, NoticeType.Story);
            }
        }

#if UNITY_EDITOR
        void OnDrawGizmos()
        {
            Gizmos.color = new Color(0.2f, 0.9f, 1f, 0.25f);
            Gizmos.DrawWireCube(transform.position, size);
        }
#endif
    }
}

using UnityEngine;

namespace BodyOS
{
    public enum Atmosphere { Safe = 0, Thin = 1, Toxic = 2 }

    /// <summary>Environmental conditions of an area. All values are fictional gameplay mechanics.</summary>
    [System.Serializable]
    public struct ZoneConditions
    {
        public string name;
        [Tooltip("Degrees Celsius (fictional).")] public float temperature;
        public Atmosphere atmosphere;
        [Range(0, 3)] public int radiation;
        [Tooltip("Gravity multiplier. 1 = ship standard.")] public float gravity;
        [Tooltip("Lateral push from unusual gravity, in m/s.")] public Vector3 drift;

        public static ZoneConditions ShipStandard => new ZoneConditions { name = "Ship standard", temperature = 19f, atmosphere = Atmosphere.Safe, radiation = 0, gravity = 1f };

        /// <summary>Cold severity 0..3 derived from temperature.</summary>
        public int ColdSeverity => temperature < -120f ? 3 : temperature < -60f ? 2 : temperature < -15f ? 1 : 0;
        public int ToxicSeverity => atmosphere == Atmosphere.Toxic ? 2 : atmosphere == Atmosphere.Thin ? 1 : 0;
        public bool IsHazardous => ColdSeverity > 0 || ToxicSeverity > 0 || radiation > 0;
    }

    /// <summary>
    /// An axis-aligned hazard volume. Zones are polled by position (no physics triggers), which is cheap
    /// and deterministic. Overlapping zones: the one with the highest priority wins.
    /// </summary>
    public sealed class HazardZone : MonoBehaviour
    {
        public ZoneConditions conditions = ZoneConditions.ShipStandard;
        public Vector3 size = new Vector3(5, 4, 5);
        public int priority;

        public Bounds WorldBounds => new Bounds(transform.position, size);

        void OnEnable() { Registry<HazardZone>.Add(this); }
        void OnDisable() { Registry<HazardZone>.Remove(this); }

#if UNITY_EDITOR
        void OnDrawGizmos()
        {
            Gizmos.color = new Color(1f, 0.5f, 0.1f, 0.3f);
            Gizmos.DrawWireCube(transform.position, size);
        }
#endif
    }
}

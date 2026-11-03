using UnityEngine;

namespace BodyOS
{
    /// <summary>Hostile creatures register here; Threat Detection determines what the HUD can report.</summary>
    public interface IThreat
    {
        Vector3 Position { get; }
        string ThreatName { get; }
        bool IsActiveThreat { get; }
    }

    /// <summary>
    /// Threat detection (a fictional brain mechanic). Polled at 5 Hz. The radius scales with the
    /// Threat Detection attribute; at 7+ the HUD also shows the hostile's direction.
    /// </summary>
    public sealed class ThreatSystem
    {
        readonly Game game;
        public ThreatSystem(Game game) { this.game = game; }

        public IThreat Nearest { get; private set; }
        public float Distance { get; private set; }
        public Vector3 Direction { get; private set; }
        public bool Detected => Nearest != null;
        bool wasDetected;

        public void Poll()
        {
            Nearest = null;
            if (game.Player == null) return;
            Vector3 p = game.Player.transform.position;
            float radius = game.Body.ThreatRadius;
            float best = radius * radius;
            var items = Registry<IThreat>.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var t = items[i];
                if (!t.IsActiveThreat) continue;
                float d = (t.Position - p).sqrMagnitude;
                if (d < best) { best = d; Nearest = t; }
            }
            if (Nearest != null)
            {
                Vector3 delta = Nearest.Position - p;
                Distance = delta.magnitude;
                Direction = delta / Mathf.Max(0.001f, Distance);
                if (!wasDetected)
                {
                    AudioManager.I?.Play(Sfx.Threat);
                    GameEvents.Notify("THREAT DETECTED: " + Nearest.ThreatName, NoticeType.Danger);
                    game.SetFlag("threat.detected");
                }
            }
            wasDetected = Nearest != null;
        }
    }
}

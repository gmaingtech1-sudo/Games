using UnityEngine;

namespace BodyOS
{
    public enum InteractAction { None, Use, Scan }

    /// <summary>
    /// Picks the best interactable near the player (10 Hz), drives the single INTERACT button, and runs
    /// the scanner analysis, including Concentration-based interference and Analysis-based cost/time.
    /// </summary>
    public sealed class PlayerInteractor : MonoBehaviour
    {
        public Interactable Focus { get; private set; }
        public InteractAction Action { get; private set; }

        public bool Scanning => scanTarget != null;
        public float ScanProgress => scanDuration > 0f ? Mathf.Clamp01(scanElapsed / scanDuration) : 0f;
        public Interactable ScanTarget => scanTarget;

        Interactable scanTarget;
        float scanElapsed, scanDuration, interferenceTimer, pollTimer;

        void Update()
        {
            var g = Game.I;
            if (g == null || !g.InGame) return;
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            pollTimer -= dt;
            if (pollTimer <= 0f) { pollTimer = 0.1f; ChooseFocus(g); }

            if (MobileInput.ConsumeInteract()) Activate(g);
            if (scanTarget != null) UpdateScan(g, dt);
        }

        void ChooseFocus(Game g)
        {
            bool scanner = g.Vision.Current == VisionModeId.Scanner;
            Vector3 p = transform.position + Vector3.up * 1.0f;
            Vector3 facing = g.Player != null && g.Player.Cam != null ? g.Player.Cam.PlanarForward : transform.forward;
            Interactable best = null;
            float bestScore = float.MaxValue;
            var items = Registry<Interactable>.Items;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                if (it == null || !it.IsAvailable) continue;
                bool scannable = scanner && it.HasScanData && !it.Scanned;
                if (!scannable && !it.HasUseAction) continue;
                float range = scannable ? Mathf.Max(it.interactRange, 5f) : it.interactRange;
                Vector3 to = it.FocusPoint - p;
                float d = to.magnitude;
                if (d > range) continue;
                to.y = 0f;
                float facingScore = to.sqrMagnitude > 0.01f ? Vector3.Dot(facing, to.normalized) : 1f;
                float score = d - facingScore * 1.2f;
                if (score < bestScore) { bestScore = score; best = it; }
            }
            Focus = best;
            if (best == null) Action = InteractAction.None;
            else Action = scanner && best.HasScanData && !best.Scanned ? InteractAction.Scan : (best.HasUseAction ? InteractAction.Use : InteractAction.Scan);
        }

        public string ActionLabel
        {
            get
            {
                if (Scanning) return "ANALYSING";
                if (Focus == null) return "";
                return Action == InteractAction.Scan ? "SCAN" : Focus.Prompt;
            }
        }

        void Activate(Game g)
        {
            if (Scanning) return;
            if (Focus == null) return;
            if (Action == InteractAction.Scan)
            {
                if (!Focus.HasScanData) return;
                if (g.Vision.Current != VisionModeId.Scanner)
                {
                    GameEvents.Notify("Switch to SCANNER vision to analyse objects.", NoticeType.Info);
                    return;
                }
                BeginScan(g, Focus);
            }
            else Focus.TryInteract();
        }

        void BeginScan(Game g, Interactable target)
        {
            float cost = 3f * target.scanDifficulty * g.Body.AnalysisCost;
            if (!g.Vitals.TrySpend(cost))
            {
                AudioManager.I?.Play(Sfx.Denied);
                GameEvents.Notify("Analysis needs " + cost.ToString("0") + " energy.", NoticeType.Warning);
                return;
            }
            scanTarget = target;
            scanElapsed = 0f;
            scanDuration = 2f * target.scanDifficulty * g.Body.AnalysisTime;
            interferenceTimer = 0.7f;
            AudioManager.I?.Play(Sfx.Scan);
        }

        void UpdateScan(Game g, float dt)
        {
            if (scanTarget == null || !scanTarget.isActiveAndEnabled) { CancelScan(null); return; }
            if (g.Vision.Current != VisionModeId.Scanner) { CancelScan("Scan aborted: scanner vision disengaged."); return; }
            float range = Mathf.Max(scanTarget.interactRange, 5f) * 1.5f;
            if ((scanTarget.FocusPoint - transform.position).sqrMagnitude > range * range) { CancelScan("Scan aborted: target out of range."); return; }

            scanElapsed += dt;

            // Interference spikes from the object or a hazardous area can knock analysis back.
            float source = Mathf.Clamp01(scanTarget.interference + (g.Environment.Current.IsHazardous ? 0.35f : 0f));
            if (source > 0f)
            {
                interferenceTimer -= dt;
                if (interferenceTimer <= 0f)
                {
                    interferenceTimer = 0.7f;
                    if (Random.value < source)
                    {
                        if (Random.value < g.Body.InterferenceChance)
                        {
                            scanElapsed = Mathf.Max(0f, scanElapsed - scanDuration * 0.35f);
                            AudioManager.I?.Play(Sfx.Interference);
                            UIRoot.I?.Fx.Glitch();
                            GameEvents.Notify("INTERFERENCE: analysis disrupted. Higher Concentration resists this.", NoticeType.Warning);
                            g.SetFlag("scan.interrupted");
                        }
                        else GameEvents.Notify("Interference resisted (Concentration).", NoticeType.Info);
                    }
                }
            }

            if (scanElapsed >= scanDuration)
            {
                var t = scanTarget;
                scanTarget = null;
                t.CompleteScan();
            }
        }

        void CancelScan(string reason)
        {
            scanTarget = null;
            if (!string.IsNullOrEmpty(reason)) { AudioManager.I?.Play(Sfx.Denied); GameEvents.Notify(reason, NoticeType.Warning); }
        }
    }
}

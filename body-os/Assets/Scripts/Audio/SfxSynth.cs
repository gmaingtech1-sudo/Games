using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Procedural sound synthesis: short sci-fi blips, sweeps and noise bursts generated once at first use.
    /// Used as the fallback for every audio slot.
    /// </summary>
    public static class SfxSynth
    {
        const int Rate = 22050;

        enum Wave { Sine, Square, Saw, Noise, Triangle }

        public static AudioClip Create(Sfx id)
        {
            switch (id)
            {
                case Sfx.UiClick: return Tone(id, 0.05f, 1400, 1800, Wave.Sine, 0.35f);
                case Sfx.UiBack: return Tone(id, 0.07f, 1100, 700, Wave.Sine, 0.35f);
                case Sfx.OsOpen: return Chord(id, 0.45f, new[] { 440f, 660f, 880f }, 0.06f, Wave.Triangle, 0.4f, true);
                case Sfx.OsClose: return Chord(id, 0.3f, new[] { 880f, 660f, 440f }, 0.05f, Wave.Triangle, 0.35f, true);
                case Sfx.Confirm: return Chord(id, 0.25f, new[] { 660f, 990f }, 0.07f, Wave.Sine, 0.4f, false);
                case Sfx.Denied: return Tone(id, 0.22f, 220, 160, Wave.Square, 0.25f);
                case Sfx.Upgrade: return Chord(id, 0.9f, new[] { 523f, 659f, 784f, 1047f }, 0.1f, Wave.Triangle, 0.45f, true);
                case Sfx.LevelUp: return Chord(id, 1.0f, new[] { 392f, 523f, 659f, 784f, 1047f }, 0.08f, Wave.Square, 0.25f, true);
                case Sfx.Scan: return Tone(id, 0.5f, 300, 2400, Wave.Sine, 0.3f);
                case Sfx.ScanComplete: return Chord(id, 0.35f, new[] { 1200f, 1600f }, 0.08f, Wave.Sine, 0.4f, false);
                case Sfx.Vision: return Tone(id, 0.25f, 500, 1500, Wave.Triangle, 0.3f);
                case Sfx.LowEnergy: return Chord(id, 0.6f, new[] { 440f, 330f, 440f, 330f }, 0.14f, Wave.Square, 0.2f, false);
                case Sfx.Hazard: return Chord(id, 0.7f, new[] { 880f, 660f, 880f, 660f }, 0.16f, Wave.Saw, 0.18f, false);
                case Sfx.Objective: return Chord(id, 0.5f, new[] { 784f, 1175f }, 0.12f, Wave.Triangle, 0.45f, true);
                case Sfx.MissionComplete: return Chord(id, 1.6f, new[] { 392f, 494f, 587f, 784f, 988f }, 0.15f, Wave.Triangle, 0.45f, true);
                case Sfx.Reality: return RealitySweep(id);
                case Sfx.Jump: return Tone(id, 0.12f, 300, 600, Wave.Triangle, 0.25f);
                case Sfx.Land: return Noise(id, 0.1f, 0.3f, 0.6f);
                case Sfx.Pickup: return Chord(id, 0.3f, new[] { 988f, 1319f, 1568f }, 0.05f, Wave.Sine, 0.4f, true);
                case Sfx.DoorOpen: return DoorSound(id);
                case Sfx.Damage: return Noise(id, 0.25f, 0.6f, 0.3f);
                case Sfx.Recharge: return Tone(id, 1.0f, 200, 1200, Wave.Saw, 0.2f);
                case Sfx.Calibrate: return Tone(id, 0.04f, 2000, 2000, Wave.Square, 0.15f);
                case Sfx.Success: return Chord(id, 0.6f, new[] { 659f, 880f, 1319f }, 0.08f, Wave.Triangle, 0.45f, true);
                case Sfx.Transmission: return Noise(id, 1.2f, 0.25f, 0.05f);
                case Sfx.Discovery: return Chord(id, 0.7f, new[] { 523f, 784f, 1047f }, 0.12f, Wave.Sine, 0.35f, true);
                case Sfx.Memory: return Chord(id, 1.2f, new[] { 330f, 415f, 494f, 659f }, 0.2f, Wave.Sine, 0.3f, true);
                case Sfx.Threat: return Chord(id, 0.5f, new[] { 196f, 185f, 196f }, 0.15f, Wave.Saw, 0.25f, false);
                case Sfx.Interference: return Noise(id, 0.3f, 0.4f, 0.1f);
                case Sfx.Footstep: return Noise(id, 0.05f, 0.12f, 0.7f);
            }
            return Tone(id, 0.05f, 1000, 1000, Wave.Sine, 0.2f);
        }

        static float Osc(Wave w, float phase)
        {
            float p = phase - Mathf.Floor(phase);
            switch (w)
            {
                case Wave.Square: return p < 0.5f ? 1f : -1f;
                case Wave.Saw: return p * 2f - 1f;
                case Wave.Triangle: return 1f - 4f * Mathf.Abs(p - 0.5f);
                case Wave.Noise: return Random.value * 2f - 1f;
                default: return Mathf.Sin(p * Mathf.PI * 2f);
            }
        }

        static AudioClip Make(Sfx id, float[] data)
        {
            var clip = AudioClip.Create(id.ToString(), data.Length, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        static AudioClip Tone(Sfx id, float dur, float f0, float f1, Wave w, float vol)
        {
            int n = Mathf.Max(1, (int)(dur * Rate));
            var d = new float[n];
            float phase = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / n;
                float f = Mathf.Lerp(f0, f1, t);
                phase += f / Rate;
                float env = Mathf.Min(1f, t * 40f) * (1f - t) * (1f - t);
                d[i] = Osc(w, phase) * env * vol;
            }
            return Make(id, d);
        }

        static AudioClip Chord(Sfx id, float dur, float[] notes, float step, Wave w, float vol, bool sustain)
        {
            int n = Mathf.Max(1, (int)(dur * Rate));
            var d = new float[n];
            for (int k = 0; k < notes.Length; k++)
            {
                int start = (int)(k * step * Rate);
                float phase = 0f;
                for (int i = start; i < n; i++)
                {
                    float local = (float)(i - start) / Rate;
                    float t = (float)i / n;
                    phase += notes[k] / Rate;
                    float env = Mathf.Min(1f, local * 60f) * (sustain ? (1f - t) : Mathf.Max(0f, 1f - local / (step * 1.2f)));
                    d[i] += Osc(w, phase) * env * vol / Mathf.Sqrt(notes.Length);
                }
            }
            return Make(id, d);
        }

        static AudioClip Noise(Sfx id, float dur, float vol, float decay)
        {
            int n = Mathf.Max(1, (int)(dur * Rate));
            var d = new float[n];
            float lp = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / n;
                lp = Mathf.Lerp(lp, Random.value * 2f - 1f, 0.35f);
                float env = Mathf.Pow(1f - t, 1f + decay * 4f);
                if (id == Sfx.Transmission) env = 0.4f + 0.6f * Mathf.Abs(Mathf.Sin(t * 30f));
                d[i] = lp * env * vol;
            }
            return Make(id, d);
        }

        static AudioClip RealitySweep(Sfx id)
        {
            int n = (int)(1.1f * Rate);
            var d = new float[n];
            float p1 = 0f, p2 = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / n;
                p1 += Mathf.Lerp(80f, 900f, t * t) / Rate;
                p2 += Mathf.Lerp(83f, 450f, t) / Rate;
                float env = Mathf.Min(1f, t * 10f) * (1f - t);
                d[i] = (Osc(Wave.Saw, p1) * 0.5f + Osc(Wave.Sine, p2) * 0.5f) * env * 0.35f;
            }
            return Make(id, d);
        }

        static AudioClip DoorSound(Sfx id)
        {
            int n = (int)(0.7f * Rate);
            var d = new float[n];
            float lp = 0f, phase = 0f;
            for (int i = 0; i < n; i++)
            {
                float t = (float)i / n;
                lp = Mathf.Lerp(lp, Random.value * 2f - 1f, 0.08f);
                phase += Mathf.Lerp(120f, 60f, t) / Rate;
                float env = Mathf.Min(1f, t * 20f) * (1f - t);
                d[i] = (lp * 0.6f + Osc(Wave.Sine, phase) * 0.4f) * env * 0.5f;
            }
            return Make(id, d);
        }

        /// <summary>Slow evolving drone used as fallback music. Loops seamlessly (whole cycles of every partial).</summary>
        public static AudioClip Ambient(string name, float baseFreq, float seconds)
        {
            int n = (int)(seconds * Rate);
            var d = new float[n];
            // Round each partial to a whole number of cycles over the loop for a click-free loop.
            float[] mult = { 1f, 1.5f, 2f, 3f, 4.02f };
            float[] amp = { 0.35f, 0.18f, 0.16f, 0.08f, 0.05f };
            float[] freq = new float[mult.Length];
            for (int k = 0; k < mult.Length; k++) freq[k] = Mathf.Round(baseFreq * mult[k] * seconds) / seconds;
            float lfoF = Mathf.Round(0.25f * seconds) / seconds;
            for (int i = 0; i < n; i++)
            {
                float time = (float)i / Rate;
                float lfo = 0.6f + 0.4f * Mathf.Sin(2f * Mathf.PI * lfoF * time);
                float s = 0f;
                for (int k = 0; k < freq.Length; k++)
                    s += Mathf.Sin(2f * Mathf.PI * freq[k] * time) * amp[k] * (k == 2 ? lfo : 1f);
                d[i] = s * 0.35f;
            }
            var clip = AudioClip.Create(name, n, 1, Rate, false);
            clip.SetData(d, 0);
            return clip;
        }
    }
}

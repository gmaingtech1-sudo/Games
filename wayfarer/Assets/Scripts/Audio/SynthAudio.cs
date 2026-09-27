using System;
using System.Collections.Generic;
using UnityEngine;

namespace Wayfarer
{
    public enum Sfx
    {
        Click, Collect, Break, Blaster, Cannon, Explosion, Scanner, VisorOn, VisorOff, Switch, Overheat,
        Warning, Mission, Discovery, Footstep, Land, Jump, Splash, Hit, Craft, Error, Dock, Warp, Takeoff,
        CallChirp, CallMoo, CallTrill, CallGrowl, Sell, Toast
    }

    /// <summary>Every sound in the game is synthesised: sound effects are
    /// generated once at start-up, while wind, engines, the jetpack, the mining
    /// beam and a generative ambient score are synthesised live on the audio thread.</summary>
    [RequireComponent(typeof(AudioListener))]
    public sealed class SynthAudio : MonoBehaviour
    {
        // live parameters (written on the main thread, read on the audio thread)
        public volatile float Wind, WindTone = 0.5f, Engine, EnginePitch = 0.5f, Jet, Laser, Pulse, Warp, Underwater;
        public volatile float Master = 0.8f, MusicVol = 0.6f, SfxVol = 0.9f;
        public volatile int MoodSeed = 1;
        public volatile float MusicIntensity = 0.5f;

        readonly Dictionary<Sfx, AudioClip[]> clips = new Dictionary<Sfx, AudioClip[]>();
        AudioSource[] sources;
        int nextSource;
        int rate;
        readonly System.Random rnd = new System.Random(7);

        void Awake()
        {
            rate = AudioSettings.outputSampleRate;
            if (rate <= 0) rate = 48000;
            sources = new AudioSource[10];
            for (int i = 0; i < sources.Length; i++)
            {
                sources[i] = gameObject.AddComponent<AudioSource>();
                sources[i].playOnAwake = false;
                sources[i].spatialBlend = 0f;
            }
            BuildClips();
            musicSR = rate;
            InitMusic();
        }

        // ───────────────────────────── one-shots ──────────────────────────
        public void Play(Sfx s, float volume = 1f, float pitch = 1f)
        {
            if (!clips.TryGetValue(s, out var arr) || arr.Length == 0) return;
            var src = sources[nextSource];
            nextSource = (nextSource + 1) % sources.Length;
            src.pitch = pitch * (1f + (float)(rnd.NextDouble() - 0.5) * 0.06f);
            src.volume = volume * SfxVol * Master;
            src.PlayOneShot(arr[rnd.Next(arr.Length)]);
        }

        public void PlayCall(float pitch, float volume, int kind)
        {
            Sfx s = kind == 0 ? Sfx.CallChirp : kind == 1 ? Sfx.CallMoo : kind == 2 ? Sfx.CallTrill : Sfx.CallGrowl;
            Play(s, volume, pitch);
        }

        AudioClip Make(string name, float seconds, Func<float, float> f)
        {
            int n = Mathf.Max(1, (int)(seconds * rate));
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(f(i / (float)rate), -1f, 1f);
            // soften the ends
            int fade = Mathf.Min(n / 4, rate / 200);
            for (int i = 0; i < fade; i++) { float k = i / (float)fade; data[i] *= k; data[n - 1 - i] *= k; }
            var clip = AudioClip.Create(name, n, 1, rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        float Noise() => (float)(rnd.NextDouble() * 2 - 1);

        static float Env(float t, float a, float d) => t < a ? t / a : Mathf.Exp(-(t - a) / d);

        void Add(Sfx s, params AudioClip[] c) => clips[s] = c;

        void BuildClips()
        {
            const float Tau = Mathf.PI * 2f;
            Add(Sfx.Click, Make("click", 0.05f, t => Mathf.Sin(Tau * 1400 * t) * Env(t, 0.002f, 0.012f) * 0.35f));
            Add(Sfx.Toast, Make("toast", 0.18f, t => (Mathf.Sin(Tau * 880 * t) + Mathf.Sin(Tau * 1320 * t) * 0.5f) * Env(t, 0.005f, 0.06f) * 0.2f));
            Add(Sfx.Collect, Make("collect", 0.22f, t =>
            {
                float f = t < 0.08f ? 660f : 990f;
                return Mathf.Sin(Tau * f * t) * Env(t % 0.08f, 0.004f, 0.05f) * 0.35f;
            }));
            float lp = 0;
            Add(Sfx.Break, Make("break", 0.5f, t => { lp += (Noise() - lp) * 0.08f; return (lp * 2.2f + Mathf.Sin(Tau * 70 * t) * 0.6f) * Env(t, 0.003f, 0.12f); }));
            Add(Sfx.Blaster, Make("blaster", 0.25f, t =>
            {
                float f = Mathf.Lerp(1100f, 180f, t / 0.25f);
                return (Mathf.Sin(Tau * f * t + Mathf.Sin(Tau * f * 0.5f * t) * 2f) * 0.5f + Noise() * 0.15f) * Env(t, 0.002f, 0.07f);
            }));
            Add(Sfx.Cannon, Make("cannon", 0.16f, t =>
            {
                float f = Mathf.Lerp(1600f, 320f, t / 0.16f);
                return (Mathf.Sin(Tau * f * t) * 0.4f + Noise() * 0.1f) * Env(t, 0.002f, 0.05f);
            }));
            float lp2 = 0;
            Add(Sfx.Explosion, Make("explosion", 1.8f, t => { lp2 += (Noise() - lp2) * Mathf.Lerp(0.2f, 0.02f, t / 1.8f); return (lp2 * 2.5f + Mathf.Sin(Tau * 45 * t) * 0.8f * Mathf.Exp(-t * 4)) * Env(t, 0.005f, 0.45f); }));
            Add(Sfx.Scanner, Make("scanner", 1.4f, t =>
            {
                float f = Mathf.Lerp(300f, 1500f, Mathf.Clamp01(t / 0.6f));
                float s = Mathf.Sin(Tau * f * t) * Env(t, 0.01f, 0.25f);
                float echo = t > 0.35f ? Mathf.Sin(Tau * Mathf.Lerp(300f, 1500f, Mathf.Clamp01((t - 0.35f) / 0.6f)) * t) * Env(t - 0.35f, 0.01f, 0.3f) * 0.4f : 0f;
                return (s + echo) * 0.3f;
            }));
            Add(Sfx.VisorOn, Make("visor on", 0.15f, t => Mathf.Sin(Tau * Mathf.Lerp(600, 1200, t / 0.15f) * t) * Env(t, 0.005f, 0.05f) * 0.25f));
            Add(Sfx.VisorOff, Make("visor off", 0.15f, t => Mathf.Sin(Tau * Mathf.Lerp(1200, 600, t / 0.15f) * t) * Env(t, 0.005f, 0.05f) * 0.25f));
            Add(Sfx.Switch, Make("switch", 0.08f, t => (Mathf.Sin(Tau * 520 * t) + Noise() * 0.3f) * Env(t, 0.002f, 0.02f) * 0.3f));
            Add(Sfx.Overheat, Make("overheat", 0.7f, t => (Mathf.Sin(Tau * Mathf.Lerp(420, 140, t / 0.7f) * t) * 0.4f + Noise() * 0.25f * Mathf.Exp(-t * 3)) * Env(t, 0.01f, 0.25f)));
            Add(Sfx.Warning, Make("warning", 0.6f, t => Mathf.Sin(Tau * (t % 0.3f < 0.15f ? 880 : 660) * t) * (t % 0.15f < 0.12f ? 1f : 0f) * 0.25f));
            Add(Sfx.Mission, Make("mission", 1.2f, t =>
            {
                float[] notes = { 523.25f, 659.25f, 783.99f, 1046.5f };
                float s = 0;
                for (int k = 0; k < 4; k++) { float st = t - k * 0.12f; if (st > 0) s += Mathf.Sin(Tau * notes[k] * st) * Env(st, 0.005f, 0.35f); }
                return s * 0.18f;
            }));
            Add(Sfx.Discovery, Make("discovery", 1.8f, t =>
            {
                float[] notes = { 783.99f, 987.77f, 1174.66f, 1567.98f, 1975.5f };
                float s = 0;
                for (int k = 0; k < 5; k++) { float st = t - k * 0.09f; if (st > 0) s += (Mathf.Sin(Tau * notes[k] * st) + 0.3f * Mathf.Sin(Tau * notes[k] * 2.01f * st)) * Env(st, 0.003f, 0.5f); }
                return s * 0.13f;
            }));
            var steps = new AudioClip[4];
            for (int v = 0; v < 4; v++)
            {
                float f0 = 0;
                float cut = 0.12f + v * 0.04f;
                steps[v] = Make("step" + v, 0.12f, t => { f0 += (Noise() - f0) * cut; return f0 * 1.4f * Env(t, 0.004f, 0.03f); });
            }
            Add(Sfx.Footstep, steps);
            float lp3 = 0;
            Add(Sfx.Land, Make("land", 0.35f, t => { lp3 += (Noise() - lp3) * 0.06f; return (lp3 * 2f + Mathf.Sin(Tau * 60 * t) * 0.8f) * Env(t, 0.003f, 0.08f); }));
            Add(Sfx.Jump, Make("jump", 0.2f, t => Noise() * 0.2f * Env(t, 0.01f, 0.05f)));
            float lp4 = 0;
            Add(Sfx.Splash, Make("splash", 0.8f, t => { lp4 += (Noise() - lp4) * 0.3f; return lp4 * 0.7f * Env(t, 0.01f, 0.2f); }));
            Add(Sfx.Hit, Make("hit", 0.3f, t => (Mathf.Sin(Tau * 90 * t) * 0.8f + Noise() * 0.5f) * Env(t, 0.002f, 0.07f)));
            Add(Sfx.Craft, Make("craft", 0.7f, t =>
            {
                float s = 0;
                for (int k = 0; k < 3; k++) { float st = t - k * 0.1f; if (st > 0) s += Mathf.Sin(Tau * (440f * (1 + k * 0.25f)) * st) * Env(st, 0.004f, 0.18f); }
                return s * 0.2f;
            }));
            Add(Sfx.Error, Make("error", 0.25f, t => (Mathf.Sin(Tau * 150 * t) + Mathf.Sin(Tau * 155 * t)) * Env(t, 0.005f, 0.1f) * 0.25f));
            Add(Sfx.Sell, Make("sell", 0.3f, t => (Mathf.Sin(Tau * 1200 * t) * Env(t, 0.002f, 0.05f) + Mathf.Sin(Tau * 1800 * (t - 0.06f)) * (t > 0.06f ? Env(t - 0.06f, 0.002f, 0.08f) : 0f)) * 0.2f));
            Add(Sfx.Dock, Make("dock", 1.5f, t => (Mathf.Sin(Tau * 392 * t) * Env(t, 0.01f, 0.5f) + Mathf.Sin(Tau * 523.25f * (t - 0.25f)) * (t > 0.25f ? Env(t - 0.25f, 0.01f, 0.6f) : 0f)) * 0.2f));
            float lp5 = 0;
            Add(Sfx.Takeoff, Make("takeoff", 2.2f, t => { lp5 += (Noise() - lp5) * Mathf.Lerp(0.02f, 0.12f, t / 2.2f); return (lp5 * 2f + Mathf.Sin(Tau * Mathf.Lerp(40, 90, t / 2.2f) * t) * 0.4f) * Mathf.Clamp01(t * 3f) * Mathf.Clamp01((2.2f - t) * 2f) * 0.8f; }));
            float lp6 = 0;
            Add(Sfx.Warp, Make("warp", 4.5f, t =>
            {
                lp6 += (Noise() - lp6) * Mathf.Lerp(0.01f, 0.3f, Mathf.Clamp01(t / 3f));
                float sweep = Mathf.Sin(Tau * Mathf.Lerp(60f, 900f, Mathf.Pow(Mathf.Clamp01(t / 3.5f), 2f)) * t) * 0.3f;
                return (lp6 * 1.5f + sweep) * Mathf.Clamp01(t) * Mathf.Clamp01((4.5f - t) * 1.5f) * 0.6f;
            }));
            Add(Sfx.CallChirp, Make("chirp", 0.45f, t => Mathf.Sin(Tau * (1400 + 500 * Mathf.Sin(Tau * 18 * t)) * t) * Env(t % 0.15f, 0.01f, 0.04f) * 0.25f));
            Add(Sfx.CallMoo, Make("moo", 1.0f, t => (Mathf.Sin(Tau * 130 * t) + 0.5f * Mathf.Sin(Tau * 260 * t) + 0.25f * Mathf.Sin(Tau * 390 * t)) * Env(t, 0.15f, 0.4f) * (1f + 0.2f * Mathf.Sin(Tau * 5 * t)) * 0.25f));
            Add(Sfx.CallTrill, Make("trill", 0.7f, t => Mathf.Sin(Tau * (700 + 120 * Mathf.Sign(Mathf.Sin(Tau * 22 * t))) * t) * Env(t, 0.02f, 0.25f) * 0.2f));
            float lp7 = 0;
            Add(Sfx.CallGrowl, Make("growl", 0.9f, t => { lp7 += (Noise() - lp7) * 0.05f; return (Mathf.Sin(Tau * 75 * t + lp7 * 6f) * 0.6f + lp7) * Env(t, 0.08f, 0.35f) * 0.35f; }));
        }

        // ───────────────────────────── live synth ─────────────────────────
        int musicSR;
        uint seed = 22222;
        float windLp, windBp, windBp2, jetLp, engPhase, engPhase2, engLp, laserPhase, laserMod, pulseLp, warpPhase;
        float gustPhase;

        float Rand()
        {
            seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
            return (seed & 0xFFFFFF) / 8388608f - 1f;
        }

        // music
        sealed class Voice { public float Freq, Amp, Target, Phase1, Phase2, Lp, Pan; }
        sealed class Bell { public float Freq, Amp, Phase; }
        readonly Voice[] pads = new Voice[6];
        readonly Bell[] bells = new Bell[6];
        int[] scale = { 0, 2, 3, 5, 7, 9, 10 };
        float root = 146.83f; // D3
        long sampleClock;
        long nextChord, nextBell;
        float[] combL, combR;
        int[] combLen;
        int[] combPos = new int[4];
        float[][] combBufL = new float[4][], combBufR = new float[4][];
        int chordDegree;

        void InitMusic()
        {
            for (int i = 0; i < pads.Length; i++) pads[i] = new Voice { Pan = (i % 2 == 0 ? -0.5f : 0.5f) * (0.3f + i * 0.1f) };
            for (int i = 0; i < bells.Length; i++) bells[i] = new Bell();
            combLen = new[] { (int)(rate * 0.0297f), (int)(rate * 0.0371f), (int)(rate * 0.0411f), (int)(rate * 0.0437f) };
            for (int i = 0; i < 4; i++)
            {
                combBufL[i] = new float[combLen[i] * 3];
                combBufR[i] = new float[combLen[i] * 3 + 7];
            }
            SetMood(1);
        }

        public void SetMood(int moodSeed)
        {
            MoodSeed = moodSeed;
            var r = new System.Random(moodSeed);
            int[][] scales =
            {
                new[] { 0, 2, 3, 5, 7, 9, 10 },  // dorian
                new[] { 0, 2, 4, 6, 7, 9, 11 },  // lydian
                new[] { 0, 2, 3, 5, 7, 8, 10 },  // aeolian
                new[] { 0, 2, 4, 7, 9, 12, 14 }, // pentatonic
                new[] { 0, 2, 4, 5, 7, 9, 11 },  // major
            };
            scale = scales[r.Next(scales.Length)];
            root = 110f * Mathf.Pow(2f, r.Next(0, 7) / 12f);
            nextChord = sampleClock;
        }

        float NoteFreq(int degree, int octave)
        {
            int n = scale.Length;
            int oct = octave + Mathf.FloorToInt(degree / (float)n);
            int idx = ((degree % n) + n) % n;
            return root * Mathf.Pow(2f, oct + scale[idx] / 12f);
        }

        void OnAudioFilterRead(float[] data, int channels)
        {
            if (channels < 1) return;
            float sr = musicSR;
            float master = Master;
            float wind = Wind * 0.55f, windTone = WindTone, engine = Engine, engPitch = EnginePitch, jet = Jet, laser = Laser, pulse = Pulse, warp = Warp;
            float musicVol = MusicVol * 0.22f;
            float under = Underwater;
            int frames = data.Length / channels;
            for (int i = 0; i < frames; i++)
            {
                float l = 0, r = 0;

                // wind: band-passed noise with slow gusts
                gustPhase += 0.25f / sr;
                float gust = 0.6f + 0.4f * Mathf.Sin(gustPhase * 6.2831f) * Mathf.Sin(gustPhase * 2.3f);
                float n = Rand();
                float f = 0.01f + 0.04f * windTone * gust;
                windLp += (n - windLp) * f;
                windBp += (windLp - windBp) * 0.2f;
                windBp2 += (n - windBp2) * 0.004f;
                float w = (windLp - windBp) * 3f + windBp2 * 2f;
                float wv = w * wind * gust;
                l += wv * 0.9f; r += wv * 1.1f;

                // engine: two detuned saws and a hiss
                if (engine > 0.001f)
                {
                    float ef = 38f + engPitch * 70f;
                    engPhase += ef / sr; if (engPhase > 1f) engPhase -= 1f;
                    engPhase2 += ef * 1.503f / sr; if (engPhase2 > 1f) engPhase2 -= 1f;
                    float saw = (engPhase * 2f - 1f) * 0.6f + (engPhase2 * 2f - 1f) * 0.3f;
                    engLp += (saw + Rand() * (0.2f + engPitch * 0.5f) - engLp) * (0.05f + engPitch * 0.1f);
                    float ev = engLp * engine * 0.6f;
                    l += ev; r += ev;
                }
                if (jet > 0.001f)
                {
                    float hn = Rand();
                    jetLp += (hn - jetLp) * 0.35f;
                    float jv = (hn - jetLp) * jet * 0.35f;
                    l += jv; r += jv;
                }
                if (laser > 0.001f)
                {
                    laserMod += 57f / sr; if (laserMod > 1f) laserMod -= 1f;
                    laserPhase += (230f + 40f * Mathf.Sin(laserMod * 6.2831f)) / sr; if (laserPhase > 1f) laserPhase -= 1f;
                    float lv = (Mathf.Sin(laserPhase * 6.2831f + Mathf.Sin(laserMod * 6.2831f) * 3f) * 0.5f + Rand() * 0.12f) * laser * 0.35f;
                    l += lv; r += lv;
                }
                if (pulse > 0.001f || warp > 0.001f)
                {
                    float pn = Rand();
                    pulseLp += (pn - pulseLp) * (0.02f + 0.2f * warp + 0.05f * pulse);
                    warpPhase += (80f + 700f * warp * warp) / sr; if (warpPhase > 1f) warpPhase -= 1f;
                    float pv = pulseLp * (pulse * 0.5f + warp * 0.8f) + Mathf.Sin(warpPhase * 6.2831f) * warp * 0.15f;
                    l += pv; r += pv;
                }

                // music
                float ml = 0, mr = 0;
                if (musicVol > 0.0005f)
                {
                    if (sampleClock >= nextChord) NextChord();
                    if (sampleClock >= nextBell) NextBell();
                    for (int v = 0; v < pads.Length; v++)
                    {
                        var p = pads[v];
                        p.Amp += (p.Target - p.Amp) * (p.Target > p.Amp ? 0.00003f : 0.00002f);
                        if (p.Amp < 0.0001f) continue;
                        p.Phase1 += p.Freq / sr; if (p.Phase1 > 1f) p.Phase1 -= 1f;
                        p.Phase2 += p.Freq * 1.0035f / sr; if (p.Phase2 > 1f) p.Phase2 -= 1f;
                        float s = (p.Phase1 * 2f - 1f) + (p.Phase2 * 2f - 1f);
                        p.Lp += (s - p.Lp) * 0.035f;
                        float o = p.Lp * p.Amp;
                        ml += o * (1f - p.Pan); mr += o * (1f + p.Pan);
                    }
                    for (int b = 0; b < bells.Length; b++)
                    {
                        var bl = bells[b];
                        if (bl.Amp < 0.0001f) continue;
                        bl.Phase += bl.Freq / sr; if (bl.Phase > 1f) bl.Phase -= 1f;
                        float s = Mathf.Sin(bl.Phase * 6.2831f) + 0.25f * Mathf.Sin(bl.Phase * 6.2831f * 2.76f);
                        bl.Amp *= 0.99994f;
                        float o = s * bl.Amp;
                        ml += o * (b % 2 == 0 ? 1.2f : 0.8f); mr += o * (b % 2 == 0 ? 0.8f : 1.2f);
                    }
                    // small comb reverb
                    float rl = 0, rr = 0;
                    for (int c = 0; c < 4; c++)
                    {
                        var bufL = combBufL[c]; var bufR = combBufR[c];
                        int pos = combPos[c];
                        int lenL = bufL.Length, lenR = bufR.Length;
                        float yl = bufL[pos % lenL], yr = bufR[pos % lenR];
                        bufL[pos % lenL] = ml * 0.3f + yl * 0.78f;
                        bufR[pos % lenR] = mr * 0.3f + yr * 0.78f;
                        combPos[c] = (pos + 1) % (lenL * lenR);
                        rl += yl; rr += yr;
                    }
                    ml = (ml + rl * 0.35f) * musicVol;
                    mr = (mr + rr * 0.35f) * musicVol;
                    sampleClock++;
                }
                float outL = (l + ml) * master, outR = (r + mr) * master;
                if (under > 0.01f) { outL *= 1f - under * 0.5f; outR *= 1f - under * 0.5f; }
                if (channels == 1) data[i] += (outL + outR) * 0.5f;
                else
                {
                    data[i * channels] += outL;
                    data[i * channels + 1] += outR;
                }
            }
        }

        void NextChord()
        {
            uint rr = seed;
            chordDegree += ((int)(rr % 5)) - 2;
            chordDegree = Mathf.Clamp(chordDegree, -3, 7);
            int[] shape = { 0, 2, 4, 6 };
            for (int v = 0; v < pads.Length; v++)
            {
                var p = pads[v];
                if (v < 4)
                {
                    p.Freq = NoteFreq(chordDegree + shape[v], v == 0 ? -1 : 0);
                    p.Target = (v == 0 ? 0.09f : 0.055f) * (0.6f + MusicIntensity * 0.4f);
                }
                else p.Target = 0f;
            }
            nextChord = sampleClock + (long)(musicSR * (9f + (rr % 7)));
        }

        void NextBell()
        {
            uint rr = seed;
            nextBell = sampleClock + (long)(musicSR * (0.35f + (rr % 9) * 0.25f + ((rr >> 4) % 3 == 0 ? 3f : 0f)));
            if ((rr >> 8) % 3 == 0) return;
            for (int b = 0; b < bells.Length; b++)
            {
                if (bells[b].Amp > 0.004f) continue;
                bells[b].Freq = NoteFreq(chordDegree + (int)((rr >> 12) % 6), 2);
                bells[b].Amp = 0.028f * (0.5f + MusicIntensity * 0.5f);
                bells[b].Phase = 0f;
                break;
            }
        }
    }
}

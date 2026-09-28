// Riftborn — small synthesized sound effects (no audio files needed).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Riftborn
{
    public static class Sfx
    {
        const int RATE = 44100;
        static AudioSource src;
        static readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        static readonly System.Random rng = new System.Random(7);

        static AudioClip Make(string name, float secs, Func<float, float> f)
        {
            int n = (int)(secs * RATE);
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(f(i / (float)RATE), -1, 1);
            var c = AudioClip.Create(name, n, 1, RATE, false);
            c.SetData(data, 0);
            return c;
        }

        static float Env(float t, float a, float len) => t < a ? t / a : Mathf.Exp(-(t - a) / len);
        static float Noise() => (float)(rng.NextDouble() * 2 - 1);
        static float Tone(float t, float hz) => Mathf.Sin(t * hz * Mathf.PI * 2);

        static AudioClip Clip(string name)
        {
            if (clips.TryGetValue(name, out var c)) return c;
            switch (name)
            {
                case "tap": c = Make(name, 0.08f, (t) => Tone(t, 900) * Env(t, 0.003f, 0.02f) * 0.3f); break;
                case "hack": c = Make(name, 0.5f, (t) => { float hz = new[] { 520f, 660f, 780f, 1040f }[Mathf.Min(3, (int)(t / 0.1f))]; return Tone(t, hz) * Env(t % 0.1f, 0.005f, 0.06f) * 0.35f; }); break;
                case "loot": c = Make(name, 0.35f, (t) => (Tone(t, 1320) + Tone(t, 1760) * 0.5f) * Env(t, 0.005f, 0.1f) * 0.25f); break;
                case "hit": c = Make(name, 0.25f, (t) => (Noise() * 0.6f + Tone(t, 180 - t * 300)) * Env(t, 0.002f, 0.05f) * 0.5f); break;
                case "bull": c = Make(name, 0.4f, (t) => (Tone(t, 880) + Tone(t, 1320) * 0.6f + Noise() * Env(t, 0.001f, 0.02f)) * Env(t, 0.003f, 0.12f) * 0.35f); break;
                case "miss": c = Make(name, 0.2f, (t) => Noise() * Env(t, 0.01f, 0.05f) * 0.2f); break;
                case "throw": c = Make(name, 0.3f, (t) => Noise() * Mathf.Sin(t / 0.3f * Mathf.PI) * 0.25f); break;
                case "absorb": c = Make(name, 0.7f, (t) => Tone(t, 300 + t * 900) * Env(t, 0.05f, 0.3f) * 0.35f); break;
                case "wobble": c = Make(name, 0.2f, (t) => Tone(t, 140) * Env(t, 0.005f, 0.05f) * 0.5f); break;
                case "caught": c = Make(name, 1.2f, (t) => { float hz = new[] { 660f, 830f, 990f, 1320f }[Mathf.Min(3, (int)(t / 0.12f))]; return (Tone(t, hz) + Tone(t, hz * 2) * 0.3f) * Env(t, 0.01f, 0.4f) * 0.3f; }); break;
                case "flee": c = Make(name, 0.8f, (t) => Tone(t, 600 - t * 500) * Env(t, 0.02f, 0.3f) * 0.3f); break;
                case "error": c = Make(name, 0.25f, (t) => Mathf.Sign(Tone(t, 150)) * Env(t, 0.005f, 0.08f) * 0.15f); break;
                case "roar":
                    float lp = 0;
                    c = Make(name, 1.4f, (t) => { lp += (Noise() - lp) * 0.08f; float w = 1 + 0.4f * Tone(t, 7); return (lp * 3 * w + Tone(t, 70 + 30 * Mathf.Sin(t * 3)) * 0.5f) * Env(t, 0.12f, 0.45f) * 0.55f; });
                    break;
                case "strike": c = Make(name, 0.3f, (t) => (Noise() * 0.8f + Tone(t, 120)) * Env(t, 0.003f, 0.07f) * 0.5f); break;
                case "blast": c = Make(name, 0.7f, (t) => (Noise() * 0.5f + Tone(t, 220 + t * 400) * 0.6f) * Env(t, 0.02f, 0.25f) * 0.45f); break;
                case "guard": c = Make(name, 0.5f, (t) => (Tone(t, 440) + Tone(t, 660)) * Env(t, 0.03f, 0.2f) * 0.2f); break;
                case "win": c = Make(name, 1.6f, (t) => { float hz = new[] { 523f, 659f, 784f, 1047f }[Mathf.Min(3, (int)(t / 0.15f))]; return (Tone(t, hz) + Tone(t, hz * 1.5f) * 0.3f) * Env(t % 0.15f + (t > 0.45f ? t - 0.45f : 0), 0.01f, 0.5f) * 0.3f; }); break;
                default: return null;
            }
            clips[name] = c;
            return c;
        }

        public static void Play(string name, float volume = 1)
        {
            if (GameState.save != null && !GameState.save.settings.sound) return;
            if (src == null)
            {
                var go = new GameObject("Sfx");
                UnityEngine.Object.DontDestroyOnLoad(go);
                src = go.AddComponent<AudioSource>();
                go.AddComponent<AudioListener>();
            }
            var c = Clip(name);
            if (c != null) src.PlayOneShot(c, volume);
        }
    }
}

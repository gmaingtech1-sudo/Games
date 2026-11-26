using System.Collections.Generic;
using UnityEngine;

// Every sound in the game is synthesised at start-up, so there are no audio files.
public class Sfx : MonoBehaviour
{
    const int Rate = 44100;
    const float Tau = Mathf.PI * 2f;

    delegate float Wave(float t, float duration);

    readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
    readonly System.Random rng = new System.Random(1234);
    AudioSource[] voices;
    int nextVoice;

    void Awake()
    {
        voices = new AudioSource[12];
        for (int i = 0; i < voices.Length; i++)
        {
            var v = gameObject.AddComponent<AudioSource>();
            v.playOnAwake = false;
            v.spatialBlend = 0f;
            voices[i] = v;
        }
        Build();
    }

    public void Play(string name, float volume = 1f, float pitch = 1f)
    {
        AudioClip clip;
        if (!clips.TryGetValue(name, out clip)) return;
        var v = voices[nextVoice];
        nextVoice = (nextVoice + 1) % voices.Length;
        v.Stop();
        v.clip = clip;
        v.volume = volume;
        v.pitch = pitch;
        v.Play();
    }

    float Noise() { return (float)(rng.NextDouble() * 2.0 - 1.0); }

    static float Square(float t, float freq) { return Mathf.Repeat(t * freq, 1f) < 0.5f ? 1f : -1f; }

    void Add(string name, float duration, Wave wave)
    {
        int n = Mathf.CeilToInt(duration * Rate);
        var data = new float[n];
        for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(wave(i / (float)Rate, duration), -1f, 1f);
        int fade = Mathf.Min(n, 256);
        for (int i = 0; i < fade; i++) data[n - 1 - i] *= i / (float)fade;
        var clip = AudioClip.Create(name, n, 1, Rate, false);
        clip.SetData(data, 0);
        clips[name] = clip;
    }

    void Build()
    {
        float phase = 0f, low = 0f;

        // Meaty cartoon punch.
        phase = 0f;
        Add("punch", 0.3f, (t, d) =>
        {
            phase += Tau * Mathf.Lerp(160f, 45f, t / d) / Rate;
            return Mathf.Sin(phase) * Mathf.Exp(-t * 12f) * 0.9f + Noise() * Mathf.Exp(-t * 70f) * 0.7f;
        });

        // Gunshot: crack + rumble.
        phase = 0f; low = 0f;
        Add("bang", 0.7f, (t, d) =>
        {
            float n = Noise();
            low += (n - low) * 0.2f;
            phase += Tau * 55f / Rate;
            return n * Mathf.Exp(-t * 35f) * 0.9f + low * Mathf.Exp(-t * 6f) * 1.4f + Mathf.Sin(phase) * Mathf.Exp(-t * 10f) * 0.6f;
        });

        // Throw / swing.
        low = 0f;
        Add("whoosh", 0.3f, (t, d) =>
        {
            float env = Mathf.Sin(Mathf.PI * t / d);
            low += (Noise() - low) * (0.05f + 0.3f * env);
            return low * env * 1.4f;
        });

        // Ceramic smash.
        Add("smash", 0.6f, (t, d) =>
            Noise() * Mathf.Exp(-t * 25f) * 0.7f +
            (Mathf.Sin(Tau * 2300f * t) + Mathf.Sin(Tau * 3170f * t) * 0.7f + Mathf.Sin(Tau * 4610f * t) * 0.5f) * Mathf.Exp(-t * 9f) * 0.15f);

        // Wet coffee splat.
        low = 0f;
        Add("splat", 0.35f, (t, d) =>
        {
            low += (Noise() - low) * 0.15f;
            return low * Mathf.Exp(-t * 10f) * 2.2f;
        });

        // Body hitting a wall or the floor.
        phase = 0f;
        Add("thud", 0.25f, (t, d) =>
        {
            phase += Tau * Mathf.Lerp(95f, 50f, t / d) / Rate;
            return Mathf.Sin(phase) * Mathf.Exp(-t * 18f) + Noise() * Mathf.Exp(-t * 50f) * 0.3f;
        });

        // Metal stapler clank / bullet ricochet.
        Add("clank", 0.3f, (t, d) =>
            (Mathf.Sin(Tau * 900f * t) + Mathf.Sin(Tau * 1410f * t) * 0.6f) * Mathf.Exp(-t * 22f) * 0.5f + Noise() * Mathf.Exp(-t * 80f) * 0.4f);

        // Talking babble blip.
        Add("blip", 0.055f, (t, d) => Square(t, 310f) * 0.22f * (1f - t / d));

        // UI click.
        Add("click", 0.03f, (t, d) => Square(t, 1200f) * 0.3f * (1f - t / d));

        // Good / bad answer.
        Add("ding", 0.5f, (t, d) => (Mathf.Sin(Tau * 880f * t) + 0.5f * Mathf.Sin(Tau * 1320f * t)) * Mathf.Exp(-t * 6f) * 0.4f);
        Add("buzz", 0.3f, (t, d) => Square(t, 110f) * 0.25f * (1f - t / d));

        // Boxing bell for a knockout and the end of the interview.
        Add("bell", 1.4f, (t, d) =>
            (Mathf.Sin(Tau * 523f * t) + Mathf.Sin(Tau * 1046f * t) * 0.5f + Mathf.Sin(Tau * 1569f * t) * 0.3f) * Mathf.Exp(-t * 3f) * 0.35f);
    }
}

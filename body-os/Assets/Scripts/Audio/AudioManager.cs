using System.Collections.Generic;
using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Sound slots. To use authored audio, drop a clip named exactly like the slot (e.g. "UiClick.wav")
    /// into Assets/Resources/Audio/. Missing clips fall back to procedurally synthesised sounds, so
    /// optional audio can never crash the game. Music slots: "MusicMenu", "MusicShip".
    /// </summary>
    public enum Sfx
    {
        UiClick, UiBack, OsOpen, OsClose, Confirm, Denied, Upgrade, LevelUp, Scan, ScanComplete, Vision,
        LowEnergy, Hazard, Objective, MissionComplete, Reality, Jump, Land, Pickup, DoorOpen, Damage,
        Recharge, Calibrate, Success, Transmission, Discovery, Memory, Threat, Interference, Footstep
    }

    public sealed class AudioManager : MonoBehaviour
    {
        public static AudioManager I { get; private set; }

        readonly Dictionary<Sfx, AudioClip> clips = new Dictionary<Sfx, AudioClip>();
        AudioSource[] voices;
        AudioSource music;
        AudioClip menuMusic, shipMusic;
        int nextVoice;
        float sfxVolume = 0.85f, musicVolume = 0.6f;
        readonly float[] lastPlayed = new float[64];

        void Awake()
        {
            I = this;
            voices = new AudioSource[8];
            for (int i = 0; i < voices.Length; i++)
            {
                voices[i] = gameObject.AddComponent<AudioSource>();
                voices[i].playOnAwake = false;
                voices[i].spatialBlend = 0f;
            }
            music = gameObject.AddComponent<AudioSource>();
            music.loop = true;
            music.playOnAwake = false;
            music.spatialBlend = 0f;
            // All sound is 2D, so the persistent manager owns the single AudioListener (cameras have none).
            gameObject.AddComponent<AudioListener>();
        }

        public void ApplyVolumes(GameSettings s)
        {
            sfxVolume = s.sfxVolume;
            musicVolume = s.musicVolume;
            if (music != null) music.volume = musicVolume * 0.5f;
        }

        AudioClip Clip(Sfx id)
        {
            if (clips.TryGetValue(id, out var c)) return c;
            AudioClip loaded = null;
            try { loaded = Resources.Load<AudioClip>("Audio/" + id); } catch { loaded = null; }
            c = loaded != null ? loaded : SfxSynth.Create(id);
            clips[id] = c;
            return c;
        }

        public void Play(Sfx id, float volume = 1f, float pitch = 1f)
        {
            int idx = (int)id;
            // Avoid stacking the same sound many times in one burst.
            if (idx < lastPlayed.Length)
            {
                if (Time.unscaledTime - lastPlayed[idx] < 0.05f) return;
                lastPlayed[idx] = Time.unscaledTime;
            }
            var clip = Clip(id);
            if (clip == null || voices == null) return;
            var v = voices[nextVoice];
            nextVoice = (nextVoice + 1) % voices.Length;
            v.pitch = pitch;
            v.PlayOneShot(clip, Mathf.Clamp01(volume * sfxVolume));
        }

        public void PlayMusic(bool menu)
        {
            AudioClip clip;
            if (menu)
            {
                if (menuMusic == null) menuMusic = LoadOr("MusicMenu", () => SfxSynth.Ambient("MusicMenu", 55f, 8f));
                clip = menuMusic;
            }
            else
            {
                if (shipMusic == null) shipMusic = LoadOr("MusicShip", () => SfxSynth.Ambient("MusicShip", 41.2f, 10f));
                clip = shipMusic;
            }
            if (music.clip == clip && music.isPlaying) return;
            music.clip = clip;
            music.volume = musicVolume * 0.5f;
            music.Play();
        }

        static AudioClip LoadOr(string name, System.Func<AudioClip> fallback)
        {
            AudioClip c = null;
            try { c = Resources.Load<AudioClip>("Audio/" + name); } catch { c = null; }
            return c != null ? c : fallback();
        }
    }
}

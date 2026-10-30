using System.Globalization;
using System.Speech.Recognition;
using System.Speech.Synthesis;

namespace JarvisAI.Desktop;

/// <summary>
/// Windows speech, offline, via System.Speech (SAPI):
///  - dictation for voice input (Windows Speech Recognition must be available
///    for your language; English is built in on most PCs),
///  - spoken replies with the voices installed in Windows,
///  - an offline wake-word listener that only recognises the wake phrase.
/// Events arrive on background threads; <paramref name="emit"/> must marshal.
/// </summary>
sealed class SpeechService : IDisposable
{
    readonly Action<string, object> emit;
    readonly SpeechSynthesizer synth = new();
    readonly Dictionary<Prompt, string> prompts = new();
    readonly object gate = new();
    SpeechRecognitionEngine? dictation;
    SpeechRecognitionEngine? wake;
    string wakePhrase = "Jarvis";
    bool wakeWanted;
    bool dictating;
    DateTime lastLevel;

    public SpeechService(Action<string, object> emit)
    {
        this.emit = emit;
        synth.SetOutputToDefaultAudioDevice();
        synth.SpeakStarted += (_, e) => { if (IdOf(e.Prompt, false) is { } id) emit("tts.start", new { id }); };
        synth.SpeakProgress += (_, e) => { if (IdOf(e.Prompt, false) is { } id) emit("tts.boundary", new { id }); };
        synth.SpeakCompleted += (_, e) =>
        {
            if (IdOf(e.Prompt, true) is { } id) emit("tts.done", new { id, stopped = e.Cancelled });
            bool idle;
            lock (gate) idle = prompts.Count == 0;
            if (idle) ResumeWake();
        };
    }

    public bool RecognitionAvailable
    {
        get
        {
            try { return SpeechRecognitionEngine.InstalledRecognizers().Count > 0; }
            catch (Exception) { return false; }
        }
    }

    string? IdOf(Prompt p, bool remove)
    {
        lock (gate)
        {
            if (!prompts.TryGetValue(p, out var id)) return null;
            if (remove) prompts.Remove(p);
            return id;
        }
    }

    static RecognizerInfo? PickRecognizer(string? lang)
    {
        var all = SpeechRecognitionEngine.InstalledRecognizers();
        if (all.Count == 0) return null;
        CultureInfo? want = null;
        try { if (!string.IsNullOrWhiteSpace(lang)) want = CultureInfo.GetCultureInfo(lang); } catch (CultureNotFoundException) { }
        return all.FirstOrDefault(r => want != null && r.Culture.Name.Equals(want.Name, StringComparison.OrdinalIgnoreCase))
               ?? all.FirstOrDefault(r => want != null && r.Culture.TwoLetterISOLanguageName == want.TwoLetterISOLanguageName)
               ?? all.FirstOrDefault(r => r.Culture.Name == CultureInfo.CurrentUICulture.Name)
               ?? all[0];
    }

    // ---- voice input ----------------------------------------------------------

    public void StartDictation(string? lang)
    {
        CancelDictation(silent: true);
        PauseWake();
        var info = PickRecognizer(lang) ?? throw new InvalidOperationException("Windows speech recognition is not installed for any language. Add a speech language in Settings > Time & language > Speech.");
        var engine = new SpeechRecognitionEngine(info);
        engine.LoadGrammar(new DictationGrammar());
        engine.InitialSilenceTimeout = TimeSpan.FromSeconds(7);
        engine.EndSilenceTimeout = TimeSpan.FromSeconds(0.9);
        engine.EndSilenceTimeoutAmbiguous = TimeSpan.FromSeconds(1.2);
        engine.SpeechHypothesized += (_, e) => emit("stt.partial", new { text = e.Result.Text });
        engine.AudioLevelUpdated += (_, e) =>
        {
            if ((DateTime.UtcNow - lastLevel).TotalMilliseconds < 50) return;
            lastLevel = DateTime.UtcNow;
            emit("stt.level", new { level = Math.Clamp(e.AudioLevel / 60.0, 0, 1) });
        };
        engine.RecognizeCompleted += (_, e) =>
        {
            if (!ReferenceEquals(engine, dictation)) return;
            dictating = false;
            if (e.Error != null)
                emit("stt.error", new { code = "audio", message = $"Microphone problem: {e.Error.Message}. Check Settings > Privacy & security > Microphone > Let desktop apps access your microphone." });
            else if (e.Cancelled) { }
            else if (e.Result != null && e.Result.Confidence >= 0.2f && e.Result.Text.Length > 0)
                emit("stt.final", new { text = e.Result.Text });
            else
                emit("stt.error", new { code = e.InitialSilenceTimeout ? "speech_timeout" : "no_match", message = "Didn't catch that." });
            emit("stt.end", new { });
            ResumeWake();
        };
        try
        {
            engine.SetInputToDefaultAudioDevice();
        }
        catch (InvalidOperationException)
        {
            engine.Dispose();
            ResumeWake();
            throw new InvalidOperationException("No microphone found, or microphone access is blocked. Check Settings > Privacy & security > Microphone.");
        }
        dictation?.Dispose();
        dictation = engine;
        dictating = true;
        engine.RecognizeAsync(RecognizeMode.Single);
        emit("stt.ready", new { });
    }

    public void StopDictation()
    {
        if (dictating) dictation?.RecognizeAsyncStop();
    }

    public void CancelDictation(bool silent = false)
    {
        if (dictation == null || !dictating) return;
        dictating = false;
        dictation.RecognizeAsyncCancel();
        if (!silent) emit("stt.end", new { });
    }

    // ---- wake word ------------------------------------------------------------

    public void StartWake(string phrase, string? lang)
    {
        wakePhrase = string.IsNullOrWhiteSpace(phrase) ? "Jarvis" : phrase.Trim();
        StopWake();
        var info = PickRecognizer(lang) ?? throw new InvalidOperationException("Windows speech recognition is not installed.");
        var engine = new SpeechRecognitionEngine(info);
        var choices = new Choices(wakePhrase, $"hey {wakePhrase}", $"okay {wakePhrase}");
        engine.LoadGrammar(new Grammar(new GrammarBuilder(choices) { Culture = info.Culture }) { Name = "wake" });
        engine.SpeechRecognized += (_, e) =>
        {
            if (e.Result.Confidence >= 0.8f && !dictating) emit("wake.detected", new { text = "" });
        };
        engine.SetInputToDefaultAudioDevice();
        wake = engine;
        wakeWanted = true;
        engine.RecognizeAsync(RecognizeMode.Multiple);
    }

    public void StopWake()
    {
        wakeWanted = false;
        if (wake == null) return;
        try { wake.RecognizeAsyncCancel(); } catch (InvalidOperationException) { }
        wake.Dispose();
        wake = null;
    }

    public bool WakeActive => wakeWanted;

    void PauseWake()
    {
        try { wake?.RecognizeAsyncCancel(); } catch (InvalidOperationException) { }
    }

    void ResumeWake()
    {
        if (!wakeWanted || wake == null || dictating) return;
        lock (gate) if (prompts.Count > 0) return;
        try { wake.RecognizeAsync(RecognizeMode.Multiple); } catch (InvalidOperationException) { /* already running */ }
    }

    // ---- spoken replies -----------------------------------------------------------

    public object[] Voices() => synth.GetInstalledVoices().Where(v => v.Enabled)
        .Select(v => (object)new { id = v.VoiceInfo.Name, name = $"{v.VoiceInfo.Name} ({v.VoiceInfo.Gender})", lang = v.VoiceInfo.Culture.Name })
        .ToArray();

    public void Speak(string text, string id, double rate, double volume, string? voice)
    {
        PauseWake(); // don't let JARVIS wake itself up
        if (!string.IsNullOrEmpty(voice))
        {
            try { synth.SelectVoice(voice); } catch (ArgumentException) { }
        }
        // UI rate 0.5x..2x maps to SAPI -10..+10.
        synth.Rate = (int)Math.Clamp(Math.Round(Math.Log2(Math.Max(rate, 0.1)) * 10), -10, 10);
        synth.Volume = (int)Math.Clamp(volume * 100, 0, 100);
        var prompt = new Prompt(text);
        lock (gate) prompts[prompt] = id;
        synth.SpeakAsync(prompt);
    }

    public void StopSpeaking() => synth.SpeakAsyncCancelAll();

    public void Dispose()
    {
        StopWake();
        dictation?.Dispose();
        synth.Dispose();
    }
}

# Voice

| | Android | Windows | Browser |
|---|---|---|---|
| Speech-to-text | Android `SpeechRecognizer` (usually Google; offline if you downloaded offline speech) | Windows Speech Recognition (System.Speech), offline | Web Speech API (Chrome/Edge; usually cloud-based) |
| Text-to-speech | Android TextToSpeech | Windows voices (SAPI) | `speechSynthesis` |
| Speed / volume | Yes / yes (and pitch) | Yes / yes | Yes / yes (and pitch) |
| Listening animation level | Real microphone level | Real microphone level | Simulated |
| Wake word | Only while the app is open on screen | Offline, while the app runs (also minimised or in the tray) | Only while the tab is visible |

## How a voice conversation works

1. Tap the mic, or press **Ctrl+Alt+J** on Windows, or say the wake word. The core turns green and shows **LISTENING**. Your words appear in the input box as you speak.
2. When you stop speaking, the text is sent automatically.
3. **THINKING**: the reply streams in. With **Voice replies** on, JARVIS starts speaking each sentence as soon as it's complete (**SPEAKING**). Code blocks aren't read out; JARVIS says the code is on screen.
4. **Interrupt** at any time: tap the mic to stop it talking and listen, tap **Stop speaking**, press **Esc**, or tap the red **Stop** button to stop the reply itself.
5. With **Hands-free** on, JARVIS listens again after answering a spoken question.

## Wake word: what it really does

**Windows (implemented, untested on real hardware):** a second Windows speech recogniser with a tiny grammar listens offline for "Jarvis", "hey Jarvis" or "okay Jarvis" (or your own phrase). Nothing leaves the PC. When it hears the phrase with high confidence, JARVIS comes forward and starts listening for your request. It pauses while JARVIS speaks, so it can't wake itself. With the wake word on, closing the window keeps JARVIS in the tray. CPU use is small, but the microphone stays in use (Windows shows the microphone indicator).

**Android (implemented, untested on a device):** Android doesn't allow normal apps to keep a speech recogniser running in the background, and a true always-on hotword needs a special system role or a third-party engine. So JARVIS doesn't pretend: wake-word listening on Android works **only while JARVIS is open on screen**. It repeatedly restarts the phone's recogniser and checks for your wake phrase, and it stops the moment you switch apps or the screen turns off. Drawbacks:
- noticeably higher battery use
- some phones beep each time listening restarts
- with Google's online recogniser, audio is sent to Google while it listens

For hands-free use in the car or kitchen, keep JARVIS on screen with the screen on (charging). Otherwise the mic button is the better choice.

If you want true background hotword detection later, the practical options are a dedicated wake-word engine (for example Picovoice Porcupine, a paid service with a free tier, running in a foreground service with a persistent notification) or Android's built-in assistant integration. Neither is implemented here.

## Language

Settings > Voice > Language sets the recognition language (English UK by default). On Windows, the matching speech language must be installed. Ask JARVIS to reply in the same language, for example by adding it to Custom instructions.

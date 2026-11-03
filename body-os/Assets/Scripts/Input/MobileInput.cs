using UnityEngine;

namespace BodyOS
{
    /// <summary>
    /// Aggregated gameplay input. Touch controls (joystick, look area, buttons) write into it; the player
    /// and camera read from it. Keyboard/mouse is merged in on desktop/editor for testing only — the game
    /// never requires a physical keyboard.
    /// </summary>
    public static class MobileInput
    {
        public static Vector2 JoystickMove;
        static Vector2 lookAccum;
        static bool jumpQueued, interactQueued;
        static float jumpQueuedAt;

        public static Vector2 Move { get; private set; }
        public static bool JumpHeld { get; set; }

        public static bool Blocked => Game.I == null || Game.I.GameplayBlocked;

        public static void AddLook(Vector2 delta) { if (!Blocked) lookAccum += delta; }

        /// <summary>Returns and clears the look delta accumulated since the last call (in reference pixels).</summary>
        public static Vector2 ConsumeLook()
        {
            var d = lookAccum;
            lookAccum = Vector2.zero;
            return Blocked ? Vector2.zero : d;
        }

        public static void QueueJump() { if (!Blocked) { jumpQueued = true; jumpQueuedAt = Time.time; } }
        public static void QueueInteract() { if (!Blocked) interactQueued = true; }

        /// <summary>Jump presses are buffered briefly so a tap just before landing still jumps.</summary>
        public static bool ConsumeJump(float buffer)
        {
            if (!jumpQueued) return false;
            if (Time.time - jumpQueuedAt > buffer) { jumpQueued = false; return false; }
            return true;
        }

        public static void ClearJump() { jumpQueued = false; }

        public static bool ConsumeInteract()
        {
            bool v = interactQueued;
            interactQueued = false;
            return v && !Blocked;
        }

        public static void ResetAll()
        {
            JoystickMove = Vector2.zero;
            lookAccum = Vector2.zero;
            jumpQueued = false;
            interactQueued = false;
            JumpHeld = false;
            Move = Vector2.zero;
            VirtualJoystick.ReleaseAll();
        }

        /// <summary>Called once per frame by Game.</summary>
        public static void Poll()
        {
            Vector2 m = JoystickMove;
#if ENABLE_LEGACY_INPUT_MANAGER
            if (!Application.isMobilePlatform)
            {
                Vector2 k = Vector2.zero;
                if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) k.y += 1;
                if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) k.y -= 1;
                if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) k.x += 1;
                if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) k.x -= 1;
                if (k.sqrMagnitude > 0f) m = Vector2.ClampMagnitude(m + k, 1f);
                if (!Blocked)
                {
                    if (Input.GetKeyDown(KeyCode.Space)) QueueJump();
                    if (Input.GetKeyDown(KeyCode.E)) QueueInteract();
                    if (Input.GetKeyDown(KeyCode.Q) && Game.I.Vision != null) Game.I.Vision.Cycle();
                }
                if (Input.GetKeyDown(KeyCode.Tab) && Game.I != null && Game.I.InGame) UIRoot.I?.ToggleBodyOS();
            }
            // Escape is also the Android system Back button: close the top menu or pause.
            if (Input.GetKeyDown(KeyCode.Escape) && Game.I != null) UIRoot.I?.HandleBack();
#endif
            Move = Blocked ? Vector2.zero : m;
        }
    }
}

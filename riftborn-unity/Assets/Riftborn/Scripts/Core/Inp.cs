// Riftborn — input through the Input System package (AR Foundation brings
// it in): one pointer (mouse or first finger), two-finger pinch, the mouse
// wheel and the keys used to walk around on a PC.
using UnityEngine;
using UnityEngine.InputSystem;

namespace Riftborn
{
    public static class Inp
    {
        static Vector2 lastPos;

        // Screen position, bottom-left origin (like Unity's screen space).
        public static Vector2 Pos
        {
            get
            {
                var p = Pointer.current;
                if (p != null) lastPos = p.position.ReadValue();
                return lastPos;
            }
        }
        public static bool Down => Pointer.current != null && Pointer.current.press.wasPressedThisFrame;
        public static bool Held => Pointer.current != null && Pointer.current.press.isPressed;
        public static bool Up => Pointer.current != null && Pointer.current.press.wasReleasedThisFrame;

        public static int Touches
        {
            get
            {
                var ts = Touchscreen.current;
                if (ts == null) return 0;
                int n = 0;
                foreach (var t in ts.touches) if (t.isInProgress) n++;
                return n;
            }
        }

        // Distance between the first two fingers (0 if there aren't two).
        public static float PinchSpan
        {
            get
            {
                var ts = Touchscreen.current;
                if (ts == null) return 0;
                Vector2? a = null;
                foreach (var t in ts.touches)
                {
                    if (!t.isInProgress) continue;
                    var p = t.position.ReadValue();
                    if (a == null) a = p; else return Vector2.Distance(a.Value, p);
                }
                return 0;
            }
        }

        public static float Scroll => Mouse.current != null ? Mouse.current.scroll.ReadValue().y : 0;

        public static bool Key(Key k) => Keyboard.current != null && Keyboard.current[k].isPressed;
        public static bool KeyDown(Key k) => Keyboard.current != null && Keyboard.current[k].wasPressedThisFrame;

        // WASD / arrow keys as a vector (x = right, y = forward).
        public static Vector2 Walk
        {
            get
            {
                var v = Vector2.zero;
                if (Key(UnityEngine.InputSystem.Key.W) || Key(UnityEngine.InputSystem.Key.UpArrow)) v.y += 1;
                if (Key(UnityEngine.InputSystem.Key.S) || Key(UnityEngine.InputSystem.Key.DownArrow)) v.y -= 1;
                if (Key(UnityEngine.InputSystem.Key.D) || Key(UnityEngine.InputSystem.Key.RightArrow)) v.x += 1;
                if (Key(UnityEngine.InputSystem.Key.A) || Key(UnityEngine.InputSystem.Key.LeftArrow)) v.x -= 1;
                return v.sqrMagnitude > 1 ? v.normalized : v;
            }
        }
        public static bool Run => Key(UnityEngine.InputSystem.Key.LeftShift) || Key(UnityEngine.InputSystem.Key.RightShift);
    }
}

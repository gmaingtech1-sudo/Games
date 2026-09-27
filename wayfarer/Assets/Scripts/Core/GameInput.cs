using UnityEngine;

namespace Wayfarer
{
    /// <summary>Keyboard and mouse input (Unity's built-in Input Manager).</summary>
    public static class GameInput
    {
        public static bool CursorLocked { get; private set; }
        public static Vector2 MouseDelta { get; private set; }
        public static float Scroll { get; private set; }
        public static bool InputBroken { get; private set; }
        static bool uiCaptured;

        public static void Update(bool wantLock)
        {
            if (wantLock != CursorLocked)
            {
                CursorLocked = wantLock;
                Cursor.lockState = wantLock ? CursorLockMode.Locked : CursorLockMode.None;
                Cursor.visible = !wantLock;
            }
            if (CursorLocked && Cursor.lockState != CursorLockMode.Locked && !InputBroken)
            {
                // the OS stole the cursor (alt-tab); re-lock on click
                try { if (Input.GetMouseButtonDown(0)) Cursor.lockState = CursorLockMode.Locked; }
                catch (System.Exception) { InputBroken = true; }
            }
            float sens = Settings.MouseSensitivity;
            float mx = 0f, my = 0f;
            try
            {
                mx = Input.GetAxisRaw("Mouse X") * sens;
                my = Input.GetAxisRaw("Mouse Y") * sens * (Settings.InvertY ? -1f : 1f);
            }
            catch (System.Exception)
            {
                if (!InputBroken) Debug.LogError("Wayfarer needs the classic Input Manager. In Edit > Project Settings > Player, set Active Input Handling to \"Both\" and restart Unity (or run Wayfarer > Set Up Project).");
                InputBroken = true;
            }
            MouseDelta = CursorLocked && Cursor.lockState == CursorLockMode.Locked ? new Vector2(mx, my) : Vector2.zero;
            if (!InputBroken) Scroll = Input.mouseScrollDelta.y;
        }

        public static void CaptureUI(bool captured) => uiCaptured = captured;

        static bool Allowed => !uiCaptured && !InputBroken;

        /// <summary>A key press that ignores UI capture (menus use it to close themselves).</summary>
        public static bool RawDown(KeyCode k) => !InputBroken && Input.GetKeyDown(k);

        public static bool Key(KeyCode k) => Allowed && Input.GetKey(k);
        public static bool Down(KeyCode k) => Allowed && Input.GetKeyDown(k);
        public static bool Up(KeyCode k) => Allowed && Input.GetKeyUp(k);
        public static bool AnyDown(params KeyCode[] keys)
        {
            if (!Allowed) return false;
            foreach (var k in keys) if (Input.GetKeyDown(k)) return true;
            return false;
        }

        public static bool Fire => Allowed && CursorLocked && Input.GetMouseButton(0);
        public static bool FireDown => Allowed && CursorLocked && Input.GetMouseButtonDown(0);
        public static bool AltFire => Allowed && CursorLocked && Input.GetMouseButton(1);
        public static bool AltFireDown => Allowed && CursorLocked && Input.GetMouseButtonDown(1);

        public static float Axis(KeyCode pos, KeyCode neg, KeyCode pos2 = KeyCode.None, KeyCode neg2 = KeyCode.None)
        {
            float v = 0;
            if (Key(pos) || (pos2 != KeyCode.None && Key(pos2))) v += 1;
            if (Key(neg) || (neg2 != KeyCode.None && Key(neg2))) v -= 1;
            return v;
        }

        public static Vector2 Move => new Vector2(
            Axis(KeyCode.D, KeyCode.A, KeyCode.RightArrow, KeyCode.LeftArrow),
            Axis(KeyCode.W, KeyCode.S, KeyCode.UpArrow, KeyCode.DownArrow));
    }
}

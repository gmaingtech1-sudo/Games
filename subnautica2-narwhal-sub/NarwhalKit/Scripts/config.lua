-- Narwhal Kit settings. Save, then restart the game or press Ctrl+R in-game.
--
-- Key names are UE4SS key names (F1..F12, letters A..Z, NUM_ZERO..NUM_NINE,
-- INS, HOME, PAGE_UP, DEL, END, PAGE_DOWN). Modifiers: CONTROL, SHIFT, ALT.

return {
    Keys = {
        ToggleBody = { Key = "F10", Modifiers = {} },            -- show or hide the Narwhal body
        NextPaint  = { Key = "F11", Modifiers = {} },            -- change paint scheme
    },

    -- Start with the body showing.
    StartEnabled = true,

    -- The game's own chassis (Seafrog, Scout Ray, Haul) wrap around the
    -- Tadpole too, so by default the Narwhal steps aside while one is attached.
    ShowWithChassis = false,

    -- Starting paint scheme; see Paints below.
    Paint = "Narwhal",

    -- Fine-tuning the fit, in centimetres. +X is forward, +Y right, +Z up.
    Offset = { X = 0, Y = 0, Z = 0 },
    Scale = 1.0,

    Shadows = true,

    -- Paint schemes: colours are 0..1 RGB. Glow is also multiplied by GlowStrength.
    Paints = {
        Narwhal = { hull = { 0.035, 0.24, 0.32 }, belly = { 0.80, 0.82, 0.78 }, trim = { 0.045, 0.05, 0.055 }, tusk = { 0.90, 0.85, 0.70 }, glow = { 0.45, 0.90, 1.00 } },
        Orca    = { hull = { 0.02, 0.02, 0.025 }, belly = { 0.92, 0.92, 0.90 }, trim = { 0.30, 0.31, 0.33 }, tusk = { 0.95, 0.95, 0.92 }, glow = { 1.00, 1.00, 1.00 } },
        Beluga  = { hull = { 0.85, 0.87, 0.88 }, belly = { 0.70, 0.74, 0.76 }, trim = { 0.20, 0.30, 0.36 }, tusk = { 0.95, 0.90, 0.78 }, glow = { 0.40, 1.00, 0.85 } },
        Abyss   = { hull = { 0.10, 0.03, 0.16 }, belly = { 0.25, 0.12, 0.30 }, trim = { 0.05, 0.04, 0.06 }, tusk = { 0.80, 0.75, 0.95 }, glow = { 1.00, 0.25, 0.85 } },
        Reef    = { hull = { 0.90, 0.38, 0.12 }, belly = { 0.98, 0.90, 0.75 }, trim = { 0.08, 0.10, 0.12 }, tusk = { 1.00, 0.96, 0.85 }, glow = { 1.00, 0.85, 0.30 } },
    },
    PaintOrder = { "Narwhal", "Orca", "Beluga", "Abyss", "Reef" },
    GlowStrength = 8.0,

    -- How paint gets onto the body. The Narwhal borrows the Tadpole's own
    -- material, so it's lit and shaded like the rest of the game, and tints
    -- any colour parameters that material has. The mod prints the
    -- parameter names it finds to the UE4SS console; if a name it should
    -- tint is missing, add part of it here (matching ignores case).
    ColorParams = { "color", "colour", "tint", "albedo", "diffuse", "paint" },
    GlowParams = { "emissive", "emission", "glow" },

    -- Which of the Tadpole's materials to paint with. -1 picks its hull paint
    -- automatically (skipping glass and lights); set a number to force one.
    MaterialIndex = -1,

    -- Print extra detail to the UE4SS console.
    Debug = false,
}

-- Diver's Companion settings.
--
-- Change anything here, save, then either restart the game or press Ctrl+R
-- with the game window focused to hot-reload UE4SS mods.
--
-- Key names are UE4SS key names: F1..F12, NUM_ZERO..NUM_NINE, INS, HOME,
-- PAGE_UP, DEL, END, PAGE_DOWN, and letters A..Z. Modifiers are CONTROL,
-- SHIFT and ALT; leave the list empty for no modifier.

return {
    ---------------------------------------------------------------------------
    -- Hotkeys
    ---------------------------------------------------------------------------
    Keys = {
        StatusReport = { Key = "F5", Modifiers = {} },  -- show depth, vitals, time and vehicle power
        ToggleTurbo  = { Key = "F6", Modifiers = {} },  -- turn Turbo Fins on or off
        ToggleAlerts = { Key = "F7", Modifiers = {} },  -- mute or unmute the survival alerts
        Recall       = { Key = "F8", Modifiers = {} },  -- press twice to return to your bed / start point
        Unstuck      = { Key = "F9", Modifiers = {} },  -- the game's own unstuck, on a key
    },

    ---------------------------------------------------------------------------
    -- Survival alerts: on-screen warnings before things go wrong
    ---------------------------------------------------------------------------
    Alerts = {
        Enabled = true,
        -- Each value is a fraction of the maximum (0.25 = 25%).
        OxygenWarning   = 0.30,
        OxygenCritical  = 0.15,
        HealthWarning   = 0.35,
        FoodWarning     = 0.20,
        WaterWarning    = 0.20,
        VehiclePowerWarning  = 0.20,
        VehiclePowerCritical = 0.05,
        -- Warn when a vehicle you're in gets within this fraction of its crush depth.
        CrushDepthWarning = 0.90,
        -- Warn when your body temperature reaches the level where it starts to hurt.
        Temperature = true,
        -- Tell you when dusk and dawn arrive.
        DayNight = true,
    },

    ---------------------------------------------------------------------------
    -- Emergency O2: a one-off reserve tank that saves you from drowning
    ---------------------------------------------------------------------------
    EmergencyOxygen = {
        Enabled = true,
        TriggerAt = 0.04,         -- release the reserve when oxygen falls to 4%
        RefillTo = 0.40,          -- ...and top you up to 40%
        CooldownSeconds = 600,    -- then it needs 10 minutes to recharge
    },

    ---------------------------------------------------------------------------
    -- Turbo Fins: a faster swim and walk you can switch on and off
    ---------------------------------------------------------------------------
    Turbo = {
        StartEnabled = false,
        SwimMultiplier = 1.5,
        WalkMultiplier = 1.25,
    },

    ---------------------------------------------------------------------------
    -- Relaxed survival: 1.0 is the normal game, 0.5 means half as fast
    ---------------------------------------------------------------------------
    Survival = {
        HungerRate = 1.0,       -- below 1.0 only; e.g. 0.5 makes food last twice as long
        ThirstRate = 1.0,
        SuffocationRate = 1.0,  -- how fast oxygen runs out underwater
    },

    -- How long the mod's on-screen messages stay up, in seconds.
    NotificationSeconds = 5.0,

    -- Print extra detail to the UE4SS console while you're tinkering.
    Debug = false,
}

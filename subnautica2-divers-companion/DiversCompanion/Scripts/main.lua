-- Diver's Companion for Subnautica 2
--
-- A UE4SS Lua mod that watches your back underwater: early warnings for
-- oxygen, health, food, water, heat, cold and vehicle power, an emergency
-- oxygen reserve, a status report on a key, Turbo Fins, a recall-home key
-- and adjustable hunger, thirst and oxygen rates. Settings live in config.lua.
--
-- Built against the game's reflection data (build CL-128456, UE 5.6).

local UEHelpers = require("UEHelpers")
local cfg = require("config")

local MOD_NAME = "DiversCompanion"
local TICK_MS = 500

-- EUWENotificationType values from /Script/UWENotifications
local NOTE_INFO, NOTE_WARNING, NOTE_ERROR, NOTE_CRITICAL = 5, 6, 7, 8

-- EDayPhase values from /Script/UWETimeOfDay
local DAY_PHASE_NAMES = { [1] = "Night", [2] = "Dawn", [3] = "Day", [4] = "Dusk" }
local PHASE_DAWN, PHASE_DUSK = 2, 4

local function log(msg)
    print(string.format("[%s] %s\n", MOD_NAME, msg))
end

local function debug(msg)
    if cfg.Debug then log(msg) end
end

local function valid(obj)
    return obj ~= nil and obj:IsValid()
end

-- Seconds since the mod loaded, counted in ticks so it follows wall time.
local clock = 0
local function now()
    return clock
end

local function pct(fraction)
    return string.format("%d%%", math.floor(fraction * 100 + 0.5))
end

local function formatSeconds(s)
    s = math.max(0, math.floor(s + 0.5))
    if s >= 60 then
        return string.format("%dm %02ds", s // 60, s % 60)
    end
    return string.format("%ds", s)
end

-------------------------------------------------------------------------------
-- State
-------------------------------------------------------------------------------

local state = {
    character = nil,       -- the local SN2PlayerCharacter
    characterAddr = nil,
    survivalSet = nil,     -- UWESurvivalAttributeSet on that character
    healthSet = nil,       -- UWEHealthAttributeSet on that character

    alertsOn = cfg.Alerts.Enabled,
    turboOn = cfg.Turbo.StartEnabled,
    baseSwim = nil,        -- the character's swim speed before Turbo Fins
    baseWalk = nil,

    lastLevels = {},       -- attribute name -> value after our last tick, for relaxed survival

    lastOxygen = nil,
    oxygenDrain = 0,       -- smoothed oxygen lost per second

    emergencyReadyAt = 0,
    recallArmedUntil = 0,
    dayPhase = nil,

    -- Which alerts are currently showing, so each fires once until it clears.
    raised = {},

    errorsLogged = 0,
}

-------------------------------------------------------------------------------
-- Finding the player
-------------------------------------------------------------------------------

local function isPlayerCharacter(pawn)
    if not valid(pawn) then return false end
    local ok, comp = pcall(function() return pawn.SurvivalSetComponent end)
    return ok and valid(comp)
end

-- Attribute sets are subobjects of the character, so match on their Outer.
local function findSetFor(className, character)
    local all = FindAllOf(className)
    if not all then return nil end
    local addr = character:GetAddress()
    for _, set in ipairs(all) do
        if set:IsValid() then
            local outer = set:GetOuter()
            if valid(outer) and outer:GetAddress() == addr then
                return set
            end
        end
    end
    return nil
end

local function resetCharacterState()
    state.survivalSet = nil
    state.healthSet = nil
    state.baseSwim = nil
    state.baseWalk = nil
    state.lastLevels = {}
    state.lastOxygen = nil
    state.oxygenDrain = 0
    state.raised = {}
end

-- Returns the local player's character, or nil while on the menus. While you
-- pilot a vehicle the controller possesses the vehicle, so we keep using the
-- character we found last.
-- Used when the game loads with you already in a vehicle: pick the character
-- that belongs to our player state.
local function findOwnCharacter(pc)
    local ps = pc.PlayerState
    if not valid(ps) then return nil end
    local all = FindAllOf("SN2PlayerCharacter")
    if not all then return nil end
    for _, character in ipairs(all) do
        if character:IsValid() then
            local cps = character:GetPS()
            if valid(cps) and cps:GetAddress() == ps:GetAddress() then
                return character
            end
        end
    end
    return nil
end

local function getCharacter()
    local pc = UEHelpers.GetPlayerController()
    if valid(pc) then
        local pawn = pc.Pawn
        if not isPlayerCharacter(pawn) and not valid(state.character) then
            pawn = findOwnCharacter(pc)
        end
        if isPlayerCharacter(pawn) then
            local addr = pawn:GetAddress()
            if addr ~= state.characterAddr then
                state.character = pawn
                state.characterAddr = addr
                resetCharacterState()
                debug("Found player character " .. pawn:GetFullName())
            end
        end
    end
    if valid(state.character) then
        if not valid(state.survivalSet) then
            state.survivalSet = findSetFor("UWESurvivalAttributeSet", state.character)
        end
        if not valid(state.healthSet) then
            state.healthSet = findSetFor("UWEHealthAttributeSet", state.character)
        end
        return state.character
    end
    state.character = nil
    state.characterAddr = nil
    return nil
end

local function getPlayerState()
    local pc = UEHelpers.GetPlayerController()
    if valid(pc) and valid(pc.PlayerState) then return pc.PlayerState end
    if valid(state.character) then return state.character:GetPS() end
    return nil
end

-- The vehicle the player is in (or piloting), if any.
local function getVehicle(character)
    local pc = UEHelpers.GetPlayerController()
    if valid(pc) then
        local pawn = pc.Pawn
        if valid(pawn) and not isPlayerCharacter(pawn) then
            local ok, mech = pcall(function() return pawn.MechanicalSetComponent end)
            if ok and valid(mech) then return pawn, mech end
        end
    end
    if valid(character) then
        local sub = character:GetSubmarinePlayerIsIn()
        if valid(sub) and valid(sub.MechanicalSetComponent) then
            return sub, sub.MechanicalSetComponent
        end
    end
    return nil, nil
end

-------------------------------------------------------------------------------
-- On-screen messages, using the game's own notification pop-ups
-------------------------------------------------------------------------------

local function notify(header, text, kind)
    log(header .. ": " .. text)
    local ps = getPlayerState()
    if not valid(ps) then return end
    local data = {
        HeaderText = FText(header),
        Text = FText(text),
        Type = kind or NOTE_INFO,
        NotificationDuration = cfg.NotificationSeconds,
    }
    local ok, err = pcall(function()
        ps.NotificationComponent:ClientNotify(data)
    end)
    if not ok then
        -- Fall back to the static helper the game uses for server-sent notes.
        local statics = StaticFindObject("/Script/UWENotifications.Default__UWENotificationStatics")
        local ok2 = valid(statics) and pcall(function()
            statics:SendNotificationToPlayers(ps, data, { ps })
        end)
        if not ok2 then debug("Could not show notification: " .. tostring(err)) end
    end
end

-- Raise an alert once; it can fire again after the condition has cleared.
local function alert(id, active, header, text, kind)
    if active then
        if not state.raised[id] then
            state.raised[id] = true
            if state.alertsOn then notify(header, text, kind) end
        end
    else
        state.raised[id] = nil
    end
end

-------------------------------------------------------------------------------
-- Attribute helpers
-------------------------------------------------------------------------------

-- Gameplay Ability System attributes keep a base and a current value; set both.
local function setAttr(set, name, value)
    set[name].BaseValue = value
    set[name].CurrentValue = value
end

local function getAttr(set, name)
    return set[name].CurrentValue
end

-------------------------------------------------------------------------------
-- Features
-------------------------------------------------------------------------------

-- Relaxed survival. The game saves its drain-rate attributes with your
-- character, so rather than change them we hand back part of whatever was
-- drained since the last tick. Nothing the mod does here ends up in a save
-- beyond the levels themselves.
local RELAXED = {
    { attr = "Food", max = "MaxFood", setting = "HungerRate" },
    { attr = "Water", max = "MaxWater", setting = "ThirstRate" },
    { attr = "Oxygen", max = "MaxOxygen", setting = "SuffocationRate" },
}

local function relaxDrain()
    local set = state.survivalSet
    if not valid(set) then return end
    for _, r in ipairs(RELAXED) do
        local multiplier = cfg.Survival[r.setting]
        local value = getAttr(set, r.attr)
        local last = state.lastLevels[r.attr]
        if multiplier < 1.0 and last ~= nil and value < last then
            local drop = last - value
            -- Only steady drain, not a big one-off cost such as a dash.
            if drop <= getAttr(set, r.max) * 0.05 then
                value = value + drop * (1.0 - multiplier)
                setAttr(set, r.attr, value)
            end
        end
        state.lastLevels[r.attr] = value
    end
end

local function applyTurbo(character)
    local move = character.MovementSetComponent
    if not valid(move) then return end
    if state.turboOn then
        if state.baseSwim == nil then
            state.baseSwim = move:GetBaseSwimSpeed()
            state.baseWalk = move:GetBaseWalkSpeed()
        end
        local swim = state.baseSwim * cfg.Turbo.SwimMultiplier
        local walk = state.baseWalk * cfg.Turbo.WalkMultiplier
        if math.abs(move:GetBaseSwimSpeed() - swim) > 0.01 then move:SetBaseSwimSpeed(swim) end
        if math.abs(move:GetBaseWalkSpeed() - walk) > 0.01 then move:SetBaseWalkSpeed(walk) end
    elseif state.baseSwim ~= nil then
        move:SetBaseSwimSpeed(state.baseSwim)
        move:SetBaseWalkSpeed(state.baseWalk)
        state.baseSwim = nil
        state.baseWalk = nil
    end
end

local function trackOxygen(survival, dt)
    local oxygen = survival:GetOxygen()
    if state.lastOxygen ~= nil and dt > 0 then
        local drain = (state.lastOxygen - oxygen) / dt
        if drain < 0 then
            state.oxygenDrain = 0   -- breathing again
        else
            state.oxygenDrain = state.oxygenDrain * 0.7 + drain * 0.3
        end
    end
    state.lastOxygen = oxygen
    return oxygen
end

local function oxygenTimeLeft(oxygen)
    if state.oxygenDrain > 0.01 then return oxygen / state.oxygenDrain end
    return nil
end

local function updateEmergencyOxygen(survival)
    local e = cfg.EmergencyOxygen
    if not e.Enabled or not valid(state.survivalSet) then return end
    local maxO2 = survival:GetMaxOxygen()
    if maxO2 <= 0 or state.oxygenDrain <= 0 then return end
    if survival:GetOxygen() / maxO2 > e.TriggerAt then return end
    if now() < state.emergencyReadyAt then return end

    setAttr(state.survivalSet, "Oxygen", maxO2 * e.RefillTo)
    state.lastOxygen = maxO2 * e.RefillTo
    state.lastLevels.Oxygen = nil
    state.emergencyReadyAt = now() + e.CooldownSeconds
    notify("Emergency O2 released",
        string.format("Reserve tank opened: oxygen back to %s. Head for air! Recharges in %s.",
            pct(e.RefillTo), formatSeconds(e.CooldownSeconds)),
        NOTE_CRITICAL)
end

local function checkVitals(character, survival, oxygen)
    local a = cfg.Alerts
    local maxO2 = survival:GetMaxOxygen()
    if maxO2 > 0 then
        local o2 = oxygen / maxO2
        local left = oxygenTimeLeft(oxygen)
        local leftText = left and (" About " .. formatSeconds(left) .. " of air left.") or ""
        alert("o2crit", state.oxygenDrain > 0 and o2 <= a.OxygenCritical,
            "Oxygen critical", "Oxygen at " .. pct(o2) .. "." .. leftText .. " Surface now!", NOTE_CRITICAL)
        alert("o2low", state.oxygenDrain > 0 and o2 <= a.OxygenWarning,
            "Oxygen low", "Oxygen at " .. pct(o2) .. "." .. leftText .. " Start heading up.", NOTE_WARNING)
    end

    alert("food", survival:GetNormalizedFood() <= a.FoodWarning,
        "Hungry", "Food at " .. pct(survival:GetNormalizedFood()) .. ". Time to eat something.", NOTE_WARNING)
    alert("water", survival:GetNormalizedWater() <= a.WaterWarning,
        "Thirsty", "Water at " .. pct(survival:GetNormalizedWater()) .. ". Find a drink soon.", NOTE_WARNING)

    local health = character.HealthSetComponent
    if valid(health) and health:IsAlive() then
        local hp = health:GetNormalizedHealth()
        alert("health", hp <= a.HealthWarning,
            "Health low", "Health at " .. pct(hp) .. ". Patch yourself up before taking more risks.", NOTE_ERROR)
    end

    local hs = state.healthSet
    if a.Temperature and valid(hs) then
        local temp = getAttr(hs, "InternalTemperature")
        local hot = getAttr(hs, "TemperatureDamageThresholdHotLow")
        local cold = getAttr(hs, "TemperatureDamageThresholdColdLow")
        alert("hot", hot > cold and temp >= hot,
            "Overheating", "Your body is getting dangerously hot. Move away from the heat.", NOTE_ERROR)
        alert("cold", hot > cold and temp <= cold,
            "Freezing", "Your body is getting dangerously cold. Find somewhere warmer.", NOTE_ERROR)
    end
end

local function checkVehicle(character)
    local a = cfg.Alerts
    local vehicle, mech = getVehicle(character)
    if not vehicle then
        alert("vpow", false); alert("vpowcrit", false); alert("crush", false)
        return
    end
    local power = mech:GetNormalizedEnergy()
    alert("vpowcrit", power <= a.VehiclePowerCritical,
        "Vehicle power critical", "Vehicle power at " .. pct(power) .. ". Recharge or swap the battery now!", NOTE_CRITICAL)
    alert("vpow", power <= a.VehiclePowerWarning,
        "Vehicle power low", "Vehicle power at " .. pct(power) .. ".", NOTE_WARNING)

    local crush = mech:GetCrushDepth()
    local depth = character:GetDepthMetersSanitized()
    alert("crush", crush > 0 and depth >= crush * a.CrushDepthWarning,
        "Crush depth",
        string.format("You're at %dm and this vehicle's hull is rated to %dm. Ascend!", math.floor(depth), math.floor(crush)),
        NOTE_CRITICAL)
end

local function timeOfDayStatics()
    local statics = StaticFindObject("/Script/UWETimeOfDay.Default__UWETimeOfDayStatics")
    if valid(statics) then return statics end
    return nil
end

local function checkDayPhase(character)
    if not cfg.Alerts.DayNight then return end
    local statics = timeOfDayStatics()
    if not statics then return end
    local phase = statics:GetDayPhase(character)
    if phase ~= state.dayPhase then
        local previous = state.dayPhase
        state.dayPhase = phase
        if previous == nil or not state.alertsOn then return end
        if phase == PHASE_DUSK then
            notify("Dusk", "The sun is going down. Keep a light handy and watch the dark water.", NOTE_INFO)
        elseif phase == PHASE_DAWN then
            notify("Dawn", "The sun is coming up. You made it through the night.", NOTE_INFO)
        end
    end
end

local function tick()
    local character = getCharacter()
    local dt = TICK_MS / 1000
    if not character then return end

    local survival = character.SurvivalSetComponent
    if not valid(survival) then return end

    relaxDrain()
    applyTurbo(character)
    local oxygen = trackOxygen(survival, dt)
    updateEmergencyOxygen(survival)
    checkVitals(character, survival, oxygen)
    checkVehicle(character)
    checkDayPhase(character)
end

-------------------------------------------------------------------------------
-- Hotkey actions
-------------------------------------------------------------------------------

local function statusReport()
    local character = getCharacter()
    if not character then return end
    local lines = {}
    local survival = character.SurvivalSetComponent
    local health = character.HealthSetComponent

    table.insert(lines, string.format("Depth %dm", math.floor(character:GetDepthMetersSanitized())))
    if valid(health) then
        table.insert(lines, "Health " .. pct(health:GetNormalizedHealth()))
    end
    if valid(survival) then
        local o2 = "O2 " .. pct(survival:GetNormalizedOxygen())
        local left = oxygenTimeLeft(survival:GetOxygen())
        if left then o2 = o2 .. " (" .. formatSeconds(left) .. ")" end
        table.insert(lines, o2)
        table.insert(lines, "Food " .. pct(survival:GetNormalizedFood()))
        table.insert(lines, "Water " .. pct(survival:GetNormalizedWater()))
    end

    local vehicle, mech = getVehicle(character)
    if vehicle then
        local v = "Vehicle power " .. pct(mech:GetNormalizedEnergy())
        local crush = mech:GetCrushDepth()
        if crush > 0 then v = v .. string.format(", hull rated to %dm", math.floor(crush)) end
        table.insert(lines, v)
    end

    local statics = timeOfDayStatics()
    if statics then
        local hm = statics:GetTimeOfDay(character)
        local phase = DAY_PHASE_NAMES[statics:GetDayPhase(character)] or ""
        table.insert(lines, string.format("Day %d, %02d:%02d %s",
            statics:GetDayNumber(character), hm.Hour, hm.Minute, phase))
    end

    if state.turboOn then table.insert(lines, "Turbo Fins on") end
    if cfg.EmergencyOxygen.Enabled then
        local wait = state.emergencyReadyAt - now()
        table.insert(lines, wait > 0 and ("Emergency O2 recharging, " .. formatSeconds(wait)) or "Emergency O2 ready")
    end

    notify("Diver status", table.concat(lines, "  |  "), NOTE_INFO)
end

local function toggleTurbo()
    state.turboOn = not state.turboOn
    local character = getCharacter()
    if character then applyTurbo(character) end
    if state.turboOn then
        notify("Turbo Fins on", string.format("Swimming %s faster.", pct(cfg.Turbo.SwimMultiplier - 1)), NOTE_INFO)
    else
        notify("Turbo Fins off", "Back to normal speed.", NOTE_INFO)
    end
end

local function toggleAlerts()
    state.alertsOn = not state.alertsOn
    notify(state.alertsOn and "Alerts on" or "Alerts muted",
        state.alertsOn and "Diver's Companion will warn you about danger." or "Survival warnings are off until you turn them back on.",
        NOTE_INFO)
end

local function recall()
    local character = getCharacter()
    if not character then return end
    if now() > state.recallArmedUntil then
        state.recallArmedUntil = now() + 4
        notify("Recall", "Press the recall key again within 4 seconds to return to your bed.", NOTE_WARNING)
        return
    end
    state.recallArmedUntil = 0
    local vehicle = getVehicle(character)
    if vehicle then
        notify("Recall", "Get out of the vehicle first.", NOTE_WARNING)
        return
    end
    if character:TryTeleportToBiobed() then
        notify("Recall", "Welcome home.", NOTE_INFO)
    elseif character:TryTeleportToPlayerStart() then
        notify("Recall", "No bed found, so you're back at the start point.", NOTE_INFO)
    else
        notify("Recall", "Couldn't find anywhere safe to send you.", NOTE_ERROR)
    end
end

local function unstuck()
    local character = getCharacter()
    if not character then return end
    character:Unstuck()
    notify("Unstuck", "Freed you up. Hope that helps!", NOTE_INFO)
end

-------------------------------------------------------------------------------
-- Wiring
-------------------------------------------------------------------------------

local function safely(name, fn)
    return function()
        ExecuteInGameThread(function()
            local ok, err = pcall(fn)
            if not ok and state.errorsLogged < 20 then
                state.errorsLogged = state.errorsLogged + 1
                log(name .. " error: " .. tostring(err))
            end
        end)
    end
end

local function bind(binding, name, fn)
    local key = Key[binding.Key]
    if key == nil then
        log("Unknown key '" .. tostring(binding.Key) .. "' for " .. name .. ", skipping")
        return
    end
    local mods = {}
    for _, m in ipairs(binding.Modifiers or {}) do
        if ModifierKey[m] ~= nil then table.insert(mods, ModifierKey[m]) end
    end
    if #mods > 0 then
        RegisterKeyBind(key, mods, safely(name, fn))
    else
        RegisterKeyBind(key, safely(name, fn))
    end
end

bind(cfg.Keys.StatusReport, "Status report", statusReport)
bind(cfg.Keys.ToggleTurbo, "Turbo Fins", toggleTurbo)
bind(cfg.Keys.ToggleAlerts, "Alerts", toggleAlerts)
bind(cfg.Keys.Recall, "Recall", recall)
bind(cfg.Keys.Unstuck, "Unstuck", unstuck)

local tickSafely = safely("Tick", tick)
LoopAsync(TICK_MS, function()
    clock = clock + TICK_MS / 1000
    tickSafely()
    return false
end)

log(string.format("Loaded! %s status, %s Turbo Fins, %s mute alerts, %s twice to recall, %s unstuck.",
    cfg.Keys.StatusReport.Key, cfg.Keys.ToggleTurbo.Key, cfg.Keys.ToggleAlerts.Key, cfg.Keys.Recall.Key, cfg.Keys.Unstuck.Key))

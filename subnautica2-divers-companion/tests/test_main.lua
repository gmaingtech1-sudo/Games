-- Runs Diver's Companion against a fake UE4SS and a fake Subnautica 2 player,
-- so the mod's logic can be checked without the game.
--
--   lua tests/test_main.lua        (Lua 5.4, from the subnautica2-divers-companion folder)

local SCRIPTS = "DiversCompanion/Scripts/"

-------------------------------------------------------------------------------
-- Fake UObjects
-------------------------------------------------------------------------------

local nextAddr = 1000
local function uobject(fields)
    nextAddr = nextAddr + 8
    local o = fields or {}
    o._addr = nextAddr
    o._valid = true
    function o:IsValid() return self._valid end
    function o:GetAddress() return self._addr end
    function o:GetFullName() return "Fake " .. tostring(self._addr) end
    function o:GetOuter() return self._outer end
    return o
end

local function attr(v) return { BaseValue = v, CurrentValue = v } end

local function makeWorld()
    local w = {}
    w.survivalSet = uobject({
        Oxygen = attr(100), MaxOxygen = attr(100),
        Food = attr(100), MaxFood = attr(100),
        Water = attr(100), MaxWater = attr(100),
    })
    w.healthSet = uobject({
        InternalTemperature = attr(37),
        TemperatureDamageThresholdHotLow = attr(42),
        TemperatureDamageThresholdColdLow = attr(32),
    })
    local ss = w.survivalSet
    local survival = uobject()
    function survival:GetOxygen() return ss.Oxygen.CurrentValue end
    function survival:GetMaxOxygen() return ss.MaxOxygen.CurrentValue end
    function survival:GetNormalizedOxygen() return ss.Oxygen.CurrentValue / ss.MaxOxygen.CurrentValue end
    function survival:GetNormalizedFood() return ss.Food.CurrentValue / ss.MaxFood.CurrentValue end
    function survival:GetNormalizedWater() return ss.Water.CurrentValue / ss.MaxWater.CurrentValue end

    local health = uobject({ hp = 1.0 })
    function health:IsAlive() return self.hp > 0 end
    function health:GetNormalizedHealth() return self.hp end

    local move = uobject({ swim = 600, walk = 400 })
    function move:GetBaseSwimSpeed() return self.swim end
    function move:GetBaseWalkSpeed() return self.walk end
    function move:SetBaseSwimSpeed(v) self.swim = v end
    function move:SetBaseWalkSpeed(v) self.walk = v end

    w.notes = {}
    local notifComp = uobject()
    function notifComp:ClientNotify(data)
        table.insert(w.notes, { header = data.HeaderText.text, text = data.Text.text, type = data.Type })
    end
    w.playerState = uobject({ NotificationComponent = notifComp })

    w.character = uobject({
        SurvivalSetComponent = survival,
        HealthSetComponent = health,
        MovementSetComponent = move,
        depth = 10, teleported = nil, unstuck = false, sub = nil,
    })
    local c = w.character
    function c:GetDepthMetersSanitized() return self.depth end
    function c:GetSubmarinePlayerIsIn() return self.sub end
    function c:GetPS() return w.playerState end
    function c:TryTeleportToBiobed() self.teleported = "bed"; return true end
    function c:TryTeleportToPlayerStart() self.teleported = "start"; return true end
    function c:Unstuck() self.unstuck = true end
    w.survivalSet._outer = c
    w.healthSet._outer = c

    -- An attribute set that belongs to some fish, which the mod must ignore.
    w.fishSet = uobject({ Oxygen = attr(5), MaxOxygen = attr(100) })
    w.fishSet._outer = uobject()

    w.pc = uobject({ Pawn = c, PlayerState = w.playerState })

    -- A co-op friend's character, which the mod must never pick.
    w.otherDiver = uobject({ SurvivalSetComponent = uobject() })
    local otherPS = uobject()
    function w.otherDiver:GetPS() return otherPS end

    w.dayPhase = 3
    w.timeStatics = uobject()
    function w.timeStatics:GetDayPhase() return w.dayPhase end
    function w.timeStatics:GetDayNumber() return 4 end
    function w.timeStatics:GetTimeOfDay() return { Hour = 19, Minute = 5 } end
    return w
end

-------------------------------------------------------------------------------
-- Fake UE4SS globals
-------------------------------------------------------------------------------

local world, loops, keybinds

local function installUE4SS()
    world = makeWorld()
    loops, keybinds = {}, {}
    Key = setmetatable({}, { __index = function(_, k)
        if k:match("^F%d+$") or k:match("^%u$") then return k end
    end })
    ModifierKey = { CONTROL = "CONTROL", SHIFT = "SHIFT", ALT = "ALT" }
    function RegisterKeyBind(key, a, b)
        local fn = b or a
        keybinds[key] = fn
    end
    function LoopAsync(ms, fn) table.insert(loops, fn) end
    function ExecuteInGameThread(fn) fn() end
    function FText(s) return { text = s } end
    function FindAllOf(name)
        if name == "UWESurvivalAttributeSet" then return { world.fishSet, world.survivalSet } end
        if name == "UWEHealthAttributeSet" then return { world.healthSet } end
        if name == "SN2PlayerCharacter" then return { world.otherDiver, world.character } end
        return nil
    end
    function StaticFindObject(path)
        if path:find("UWETimeOfDayStatics") then return world.timeStatics end
        return nil
    end
    package.loaded.UEHelpers = { GetPlayerController = function() return world.pc end }
    package.loaded.config = nil
    print = function() end
end

local realPrint = print

local function loadMod(overrides)
    installUE4SS()
    package.path = SCRIPTS .. "?.lua;" .. package.path
    local cfg = require("config")
    for section, values in pairs(overrides or {}) do
        for k, v in pairs(values) do cfg[section][k] = v end
    end
    dofile(SCRIPTS .. "main.lua")
    return cfg
end

local function tick(n)
    for _ = 1, n or 1 do
        for _, fn in ipairs(loops) do fn() end
    end
end

local function press(key)
    assert(keybinds[key], "no keybind for " .. key)
    keybinds[key]()
end

local function lastNote() return world.notes[#world.notes] end

local function hasNote(header)
    for _, n in ipairs(world.notes) do
        if n.header == header then return true end
    end
    return false
end

local function countNotes(header)
    local c = 0
    for _, n in ipairs(world.notes) do if n.header == header then c = c + 1 end end
    return c
end

-- Drain oxygen by `perTick` each tick, as the game would underwater.
local function dive(perTick, ticks)
    for _ = 1, ticks do
        local o = world.survivalSet.Oxygen
        o.CurrentValue = math.max(0, o.CurrentValue - perTick)
        o.BaseValue = o.CurrentValue
        tick()
    end
end

-------------------------------------------------------------------------------
-- Tests
-------------------------------------------------------------------------------

local tests = {}
local function test(name, fn) table.insert(tests, { name = name, fn = fn }) end

test("loads and binds every key", function()
    loadMod()
    for _, k in ipairs({ "F5", "F6", "F7", "F8", "F9" }) do assert(keybinds[k], k) end
    assert(#loops == 1)
end)

test("finds the player's own attribute set, not a fish's", function()
    loadMod()
    tick()
    -- Food drops naturally; with no relaxed setting nothing should change it.
    world.survivalSet.Food.CurrentValue = 90
    tick()
    assert(world.survivalSet.Food.CurrentValue == 90)
    assert(world.fishSet.Oxygen.CurrentValue == 5, "touched a fish")
end)

test("warns once on low oxygen with time left, then critical", function()
    loadMod({ EmergencyOxygen = { Enabled = false } })
    tick()
    dive(2, 36)  -- 100 -> 28
    assert(countNotes("Oxygen low") == 1)
    local note
    for _, n in ipairs(world.notes) do if n.header == "Oxygen low" then note = n end end
    assert(note.text:find("of air left"), note.text)
    assert(note.type == 6)
    dive(2, 10)
    assert(countNotes("Oxygen low") == 1, "repeated warning")
    assert(hasNote("Oxygen critical"))
end)

test("no oxygen warning while oxygen is refilling", function()
    loadMod()
    world.survivalSet.Oxygen.CurrentValue = 10
    tick(3)
    world.survivalSet.Oxygen.CurrentValue = 20
    tick(3)
    assert(not hasNote("Oxygen low"))
end)

test("emergency oxygen fires once, then cools down", function()
    loadMod()
    tick()
    dive(3, 32)  -- down to 4%
    assert(hasNote("Emergency O2 released"))
    assert(math.abs(world.survivalSet.Oxygen.CurrentValue - 40) < 3, world.survivalSet.Oxygen.CurrentValue)
    assert(world.survivalSet.Oxygen.BaseValue == world.survivalSet.Oxygen.CurrentValue)
    dive(3, 14)
    assert(countNotes("Emergency O2 released") == 1, "fired again during cooldown")
end)

test("alerts can be muted", function()
    loadMod()
    tick()
    press("F7")
    assert(lastNote().header == "Alerts muted")
    world.survivalSet.Food.CurrentValue = 10
    tick()
    assert(not hasNote("Hungry"))
    press("F7")
    world.survivalSet.Food.CurrentValue = 100
    tick()
    world.survivalSet.Food.CurrentValue = 10
    tick()
    assert(hasNote("Hungry"))
end)

test("food, water, health and temperature alerts", function()
    loadMod()
    world.survivalSet.Food.CurrentValue = 15
    world.survivalSet.Water.CurrentValue = 15
    world.character.HealthSetComponent.hp = 0.2
    world.healthSet.InternalTemperature.CurrentValue = 30
    tick()
    assert(hasNote("Hungry") and hasNote("Thirsty") and hasNote("Health low") and hasNote("Freezing"))
end)

test("turbo fins speeds up and restores exactly", function()
    loadMod()
    tick()
    local move = world.character.MovementSetComponent
    press("F6")
    assert(move.swim == 900 and move.walk == 500, move.swim)
    tick(5)
    assert(move.swim == 900, "stacked")
    press("F6")
    assert(move.swim == 600 and move.walk == 400)
end)

test("turbo fins reapplies after respawn", function()
    loadMod({ Turbo = { StartEnabled = true } })
    tick()
    assert(world.character.MovementSetComponent.swim == 900)
    local old = world.character
    local fresh = makeWorld()
    fresh.character.MovementSetComponent.swim = 600
    world.character = fresh.character
    world.survivalSet, world.healthSet = fresh.survivalSet, fresh.healthSet
    world.pc.Pawn = fresh.character
    tick()
    assert(fresh.character.MovementSetComponent.swim == 900, fresh.character.MovementSetComponent.swim)
    assert(old.MovementSetComponent.swim == 900)
end)

test("relaxed hunger halves the drain and keeps the base value in step", function()
    loadMod({ Survival = { HungerRate = 0.5 } })
    tick()
    for _ = 1, 10 do
        local f = world.survivalSet.Food
        f.CurrentValue = f.CurrentValue - 1
        f.BaseValue = f.CurrentValue
        tick()
    end
    local f = world.survivalSet.Food
    assert(math.abs(f.CurrentValue - 95) < 1e-6, f.CurrentValue)
    assert(f.BaseValue == f.CurrentValue)
end)

test("relaxed hunger leaves eating and big drops alone", function()
    loadMod({ Survival = { HungerRate = 0.5 } })
    world.survivalSet.Food.CurrentValue = 50
    tick()
    world.survivalSet.Food.CurrentValue = 80
    tick()
    assert(world.survivalSet.Food.CurrentValue == 80)
    world.survivalSet.Food.CurrentValue = 60
    tick()
    assert(world.survivalSet.Food.CurrentValue == 60)
end)

test("status report shows depth, vitals and time", function()
    loadMod()
    world.character.depth = 123.7
    tick()
    press("F5")
    local n = lastNote()
    assert(n.header == "Diver status")
    for _, s in ipairs({ "Depth 123m", "Health 100%", "O2 100%", "Food 100%", "Day 4, 19:05 Day", "Emergency O2 ready" }) do
        assert(n.text:find(s, 1, true), "missing '" .. s .. "' in: " .. n.text)
    end
end)

test("vehicle power and crush depth warnings, even when loading in a vehicle", function()
    loadMod()
    local mech = uobject({ energy = 0.04, crush = 200 })
    function mech:GetNormalizedEnergy() return self.energy end
    function mech:GetCrushDepth() return self.crush end
    local sub = uobject({ MechanicalSetComponent = mech })
    world.pc.Pawn = sub                -- piloting: the controller possesses the vehicle
    world.character.sub = sub
    world.character.depth = 190
    tick()
    assert(hasNote("Vehicle power critical"))
    assert(hasNote("Crush depth"))
    press("F5")
    assert(lastNote().text:find("Vehicle power 4%", 1, true), lastNote().text)
end)

test("recall needs two presses and refuses in a vehicle", function()
    loadMod()
    tick()
    press("F8")
    assert(world.character.teleported == nil)
    press("F8")
    assert(world.character.teleported == "bed")

    world.character.teleported = nil
    world.character.sub = uobject({ MechanicalSetComponent = uobject() })
    world.character.sub.MechanicalSetComponent.GetNormalizedEnergy = function() return 1 end
    world.character.sub.MechanicalSetComponent.GetCrushDepth = function() return 0 end
    press("F8"); press("F8")
    assert(world.character.teleported == nil)
    assert(lastNote().text:find("vehicle"))
end)

test("recall press expires after 4 seconds", function()
    loadMod()
    tick()
    press("F8")
    tick(10)  -- 5 seconds
    press("F8")
    assert(world.character.teleported == nil)
end)

test("unstuck", function()
    loadMod()
    tick()
    press("F9")
    assert(world.character.unstuck)
end)

test("dusk and dawn notices", function()
    loadMod()
    tick()
    assert(#world.notes == 0, "noticed the starting phase")
    world.dayPhase = 4
    tick()
    assert(lastNote().header == "Dusk")
    world.dayPhase = 1
    tick()
    world.dayPhase = 2
    tick()
    assert(lastNote().header == "Dawn")
end)

test("survives the main menu with no player", function()
    loadMod()
    world.pc.Pawn = nil
    world.character._valid = false
    tick(3)
    press("F5"); press("F6"); press("F8"); press("F9")
end)

test("errors inside a tick are caught and logged", function()
    loadMod()
    world.character.GetDepthMetersSanitized = function() error("boom") end
    world.character.sub = uobject({ MechanicalSetComponent = uobject() })
    tick()  -- must not raise
end)

-------------------------------------------------------------------------------

local failed = 0
for _, t in ipairs(tests) do
    local ok, err = pcall(t.fn)
    print = realPrint
    if ok then
        print("ok    " .. t.name)
    else
        failed = failed + 1
        print("FAIL  " .. t.name .. "\n      " .. tostring(err))
    end
end
print(string.format("\n%d passed, %d failed", #tests - failed, failed))
if failed > 0 then os.exit(1) end

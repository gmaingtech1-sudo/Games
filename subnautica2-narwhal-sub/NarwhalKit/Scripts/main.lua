-- Narwhal Kit for Subnautica 2
--
-- Gives your Tadpole a Narwhal body: a whale-shaped shell with a spiral
-- tusk, ducted thrusters and flukes, modelled in Blender. The mesh lives in
-- narwhal_mesh.lua (exported by blender/build_narwhal.py) and is built in
-- the game with a ProceduralMeshComponent, so the mod needs only UE4SS.
--
-- Built against the game's reflection data (build CL-128456, UE 5.6).

local cfg = require("config")
local MESH = require("narwhal_mesh")

local MOD_NAME = "NarwhalKit"
local TICK_MS = 1000
local PROC_MESH_CLASS = "/Script/ProceduralMeshComponent.ProceduralMeshComponent"
local FALLBACK_MATERIAL = "/Engine/EngineMaterials/DefaultMaterial.DefaultMaterial"
local NO_COLLISION = 0  -- ECollisionEnabled::NoCollision

-- Blender material name -> paint slot
local SLOT_OF = {
    M_Narwhal_Hull = "hull",
    M_Narwhal_Belly = "belly",
    M_Narwhal_Trim = "trim",
    M_Narwhal_Tusk = "tusk",
    M_Narwhal_Glow = "glow",
}

local function log(msg)
    print(string.format("[%s] %s\n", MOD_NAME, msg))
end

local function debug(msg)
    if cfg.Debug then log(msg) end
end

local function valid(obj)
    return obj ~= nil and obj:IsValid()
end

local state = {
    enabled = cfg.StartEnabled,
    paint = cfg.Paint,
    bodies = {},       -- tadpole address -> { tadpole, comp, mids = { {slot, mid, colorParams, glowParams} } }
    sections = nil,    -- mesh sections converted to UE4SS-ready tables, built once
    errorsLogged = 0,
}

-------------------------------------------------------------------------------
-- Mesh data -> the tables CreateMeshSection takes
-------------------------------------------------------------------------------

local function tangentFor(nx, ny, nz)
    -- Any unit vector at right angles to the normal will do for plain paint.
    local tx, ty, tz
    if math.abs(nz) < 0.9 then
        tx, ty, tz = -ny, nx, 0          -- normal x up
    else
        tx, ty, tz = 0, -nz, ny          -- normal x forward
    end
    local len = math.sqrt(tx * tx + ty * ty + tz * tz)
    if len < 1e-6 then return 1, 0, 0 end
    return tx / len, ty / len, tz / len
end

local function buildSections()
    local scale = cfg.Scale or 1.0
    local off = cfg.Offset or { X = 0, Y = 0, Z = 0 }
    local white = { R = 255, G = 255, B = 255, A = 255 }
    local sections = {}
    for _, src in ipairs(MESH) do
        local verts, normals, uvs, colors, tangents, tris = {}, {}, {}, {}, {}, {}
        local v, n, uv = src.verts, src.normals, src.uvs
        for i = 1, #v // 3 do
            local j = (i - 1) * 3
            verts[i] = { X = v[j + 1] * scale + off.X, Y = v[j + 2] * scale + off.Y, Z = v[j + 3] * scale + off.Z }
            local nx, ny, nz = n[j + 1], n[j + 2], n[j + 3]
            normals[i] = { X = nx, Y = ny, Z = nz }
            local tx, ty, tz = tangentFor(nx, ny, nz)
            tangents[i] = { TangentX = { X = tx, Y = ty, Z = tz }, bFlipTangentY = false }
            uvs[i] = { X = uv[(i - 1) * 2 + 1], Y = uv[(i - 1) * 2 + 2] }
            colors[i] = white
        end
        for i, idx in ipairs(src.tris) do tris[i] = idx end
        table.insert(sections, {
            slot = SLOT_OF[src.material] or "hull",
            verts = verts, normals = normals, uvs = uvs, colors = colors, tangents = tangents, tris = tris,
        })
    end
    return sections
end

-------------------------------------------------------------------------------
-- Paint
-------------------------------------------------------------------------------

local function nameMatches(name, patterns)
    local lower = name:lower()
    for _, p in ipairs(patterns) do
        if lower:find(p:lower(), 1, true) then return true end
    end
    return false
end

-- Collect the vector and scalar parameter names a material instance (and
-- its parents) exposes.
local function parameterNames(material)
    local vectors, scalars, seen = {}, {}, {}
    local depth = 0
    while valid(material) and depth < 8 do
        depth = depth + 1
        local ok = pcall(function()
            material.VectorParameterValues:ForEach(function(_, elem)
                local name = elem:get().ParameterInfo.Name:ToString()
                if not seen["v" .. name] then
                    seen["v" .. name] = true
                    table.insert(vectors, name)
                end
            end)
            material.ScalarParameterValues:ForEach(function(_, elem)
                local name = elem:get().ParameterInfo.Name:ToString()
                if not seen["s" .. name] then
                    seen["s" .. name] = true
                    table.insert(scalars, name)
                end
            end)
        end)
        if not ok then break end
        local okParent, parent = pcall(function() return material.Parent end)
        if not okParent then break end
        material = parent
    end
    return vectors, scalars
end

-- Pick the Tadpole's paintwork, not its glass or lights.
local AVOID = { "glass", "window", "screen", "light", "emiss", "glow", "decal", "interior", "hud", "trans" }
local PREFER = { "hull", "body", "paint", "exterior", "tadpole", "metal" }

local function baseMaterial(tadpole)
    local ok, best, bestName = pcall(function()
        local mesh = tadpole.Mesh
        local count = mesh:GetNumMaterials()
        if cfg.MaterialIndex and cfg.MaterialIndex >= 0 then
            local mat = mesh:GetMaterial(cfg.MaterialIndex)
            return mat, valid(mat) and mat:GetFName():ToString() or nil
        end
        local pick, pickName, pickScore = nil, nil, -math.huge
        for i = 0, count - 1 do
            local mat = mesh:GetMaterial(i)
            if valid(mat) then
                local name = mat:GetFName():ToString()
                local score = -i * 0.01
                if nameMatches(name, AVOID) then score = score - 10 end
                if nameMatches(name, PREFER) then score = score + 5 end
                debug(string.format("Tadpole material %d: %s (score %.2f)", i, name, score))
                if score > pickScore then pick, pickName, pickScore = mat, name, score end
            end
        end
        return pick, pickName
    end)
    if ok and valid(best) then return best, "the Tadpole's material " .. tostring(bestName) end
    local fallback = StaticFindObject(FALLBACK_MATERIAL)
    if valid(fallback) then return fallback, "Unreal's default material" end
    return nil, "no material"
end

local function applyPaint(body)
    local scheme = cfg.Paints[state.paint] or cfg.Paints.Narwhal
    for _, m in ipairs(body.mids) do
        if valid(m.mid) then
            local c = scheme[m.slot] or scheme.hull
            local glow = m.slot == "glow"
            local k = glow and cfg.GlowStrength or 1.0
            local color = { R = c[1] * k, G = c[2] * k, B = c[3] * k, A = 1.0 }
            for _, name in ipairs(m.colorParams) do
                m.mid:SetVectorParameterValue(FName(name), color)
            end
            for _, name in ipairs(m.glowParams) do
                if glow then
                    m.mid:SetVectorParameterValue(FName(name), color)
                else
                    m.mid:SetVectorParameterValue(FName(name), { R = 0, G = 0, B = 0, A = 1 })
                end
            end
            for _, name in ipairs(m.glowScalars) do
                m.mid:SetScalarParameterValue(FName(name), glow and cfg.GlowStrength or 0.0)
            end
        end
    end
end

-------------------------------------------------------------------------------
-- Building the body on a Tadpole
-------------------------------------------------------------------------------

local function buildBody(tadpole)
    local procClass = StaticFindObject(PROC_MESH_CLASS)
    if not valid(procClass) then
        log("This game build has no ProceduralMeshComponent, so the Narwhal can't be built.")
        return nil
    end
    state.sections = state.sections or buildSections()

    local identity = {
        Rotation = { X = 0, Y = 0, Z = 0, W = 1 },
        Translation = { X = 0, Y = 0, Z = 0 },
        Scale3D = { X = 1, Y = 1, Z = 1 },
    }
    local comp = tadpole:AddComponentByClass(procClass, false, identity, false)
    if not valid(comp) then
        log("Couldn't add the Narwhal body to the Tadpole.")
        return nil
    end
    comp:SetCollisionEnabled(NO_COLLISION)
    comp:SetCastShadow(cfg.Shadows)

    local base, source = baseMaterial(tadpole)
    local vectors, scalars = {}, {}
    if base then vectors, scalars = parameterNames(base) end
    local colorParams, glowParams, glowScalars = {}, {}, {}
    for _, name in ipairs(vectors) do
        if nameMatches(name, cfg.GlowParams) then
            table.insert(glowParams, name)
        elseif nameMatches(name, cfg.ColorParams) then
            table.insert(colorParams, name)
        end
    end
    for _, name in ipairs(scalars) do
        if nameMatches(name, cfg.GlowParams) then table.insert(glowScalars, name) end
    end
    log(string.format("Painting with %s. Colour parameters: %s. Glow parameters: %s.",
        source,
        #colorParams > 0 and table.concat(colorParams, ", ") or "none found",
        (#glowParams + #glowScalars) > 0 and table.concat(glowParams, ", ") .. " " .. table.concat(glowScalars, ", ") or "none found"))
    debug("All vector parameters: " .. table.concat(vectors, ", "))
    debug("All scalar parameters: " .. table.concat(scalars, ", "))

    local body = { tadpole = tadpole, comp = comp, mids = {} }
    for i, s in ipairs(state.sections) do
        local index = i - 1
        comp:CreateMeshSection(index, s.verts, s.tris, s.normals, s.uvs, s.colors, s.tangents, false)
        if base then
            local mid = comp:CreateDynamicMaterialInstance(index, base, FName("NarwhalPaint_" .. s.slot))
            table.insert(body.mids, {
                slot = s.slot, mid = mid,
                colorParams = colorParams, glowParams = glowParams, glowScalars = glowScalars,
            })
        end
    end
    applyPaint(body)
    log("Narwhal body fitted to a Tadpole.")
    return body
end

-------------------------------------------------------------------------------
-- Keeping every Tadpole dressed
-------------------------------------------------------------------------------

local function hasChassis(tadpole)
    local ok, chassis = pcall(function() return tadpole:GetCurrentChassis() end)
    return ok and valid(chassis)
end

local function tick()
    local seen = {}
    -- Search the Blueprint class too, in case a UE4SS build only matches exact classes.
    local tadpoles = {}
    for _, className in ipairs({ "SN2Tadpole", "BP_Tadpole_C" }) do
        for _, t in ipairs(FindAllOf(className) or {}) do table.insert(tadpoles, t) end
    end
    for _, tadpole in ipairs(tadpoles) do
        local addr = tadpole:IsValid() and tadpole:GetAddress()
        if addr and not seen[addr] then
            seen[addr] = true
            local want = state.enabled and (cfg.ShowWithChassis or not hasChassis(tadpole))
            local body = state.bodies[addr]
            if body and not valid(body.comp) then
                body = nil
                state.bodies[addr] = nil
            end
            if want and not body then
                body = buildBody(tadpole)
                state.bodies[addr] = body
            end
            if body and body.visible ~= want then
                body.comp:SetVisibility(want, true)
                body.visible = want
            end
        end
    end
    for addr in pairs(state.bodies) do
        if not seen[addr] then state.bodies[addr] = nil end
    end
end

local function toggleBody()
    state.enabled = not state.enabled
    log(state.enabled and "Narwhal body on." or "Narwhal body off.")
    tick()
end

local function nextPaint()
    local order = cfg.PaintOrder
    local current = 1
    for i, name in ipairs(order) do
        if name == state.paint then current = i end
    end
    state.paint = order[current % #order + 1]
    for _, body in pairs(state.bodies) do applyPaint(body) end
    log("Paint: " .. state.paint)
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

bind(cfg.Keys.ToggleBody, "Toggle body", toggleBody)
bind(cfg.Keys.NextPaint, "Next paint", nextPaint)

local tickSafely = safely("Tick", tick)
LoopAsync(TICK_MS, function()
    tickSafely()
    return false
end)

local tris = 0
for _, s in ipairs(MESH) do tris = tris + #s.tris // 3 end
local function keyText(binding)
    local parts = {}
    for _, m in ipairs(binding.Modifiers or {}) do table.insert(parts, m) end
    table.insert(parts, binding.Key)
    return table.concat(parts, "+")
end
log(string.format("Loaded! %d triangles ready. %s toggles the body, %s changes the paint.",
    tris, keyText(cfg.Keys.ToggleBody), keyText(cfg.Keys.NextPaint)))

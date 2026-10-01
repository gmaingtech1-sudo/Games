-- Runs Narwhal Kit against a fake UE4SS and a fake Tadpole, and checks the
-- exported mesh data is something Unreal can draw.
--
--   lua tests/test_narwhal_kit.lua      (Lua 5.4, from the subnautica2-narwhal-sub folder)

local SCRIPTS = "NarwhalKit/Scripts/"
package.path = SCRIPTS .. "?.lua;" .. package.path
local realPrint = print

-------------------------------------------------------------------------------
-- Fakes
-------------------------------------------------------------------------------

local nextAddr = 1000
local function uobject(fields)
    nextAddr = nextAddr + 8
    local o = fields or {}
    o._addr = nextAddr
    o._valid = true
    function o:IsValid() return self._valid end
    function o:GetAddress() return self._addr end
    return o
end

local function fname(s)
    return { s = s, ToString = function(self) return self.s end }
end

local function fakeArray(items)
    return { ForEach = function(_, fn)
        for i, v in ipairs(items) do fn(i, { get = function() return v end }) end
    end }
end

local function material(name, vectors, scalars, parent)
    local vs, ss = {}, {}
    for _, n in ipairs(vectors or {}) do table.insert(vs, { ParameterInfo = { Name = fname(n) } }) end
    for _, n in ipairs(scalars or {}) do table.insert(ss, { ParameterInfo = { Name = fname(n) } }) end
    local m = uobject({ VectorParameterValues = fakeArray(vs), ScalarParameterValues = fakeArray(ss), Parent = parent })
    function m:GetFName() return fname(name) end
    return m
end

local world, loops, keybinds

local function makeTadpole(materials)
    local mesh = uobject()
    function mesh:GetNumMaterials() return #materials end
    function mesh:GetMaterial(i) return materials[i + 1] end
    local t = uobject({ Mesh = mesh, chassis = nil, added = {} })
    function t:GetCurrentChassis() return self.chassis end
    function t:AddComponentByClass(cls, manual, transform, deferred)
        assert(cls == world.procClass, "wrong class")
        assert(manual == false and deferred == false)
        assert(transform.Rotation.W == 1 and transform.Scale3D.X == 1)
        local comp = uobject({ sections = {}, materials = {}, mids = {}, visible = true })
        function comp:SetCollisionEnabled(v) self.collision = v end
        function comp:SetCastShadow(v) self.shadow = v end
        function comp:CreateMeshSection(i, verts, tris, normals, uvs, colors, tangents, collide)
            self.sections[i] = { verts = verts, tris = tris, normals = normals, uvs = uvs,
                                 colors = colors, tangents = tangents, collide = collide }
        end
        function comp:CreateDynamicMaterialInstance(i, base, name)
            local mid = uobject({ base = base, name = name.s, vectors = {}, scalars = {} })
            function mid:SetVectorParameterValue(n, c) self.vectors[n.s] = c end
            function mid:SetScalarParameterValue(n, v) self.scalars[n.s] = v end
            self.mids[i] = mid
            return mid
        end
        function comp:SetVisibility(v, children) self.visible = v end
        table.insert(self.added, comp)
        return comp
    end
    return t
end

local function install()
    world = { tadpoles = {}, procClass = uobject(), defaultMat = material("DefaultMaterial") }
    loops, keybinds = {}, {}
    Key = setmetatable({}, { __index = function(_, k) if k:match("^F%d+$") then return k end end })
    ModifierKey = { CONTROL = "CONTROL", SHIFT = "SHIFT", ALT = "ALT" }
    function RegisterKeyBind(key, a, b) keybinds[key] = b or a end
    function LoopAsync(ms, fn) table.insert(loops, fn) end
    function ExecuteInGameThread(fn) fn() end
    FName = fname
    function FindAllOf(name)
        if name == "SN2Tadpole" and #world.tadpoles > 0 then return world.tadpoles end
        if name == "BP_Tadpole_C" and #world.tadpoles > 0 then return { world.tadpoles[1] } end  -- duplicates must be ignored
        return nil
    end
    function StaticFindObject(path)
        if path:find("ProceduralMeshComponent") then return world.procClass end
        if path:find("DefaultMaterial") then return world.defaultMat end
        return nil
    end
    print = function() end
    package.loaded.config = nil
    package.loaded.main = nil
end

local function load(overrides)
    install()
    local cfg = require("config")
    for k, v in pairs(overrides or {}) do cfg[k] = v end
    dofile(SCRIPTS .. "main.lua")
    return cfg
end

local function tick(n) for _ = 1, n or 1 do for _, fn in ipairs(loops) do fn() end end end

local function hullTadpole()
    local glass = material("MI_Tadpole_Glass", { "GlassTint" })
    local hullParent = material("M_VehiclePaint", { "PaintColor", "EmissiveColor" }, { "EmissiveIntensity", "Roughness" })
    local hull = material("MI_Tadpole_Hull", { "BaseColorTint" }, {}, hullParent)
    return makeTadpole({ glass, hull })
end

-------------------------------------------------------------------------------

local tests = {}
local function test(name, fn) table.insert(tests, { name = name, fn = fn }) end

test("exported mesh data is well formed", function()
    local mesh = dofile(SCRIPTS .. "narwhal_mesh.lua")
    assert(#mesh == 5, "expected 5 sections, got " .. #mesh)
    local totalTris = 0
    for _, s in ipairs(mesh) do
        local nv = #s.verts // 3
        assert(#s.verts % 3 == 0 and #s.normals == #s.verts and #s.uvs == nv * 2, s.material)
        assert(#s.tris % 3 == 0, s.material)
        for _, idx in ipairs(s.tris) do assert(idx >= 0 and idx < nv, "index out of range in " .. s.material) end
        totalTris = totalTris + #s.tris // 3
    end
    assert(totalTris > 10000, totalTris)
end)

test("triangles wind clockwise against their normals, as Unreal wants", function()
    local mesh = dofile(SCRIPTS .. "narwhal_mesh.lua")
    local good, bad = 0, 0
    for _, s in ipairs(mesh) do
        local v, n = s.verts, s.normals
        for t = 1, #s.tris, 3 do
            local a, b, c = s.tris[t] * 3, s.tris[t + 1] * 3, s.tris[t + 2] * 3
            local e1 = { v[b + 1] - v[a + 1], v[b + 2] - v[a + 2], v[b + 3] - v[a + 3] }
            local e2 = { v[c + 1] - v[a + 1], v[c + 2] - v[a + 2], v[c + 3] - v[a + 3] }
            local cx = e1[2] * e2[3] - e1[3] * e2[2]
            local cy = e1[3] * e2[1] - e1[1] * e2[3]
            local cz = e1[1] * e2[2] - e1[2] * e2[1]
            local nx = n[a + 1] + n[b + 1] + n[c + 1]
            local ny = n[a + 2] + n[b + 2] + n[c + 2]
            local nz = n[a + 3] + n[b + 3] + n[c + 3]
            local d = cx * nx + cy * ny + cz * nz
            if d < 0 then good = good + 1 elseif d > 0 then bad = bad + 1 end
        end
    end
    -- Unreal's own GenerateBoxMesh has cross(b-a, c-a) pointing away from the normal.
    assert(bad < (good + bad) * 0.01, string.format("%d of %d triangles face the wrong way", bad, good + bad))
end)

test("mesh is in centimetres and fits round the Tadpole", function()
    local mesh = dofile(SCRIPTS .. "narwhal_mesh.lua")
    local minX, maxX, minD = math.huge, -math.huge, math.huge
    for _, s in ipairs(mesh) do
        for i = 1, #s.verts, 3 do
            local x, y, z = s.verts[i], s.verts[i + 1], s.verts[i + 2]
            minX, maxX = math.min(minX, x), math.max(maxX, x)
            local cz = math.max(-16, math.min(16, z))      -- capsule: radius 80, half-height 96
            minD = math.min(minD, math.sqrt(x * x + y * y + (z - cz) ^ 2))
        end
    end
    assert(maxX - minX > 700 and maxX - minX < 850, "length " .. (maxX - minX))
    assert(minD >= 80, "cuts into the Tadpole: " .. minD)
end)

test("fits a body with every section on a bare Tadpole", function()
    load()
    local t = hullTadpole()
    world.tadpoles = { t }
    tick()
    assert(#t.added == 1, "expected one body, got " .. #t.added)
    local comp = t.added[1]
    assert(comp.collision == 0, "body must not collide")
    for i = 0, 4 do
        local s = comp.sections[i]
        assert(s, "missing section " .. i)
        local n = #s.verts
        assert(#s.normals == n and #s.uvs == n and #s.colors == n and #s.tangents == n)
        assert(s.verts[1].X and s.normals[1].Z and s.uvs[1].Y and s.colors[1].A == 255)
        assert(s.tangents[1].TangentX.X and s.tangents[1].bFlipTangentY == false)
        assert(s.collide == false)
    end
    tick(3)
    assert(#t.added == 1, "rebuilt the body")
end)

test("tangents are unit length and at right angles to the normal", function()
    load()
    local t = hullTadpole()
    world.tadpoles = { t }
    tick()
    for _, s in pairs(t.added[1].sections) do
        for i = 1, #s.normals, 97 do
            local n, tg = s.normals[i], s.tangents[i].TangentX
            local dot = n.X * tg.X + n.Y * tg.Y + n.Z * tg.Z
            local len = math.sqrt(tg.X ^ 2 + tg.Y ^ 2 + tg.Z ^ 2)
            assert(math.abs(dot) < 1e-3 and math.abs(len - 1) < 1e-3)
        end
    end
end)

test("borrows the hull material, not the glass, and tints its colour parameters", function()
    load()
    local t = hullTadpole()
    world.tadpoles = { t }
    tick()
    local comp = t.added[1]
    local hullMid
    for _, mid in pairs(comp.mids) do
        assert(mid.base:GetFName():ToString() == "MI_Tadpole_Hull", "used " .. mid.base:GetFName():ToString())
        if mid.name == "NarwhalPaint_hull" then hullMid = mid end
    end
    assert(hullMid, "no hull section")
    local c = hullMid.vectors.BaseColorTint
    assert(c and math.abs(c.R - 0.035) < 1e-6 and math.abs(c.B - 0.32) < 1e-6)
    assert(hullMid.vectors.PaintColor, "parent's parameter not tinted")
    assert(hullMid.vectors.EmissiveColor.R == 0, "hull shouldn't glow")
    assert(hullMid.scalars.EmissiveIntensity == 0)
    assert(hullMid.vectors.GlassTint == nil)
end)

test("glow section glows", function()
    load()
    local t = hullTadpole()
    world.tadpoles = { t }
    tick()
    for _, mid in pairs(t.added[1].mids) do
        if mid.name == "NarwhalPaint_glow" then
            assert(mid.vectors.EmissiveColor.G > 1, "not glowing")
            assert(mid.scalars.EmissiveIntensity == 8.0)
            return
        end
    end
    error("no glow section")
end)

test("paint cycles through schemes", function()
    load()
    local t = hullTadpole()
    world.tadpoles = { t }
    tick()
    keybinds.F11()
    for _, mid in pairs(t.added[1].mids) do
        if mid.name == "NarwhalPaint_hull" then
            assert(mid.vectors.BaseColorTint.R == 0.02, "not Orca")   -- second in PaintOrder
        end
    end
    for _ = 1, 4 do keybinds.F11() end
    for _, mid in pairs(t.added[1].mids) do
        if mid.name == "NarwhalPaint_hull" then
            assert(math.abs(mid.vectors.BaseColorTint.R - 0.035) < 1e-6, "didn't wrap back to Narwhal")
        end
    end
end)

test("steps aside when a game chassis is attached, and comes back", function()
    load()
    local t = hullTadpole()
    world.tadpoles = { t }
    tick()
    t.chassis = uobject()
    tick()
    assert(t.added[1].visible == false)
    t.chassis = nil
    tick()
    assert(t.added[1].visible == true)
    assert(#t.added == 1)
end)

test("toggle hides and shows every body", function()
    load()
    local a, b = hullTadpole(), hullTadpole()
    world.tadpoles = { a, b }
    tick()
    keybinds.F10()
    assert(a.added[1].visible == false and b.added[1].visible == false)
    keybinds.F10()
    assert(a.added[1].visible == true and b.added[1].visible == true)
end)

test("doesn't build anything while turned off", function()
    load({ StartEnabled = false })
    local t = hullTadpole()
    world.tadpoles = { t }
    tick(2)
    assert(#t.added == 0)
end)

test("offset and scale move the body", function()
    load({ Offset = { X = 10, Y = 0, Z = -5 }, Scale = 2.0 })
    local mesh = dofile(SCRIPTS .. "narwhal_mesh.lua")
    local t = hullTadpole()
    world.tadpoles = { t }
    tick()
    local v = t.added[1].sections[0].verts[1]
    assert(math.abs(v.X - (mesh[1].verts[1] * 2 + 10)) < 1e-6)
    assert(math.abs(v.Z - (mesh[1].verts[3] * 2 - 5)) < 1e-6)
end)

test("falls back to Unreal's default material", function()
    load()
    local t = makeTadpole({})
    world.tadpoles = { t }
    tick()
    for _, mid in pairs(t.added[1].mids) do assert(mid.base == world.defaultMat) end
end)

test("rebuilds after the Tadpole's body is destroyed, and survives no Tadpoles", function()
    load()
    local t = hullTadpole()
    world.tadpoles = { t }
    tick()
    t.added[1]._valid = false
    tick()
    assert(#t.added == 2)
    world.tadpoles = {}
    tick(2)
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

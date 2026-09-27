// Wayfarer shared shader code: noise, ray/sphere tests, scattering phase
// functions and the cloud density field (shared by the atmosphere shader and
// the terrain shader's cloud shadows, so both see the same clouds).
#ifndef WAYFARER_COMMON_INCLUDED
#define WAYFARER_COMMON_INCLUDED

// ─── 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT licence) ───────
float3 wf_mod289(float3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float4 wf_mod289(float4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float4 wf_permute(float4 x) { return wf_mod289(((x * 34.0) + 1.0) * x); }
float4 wf_taylorInvSqrt(float4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(float3 v)
{
    const float2 C = float2(1.0 / 6.0, 1.0 / 3.0);
    const float4 D = float4(0.0, 0.5, 1.0, 2.0);
    float3 i = floor(v + dot(v, C.yyy));
    float3 x0 = v - i + dot(i, C.xxx);
    float3 g = step(x0.yzx, x0.xyz);
    float3 l = 1.0 - g;
    float3 i1 = min(g.xyz, l.zxy);
    float3 i2 = max(g.xyz, l.zxy);
    float3 x1 = x0 - i1 + C.xxx;
    float3 x2 = x0 - i2 + C.yyy;
    float3 x3 = x0 - D.yyy;
    i = wf_mod289(i);
    float4 p = wf_permute(wf_permute(wf_permute(
                  i.z + float4(0.0, i1.z, i2.z, 1.0))
                + i.y + float4(0.0, i1.y, i2.y, 1.0))
                + i.x + float4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    float3 ns = n_ * D.wyz - D.xzx;
    float4 j = p - 49.0 * floor(p * ns.z * ns.z);
    float4 x_ = floor(j * ns.z);
    float4 y_ = floor(j - 7.0 * x_);
    float4 x = x_ * ns.x + ns.yyyy;
    float4 y = y_ * ns.x + ns.yyyy;
    float4 h = 1.0 - abs(x) - abs(y);
    float4 b0 = float4(x.xy, y.xy);
    float4 b1 = float4(x.zw, y.zw);
    float4 s0 = floor(b0) * 2.0 + 1.0;
    float4 s1 = floor(b1) * 2.0 + 1.0;
    float4 sh = -step(h, float4(0.0, 0.0, 0.0, 0.0));
    float4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    float4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    float3 p0 = float3(a0.xy, h.x);
    float3 p1 = float3(a0.zw, h.y);
    float3 p2 = float3(a1.xy, h.z);
    float3 p3 = float3(a1.zw, h.w);
    float4 norm = wf_taylorInvSqrt(float4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    float4 m = max(0.6 - float4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, float4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm3(float3 p, int octaves)
{
    float sum = 0.0, amp = 0.5, norm = 0.0;
    [loop] for (int i = 0; i < 8; i++)
    {
        if (i >= octaves) break;
        sum += snoise(p) * amp;
        norm += amp;
        p = p * 2.03 + float3(3.1, -1.7, 2.3);
        amp *= 0.5;
    }
    return sum / max(norm, 1e-4);
}

float hash13(float3 p)
{
    p = frac(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return frac((p.x + p.y) * p.z);
}

float3 hash33(float3 p)
{
    p = frac(p * float3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return frac((p.xxy + p.yxx) * p.zyx);
}

// ─── geometry ─────────────────────────────────────────────────────────────
// Returns (near, far) distances along a unit ray; near > far means a miss.
float2 wf_raySphere(float3 ro, float3 rd, float r)
{
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float d = b * b - c;
    if (d < 0.0) return float2(1e20, -1e20);
    d = sqrt(d);
    return float2(-b - d, -b + d);
}

// ─── scattering ───────────────────────────────────────────────────────────
float wf_phaseR(float mu) { return 0.0596831 * (1.0 + mu * mu); }

float wf_phaseM(float mu, float g)
{
    float g2 = g * g;
    return 0.1193662 * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

// ─── clouds ───────────────────────────────────────────────────────────────
// p is a planet-local position in metres. Returns coverage 0..1.
float wf_cloudDensity(float3 p, float cover, float scale, int octaves)
{
    float3 q = p * scale;
    float3 w = float3(snoise(q * 0.45 + 11.7), snoise(q * 0.45 + 27.1), snoise(q * 0.45 - 5.3));
    q += w * 0.55;
    float n = fbm3(q, octaves) * 0.5 + 0.5;
    float lo = 1.0 - cover;
    return saturate((n - lo) / max(0.06, 0.3 * cover + 0.05));
}

// rotate a point about the local Y (spin) axis, to let clouds drift
float3 wf_rotY(float3 p, float a)
{
    float s = sin(a), c = cos(a);
    return float3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

// ─── the shadow of the planet you're on (set globally each frame) ────────
float4 _WF_ShadowCenter, _WF_SunDirW;
float _WF_ShadowOn, _WF_ShadowRadius;

// 1 in daylight, 0 on the night side of the current planet
float wf_planetShadow(float3 worldPos)
{
    if (_WF_ShadowOn < 0.5) return 1.0;
    float3 d = worldPos - _WF_ShadowCenter.xyz;
    float r = length(d);
    float mu = dot(d / max(r, 1e-3), normalize(_WF_SunDirW.xyz));
    // how far below the horizon the sun is, softened over the terminator
    float horizon = -sqrt(saturate(1.0 - (_WF_ShadowRadius * _WF_ShadowRadius) / max(r * r, 1e-3)));
    return smoothstep(horizon - 0.06, horizon + 0.03, mu);
}

// ─── the atmosphere the camera is in (set globally each frame) ───────────
// Used by the sun and its glow so the disc reddens and dims near the horizon.
float4 _WF_AtmoPos;      // world centre
float4 _WF_AtmoBetaR;
float _WF_AtmoOn, _WF_AtmoR, _WF_AtmoRa, _WF_AtmoScale, _WF_AtmoHR, _WF_AtmoHM, _WF_AtmoBetaM;

float3 wf_skyTransmittance(float3 camW, float3 dirW)
{
    if (_WF_AtmoOn < 0.5) return float3(1, 1, 1);
    float inv = 1.0 / _WF_AtmoScale;
    float3 ro = (camW - _WF_AtmoPos.xyz) * inv;
    float2 t = wf_raySphere(ro, dirW, _WF_AtmoRa);
    if (t.x > t.y || t.y <= 0.0) return float3(1, 1, 1);
    float t0 = max(t.x, 0.0);
    float seg = (t.y - t0) / 8.0;
    float odR = 0.0, odM = 0.0;
    [unroll] for (int i = 0; i < 8; i++)
    {
        float h = max(length(ro + dirW * (t0 + (i + 0.5) * seg)) - _WF_AtmoR, 0.0);
        odR += exp(-h / _WF_AtmoHR);
        odM += exp(-h / _WF_AtmoHM);
    }
    return exp(-(_WF_AtmoBetaR.xyz * odR * seg + _WF_AtmoBetaM * 1.1 * odM * seg));
}

#endif

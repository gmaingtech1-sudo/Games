// Atmosphere, clouds and oceans in one pass.
//
// Drawn as the inside of a sphere around the planet after all opaque
// geometry. For every pixel it reads the scene depth, marches the view ray
// through the air (Rayleigh + Mie single scattering with sunlight attenuated
// on the way in), adds a cloud layer where the ray crosses it and shades the
// sea surface where the ray hits water. The result is composited with
// "Blend One SrcAlpha": colour = inscattered light + scene * transmittance.
Shader "Wayfarer/Atmosphere"
{
    Properties
    {
        _PlanetPos ("Planet centre (world)", Vector) = (0, 0, 0, 0)
        _PScale ("World units per metre", Float) = 1
        _R ("Planet radius", Float) = 20000
        _Ra ("Atmosphere radius", Float) = 22000
        _Rs ("Sea radius (0 = none)", Float) = 0
        _Rc ("Cloud radius", Float) = 21000
        _BetaR ("Rayleigh", Vector) = (0.00018, 0.00042, 0.00085, 0)
        _BetaM ("Mie", Float) = 0.0004
        _HR ("Rayleigh scale height", Float) = 450
        _HM ("Mie scale height", Float) = 180
        _MieG ("Mie anisotropy", Float) = 0.76
        _SunDir ("Sun direction", Vector) = (0, 1, 0, 0)
        _SunColor ("Sun radiance for scattering", Color) = (18, 18, 18, 1)
        _LightColor ("Direct light", Color) = (1.4, 1.4, 1.4, 1)
        _AmbientSky ("Ambient sky", Color) = (0.2, 0.25, 0.35, 1)
        _CloudCover ("Cloud cover", Float) = 0.4
        _CloudDensity ("Cloud opacity", Float) = 0.9
        _CloudColor ("Cloud colour", Color) = (1, 1, 1, 1)
        _CloudScale ("Cloud feature scale", Float) = 0.0004
        _CloudDrift ("Cloud drift angle", Float) = 0
        _WaterColor ("Water colour", Color) = (0.05, 0.25, 0.35, 1)
        _WaterDeep ("Deep water colour", Color) = (0.01, 0.06, 0.1, 1)
        _SeaMode ("0 water 1 lava 2 ice", Float) = 0
        _GroundColor ("Average ground colour", Color) = (0.3, 0.3, 0.3, 1)
        _Steps ("Samples", Float) = 12
    }
    SubShader
    {
        Tags { "Queue" = "Transparent-60" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Cull Front
            ZWrite Off
            ZTest Always
            Blend One SrcAlpha

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 4.0
            #include "UnityCG.cginc"
            #include "WayfarerCommon.cginc"

            UNITY_DECLARE_DEPTH_TEXTURE(_CameraDepthTexture);
            float4 _PlanetPos;
            float4x4 _PlanetRot; // world direction -> planet-local direction
            float _PScale, _R, _Ra, _Rs, _Rc;
            float4 _BetaR;
            float _BetaM, _HR, _HM, _MieG;
            float4 _SunDir, _SunColor, _LightColor, _AmbientSky, _CloudColor;
            float _CloudCover, _CloudDensity, _CloudScale, _CloudDrift;
            float4 _WaterColor, _WaterDeep, _GroundColor;
            float _SeaMode, _Steps;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 worldPos : TEXCOORD0;
                float4 screenPos : TEXCOORD1;
            };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.screenPos = ComputeScreenPos(o.pos);
                return o;
            }

            float3 ToLocal(float3 p) { return mul((float3x3)_PlanetRot, p); }

            // sunlight that reaches point p (planet-centred metres) through the air,
            // softened across the terminator
            float3 SunTransmittance(float3 p)
            {
                float r = max(length(p), _R + 1.0);
                float3 sd = _SunDir.xyz;
                float mu = dot(p / r, sd);
                float horizon = -sqrt(saturate(1.0 - (_R * _R) / (r * r)));
                float lit = smoothstep(horizon - 0.015, horizon + 0.06, mu);
                if (lit <= 0.0) return float3(0, 0, 0);
                float tTop = wf_raySphere(p, sd, _Ra).y;
                float ls = max(tTop, 0.0) * 0.25;
                float lR = 0.0, lM = 0.0;
                [unroll] for (int j = 0; j < 4; j++)
                {
                    float hl = max(length(p + sd * ((j + 0.5) * ls)) - _R, 0.0);
                    lR += exp(-hl / _HR);
                    lM += exp(-hl / _HM);
                }
                return exp(-(_BetaR.xyz * lR * ls + _BetaM * 1.1 * lM * ls)) * lit;
            }

            void Scatter(float3 ro, float3 rd, float t0, float t1, int steps, out float3 inscatter, out float3 trans)
            {
                inscatter = float3(0, 0, 0);
                trans = float3(1, 1, 1);
                if (t1 <= t0) return;
                float seg = (t1 - t0) / steps;
                float odR = 0.0, odM = 0.0;
                float3 sumR = float3(0, 0, 0), sumM = float3(0, 0, 0);
                [loop] for (int i = 0; i < 24; i++)
                {
                    if (i >= steps) break;
                    float3 p = ro + rd * (t0 + (i + 0.5) * seg);
                    float h = max(length(p) - _R, 0.0);
                    float dR = exp(-h / _HR) * seg;
                    float dM = exp(-h / _HM) * seg;
                    float3 tau = _BetaR.xyz * (odR + dR * 0.5) + _BetaM * 1.1 * (odM + dM * 0.5);
                    float3 att = exp(-tau) * SunTransmittance(p);
                    sumR += dR * att;
                    sumM += dM * att;
                    odR += dR;
                    odM += dM;
                }
                float mu = dot(rd, _SunDir.xyz);
                inscatter = _SunColor.rgb * (sumR * _BetaR.xyz * wf_phaseR(mu) + sumM * _BetaM * wf_phaseM(mu, _MieG));
                inscatter += _AmbientSky.rgb * 0.02 * (1.0 - exp(-(_BetaR.xyz * odR)));
                trans = exp(-(_BetaR.xyz * odR + _BetaM * 1.1 * odM));
            }

            float4 Cloud(float3 p, float3 rd, float dist)
            {
                int oct = dist < 6000.0 ? 5 : (dist < 40000.0 ? 4 : 3);
                float3 lp = wf_rotY(ToLocal(p), _CloudDrift);
                float d = wf_cloudDensity(lp, _CloudCover, _CloudScale, oct);
                float alpha = saturate(d * _CloudDensity);
                if (alpha <= 0.002) return float4(0, 0, 0, 0);
                float3 lp2 = wf_rotY(ToLocal(p + _SunDir.xyz * 420.0), _CloudDrift);
                float d2 = wf_cloudDensity(lp2, _CloudCover, _CloudScale, 3);
                float selfShadow = exp(-d2 * 2.2);
                float3 sunT = SunTransmittance(p);
                float mu = dot(rd, _SunDir.xyz);
                float phase = 0.55 + 1.2 * wf_phaseM(mu, 0.55);
                float3 col = _CloudColor.rgb * (_LightColor.rgb * sunT * (0.3 + 0.7 * selfShadow) * phase
                                                + _AmbientSky.rgb * (0.55 + 0.25 * (1.0 - d)));
                return float4(col, alpha);
            }

            float WaveH(float3 lp, float t)
            {
                return snoise(lp * 0.045 + float3(t * 0.08, 0, t * 0.05)) * 0.6
                     + snoise(lp * 0.16 + float3(-t * 0.21, t * 0.1, 0)) * 0.25
                     + snoise(lp * 0.55 + float3(0, -t * 0.4, t * 0.3)) * 0.08;
            }

            // Shades the sea surface at distance ts. Returns the light coming off
            // the water (bgIn) and how much of the scene below still shows (bgT).
            void Water(float3 ro, float3 rd, float ts, float sceneDist, out float3 bgIn, out float bgT)
            {
                float3 p = ro + rd * ts;
                float3 n0 = normalize(p);
                float3 sunT = SunTransmittance(p + n0 * 2.0);
                float sunUp = saturate(dot(n0, _SunDir.xyz));
                float3 lp = ToLocal(p);
                float t = _Time.y;

                if (_SeaMode > 1.5)
                {
                    // ice sheet
                    float cr = snoise(lp * 0.02) * 0.5 + 0.5;
                    float3 ice = _WaterColor.rgb * (0.85 + 0.15 * cr);
                    float diff = saturate(dot(n0, _SunDir.xyz));
                    bgIn = ice * (_LightColor.rgb * sunT * diff + _AmbientSky.rgb * 0.8);
                    bgT = 0.0;
                    return;
                }
                if (_SeaMode > 0.5)
                {
                    // lava: glowing crust with cooler plates drifting on top
                    float n = fbm3(lp * 0.012 + float3(0, t * 0.02, 0), 4) * 0.5 + 0.5;
                    float crack = smoothstep(0.45, 0.62, n);
                    float3 hot = _WaterColor.rgb * (2.5 + 3.5 * (1.0 - crack)) * (0.8 + 0.2 * sin(t * 1.3 + n * 12.0));
                    float3 crust = float3(0.05, 0.03, 0.02) * (_LightColor.rgb * sunT * sunUp + _AmbientSky.rgb);
                    bgIn = lerp(hot, crust, crack * 0.85);
                    bgT = 0.0;
                    return;
                }

                // waves: perturb the normal with the gradient of a moving height field
                float fade = saturate(1.0 - ts / 4000.0);
                float3 n = n0;
                if (fade > 0.0)
                {
                    float3 ta = normalize(cross(n0, abs(n0.y) < 0.95 ? float3(0, 1, 0) : float3(1, 0, 0)));
                    float3 tb = cross(n0, ta);
                    const float e = 0.5;
                    float w0 = WaveH(lp, t);
                    float wa = WaveH(ToLocal(p + ta * e), t);
                    float wb = WaveH(ToLocal(p + tb * e), t);
                    n = normalize(n0 - (ta * (wa - w0) + tb * (wb - w0)) / e * 0.35 * fade);
                }
                float cosI = saturate(dot(n, -rd));
                float fres = 0.02 + 0.98 * pow(1.0 - cosI, 5.0);
                float3 refl = reflect(rd, n);
                if (dot(refl, n0) < 0.02) refl = normalize(refl + n0 * (0.02 - dot(refl, n0)));

                float3 skyS, skyT;
                float tr = wf_raySphere(p, refl, _Ra).y;
                Scatter(p + n0, refl, 0.0, max(tr, 0.0), 6, skyS, skyT);
                float glint = pow(saturate(dot(refl, _SunDir.xyz)), 420.0) * 60.0 + pow(saturate(dot(refl, _SunDir.xyz)), 30.0) * 0.6;
                float3 reflC = skyS + _LightColor.rgb * sunT * glint;

                float depthW = clamp(sceneDist - ts, 0.0, 600.0);
                float absorb = exp(-depthW * 0.09);
                float3 body = _WaterDeep.rgb * (_LightColor.rgb * sunT * (0.25 + 0.75 * sunUp) * 0.6 + _AmbientSky.rgb * 0.7)
                            + _WaterColor.rgb * _LightColor.rgb * sunT * sunUp * 0.25 * (1.0 - absorb);
                float foamN = snoise(lp * 0.6 + float3(t * 0.3, 0, t * 0.2)) * 0.5 + 0.5;
                float foam = (1.0 - smoothstep(0.0, 1.2, depthW)) * smoothstep(0.35, 0.75, foamN) * fade;
                float3 foamC = (_LightColor.rgb * sunT * sunUp + _AmbientSky.rgb) * 0.8;

                bgIn = fres * reflC + (1.0 - fres) * (body * (1.0 - absorb)) + foam * foamC;
                bgT = (1.0 - fres) * absorb * (1.0 - foam);
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 camW = _WorldSpaceCameraPos;
                float3 rd = normalize(i.worldPos - camW);
                float2 uv = i.screenPos.xy / i.screenPos.w;
                float raw = SAMPLE_DEPTH_TEXTURE(_CameraDepthTexture, uv);
            #if defined(UNITY_REVERSED_Z)
                bool isSky = raw <= 1e-7;
            #else
                bool isSky = raw >= 0.9999999;
            #endif
                float3 fwd = -UNITY_MATRIX_V[2].xyz;
                float invS = 1.0 / _PScale;
                float sceneDist = isSky ? 1e12 : LinearEyeDepth(raw) / max(dot(rd, fwd), 1e-4) * invS;
                float3 ro = (camW - _PlanetPos.xyz) * invS;
                float camR = length(ro);
                int steps = (int)_Steps;

                // camera under the sea: murky blue fog
                if (_Rs > 0.0 && camR < _Rs && _SeaMode < 0.5)
                {
                    float tExit = wf_raySphere(ro, rd, _Rs).y;
                    float d = min(sceneDist, tExit);
                    float f = exp(-d * 0.055);
                    float3 up = ro / camR;
                    float day = smoothstep(-0.2, 0.3, dot(up, _SunDir.xyz));
                    float3 fogC = _WaterColor.rgb * (_LightColor.rgb * 0.35 * day + _AmbientSky.rgb * 0.35) * exp(-max(_Rs - camR, 0.0) * 0.02);
                    if (sceneDist > tExit) fogC *= 1.6;
                    return float4(fogC * (1.0 - f), f);
                }

                float2 ta = wf_raySphere(ro, rd, _Ra);
                if (ta.x > ta.y || ta.y <= 0.0) return float4(0, 0, 0, 1);
                float t0 = max(ta.x, 0.0);
                float t1 = min(ta.y, sceneDist);

                float3 bgIn = float3(0, 0, 0);
                float bgT = 1.0;

                // a sky pixel whose ray hits the planet means terrain is still streaming in
                if (isSky)
                {
                    float2 tg = wf_raySphere(ro, rd, _R - 40.0);
                    if (tg.x < tg.y && tg.x > 0.0 && tg.x < t1)
                    {
                        t1 = tg.x;
                        float3 pg = ro + rd * tg.x;
                        float diff = saturate(dot(normalize(pg), _SunDir.xyz));
                        bgIn = _GroundColor.rgb * (_LightColor.rgb * SunTransmittance(pg + normalize(pg) * 5.0) * diff + _AmbientSky.rgb * 0.5);
                        bgT = 0.0;
                        sceneDist = tg.x;
                    }
                }

                if (_Rs > 0.0)
                {
                    float2 ts = wf_raySphere(ro, rd, _Rs);
                    if (ts.x < ts.y && ts.x > 0.0 && ts.x < t1)
                    {
                        t1 = ts.x;
                        Water(ro, rd, ts.x, sceneDist, bgIn, bgT);
                    }
                }

                float tc = -1.0;
                if (_CloudCover > 0.001)
                {
                    float2 tcs = wf_raySphere(ro, rd, _Rc);
                    if (tcs.x < tcs.y)
                    {
                        tc = camR < _Rc ? tcs.y : tcs.x;
                        if (tc < t0 || tc > t1) tc = -1.0;
                    }
                }

                float3 S, T;
                if (tc > 0.0)
                {
                    float3 S1, T1, S2, T2;
                    int hs = max(steps / 2, 3);
                    Scatter(ro, rd, t0, tc, hs, S1, T1);
                    Scatter(ro, rd, tc, t1, hs, S2, T2);
                    float4 cl = Cloud(ro + rd * tc, rd, tc);
                    S = S1 + T1 * (cl.rgb * cl.a + (1.0 - cl.a) * (S2 + T2 * bgIn));
                    T = T1 * (1.0 - cl.a) * T2 * bgT;
                }
                else
                {
                    Scatter(ro, rd, t0, t1, steps, S, T);
                    S += T * bgIn;
                    T *= bgT;
                }
                // bright daytime sky drowns out the stars behind it
                if (isSky && bgT > 0.5) T *= exp(-dot(S, float3(0.2126, 0.7152, 0.0722)) * 25.0);
                return float4(S, dot(T, float3(0.3333, 0.3334, 0.3333)));
            }
            ENDCG
        }
    }
}

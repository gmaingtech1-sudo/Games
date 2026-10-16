// Paints the night sky of a star system into a cubemap once, on arrival:
// thousands of background stars, the band of the galaxy with dust lanes
// brightening toward the core, nebulae, and the real neighbouring stars
// (the ones on the galaxy map) at their true positions.
Shader "Wayfarer/SkyBake"
{
    Properties
    {
        _GalUp ("Galactic north", Vector) = (0, 1, 0, 0)
        _CoreDir ("Direction of the core", Vector) = (1, 0, 0, 0)
        _Neb1 ("Nebula colour 1", Color) = (0.5, 0.2, 0.6, 1)
        _Neb2 ("Nebula colour 2", Color) = (0.1, 0.35, 0.7, 1)
        _NebAmount ("Nebula amount", Float) = 0.5
        _Band ("Galaxy band brightness", Float) = 1
        _Seed ("Seed", Float) = 0
        _StarCount ("Neighbour star count", Float) = 0
    }
    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Background" "PreviewType" = "Skybox" }
        Cull Off
        ZWrite Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 4.0
            #include "UnityCG.cginc"
            #include "WayfarerCommon.cginc"

            float4 _GalUp, _CoreDir, _Neb1, _Neb2;
            float _NebAmount, _Band, _Seed, _StarCount;
            float4 _NearStars[128];      // xyz direction, w brightness
            float4 _NearStarColors[128];

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 dir : TEXCOORD0;
            };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.dir = v.vertex.xyz;
                return o;
            }

            float3 StarColor(float t)
            {
                float3 cool = float3(1.0, 0.62, 0.38);
                float3 sun = float3(1.0, 0.93, 0.84);
                float3 hot = float3(0.7, 0.8, 1.0);
                return t < 0.5 ? lerp(cool, sun, t * 2.0) : lerp(sun, hot, t * 2.0 - 1.0);
            }

            float3 StarLayer(float3 d, float scale, float density, float size, float gain)
            {
                float3 p = d * scale + _Seed * 13.7;
                float3 c = floor(p);
                float3 f = p - c;
                float3 h = hash33(c);
                if (h.z > density) return float3(0, 0, 0);
                float3 sp = 0.2 + 0.6 * hash33(c + 17.1);
                float3 dv = f - sp;
                float d2 = dot(dv, dv);
                float b = pow(hash13(c * 1.7 + 3.1), 14.0) * 22.0 + 0.25;
                return StarColor(h.y) * exp(-d2 / (size * size)) * b * gain;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float3 col = float3(0, 0, 0);

                float g = dot(d, normalize(_GalUp.xyz));
                float band = exp(-g * g * 22.0);
                float core = pow(saturate(dot(d, normalize(_CoreDir.xyz)) * 0.5 + 0.5), 5.0);

                col += StarLayer(d, 260.0, 0.55, 0.16, 0.9);
                col += StarLayer(d, 640.0, 0.5, 0.14, 0.35);
                col += StarLayer(d, 1500.0, 0.45 * band + 0.08, 0.14, 0.22) * (0.4 + band);

                float3 q = d * 5.0 + _Seed;
                float clouds = fbm3(q * 0.6, 5) * 0.5 + 0.5;
                float dust = fbm3(q * 1.1 + 31.0, 5) * 0.5 + 0.5;
                float mw = band * (0.25 + 0.75 * core) * (0.45 + 0.55 * clouds);
                mw *= 1.0 - 0.85 * smoothstep(0.5, 0.72, dust) * smoothstep(0.2, 0.9, band);
                col += float3(0.62, 0.56, 0.5) * mw * 0.22 * _Band;
                col += float3(1.0, 0.8, 0.6) * pow(core, 6.0) * band * 0.35 * _Band;

                float nb = fbm3(d * 2.3 + _Seed * 3.1, 5) * 0.5 + 0.5;
                nb = smoothstep(0.55, 0.85, nb) * _NebAmount;
                float mixT = fbm3(d * 4.1 + 7.0 + _Seed, 3) * 0.5 + 0.5;
                col += lerp(_Neb1.rgb, _Neb2.rgb, mixT) * nb * 0.12;

                [loop] for (int k = 0; k < 128; k++)
                {
                    if (k >= (int)_StarCount) break;
                    float c = dot(d, _NearStars[k].xyz);
                    if (c < 0.9999) continue;
                    float x = (1.0 - c) * 3.0e6;
                    col += _NearStarColors[k].rgb * _NearStars[k].w * (exp(-x) + 0.04 * exp(-x * 0.02));
                }
                return float4(col, 1);
            }
            ENDCG
        }
    }
}

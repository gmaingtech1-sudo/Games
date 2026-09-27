// Planetary rings: many thin bands of ice and dust, lit by the sun and
// darkened where the planet's shadow falls across them.
Shader "Wayfarer/Ring"
{
    Properties
    {
        _Color ("Colour", Color) = (0.8, 0.75, 0.65, 1)
        _Inner ("Inner radius (object)", Float) = 1.4
        _Outer ("Outer radius (object)", Float) = 2.3
        _PlanetPos ("Planet centre (world)", Vector) = (0, 0, 0, 0)
        _PlanetRadius ("Planet radius (world)", Float) = 1
        _SunDir ("Sun direction (world)", Vector) = (0, 1, 0, 0)
        _LightColor ("Light", Color) = (1.4, 1.4, 1.4, 1)
        _Seed ("Seed", Float) = 0
    }
    SubShader
    {
        Tags { "Queue" = "Transparent-70" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            Cull Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.5
            #include "UnityCG.cginc"
            #include "WayfarerCommon.cginc"

            float4 _Color, _PlanetPos, _SunDir, _LightColor;
            float _Inner, _Outer, _PlanetRadius, _Seed;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 worldPos : TEXCOORD0;
                float3 objPos : TEXCOORD1;
            };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.objPos = v.vertex.xyz;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float r = length(i.objPos.xz);
                float x = (r - _Inner) / (_Outer - _Inner);
                if (x < 0.0 || x > 1.0) discard;
                float bands = snoise(float3(x * 60.0, _Seed, 0.0)) * 0.5 + 0.5;
                float fine = snoise(float3(x * 400.0, _Seed + 5.0, 0.0)) * 0.5 + 0.5;
                float gap = smoothstep(0.02, 0.0, abs(x - 0.62)) + smoothstep(0.01, 0.0, abs(x - 0.35));
                float alpha = saturate(bands * 0.8 + fine * 0.4 - 0.2) * smoothstep(0.0, 0.05, x) * smoothstep(1.0, 0.9, x);
                alpha *= 1.0 - gap;
                // planet shadow
                float3 L = normalize(_SunDir.xyz);
                float2 hit = wf_raySphere(i.worldPos - _PlanetPos.xyz, L, _PlanetRadius);
                float lit = (hit.x < hit.y && hit.y > 0.0) ? 0.08 : 1.0;
                float3 col = _Color.rgb * (0.75 + 0.5 * fine) * _LightColor.rgb * lit;
                return float4(col, alpha * 0.85);
            }
            ENDCG
        }
    }
}

// Banded gas giant with turbulent belts, a great storm, a soft terminator
// and a hazy rim. Lit from its own direction to the star.
Shader "Wayfarer/GasGiant"
{
    Properties
    {
        _BandA ("Band A", Color) = (0.85, 0.7, 0.5, 1)
        _BandB ("Band B", Color) = (0.55, 0.4, 0.3, 1)
        _BandC ("Band C", Color) = (0.9, 0.88, 0.8, 1)
        _SunDir ("Sun direction (world)", Vector) = (0, 1, 0, 0)
        _LightColor ("Light", Color) = (1.4, 1.4, 1.4, 1)
        _Rim ("Rim haze colour", Color) = (0.5, 0.65, 1, 1)
        _Seed ("Seed", Float) = 0
    }
    SubShader
    {
        Tags { "Queue" = "Geometry" "RenderType" = "Opaque" }
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.5
            #include "UnityCG.cginc"
            #include "WayfarerCommon.cginc"

            float4 _BandA, _BandB, _BandC, _SunDir, _LightColor, _Rim;
            float _Seed;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 worldPos : TEXCOORD0;
                float3 normal : TEXCOORD1;
                float3 objPos : TEXCOORD2;
            };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.normal = UnityObjectToWorldNormal(v.normal);
                o.objPos = v.vertex.xyz;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 q = normalize(i.objPos);
                float t = _Time.y * 0.002;
                float turb = fbm3(float3(q.x * 3.0, q.y * 14.0, q.z * 3.0) + _Seed + float3(t, 0, 0), 5);
                float lat = q.y + turb * 0.06;
                float bands = sin(lat * 23.0 + _Seed) * 0.5 + 0.5;
                float bands2 = sin(lat * 57.0 + _Seed * 2.0) * 0.5 + 0.5;
                float3 col = lerp(_BandA.rgb, _BandB.rgb, bands);
                col = lerp(col, _BandC.rgb, smoothstep(0.6, 0.95, bands2) * 0.6);
                // a great storm
                float3 sc = normalize(float3(0.7, -0.35, 0.6));
                float sd = length((q - sc) * float3(1.0, 2.2, 1.0));
                float storm = smoothstep(0.22, 0.05, sd + turb * 0.05);
                col = lerp(col, _BandB.rgb * float3(1.25, 0.8, 0.7), storm * 0.8);

                float3 N = normalize(i.normal);
                float3 L = normalize(_SunDir.xyz);
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float ndl = dot(N, L);
                float diff = smoothstep(-0.12, 0.5, ndl) * (0.25 + 0.75 * saturate(ndl + 0.1));
                float fres = pow(1.0 - saturate(dot(N, V)), 3.0);
                float3 lit = col * _LightColor.rgb * diff;
                lit += _Rim.rgb * _LightColor.rgb * fres * smoothstep(-0.3, 0.3, ndl) * 0.6;
                return float4(lit, 1);
            }
            ENDCG
        }
    }
}

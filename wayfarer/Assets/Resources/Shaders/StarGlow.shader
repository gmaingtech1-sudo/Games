// Soft corona around the sun: an additive camera-facing quad drawn after the
// atmosphere, tinted by the air between you and the star.
Shader "Wayfarer/StarGlow"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 0.9, 0.8, 1)
        _Intensity ("Intensity", Float) = 3
        _Core ("Core size", Float) = 0.12
    }
    SubShader
    {
        Tags { "Queue" = "Transparent-40" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Blend One One
            ZWrite Off
            Cull Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.5
            #include "UnityCG.cginc"
            #include "WayfarerCommon.cginc"

            float4 _Color;
            float _Intensity, _Core;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 center : TEXCOORD1;
            };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.texcoord.xy * 2.0 - 1.0;
                o.center = mul(unity_ObjectToWorld, float4(0, 0, 0, 1)).xyz;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float r = length(i.uv);
                float glow = exp(-r * r / (_Core * _Core)) * 0.8 + exp(-r * 7.0) * 0.35 + exp(-r * 2.5) * 0.08;
                glow *= saturate(1.0 - r);
                float3 dir = normalize(i.center - _WorldSpaceCameraPos);
                float3 T = wf_skyTransmittance(_WorldSpaceCameraPos, dir);
                return float4(_Color.rgb * _Intensity * glow * T, 1);
            }
            ENDCG
        }
    }
}

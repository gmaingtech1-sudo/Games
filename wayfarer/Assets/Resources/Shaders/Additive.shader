// Glowing effects: laser beams, engine flames, scanner pulses, particles.
Shader "Wayfarer/Additive"
{
    Properties
    {
        [HDR] _Color ("Colour", Color) = (1, 1, 1, 1)
        _Soft ("Radial falloff", Range(0, 1)) = 0
        _Beam ("Beam falloff across U", Range(0, 1)) = 0
    }
    SubShader
    {
        Tags { "Queue" = "Transparent+10" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Blend One One
            ZWrite Off
            Cull Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"

            float4 _Color;
            float _Soft, _Beam;

            struct appdata
            {
                float4 vertex : POSITION;
                float4 color : COLOR;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float4 color : COLOR;
                float2 uv : TEXCOORD0;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.color = v.color;
                o.uv = v.uv;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float a = 1.0;
                float2 c = i.uv * 2.0 - 1.0;
                if (_Soft > 0.0) a *= lerp(1.0, saturate(1.0 - dot(c, c)), _Soft);
                if (_Beam > 0.0) a *= lerp(1.0, pow(saturate(1.0 - abs(c.x)), 2.0), _Beam);
                return float4(_Color.rgb * i.color.rgb * i.color.a * a, 1);
            }
            ENDCG
        }
    }
}

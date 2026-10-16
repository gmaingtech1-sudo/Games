// Shows the baked star field. It is rotated every frame because standing
// on a spinning planet makes the whole sky turn overhead.
Shader "Wayfarer/Skybox"
{
    Properties
    {
        [NoScaleOffset] _Tex ("Sky cubemap", Cube) = "black" {}
        _Exposure ("Exposure", Float) = 1
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
            #pragma target 3.0
            #include "UnityCG.cginc"

            samplerCUBE _Tex;
            float _Exposure;
            float4x4 _SkyRot;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 dir : TEXCOORD0;
            };

            v2f vert(appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.dir = mul((float3x3)_SkyRot, v.vertex.xyz);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                return float4(texCUBE(_Tex, i.dir).rgb * _Exposure, 1);
            }
            ENDCG
        }
    }
}

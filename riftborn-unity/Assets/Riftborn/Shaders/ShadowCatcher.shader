// Riftborn — an invisible floor that only shows the shadows falling on it,
// so AR creatures look like they stand on your real floor.
Shader "Riftborn/ShadowCatcher"
{
    Properties
    {
        _Strength ("Shadow strength", Range(0, 1)) = 0.45
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "AlphaTest+50" }
        Pass
        {
            Tags { "LightMode" = "ForwardBase" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #include "UnityCG.cginc"
            #include "AutoLight.cginc"

            half _Strength;

            struct v2f { float4 pos : SV_POSITION; SHADOW_COORDS(0) };

            v2f vert (appdata_base v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                TRANSFER_SHADOW(o);
                return o;
            }

            half4 frag (v2f i) : SV_Target
            {
                half a = (1 - SHADOW_ATTENUATION(i)) * _Strength;
                return half4(0, 0, 0, a);
            }
            ENDCG
        }
    }
    Fallback "VertexLit"
}

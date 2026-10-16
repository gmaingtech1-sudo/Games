// The sun: a very bright sphere with limb darkening and a boiling surface.
// Its colour is filtered through the atmosphere the camera is in, so it
// turns orange and dim as it sets.
Shader "Wayfarer/Star"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 0.95, 0.85, 1)
        _Intensity ("Intensity", Float) = 60
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

            float4 _Color;
            float _Intensity;

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
                float3 V = normalize(_WorldSpaceCameraPos - i.worldPos);
                float mu = saturate(dot(normalize(i.normal), V));
                float limb = 0.35 + 0.65 * pow(mu, 0.45);
                float3 q = normalize(i.objPos);
                float gran = snoise(q * 38.0 + _Time.y * 0.05) * 0.5 + 0.5;
                float spots = smoothstep(0.62, 0.75, snoise(q * 4.0 + 7.3) * 0.5 + 0.5);
                float3 col = _Color.rgb * _Intensity * limb * (0.82 + 0.3 * gran) * (1.0 - spots * 0.45);
                float3 T = wf_skyTransmittance(_WorldSpaceCameraPos, -V);
                // the atmosphere pass later multiplies by the average transmittance,
                // so divide it out here to end up with the true colour shift
                col *= T / max(dot(T, float3(0.3333, 0.3334, 0.3333)), 1e-3);
                return float4(col, 1);
            }
            ENDCG
        }
    }
}

// Plants and trees, drawn in large instanced batches. They sway in the
// wind (more at the top than at the root), get a per-instance colour tint,
// and let a little light through when the sun is behind them.
Shader "Wayfarer/Foliage"
{
    Properties
    {
        _Color ("Colour", Color) = (0.3, 0.5, 0.2, 1)
        [HDR] _Emission ("Emission", Color) = (0, 0, 0, 1)
        _Smoothness ("Smoothness", Range(0, 1)) = 0.2
        _Wind ("Wind", Float) = 1
        _Translucency ("Translucency", Range(0, 1)) = 0.3
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        LOD 200

        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows vertex:vert addshadow
        #pragma target 3.5
        #pragma multi_compile_instancing
        #include "UnityCG.cginc"
        #include "WayfarerCommon.cginc"

        fixed4 _Color;
        half4 _Emission;
        half _Smoothness, _Wind, _Translucency;

        UNITY_INSTANCING_BUFFER_START(Props)
            UNITY_DEFINE_INSTANCED_PROP(fixed4, _Tint)
        UNITY_INSTANCING_BUFFER_END(Props)

        struct Input
        {
            float3 objPos;
            float3 worldPos;
            float3 viewDir;
        };

        void vert(inout appdata_full v, out Input o)
        {
            UNITY_INITIALIZE_OUTPUT(Input, o);
            o.objPos = v.vertex.xyz;
            float3 origin = float3(unity_ObjectToWorld[0].w, unity_ObjectToWorld[1].w, unity_ObjectToWorld[2].w);
            float phase = dot(origin, float3(0.13, 0.17, 0.11));
            float h = max(v.vertex.y, 0.0);
            float t = _Time.y;
            float sway = sin(t * 1.3 + phase) * 0.6 + sin(t * 2.9 + phase * 1.7) * 0.25;
            float flutter = sin(t * 7.0 + dot(v.vertex.xyz, float3(3.1, 2.3, 4.7))) * 0.015;
            float bend = _Wind * h * h * 0.012;
            v.vertex.x += sway * bend + flutter * _Wind * saturate(h);
            v.vertex.z += cos(t * 1.1 + phase * 1.3) * 0.45 * bend;
        }

        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            fixed4 tint = UNITY_ACCESS_INSTANCED_PROP(Props, _Tint);
            float n = snoise(IN.objPos * 1.3) * 0.5 + 0.5;
            float3 col = _Color.rgb * tint.rgb * (0.8 + 0.35 * n);
            o.Albedo = col;
            o.Smoothness = _Smoothness;
            o.Metallic = 0;
            // cheap translucency: brighten when looking toward the light through leaves
            float back = saturate(dot(-normalize(IN.viewDir), normalize(_WorldSpaceLightPos0.xyz)));
            o.Emission = _Emission.rgb * (0.85 + 0.3 * n) + col * pow(back, 4.0) * _Translucency * 0.6;
            o.Alpha = 1;
        }
        ENDCG
    }
    FallBack "Diffuse"
}

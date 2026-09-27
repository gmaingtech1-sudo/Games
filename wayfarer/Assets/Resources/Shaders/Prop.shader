// Ships, buildings, rocks and creatures: physically based with procedural
// wear, panel seams and optional glow. Supports GPU instancing.
Shader "Wayfarer/Prop"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 1)
        _Metallic ("Metallic", Range(0, 1)) = 0
        _Smoothness ("Smoothness", Range(0, 1)) = 0.5
        [HDR] _Emission ("Emission", Color) = (0, 0, 0, 1)
        _Grime ("Wear", Range(0, 1)) = 0.3
        _Panels ("Panel seams", Range(0, 1)) = 0
        _NoiseScale ("Wear scale", Float) = 1.5
        _Pattern ("Pattern (creatures)", Range(0, 1)) = 0
        _PatternColor ("Pattern colour", Color) = (0.2, 0.2, 0.2, 1)
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        LOD 300

        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows vertex:vert addshadow
        #pragma target 3.5
        #pragma multi_compile_instancing
        #include "UnityCG.cginc"
        #include "WayfarerCommon.cginc"

        half _Metallic, _Smoothness, _Grime, _Panels, _NoiseScale, _Pattern;
        half4 _Emission, _PatternColor;

        UNITY_INSTANCING_BUFFER_START(Props)
            UNITY_DEFINE_INSTANCED_PROP(fixed4, _Color)
        UNITY_INSTANCING_BUFFER_END(Props)

        struct Input
        {
            float3 objPos;
            float3 objNormal;
        };

        void vert(inout appdata_full v, out Input o)
        {
            UNITY_INITIALIZE_OUTPUT(Input, o);
            o.objPos = v.vertex.xyz;
            o.objNormal = v.normal;
        }

        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            fixed4 c = UNITY_ACCESS_INSTANCED_PROP(Props, _Color);
            float3 p = IN.objPos * _NoiseScale;
            float wear = snoise(p) * 0.5 + 0.5;
            float fine = snoise(p * 7.3) * 0.5 + 0.5;
            float grime = saturate(wear * 0.8 + fine * 0.3 - 0.35) * _Grime;
            float3 col = c.rgb * (1.0 - grime * 0.45);

            if (_Pattern > 0.001)
            {
                float stripes = smoothstep(0.1, 0.25, sin(IN.objPos.z * 18.0 + snoise(IN.objPos * 3.0) * 2.5));
                float spots = smoothstep(0.35, 0.5, snoise(IN.objPos * 6.5));
                float pat = lerp(spots, stripes, step(0.5, _Pattern)) * saturate(_Pattern * 2.0);
                col = lerp(col, _PatternColor.rgb, pat * 0.85);
            }

            float seam = 1.0;
            if (_Panels > 0.001)
            {
                float3 n = abs(normalize(IN.objNormal));
                float3 g = abs(frac(IN.objPos * 0.9) - 0.5);
                float lx = smoothstep(0.485, 0.5, g.x), ly = smoothstep(0.485, 0.5, g.y), lz = smoothstep(0.485, 0.5, g.z);
                float line1 = n.x > 0.6 ? max(ly, lz) : (n.y > 0.6 ? max(lx, lz) : max(lx, ly));
                seam = 1.0 - line1 * _Panels * 0.5;
            }
            o.Albedo = col * seam;
            o.Metallic = _Metallic;
            o.Smoothness = _Smoothness * (1.0 - grime * 0.6);
            o.Emission = _Emission.rgb;
            o.Alpha = 1;
        }
        ENDCG
    }
    FallBack "Diffuse"
}

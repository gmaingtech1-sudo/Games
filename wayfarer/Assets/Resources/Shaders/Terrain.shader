// Planet surface. Colours come from the vertex climate data (moisture,
// temperature, variation) plus slope, height and procedural noise, so there
// are no textures to tile. Lighting uses each planet's own sun direction so
// distant planets are lit correctly too, and clouds cast shadows.
Shader "Wayfarer/Terrain"
{
    Properties
    {
        _Ground1 ("Ground 1", Color) = (0.28, 0.42, 0.18, 1)
        _Ground2 ("Ground 2", Color) = (0.35, 0.5, 0.22, 1)
        _Dry ("Dry ground", Color) = (0.6, 0.52, 0.36, 1)
        _Rock1 ("Rock 1", Color) = (0.42, 0.39, 0.35, 1)
        _Rock2 ("Rock 2", Color) = (0.3, 0.28, 0.26, 1)
        _Snow ("Snow", Color) = (0.94, 0.95, 0.98, 1)
        _Sand ("Sand", Color) = (0.8, 0.74, 0.58, 1)
        _Radius ("Radius (m)", Float) = 20000
        _SeaLevel ("Sea level (m)", Float) = -100000
        _SnowLine ("Snow line (m)", Float) = 100000
        _PlanetCenter ("Planet centre (world)", Vector) = (0, 0, 0, 0)
        _SunDirWorld ("Sun direction (world)", Vector) = (0, 1, 0, 0)
        _SunDirLocal ("Sun direction (planet)", Vector) = (0, 1, 0, 0)
        _Ambient ("Day ambient", Color) = (0.25, 0.3, 0.38, 1)
        _NightAmbient ("Night ambient", Color) = (0.012, 0.014, 0.022, 1)
        _LavaGlow ("Lava glow", Color) = (0, 0, 0, 1)
        _ChunkCenter ("Chunk centre", Vector) = (0, 0, 0, 0)
        _DetailFade ("Detail fade distance", Float) = 450
        _CloudCover ("Cloud cover", Float) = 0
        _CloudRadius ("Cloud radius (m)", Float) = 0
        _CloudScale ("Cloud scale", Float) = 0.0004
        _CloudDrift ("Cloud drift", Float) = 0
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        LOD 300

        CGPROGRAM
        #pragma surface surf Planet vertex:vert fullforwardshadows addshadow
        #pragma target 4.0
        #include "UnityPBSLighting.cginc"
        #include "WayfarerCommon.cginc"

        fixed4 _Ground1, _Ground2, _Dry, _Rock1, _Rock2, _Snow, _Sand;
        float _Radius, _SeaLevel, _SnowLine, _DetailFade;
        float4 _PlanetCenter, _SunDirWorld, _SunDirLocal, _ChunkCenter;
        fixed4 _Ambient, _NightAmbient, _LavaGlow;
        float _CloudCover, _CloudRadius, _CloudScale, _CloudDrift;

        struct SurfaceOutputPlanet
        {
            fixed3 Albedo;
            float3 Normal;
            half3 Emission;
            half Metallic;
            half Smoothness;
            half Occlusion;
            fixed Alpha;
            half SunShadow;
        };

        struct Input
        {
            float4 color : COLOR;
            float3 localPos;
            float3 localNormal;
            float3 localTangent;
            float3 worldPos;
        };

        void vert(inout appdata_full v, out Input o)
        {
            UNITY_INITIALIZE_OUTPUT(Input, o);
            o.localPos = v.vertex.xyz + _ChunkCenter.xyz;
            o.localNormal = v.normal;
            o.localTangent = v.tangent.xyz;
        }

        half4 LightingPlanet(SurfaceOutputPlanet s, half3 viewDir, UnityGI gi)
        {
            SurfaceOutputStandard o;
            o.Albedo = s.Albedo;
            o.Normal = s.Normal;
            o.Emission = s.Emission;
            o.Metallic = s.Metallic;
            o.Smoothness = s.Smoothness;
            o.Occlusion = s.Occlusion;
            o.Alpha = s.Alpha;
        #if defined(UNITY_PASS_FORWARDBASE)
            // each planet is lit from its own direction to the star
            gi.light.dir = normalize(_SunDirWorld.xyz);
            gi.light.color *= s.SunShadow;
        #endif
            gi.indirect.diffuse = 0;
            gi.indirect.specular *= 0.15;
            return LightingStandard(o, viewDir, gi);
        }

        void LightingPlanet_GI(SurfaceOutputPlanet s, UnityGIInput data, inout UnityGI gi)
        {
            SurfaceOutputStandard o;
            o.Albedo = s.Albedo;
            o.Normal = s.Normal;
            o.Emission = s.Emission;
            o.Metallic = s.Metallic;
            o.Smoothness = s.Smoothness;
            o.Occlusion = s.Occlusion;
            o.Alpha = s.Alpha;
            LightingStandard_GI(o, data, gi);
        }

        void surf(Input IN, inout SurfaceOutputPlanet o)
        {
            float3 p = IN.localPos;
            float r = length(p);
            float3 up = p / r;
            float h = r - _Radius;
            float3 nrm = normalize(IN.localNormal);
            float flatness = saturate(dot(nrm, up));
            float slope = 1.0 - flatness;
            float moist = IN.color.r;
            float temp = IN.color.g;
            float vari = IN.color.b;
            float dist = distance(IN.worldPos, _WorldSpaceCameraPos);
            float detail = saturate(1.0 - dist / _DetailFade);
            float mid = saturate(1.0 - dist / (_DetailFade * 12.0));

            float n1 = snoise(p * 0.0021);
            float n2 = mid > 0.0 ? snoise(p * 0.019) : 0.0;
            float n3 = detail > 0.0 ? snoise(p * 0.21) : 0.0;

            // ground from climate
            float3 ground = lerp(_Ground1.rgb, _Ground2.rgb, saturate(moist + n1 * 0.35 + (vari - 0.5) * 0.45));
            float dryness = saturate((temp - moist) * 1.6 - 0.15 + n2 * 0.25 + n1 * 0.15);
            ground = lerp(ground, _Dry.rgb, dryness * 0.8);

            // exposed rock on steep ground, with strata
            float rockMask = smoothstep(0.26, 0.4, slope + n2 * 0.06 + n3 * 0.035);
            float3 rock = lerp(_Rock1.rgb, _Rock2.rgb, saturate(0.5 + n2 * 0.7 + n3 * 0.3));
            rock *= 0.86 + 0.14 * sin(h * 0.33 + n2 * 4.0 + n1 * 6.0);
            float3 col = lerp(ground, rock, rockMask);

            // beaches and sea floor
            float beach = 1.0 - smoothstep(_SeaLevel + 1.0, _SeaLevel + 6.0 + n2 * 4.0, h);
            col = lerp(col, _Sand.rgb, beach * (1.0 - rockMask * 0.7));

            // snow on flat high ground
            float snow = smoothstep(_SnowLine - 70.0, _SnowLine + 70.0, h + n1 * 160.0 + n2 * 35.0);
            snow *= saturate(1.25 - slope * 2.2);
            col = lerp(col, _Snow.rgb, snow);

            col *= 0.9 + 0.12 * n3 * detail + 0.08 * n2;

            // fine relief from noise, in tangent space
            float3 T = normalize(IN.localTangent - nrm * dot(IN.localTangent, nrm));
            float3 B = cross(nrm, T);
            float3 bump = float3(0, 0, 1);
            if (detail > 0.001)
            {
                float amp = lerp(0.18, 0.55, rockMask) * detail;
                const float e = 0.22;
                const float f = 0.35;
                float3 pt = p + T * e;
                float3 pb = p + B * e;
                float h0 = snoise(p * f) + 0.45 * snoise(p * f * 2.9);
                float ht = snoise(pt * f) + 0.45 * snoise(pt * f * 2.9);
                float hb = snoise(pb * f) + 0.45 * snoise(pb * f * 2.9);
                bump = normalize(float3(-(ht - h0) / e * amp, -(hb - h0) / e * amp, 1.0));
            }
            o.Normal = bump;
            o.Albedo = col;
            o.Metallic = 0;
            o.Smoothness = lerp(0.06, 0.35, snow) + beach * 0.15 * step(h, _SeaLevel + 1.0);
            o.Occlusion = 1;
            o.Alpha = 1;

            // cloud shadows: where the sun ray from here crosses the cloud layer
            float shadow = 1.0;
            if (_CloudCover > 0.001 && r < _CloudRadius)
            {
                float3 sl = normalize(_SunDirLocal.xyz);
                float2 tc = wf_raySphere(p, sl, _CloudRadius);
                float3 pc = wf_rotY(p + sl * tc.y, _CloudDrift);
                float cd = wf_cloudDensity(pc, _CloudCover, _CloudScale, 3);
                shadow = 1.0 - cd * 0.75;
            }
            o.SunShadow = shadow;

            // sky light, night light and lava glow
            float3 wUp = normalize(IN.worldPos - _PlanetCenter.xyz);
            float day = smoothstep(-0.25, 0.35, dot(wUp, normalize(_SunDirWorld.xyz)));
            float3 amb = lerp(_NightAmbient.rgb, _Ambient.rgb * (0.7 + 0.3 * shadow), day) * (0.65 + 0.35 * flatness);
            float lava = smoothstep(_SeaLevel + 45.0, _SeaLevel + 2.0, h);
            o.Emission = col * amb + _LavaGlow.rgb * lava * (0.6 + 0.4 * n2);
        }
        ENDCG
    }
    FallBack "Diffuse"
}

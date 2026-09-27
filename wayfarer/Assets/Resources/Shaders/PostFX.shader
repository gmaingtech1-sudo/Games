// Camera post-processing: bloom, eye adaptation, filmic (ACES) tone mapping,
// colour grading, vignette, film grain, and the hyperspace tunnel.
Shader "Hidden/Wayfarer/PostFX"
{
    Properties
    {
        _MainTex ("Source", 2D) = "black" {}
    }
    CGINCLUDE
    #include "UnityCG.cginc"

    sampler2D _MainTex;
    float4 _MainTex_TexelSize;
    sampler2D _BloomTex;
    sampler2D _ExposureTex;
    sampler2D _PrevTex;
    float _Threshold, _Knee, _BloomIntensity;
    float _Exposure, _AutoExposure, _Key, _MinExposure, _MaxExposure, _AdaptSpeed, _DeltaTime;
    float _Vignette, _Grain, _Saturation, _Contrast;
    float _Warp, _WarpTime, _Fade, _Flash, _Damage;
    float4 _WarpColor, _Lift;

    float Max3(float3 c) { return max(c.x, max(c.y, c.z)); }

    float3 Box4(float2 uv, float2 d)
    {
        float3 s = tex2D(_MainTex, uv + float2(-d.x, -d.y)).rgb;
        s += tex2D(_MainTex, uv + float2(d.x, -d.y)).rgb;
        s += tex2D(_MainTex, uv + float2(-d.x, d.y)).rgb;
        s += tex2D(_MainTex, uv + float2(d.x, d.y)).rgb;
        return s * 0.25;
    }

    float4 FragPrefilter(v2f_img i) : SV_Target
    {
        float3 c = Box4(i.uv, _MainTex_TexelSize.xy);
        c = min(c, float3(3000, 3000, 3000));
        float br = Max3(c);
        float soft = clamp(br - _Threshold + _Knee, 0.0, 2.0 * _Knee);
        soft = soft * soft / (4.0 * _Knee + 1e-5);
        float contrib = max(soft, br - _Threshold) / max(br, 1e-5);
        return float4(c * contrib, 1);
    }

    // 13-tap downsample (as used in Call of Duty: Advanced Warfare)
    float4 FragDown(v2f_img i) : SV_Target
    {
        float2 t = _MainTex_TexelSize.xy;
        float2 uv = i.uv;
        float3 a = tex2D(_MainTex, uv + t * float2(-2, -2)).rgb;
        float3 b = tex2D(_MainTex, uv + t * float2(0, -2)).rgb;
        float3 c = tex2D(_MainTex, uv + t * float2(2, -2)).rgb;
        float3 d = tex2D(_MainTex, uv + t * float2(-1, -1)).rgb;
        float3 e = tex2D(_MainTex, uv + t * float2(1, -1)).rgb;
        float3 f = tex2D(_MainTex, uv + t * float2(-2, 0)).rgb;
        float3 g = tex2D(_MainTex, uv).rgb;
        float3 h = tex2D(_MainTex, uv + t * float2(2, 0)).rgb;
        float3 j = tex2D(_MainTex, uv + t * float2(-1, 1)).rgb;
        float3 k = tex2D(_MainTex, uv + t * float2(1, 1)).rgb;
        float3 l = tex2D(_MainTex, uv + t * float2(-2, 2)).rgb;
        float3 m = tex2D(_MainTex, uv + t * float2(0, 2)).rgb;
        float3 n = tex2D(_MainTex, uv + t * float2(2, 2)).rgb;
        float3 o = (d + e + j + k) * 0.125;
        o += (a + b + g + f) * 0.03125;
        o += (b + c + h + g) * 0.03125;
        o += (f + g + l + m) * 0.03125;
        o += (g + h + m + n) * 0.03125;
        return float4(o, 1);
    }

    // 9-tap tent upsample, added onto the next larger level
    float4 FragUp(v2f_img i) : SV_Target
    {
        float2 t = _MainTex_TexelSize.xy;
        float2 uv = i.uv;
        float3 s = tex2D(_MainTex, uv + t * float2(-1, -1)).rgb;
        s += tex2D(_MainTex, uv + t * float2(0, -1)).rgb * 2.0;
        s += tex2D(_MainTex, uv + t * float2(1, -1)).rgb;
        s += tex2D(_MainTex, uv + t * float2(-1, 0)).rgb * 2.0;
        s += tex2D(_MainTex, uv).rgb * 4.0;
        s += tex2D(_MainTex, uv + t * float2(1, 0)).rgb * 2.0;
        s += tex2D(_MainTex, uv + t * float2(-1, 1)).rgb;
        s += tex2D(_MainTex, uv + t * float2(0, 1)).rgb * 2.0;
        s += tex2D(_MainTex, uv + t * float2(1, 1)).rgb;
        return float4(s / 16.0 + tex2D(_BloomTex, uv).rgb, 1);
    }

    float3 ACES(float3 x)
    {
        return saturate((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
    }

    float Hash(float2 p)
    {
        float3 p3 = frac(float3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return frac((p3.x + p3.y) * p3.z);
    }

    float3 WarpTunnel(float2 uv)
    {
        float2 d = uv - 0.5;
        d.x *= _ScreenParams.x / _ScreenParams.y;
        float r = length(d);
        float a = atan2(d.y, d.x);
        float lanes = floor((a + 3.14159) / 6.28318 * 90.0);
        float speed = 1.5 + Hash(float2(lanes, 3.0)) * 2.5;
        float phase = frac(Hash(float2(lanes, 7.0)) + _WarpTime * speed * 0.35 - 0.6 / (r + 0.05));
        float streak = smoothstep(0.0, 0.06, phase) * smoothstep(0.35, 0.06, phase);
        float laneMask = smoothstep(0.45, 0.5, abs(frac((a + 3.14159) / 6.28318 * 90.0) - 0.5));
        float3 c = _WarpColor.rgb * streak * (1.0 - laneMask) * smoothstep(0.02, 0.6, r) * 6.0;
        c += _WarpColor.rgb * exp(-r * 6.0) * 2.0;
        return c;
    }

    float4 FragFinal(v2f_img i) : SV_Target
    {
        float2 uv = i.uv;
        float3 col;
        if (_Warp > 0.001)
        {
            // radial smear toward the centre while the drive is engaged
            float2 d = uv - 0.5;
            col = float3(0, 0, 0);
            [unroll] for (int k = 0; k < 8; k++)
                col += tex2D(_MainTex, 0.5 + d * (1.0 - k * 0.018 * _Warp)).rgb;
            col *= 0.125;
            col = lerp(tex2D(_MainTex, uv).rgb, col, saturate(_Warp * 2.0));
            col += WarpTunnel(uv) * _Warp;
        }
        else
        {
            col = tex2D(_MainTex, uv).rgb;
        }
        col += tex2D(_BloomTex, uv).rgb * _BloomIntensity;
        float exposure = _Exposure;
        if (_AutoExposure > 0.5) exposure *= tex2D(_ExposureTex, float2(0.5, 0.5)).r;
        col *= exposure;
        col = ACES(col);
        float lum = dot(col, float3(0.2126, 0.7152, 0.0722));
        col = lerp(lum.xxx, col, _Saturation);
        col = saturate((col - 0.5) * _Contrast + 0.5 + _Lift.rgb);
        float2 v = uv - 0.5;
        float vig = dot(v, v);
        col *= 1.0 - vig * _Vignette;
        col = lerp(col, float3(0.55, 0.02, 0.0), saturate(_Damage * (0.25 + vig * 3.0)));
        col += (Hash(uv * _ScreenParams.xy + frac(_Time.y) * 1000.0) - 0.5) * _Grain;
        col = lerp(col, float3(1, 1, 1), _Flash);
        col *= 1.0 - _Fade;
        return float4(col, 1);
    }

    // average log luminance of a small image, weighted toward the centre
    float4 FragLogLum(v2f_img i) : SV_Target
    {
        float sum = 0.0, wsum = 0.0;
        [unroll] for (int y = 0; y < 8; y++)
        {
            [unroll] for (int x = 0; x < 8; x++)
            {
                float2 uv = float2((x + 0.5) / 8.0, (y + 0.5) / 8.0);
                float3 c = tex2D(_MainTex, uv).rgb;
                float l = dot(c, float3(0.2126, 0.7152, 0.0722));
                float2 d = uv - 0.5;
                float w = 1.0 - dot(d, d) * 1.6;
                sum += log(max(l, 0.03)) * w;
                wsum += w;
            }
        }
        return float4(exp(sum / wsum), 0, 0, 1);
    }

    float4 FragAdapt(v2f_img i) : SV_Target
    {
        float lum = tex2D(_MainTex, float2(0.5, 0.5)).r;
        float target = clamp(_Key / max(lum, 1e-4), _MinExposure, _MaxExposure);
        float prev = tex2D(_PrevTex, float2(0.5, 0.5)).r;
        if (prev <= 0.0 || prev != prev) prev = target;
        prev = clamp(prev, _MinExposure, _MaxExposure);
        float t = 1.0 - exp(-_DeltaTime * _AdaptSpeed);
        return float4(lerp(prev, target, t), 0, 0, 1);
    }
    ENDCG

    SubShader
    {
        Cull Off ZWrite Off ZTest Always
        Pass { CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment FragPrefilter
            ENDCG }
        Pass { CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment FragDown
            ENDCG }
        Pass { CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment FragUp
            ENDCG }
        Pass { CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment FragFinal
            #pragma target 3.5
            ENDCG }
        Pass { CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment FragLogLum
            #pragma target 3.5
            ENDCG }
        Pass { CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment FragAdapt
            ENDCG }
    }
}

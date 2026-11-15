// Building facade shader (Compatibility/GLES3 friendly, one texture).
// World-space planar mapping so windows stay the same size on every building.
// RGB = facade albedo (white walls get tinted), A = "this window is lit at night".
shader_type spatial;
render_mode cull_back, diffuse_lambert, specular_schlick_ggx;

uniform sampler2D facade : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 tint : source_color = vec4(1.0);
uniform vec4 roof_color : source_color = vec4(0.42, 0.42, 0.45, 1.0);
uniform vec4 glow_color : source_color = vec4(1.0, 0.82, 0.5, 1.0);
uniform float night = 0.0;
uniform float tile_scale = 0.0714;

varying vec3 wpos;
varying vec3 wnorm;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnorm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 n = abs(wnorm);
	float roof = step(0.7, n.y);
	vec2 uv = (n.x > n.z) ? vec2(wpos.z, -wpos.y) : vec2(wpos.x, -wpos.y);
	vec4 t = texture(facade, uv * tile_scale);
	// Windows are dark in the texture, so tint mostly affects the walls.
	float is_wall = smoothstep(0.55, 0.8, t.r);
	vec3 wall = t.rgb * mix(vec3(1.0), tint.rgb, is_wall);
	ALBEDO = mix(wall, roof_color.rgb, roof);
	ROUGHNESS = mix(0.35, 0.9, is_wall);
	SPECULAR = 0.4;
	EMISSION = glow_color.rgb * t.a * (1.0 - roof) * night * 1.6;
}

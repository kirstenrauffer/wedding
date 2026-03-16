// ─── Water Surface Distortion / Refraction Pass ───
// Generic screen-space water distortion using a normal map.
// Can be driven by the ripple heightfield, a procedural pattern, or a texture.
//
// Technique: Sample a normal map, use XY components as UV offset to distort
// the scene texture. Combined with Fresnel for reflection/refraction blend.
// Inspired by the Codrops two-texture approach: blurred bg + sharp refracted fg.

// precision highp float;
//
// uniform sampler2D u_sceneTexture;    // rendered scene
// uniform sampler2D u_normalMap;       // water surface normals (from ripples or texture)
// uniform sampler2D u_depthTexture;    // scene depth for water masking
// uniform vec2 u_resolution;
// uniform float u_distortionAmount;    // overall distortion strength
// uniform float u_chromaticAberration; // RGB split for prismatic effect
// uniform float u_time;
//
// varying vec2 v_uv;
//
// void main() {
//   vec3 normal = texture2D(u_normalMap, v_uv).rgb * 2.0 - 1.0;
//
//   // Base distortion from normal map XY
//   vec2 offset = normal.xy * u_distortionAmount / u_resolution;
//
//   // Optional: animate with slight drift
//   offset += vec2(sin(u_time * 0.5), cos(u_time * 0.3)) * 0.0005;
//
//   // Chromatic aberration: offset each channel slightly differently
//   float ca = u_chromaticAberration;
//   float r = texture2D(u_sceneTexture, v_uv + offset * (1.0 + ca)).r;
//   float g = texture2D(u_sceneTexture, v_uv + offset).g;
//   float b = texture2D(u_sceneTexture, v_uv + offset * (1.0 - ca)).b;
//
//   gl_FragColor = vec4(r, g, b, 1.0);
// }

// ─── Fresnel Blend Helper ───
// Use this in any water shader to blend reflection and refraction.
//
// float fresnel(vec3 viewDir, vec3 normal, float ior) {
//   float r0 = pow((1.0 - ior) / (1.0 + ior), 2.0);
//   float cosTheta = max(dot(viewDir, normal), 0.0);
//   return r0 + (1.0 - r0) * pow(1.0 - cosTheta, 5.0);
// }
//
// Usage:
//   float f = fresnel(eyeDir, surfaceNormal, 1.33); // water IOR
//   vec3 color = mix(refractionColor, reflectionColor, f);

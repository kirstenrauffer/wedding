// ─── Rain Drops on Glass Effect ───
// Based on: https://tympanus.net/codrops/2015/11/04/rain-water-effect-experiments/
//
// Technique: Render rain drops to an offscreen canvas, use the drop color channels
// as refraction coordinates to distort the background. Red channel = Y offset,
// Green channel = X offset. This creates the "magnifying lens" inversion
// that real water drops exhibit.
//
// Integration: Use as a post-processing pass or overlay on the WebGL canvas.
// Render drops to a 2D canvas → upload as texture → sample in this shader.

// ─── Vertex Shader ───
// #ifdef VERTEX

precision highp float;

attribute vec4 a_position;
attribute vec2 a_texCoord;

varying vec2 v_uv;

void main() {
  v_uv = a_texCoord;
  gl_Position = a_position;
}

// #endif

// ─── Fragment Shader ───
// #ifdef FRAGMENT

// precision highp float;
//
// uniform sampler2D u_background;    // scene render or blurred background
// uniform sampler2D u_backgroundFocus; // sharp version for inside drops
// uniform sampler2D u_rainTexture;   // 2D canvas with rendered drops (RGBA)
// uniform vec2 u_resolution;
// uniform float u_refractionStrength; // how much drops distort (0.0 - 1.0)
// uniform float u_dropAlpha;          // global drop opacity
//
// varying vec2 v_uv;
//
// void main() {
//   vec4 rain = texture2D(u_rainTexture, v_uv);
//
//   // Rain drop refraction: use RG channels as UV offset
//   // The drop canvas encodes refraction direction in color:
//   //   R channel → vertical distortion (inverted, simulating lens flip)
//   //   G channel → horizontal distortion
//   vec2 refractionOffset = (rain.rg - 0.5) * 2.0 * u_refractionStrength;
//
//   // Sample background at distorted coordinates
//   vec2 distortedUV = v_uv + refractionOffset;
//   distortedUV = clamp(distortedUV, 0.0, 1.0);
//
//   // Where there are drops (alpha > 0), show sharp refracted background
//   // Where there are no drops, show the blurred background
//   vec3 blurred = texture2D(u_background, v_uv).rgb;
//   vec3 sharp = texture2D(u_backgroundFocus, distortedUV).rgb;
//
//   vec3 color = mix(blurred, sharp, rain.a * u_dropAlpha);
//
//   gl_FragColor = vec4(color, 1.0);
// }

// #endif

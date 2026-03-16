// ─── Heightfield Water Ripple Simulation ───
// GPU-based ripple propagation using ping-pong framebuffers.
//
// Technique: Two framebuffers (prev + current) store height values.
// Each frame, compute the wave equation: new height at each texel =
// average of 4 neighbors × damping - previous height.
// The resulting heightfield is used as a normal map to distort reflections.
//
// Integration: Run as a compute-like pass (render fullscreen quad),
// then sample the output as a normal/displacement map in the ocean shader.

// ─── Simulation Pass (Fragment) ───
// Runs each frame on a fullscreen quad, ping-ponging between two FBOs.

// precision highp float;
//
// uniform sampler2D u_currentHeight; // current frame heightfield
// uniform sampler2D u_prevHeight;    // previous frame heightfield
// uniform vec2 u_texelSize;          // 1.0 / resolution
// uniform float u_damping;           // wave energy loss per frame (0.98 - 0.999)
//
// varying vec2 v_uv;
//
// void main() {
//   // Sample 4 neighbors (Von Neumann stencil)
//   float left  = texture2D(u_currentHeight, v_uv + vec2(-u_texelSize.x, 0.0)).r;
//   float right = texture2D(u_currentHeight, v_uv + vec2( u_texelSize.x, 0.0)).r;
//   float up    = texture2D(u_currentHeight, v_uv + vec2(0.0,  u_texelSize.y)).r;
//   float down  = texture2D(u_currentHeight, v_uv + vec2(0.0, -u_texelSize.y)).r;
//   float curr  = texture2D(u_currentHeight, v_uv).r;
//   float prev  = texture2D(u_prevHeight, v_uv).r;
//
//   // Wave equation: new = avg_neighbors * 2 - prev, with damping
//   float avg = (left + right + up + down) * 0.5 - prev;
//   float newHeight = avg * u_damping;
//
//   gl_FragColor = vec4(newHeight, newHeight, newHeight, 1.0);
// }

// ─── Normal Extraction Pass (Fragment) ───
// Converts the heightfield to a normal map for use in lighting/refraction.

// precision highp float;
//
// uniform sampler2D u_heightfield;
// uniform vec2 u_texelSize;
// uniform float u_normalStrength; // exaggeration factor for normals
//
// varying vec2 v_uv;
//
// void main() {
//   float left  = texture2D(u_heightfield, v_uv + vec2(-u_texelSize.x, 0.0)).r;
//   float right = texture2D(u_heightfield, v_uv + vec2( u_texelSize.x, 0.0)).r;
//   float up    = texture2D(u_heightfield, v_uv + vec2(0.0,  u_texelSize.y)).r;
//   float down  = texture2D(u_heightfield, v_uv + vec2(0.0, -u_texelSize.y)).r;
//
//   // Central differences for gradient
//   float dx = (right - left) * u_normalStrength;
//   float dy = (up - down) * u_normalStrength;
//
//   vec3 normal = normalize(vec3(-dx, -dy, 1.0));
//
//   // Encode normal to [0,1] range for storage
//   gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
// }

// ─── Drop Spawn ───
// To add a ripple: render a small gaussian splat onto the heightfield FBO
// at the drop impact point. The simulation will propagate it outward.
//
// uniform vec2 u_dropCenter;   // normalized position of impact
// uniform float u_dropRadius;  // radius in UV space
// uniform float u_dropForce;   // amplitude of initial displacement
//
// float drop = max(0.0, 1.0 - length(v_uv - u_dropCenter) / u_dropRadius);
// drop = drop * drop * u_dropForce; // quadratic falloff
// newHeight += drop;

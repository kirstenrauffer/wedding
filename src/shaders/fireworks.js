// ─── Fireworks Particle System ─────────────────────────────────────────────
// GPU-accelerated fireworks for reception (7pm–11pm)
// Uses Points + onBeforeCompile shader injection pattern
// Particles expand from a seeded pseudo-random sphere with gravity droop

export const FIREWORKS_CONFIG = {
  TIME_START:      19,     // 7pm — reception begins
  TIME_END:        24,     // midnight — La Fin
  FADE_IN:         0.1,    // quick fade at window start (fade in from 18:54 to 19:00)
  FADE_OUT:        0.05,   // quick fade at window end
  BASE_INTERVAL:   2.2,    // seconds between spawns at normal rate
  FINALE_INTERVAL: 0.45,   // seconds between spawns at finale rate (22–23h)
  MAX_FIREWORKS:   40,     // pool cap
  EXPAND_SCALE:    12.0,   // world-unit expansion radius of a burst
  // Scene positioning (camera [0,15,80], ocean y=0, moon at y=30 z=-80)
  LAUNCH_Y_MIN:    1,
  LAUNCH_Y_MAX:    4,
  BURST_Y_MIN:     38,
  BURST_Y_MAX:     72,
  SPREAD_X:        55,     // ±55 x
  Z_NEAR:         -30,
  Z_FAR:          -85,
};

// Wedding palette in [r,g,b] 0–1 — additive-blending-safe
export const FIREWORKS_PALETTE = [
  [1.0,  0.92, 0.60],  // champagne gold
  [1.0,  0.85, 0.75],  // blush rose
  [0.95, 0.95, 1.0 ],  // warm white
  [1.0,  0.70, 0.80],  // rose pink
  [0.75, 0.90, 1.0 ],  // pale blue
  [1.0,  0.80, 0.40],  // deep gold
  [0.90, 0.80, 1.0 ],  // lavender
  [0.60, 1.0,  0.80],  // seafoam mint
];

// Shell types with world-scale gravity
// grav: vertical droop relative to EXPAND_SCALE
export const SHELL_TYPES = [
  { name: 'chrysanthemum', particles: 400, grav: 0.75, step: 0.005, rainbow: false, weight: 35 },
  { name: 'peony',         particles: 350, grav: 1.00, step: 0.005, rainbow: false, weight: 30 },
  { name: 'willow',        particles: 300, grav: 1.80, step: 0.006, rainbow: false, weight: 25 },
  { name: 'rainbow',       particles: 420, grav: 0.80, step: 0.005, rainbow: true,  weight: 10 },
];

// ─── Shader Injection Strings ──────────────────────────────────────────────

export const FW_VERT_PREAMBLE = /* glsl */ `
// ─── Hash Functions & Utilities ────────────────────────────────────────────
// Float-based pseudo-random hash (compatible with GLSL ES 3.0)
float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

vec3 hash3(float n) {
  return vec3(
    hash(n),
    hash(n + 0.5),
    hash(n + 1.0)
  );
}

// Cube root (needed for uniform sphere sampling)
float cbrt(float x) {
  float y = sign(x) * pow(abs(x), 0.33333);
  y = (2.0 * y + x / (y * y)) / 3.0;
  y = (2.0 * y + x / (y * y)) / 3.0;
  return y;
}

// Maps 3 uniform randoms to a point clustered near a sphere surface (r ≈ 0.9–1.1)
vec3 randomInSphere(float u, float v, float w) {
  float theta = 6.28318 * u;
  float phi   = acos(clamp(2.0 * v - 1.0, -1.0, 1.0));
  float r     = cbrt(w) * 0.18 + 0.9;
  return vec3(
    r * sin(phi) * cos(theta),
    r * sin(phi) * sin(theta),
    r * cos(phi)
  );
}

// Uniforms & attributes
attribute vec2  aDelay;   // x = stagger time offset 0..0.05, y = unused
uniform  float  uTime;    // bloom progress 0→1
uniform  float  uGravity; // per-shell droop strength
uniform  float  uScale;   // burst radius in world units (EXPAND_SCALE)
`;

export const FW_VERT_POSITION = /* glsl */ `
// Generate deterministic random direction from position seed
float seed = transformed.x * 65521.0 + transformed.y * 65521.0 + transformed.z * 65521.0 + floor(uTime);
vec3 hashVals = hash3(seed);
vec3 dir = randomInSphere(hashVals.x, hashVals.y, hashVals.z);

// Time into this firework's burst (accounting for per-particle delay)
float t       = max(0.0, uTime - aDelay.x);
float expand  = 1.0 - (1.0 - t) * (1.0 - t) * (1.0 - t);  // ease-out cubic
vec3  grav    = vec3(0.0, -1.0, 0.0) * t * t * uGravity;  // droop relative to scale
float twinkle = 1.0 + 0.10 * sin(uTime * 32.0 + aDelay.x * 85.0);

// Particle position: outward expansion + downward gravity, scaled for visibility
transformed.xyz = (dir * expand + grav) * uScale;

// Pixel-space size (sizeAttenuation: false) — smaller for high-delay particles (trailing effect)
gl_PointSize = size * (1.0 - aDelay.x * 7.5) * twinkle;
`;

export const FW_FRAG_COLOR = /* glsl */ `
// Soft radial falloff — clips square point to a soft disc
vec2  cxy = 2.0 * gl_PointCoord - 1.0;
float r   = dot(cxy, cxy);
if (r > 1.0) discard;

// Opacity: bright at bloom start, fade to 0 by end, quadratic curve
float frac = fract(uTime);
float op   = clamp((0.92 - frac * frac) * 1.55, 0.0, 1.0) * (1.0 - r * r);

vec4 diffuseColor = vec4(diffuse, op);
`;

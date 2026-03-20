// ─── Gommage: Text Dissolution + Petal Particles ──────────────────────────────
// Ghibli-inspired dissolving text effect with organic petal shapes.
// Two shader systems: TEXT (dissolution + glow), PETAL (instanced rose-curve billboards).

export const GOMMAGE_CONFIG = {
  maxPetals: 1200,
  cycleSeconds: 10.0,
};

// ─── TEXT DISSOLUTION SHADERS ────────────────────────────────────────────────

export const TEXT_VERT = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;

export const TEXT_FRAG = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uDissolve;

  varying vec2 vUv;

  // 2D value noise (no texture dependency)
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    return 0.5 * noise(p)
         + 0.25 * noise(p * 2.1)
         + 0.125 * noise(p * 4.3);
  }

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);

    // FBM noise at this UV to drive dissolution edge
    float noiseVal = fbm(vUv * 4.0);

    // Threshold: dissolve is 0 (solid) → 1 (gone)
    float edge = smoothstep(uDissolve - 0.08, uDissolve + 0.08, noiseVal);

    // Soft pink glow at the dissolving boundary
    float glowMask = smoothstep(uDissolve - 0.18, uDissolve - 0.02, noiseVal) * (1.0 - edge);
    vec3 glowColor = vec3(1.0, 0.72, 0.77); // soft pink

    vec3 color = mix(
      texColor.rgb + glowColor * glowMask * 2.0,
      texColor.rgb,
      edge
    );

    float alpha = texColor.a * edge;

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

// ─── PETAL PARTICLE SHADERS ──────────────────────────────────────────────────

export const PETAL_VERT = /* glsl */ `
  attribute float aLifeOffset;
  attribute float aPetalType;
  attribute float aColorIndex;
  attribute float aRotationSeed;

  uniform float uTime;
  uniform float uPhase;
  uniform vec2  uWindDir;
  uniform float uWindSpeed;
  uniform float uWindGustStrength;
  uniform float uWindGustFreq;

  varying float vAlpha;
  varying float vColorIndex;
  varying float vPetalType;
  varying vec2  vUv;

  // Smoothstep helper (emulate GLSL smoothstep)
  float ss(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  // Wind displacement: primary direction + gusts + per-petal turbulence
  vec2 windDisplace(float localT, float seed, float t) {
    // Time elapsed in this petal's lifecycle (5s total)
    float elapsed = localT * 5.0;

    // 1. Primary wind: left to right
    vec2 primary = uWindDir * uWindSpeed * elapsed;

    // 2. Gentle gust: slow sinusoidal speed variation
    float gustPhase = t * uWindGustFreq * 6.2832 + seed * 3.14159;
    float gustFactor = 0.7 + 0.3 * (0.5 + 0.5 * sin(gustPhase)) * uWindGustStrength * 2.0;
    primary *= gustFactor;

    // 3. Turbulence: per-petal sinusoidal wobble
    float turbX = sin(localT * 2.8 + seed * 6.2832 + t * 0.4) * 2.0
                + sin(localT * 5.1 + seed * 3.7   + t * 0.9) * 0.8;
    float turbY = cos(localT * 2.1 + seed * 5.1   + t * 0.3) * 1.0
                + cos(localT * 4.3 + seed * 2.8   + t * 0.7) * 0.4;

    return primary + vec2(turbX, turbY);
  }

  void main() {
    vUv = uv;
    vColorIndex = aColorIndex;
    vPetalType = aPetalType;

    // Lifecycle: continuous spawning with wrapping phase
    // aLifeOffset ∈ [0, 1] stagger birth; uPhase cycles continuously
    // Petals born when uPhase crosses aLifeOffset, live for ~1.0 phase units
    float localT = fract(uPhase - aLifeOffset);
    localT = clamp(localT * 1.2, 0.0, 1.0); // scale to ensure full arc

    // Fade in [0, 0.1], fade out [0.8, 1.0]
    vAlpha = localT < 0.1
      ? ss(0.0, 0.1, localT)
      : ss(1.0, 0.8, localT);

    // World position from instance matrix
    vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

    // Wind physics: replaces static aDriftSeed with dynamic wind displacement
    vec2 windDisp = windDisplace(localT, aRotationSeed, uTime);
    center.x += windDisp.x;
    center.y += windDisp.y;

    // Gravity: 1.2 world units/s²
    float drop = 0.5 * 1.2 * localT * localT;

    // Upward burst at birth (peaks at localT=0.15, fades by 0.3)
    float burst = 1.5 * ss(0.0, 0.15, localT) * (1.0 - ss(0.1, 0.3, localT));

    // Apply gravity pull (wind is applied before burst/gravity)
    center.y += burst - drop;

    // Billboard toward camera
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    // Spin: aRotationSeed encodes initial angle and angular velocity direction
    float spinDir = sign(aRotationSeed - 0.5);
    float omega   = 1.5 + abs(aRotationSeed) * 2.5; // 1.5–4 rad/s
    float angle   = aRotationSeed * 6.2832 + spinDir * omega * localT;

    float cosA = cos(angle);
    float sinA = sin(angle);
    vec3 rotRight = right * cosA - up * sinA;
    vec3 rotUp    = right * sinA + up * cosA;

    float scale = 0.8 + aRotationSeed * 0.5; // 0.8–1.3 world units
    vec3 worldPos = center + (rotRight * position.x + rotUp * position.y) * scale;

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

export const PETAL_FRAG = /* glsl */ `
  uniform sampler2D uPalette;

  varying float vAlpha;
  varying float vColorIndex;
  varying float vPetalType;
  varying vec2  vUv;

  void main() {
    // Transform UV to [-1, 1] centered
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float theta = atan(p.y, p.x);

    // Petal shape via rose curves in polar coordinates
    float inside;

    if (vPetalType < 0.5) {
      // Type 0: cardioid (true single teardrop lobe)
      // r = 0.5 * (1 + cos(theta))
      float pR = max(0.5 * (1.0 + cos(theta)), 0.001);
      inside = smoothstep(pR + 0.05, pR - 0.05, r);

    } else if (vPetalType < 1.5) {
      // Type 1: 4-petal rose, k=2
      // r = |cos(2θ)|
      float pR = max(abs(cos(2.0 * theta)), 0.001);
      inside = smoothstep(pR + 0.05, pR - 0.05, r);

    } else if (vPetalType < 2.5) {
      // Type 2: 6-petal rose, k=3
      // r = |cos(3θ)|
      float pR = max(abs(cos(3.0 * theta)), 0.001);
      inside = smoothstep(pR + 0.05, pR - 0.05, r);

    } else {
      // Type 3: 3-lobe elongated, k=1.5
      // r = |cos(1.5θ)|
      float pR = max(abs(cos(1.5 * theta)), 0.001);
      inside = smoothstep(pR + 0.05, pR - 0.05, r);
    }

    // Sample Ghibli palette from DataTexture
    // vColorIndex ∈ [0, 7] (float-encoded integer)
    float u = (floor(vColorIndex) + 0.5) / 8.0;
    vec3 petalColor = texture2D(uPalette, vec2(u, 0.5)).rgb;

    // Radial gradient: lighter center, richer saturated edge
    float radialGrad = 1.0 - smoothstep(0.0, 0.9, r);
    petalColor = clamp(mix(petalColor * 1.3, petalColor, radialGrad), 0.0, 1.0);

    float alpha = inside * vAlpha;

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(petalColor, alpha);
  }
`;

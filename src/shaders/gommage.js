// ─── Gommage: Text Dissolution + Petal Particles ──────────────────────────────
// Ghibli-inspired dissolving text effect with organic petal shapes.
// Two shader systems: TEXT (dissolution + glow), PETAL (instanced rose-curve billboards).

export const GOMMAGE_CONFIG = {
  maxPetals: 150,
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
  // Per-instance attributes (new: replacing phase-based spawning with explicit birth time)
  attribute vec3  aSpawnPos;       // World spawn position
  attribute vec4  aBirthLifeSeedScale; // [birthTime, lifeDuration, seed [0,1], scale]
  attribute float aColorIndex;

  // Uniforms
  uniform float uTime;
  uniform vec2  uWindDir;
  uniform float uWindSpeed;
  uniform float uWindGustStrength;
  uniform float uWindGustFreq;

  // Varyings
  varying float vAlpha;
  varying float vColorIndex;
  varying vec3  vNormal; // For diffuse lighting in fragment shader

  // Utility: simple 3D rotation matrices (GLSL column-major order)
  mat3 rotateX(float angle) {
    float c = cos(angle), s = sin(angle);
    return mat3(
      1.0, 0.0, 0.0,
      0.0, c, s,      // column 1: [0, c, s]
      0.0, -s, c      // column 2: [0, -s, c]
    );
  }

  mat3 rotateY(float angle) {
    float c = cos(angle), s = sin(angle);
    return mat3(
      c, 0.0, -s,     // column 0: [c, 0, -s]
      0.0, 1.0, 0.0,  // column 1: [0, 1, 0]
      s, 0.0, c       // column 2: [s, 0, c]
    );
  }

  mat3 rotateZ(float angle) {
    float c = cos(angle), s = sin(angle);
    return mat3(
      c, s, 0.0,      // column 0: [c, s, 0]
      -s, c, 0.0,     // column 1: [-s, c, 0]
      0.0, 0.0, 1.0   // column 2: [0, 0, 1]
    );
  }

  // Simple noise function for turbulence
  float noise(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  // Smoothstep
  float ss(float edge0, float edge1, float x) {
    float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  void main() {
    vColorIndex = aColorIndex;

    // Extract per-instance data
    float birthTime = aBirthLifeSeedScale.x;
    float lifeDuration = aBirthLifeSeedScale.y;
    float seed = aBirthLifeSeedScale.z;
    float scale = aBirthLifeSeedScale.w;

    // Calculate age (0 at birth, 1 at death, repeats)
    float age = mod(uTime - birthTime, lifeDuration) / lifeDuration;

    // Fade in and out
    float fadeIn = ss(0.0, 0.05, age);
    float fadeOut = 1.0 - ss(0.8, 1.0, age);
    vAlpha = fadeIn * fadeOut;

    // Start with object-space position and normal
    vec3 pos = position;
    vec3 norm = normal;

    // === Tip bending ===
    // Rotate around X axis, weighted by uv.y (tip bends more)
    float bendAngle = 2.5 * sin(age * 6.2832 + seed * 6.2832);
    float bendWeight = pow(max(uv.y, 0.0), 3.0); // tip = 1.0, base = 0.0
    float actualBend = bendAngle * bendWeight;
    mat3 bendRot = rotateX(actualBend);
    pos = bendRot * pos;
    norm = bendRot * norm;

    // === 3D Spin ===
    // Time-modulated rotation angles with seed randomization
    float rngBase = seed;
    float ry = rngBase * 6.2832 + age * uTime * 0.9;
    float rx = (rngBase + 0.3) * 6.2832 + age * uTime * 1.2;
    float rz = (rngBase + 0.7) * 6.2832 + age * uTime * 0.7;

    mat3 spinRot = rotateZ(rz) * rotateX(rx) * rotateY(ry);
    pos = spinRot * pos;
    norm = spinRot * norm;

    // === Wind & Turbulence ===
    float windTime = age * lifeDuration;
    vec2 windDisp = uWindDir * uWindSpeed * windTime;

    // Gusts
    float gustPhase = uTime * uWindGustFreq * 6.2832 + seed * 3.14159;
    float gustFactor = 0.7 + 0.3 * (0.5 + 0.5 * sin(gustPhase));
    windDisp *= gustFactor;

    // Turbulent swirl
    float turbX = sin(age * 2.8 + seed * 6.2832 + uTime * 0.4) * 1.5
                + sin(age * 5.1 + seed * 3.7 + uTime * 0.9) * 0.5;
    float turbY = cos(age * 2.1 + seed * 5.1 + uTime * 0.3) * 0.8
                + cos(age * 4.3 + seed * 2.8 + uTime * 0.7) * 0.3;
    windDisp += vec2(turbX, turbY);

    // Apply scale
    pos *= scale;

    // Transform to world space: spawn position + wind/gravity displacement
    vec3 worldPos = aSpawnPos + vec3(windDisp.x, windDisp.y, 0.0) + pos;

    // Gravity: petals fall over their lifetime
    float gravityAmount = 0.5 * 1.2 * (age * lifeDuration) * (age * lifeDuration);
    worldPos.y -= gravityAmount;

    // Upward burst at birth
    float burst = 1.5 * ss(0.0, 0.15, age) * (1.0 - ss(0.1, 0.3, age));
    worldPos.y += burst;

    // Transform normal to world space (since we only applied object-space rotations)
    vNormal = normalize(norm);

    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

export const PETAL_FRAG = /* glsl */ `
  uniform sampler2D uPalette;

  varying float vAlpha;
  varying float vColorIndex;
  varying vec3  vNormal;

  void main() {
    // Sample Ghibli palette from DataTexture
    // vColorIndex ∈ [0, 7] (float-encoded integer)
    float u = (floor(vColorIndex) + 0.5) / 8.0;
    vec3 petalColor = texture2D(uPalette, vec2(u, 0.5)).rgb;

    // Subtle diffuse lighting to add depth without desaturating colors
    // Light direction: pointing from upper-right-back
    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));
    float diffuse = abs(dot(vNormal, lightDir));
    // Use a minimal lighting effect to keep colors saturated
    float lighting = 0.95 + diffuse * 0.1; // Range [0.95, 1.05]

    petalColor *= lighting;
    // Saturate colors slightly for more vibrance
    petalColor = mix(petalColor, normalize(petalColor) * length(petalColor), 0.15);

    float alpha = vAlpha;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(petalColor, alpha);
  }
`;

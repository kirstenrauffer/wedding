// ─── Star Field Shaders ─────────────────────────────────────────────────────
// GPU-driven instanced billboard stars with soft-glow halo and twinkle.
// Inspired by procedural star rendering techniques:
//   - Instanced quads billboarded toward camera (no geometry overhead)
//   - Per-instance attributes: size, twinkle phase, colour
//   - Soft radial core + exponential halo for gentle light emission
//   - Brightness uniform for real-time intensity control

export const STAR_CONFIG = {
  bgCount: 6000,
  brightCount: 140,
  brightness: 1.3,
};

export const STAR_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aTwinkle;
  attribute vec3  aColor;

  uniform float uTime;
  uniform float uBrightness;
  uniform float uTwinkleIntensity;

  varying vec2  vUv;
  varying float vBrightness;
  varying vec3  vColor;
  varying float vHorizonFade;

  void main() {
    vUv    = uv;
    vColor = aColor;

    // Each star has its own twinkling speed based on aTwinkle
    // This decorrelates twinkling patterns so stars don't twinkle in sync
    float scaledTime = uTime * (0.8 + aTwinkle * 0.6);

    // Multi-frequency twinkle with time scaling per star - larger amplitudes for visible effect
    float t = sin(scaledTime * 1.7  + aTwinkle * 6.2832) * 0.18
            + sin(scaledTime * 2.3  + aTwinkle * 4.123 ) * 0.12
            + sin(scaledTime * 3.5  + aTwinkle * 2.618 ) * 0.08
            + sin(scaledTime * 5.1  + aTwinkle * 1.414 ) * 0.06;
    // Minimum brightness 0.4 so stars never fully disappear, maximum 1.0 for bright twinkle
    vBrightness = clamp(0.40 + t * uTwinkleIntensity, 0.40, 1.0) * uBrightness;

    // World-space centre from instance matrix
    vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

    // Atmospheric horizon dimming — stars near/below the horizon fade out
    float elevation = normalize(center).y;
    vHorizonFade = smoothstep(-0.12, 0.08, elevation);

    // Billboard: expand the unit quad along camera right/up axes
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    vec3 worldPos = center + (right * position.x + up * position.y) * aSize;
    gl_Position   = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

export const STAR_FRAG = /* glsl */ `
  uniform float uOpacity;
  uniform sampler2D uStarTexture;

  varying vec2  vUv;
  varying float vBrightness;
  varying vec3  vColor;
  varying float vHorizonFade;

  void main() {
    // Sample the star texture directly
    vec4 tex = texture2D(uStarTexture, vUv);

    // Use texture alpha as-is
    float alpha = tex.a;

    gl_FragColor = vec4(vColor * vBrightness, alpha * vBrightness * uOpacity * vHorizonFade);
  }
`;

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls, folder } from 'leva';
import { SOLAR } from '../utils/solar';

// ─── Volumetric Cloud Sky ───
// Ray-marched clouds using David Hoskins' noise technique from Shadertoy.
// Features: FBM noise, Henyey-Greenstein scattering, Beer-Lambert absorption,
// subtle shape influence (hearts, flowers, cats) blended into cloud density.
// Future: sky color will change based on visitor's time of day.

const CLOUD_VERTEX = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    // Mesh follows camera (translation only, no rotation)
    // so model-space position == world-space direction from camera
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CLOUD_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float time;
  uniform vec3 cameraPos;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 cloudColor;
  uniform vec3 cloudShadowColor;
  uniform float coverage;
  uniform float fluffiness;
  uniform float cloudScale;
  uniform float cloudSpeed;
  uniform float cloudDensity;
  uniform float cloudBase;
  uniform float cloudTop;
  uniform float shapeStrength;
  uniform float lightAbsorption;

  varying vec3 vDirection;

  // ─── David Hoskins Hash Functions ───
  // https://www.shadertoy.com/view/4djSRW
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  // ─── 3D Value Noise ───
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash13(i + vec3(0, 0, 0)), hash13(i + vec3(1, 0, 0)), f.x),
        mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x),
        f.y),
      mix(
        mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
        mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x),
        f.y),
      f.z);
  }

  // ─── FBM – fluffiness controls detail persistence ───
  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float gain = mix(0.35, 0.6, fluffiness);

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p * frequency);
      frequency *= 2.0;
      amplitude *= gain;
    }
    return value;
  }

  // Cheaper FBM for light marching (3 octaves)
  float fbmLight(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float gain = mix(0.35, 0.6, fluffiness);

    for (int i = 0; i < 3; i++) {
      value += amplitude * noise(p * frequency);
      frequency *= 2.0;
      amplitude *= gain;
    }
    return value;
  }

  // ─── Heart SDF (2D) ───
  float sdHeart(vec2 p) {
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) {
      return length(p - vec2(0.25, 0.75)) - sqrt(2.0) / 4.0;
    }
    float a = p.x;
    float b = p.y - 1.0;
    float c = max(p.x + p.y, 0.0) * 0.5;
    return sqrt(min(a * a + b * b, (a - c) * (a - c) + (p.y - c) * (p.y - c)))
           * sign(p.x - p.y);
  }

  // Tile hearts across the sky — they drift with the wind
  float shapeInfluence(vec2 p) {
    // Hearts move with the cloud wind
    p -= vec2(time * cloudSpeed * 120.0, time * cloudSpeed * 60.0);

    float cellSize = 8000.0;
    vec2 cellId = floor(p / cellSize);
    vec2 cell = fract(p / cellSize) - 0.5; // local coords -0.5 to 0.5

    // Per-cell random offset + scale to break the grid pattern
    float h1 = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
    float h2 = fract(sin(dot(cellId, vec2(269.5, 183.3))) * 43758.5453);
    cell += (vec2(h1, h2) - 0.5) * 0.25;
    float scale = 0.28 + h1 * 0.1;

    vec2 lp = cell / scale;
    float d = sdHeart(lp);
    return 1.0 - smoothstep(-0.05, 0.15, d);
  }

  // ─── Henyey-Greenstein phase function ───
  float hg(float cosAngle, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * cosAngle, 1.5));
  }

  // ─── Cloud density (full, used on primary ray) ───
  float sampleDensity(vec3 pos) {
    float heightFraction = (pos.y - cloudBase) / (cloudTop - cloudBase);
    if (heightFraction < 0.0 || heightFraction > 1.0) return 0.0;

    // Rounded bottom, tapered top
    float heightProfile = smoothstep(0.0, 0.15, heightFraction)
                        * smoothstep(1.0, 0.7, heightFraction);

    // Wind speed matched to shape drift so shapes stay coherent
    vec3 windOffset = vec3(time * cloudSpeed * 120.0, 0.0, time * cloudSpeed * 60.0);
    float rawDensity = fbm((pos + windOffset) * cloudScale * 0.001);

    // Normal noise-driven clouds
    float coverageThreshold = 1.0 - coverage;
    float normalDensity = smoothstep(coverageThreshold, coverageThreshold + 0.15, rawDensity);

    // Heart-shaped clouds: SDF defines shape, noise adds texture inside
    float heartMask = shapeInfluence(pos.xz);
    float heartDensity = heartMask * (0.4 + 0.6 * rawDensity);

    // Blend between normal clouds and heart clouds
    float density = mix(normalDensity, heartDensity, shapeStrength);

    return density * heightProfile * cloudDensity;
  }

  // ─── Cheaper density for light march (no shapes) ───
  float sampleDensityLight(vec3 pos) {
    float heightFraction = (pos.y - cloudBase) / (cloudTop - cloudBase);
    if (heightFraction < 0.0 || heightFraction > 1.0) return 0.0;

    float heightProfile = smoothstep(0.0, 0.15, heightFraction)
                        * smoothstep(1.0, 0.7, heightFraction);

    vec3 windOffset = vec3(time * cloudSpeed * 120.0, 0.0, time * cloudSpeed * 60.0);
    float rawDensity = fbmLight((pos + windOffset) * cloudScale * 0.001);

    float coverageThreshold = 1.0 - coverage;
    float density = smoothstep(coverageThreshold, coverageThreshold + 0.15, rawDensity);

    return density * heightProfile * cloudDensity;
  }

  // ─── Main ───
  void main() {
    vec3 rd = normalize(vDirection);

    // Only render above horizon
    if (rd.y < 0.002) {
      discard;
    }

    vec3 ro = cameraPos;

    // Ray-plane intersection with cloud layer
    float tNear = (cloudBase - ro.y) / rd.y;
    float tFar  = (cloudTop  - ro.y) / rd.y;

    if (tNear > tFar) {
      float tmp = tNear;
      tNear = tFar;
      tFar  = tmp;
    }

    if (tFar < 0.0) discard;
    tNear = max(tNear, 0.0);
    tFar  = min(tFar, 25000.0);

    // Ray march
    const int STEPS = 40;
    const int LIGHT_STEPS = 4;
    float stepSize = (tFar - tNear) / float(STEPS);

    float transmittance = 1.0;
    vec3 scatteredLight = vec3(0.0);

    // Multi-lobe phase (forward scatter + back scatter + isotropic)
    float cosAngle = dot(rd, sunDirection);
    float phase = hg(cosAngle, 0.3) * 0.6
                + hg(cosAngle, -0.15) * 0.15
                + 0.25;

    // Jitter start position to reduce banding
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * stepSize;

    for (int i = 0; i < STEPS; i++) {
      if (transmittance < 0.01) break;

      float t = tNear + jitter + float(i) * stepSize;
      vec3 pos = ro + rd * t;

      float density = sampleDensity(pos);

      if (density > 0.001) {
        // Light march toward sun
        float lightDepth = 0.0;
        float lightMarchDist = (cloudTop - pos.y) / max(sunDirection.y, 0.05);
        lightMarchDist = min(lightMarchDist, 1000.0);
        float lightStep = lightMarchDist / float(LIGHT_STEPS);

        for (int j = 1; j <= LIGHT_STEPS; j++) {
          vec3 lightPos = pos + sunDirection * float(j) * lightStep;
          lightDepth += sampleDensityLight(lightPos) * lightStep;
        }

        float lightTransmittance = exp(-lightDepth * lightAbsorption * 0.005);

        // Combine sun + ambient
        vec3 ambient = cloudShadowColor * 0.2;
        vec3 sunLit  = sunColor * lightTransmittance * phase * 0.35;
        vec3 luminance = (sunLit + ambient) * cloudColor;

        // Beer-Lambert for primary ray
        float sampleTransmittance = exp(-density * stepSize * lightAbsorption * 0.01);
        vec3 integScatter = luminance * (1.0 - sampleTransmittance);
        scatteredLight += transmittance * integScatter;
        transmittance  *= sampleTransmittance;
      }
    }

    // Tone-map accumulated light to prevent HDR blowout
    scatteredLight = scatteredLight / (1.0 + scatteredLight);

    float alpha = (1.0 - transmittance) * 0.8; // cap max opacity

    // Gradual fade near horizon
    float horizonFade = smoothstep(0.005, 0.2, rd.y);
    alpha *= horizonFade;

    // Pre-multiply alpha so blending is correct
    gl_FragColor = vec4(scatteredLight * alpha, alpha);
  }
`;

// ─── React Component ───

export default function CloudSky() {
  const meshRef = useRef();
  const materialRef = useRef();
  const { camera } = useThree();

  // Share light controls with other scene components
  const { lightX, lightY, lightZ, sunColorHex } = useControls({
    'Light Position': folder({
      lightX: { value: SOLAR.lightX },
      lightY: { value: SOLAR.lightY },
      lightZ: { value: SOLAR.lightZ },
      sunColorHex: { value: SOLAR.sunColorHex },
    }),
  });

  const {
    coverage,
    fluffiness,
    cloudScale,
    cloudSpeed,
    density,
    base,
    top,
    shapeStrength,
    lightAbsorption,
    cloudColorHex,
    shadowColorHex,
  } = useControls({
    Clouds: folder({
      coverage:       { value: 0.35, min: 0, max: 1, step: 0.01, label: 'Coverage' },
      fluffiness:     { value: 0.6,  min: 0, max: 1, step: 0.01, label: 'Fluffiness' },
      cloudScale:     { value: 1.0,  min: 0.1, max: 5, step: 0.1, label: 'Scale' },
      cloudSpeed:     { value: 0.3,  min: 0, max: 2, step: 0.05, label: 'Wind Speed' },
      density:        { value: 0.5,  min: 0.1, max: 3, step: 0.1, label: 'Density' },
      base:           { value: 800,  min: 200, max: 2000, step: 50, label: 'Base Altitude' },
      top:            { value: 2500, min: 500, max: 5000, step: 50, label: 'Top Altitude' },
      shapeStrength:  { value: 0.35, min: 0, max: 1.0, step: 0.01, label: 'Shape Influence' },
      lightAbsorption:{ value: 1.0,  min: 0.1, max: 3, step: 0.1, label: 'Light Absorption' },
      cloudColorHex:  { value: SOLAR.cloudColorHex, label: 'Cloud Color' },
      shadowColorHex: { value: SOLAR.shadowColorHex, label: 'Shadow Color' },
    }),
  });

  const sunDirection = useMemo(() => {
    return new THREE.Vector3(lightX, lightY, lightZ).normalize();
  }, [lightX, lightY, lightZ]);

  const uniforms = useMemo(() => ({
    time:             { value: 0 },
    cameraPos:        { value: new THREE.Vector3() },
    sunDirection:     { value: new THREE.Vector3() },
    sunColor:         { value: new THREE.Color(1, 0.95, 0.85) },
    cloudColor:       { value: new THREE.Color() },
    cloudShadowColor: { value: new THREE.Color() },
    coverage:         { value: 0.55 },
    fluffiness:       { value: 0.6 },
    cloudScale:       { value: 1.0 },
    cloudSpeed:       { value: 0.3 },
    cloudDensity:     { value: 1.0 },
    cloudBase:        { value: 800.0 },
    cloudTop:         { value: 2500.0 },
    shapeStrength:    { value: 0.15 },
    lightAbsorption:  { value: 1.0 },
  }), []);

  // Upper hemisphere only (slight overlap past equator)
  const geometry = useMemo(
    () => new THREE.SphereGeometry(8000, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
    [],
  );

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;

    mat.uniforms.time.value = state.clock.elapsedTime;
    mat.uniforms.cameraPos.value.copy(camera.position);
    meshRef.current.position.copy(camera.position);

    // Reactive uniform updates
    mat.uniforms.sunDirection.value.copy(sunDirection);
    mat.uniforms.sunColor.value.set(sunColorHex);
    mat.uniforms.cloudColor.value.set(cloudColorHex);
    mat.uniforms.cloudShadowColor.value.set(shadowColorHex);
    mat.uniforms.coverage.value = coverage;
    mat.uniforms.fluffiness.value = fluffiness;
    mat.uniforms.cloudScale.value = cloudScale;
    mat.uniforms.cloudSpeed.value = cloudSpeed;
    mat.uniforms.cloudDensity.value = density;
    mat.uniforms.cloudBase.value = base;
    mat.uniforms.cloudTop.value = top;
    mat.uniforms.shapeStrength.value = shapeStrength;
    mat.uniforms.lightAbsorption.value = lightAbsorption;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} renderOrder={1}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={CLOUD_VERTEX}
        fragmentShader={CLOUD_FRAGMENT}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        blending={THREE.CustomBlending}
        blendSrc={THREE.OneFactor}
        blendDst={THREE.OneMinusSrcAlphaFactor}
        uniforms={uniforms}
      />
    </mesh>
  );
}

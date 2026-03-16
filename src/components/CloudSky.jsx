import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls, folder } from 'leva';
import { SOLAR } from '../utils/solar';

// ─── Volumetric Cloud Sky ───
// Ray-marched clouds using David Hoskins' FBM noise technique from Shadertoy.
// Features: FBM noise, Henyey-Greenstein scattering, Beer-Lambert absorption,
// procedural cloud coverage, interactive sky darkening for time-of-day effects.
// Future: integrate with time-of-day system for automatic sky transitions.

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
  uniform float lightAbsorption;
  uniform float skyDarkening;

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

  // Cheaper FBM for light marching (4 octaves)
  float fbmLight(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    float gain = mix(0.35, 0.6, fluffiness);

    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p * frequency);
      frequency *= 2.0;
      amplitude *= gain;
    }
    return value;
  }


  // ─── Henyey-Greenstein phase function ───
  float hg(float cosAngle, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * cosAngle, 1.5));
  }

  // ─── Cloud density (David Hoskins FBM-based) ───
  float sampleDensity(vec3 pos) {
    float heightFraction = (pos.y - cloudBase) / (cloudTop - cloudBase);
    if (heightFraction < 0.0 || heightFraction > 1.0) return 0.0;

    // Rounded bottom, tapered top
    float heightProfile = smoothstep(0.0, 0.15, heightFraction)
                        * smoothstep(1.0, 0.7, heightFraction);

    // Wind-driven FBM sampling
    vec3 windOffset = vec3(time * cloudSpeed * 120.0, 0.0, time * cloudSpeed * 60.0);
    float rawDensity = fbm((pos + windOffset) * cloudScale * 0.001);

    // Noise-based density with coverage threshold
    float coverageThreshold = 1.0 - coverage;
    float density = smoothstep(coverageThreshold, coverageThreshold + 0.15, rawDensity);

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

    // Simplified ray march with fewer steps for stylized look
    const int STEPS = 22;
    float stepSize = (tFar - tNear) / float(STEPS);

    float transmittance = 1.0;
    vec3 scatteredLight = vec3(0.0);

    // Sun disk effect
    float cosAngle = dot(rd, sunDirection);
    float sunDisk = pow(max(0.0, cosAngle), 1500.0) * 2.0; // sharp sun disk

    // Jitter start position to reduce banding
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * stepSize;

    for (int i = 0; i < STEPS; i++) {
      if (transmittance < 0.01) break;

      float t = tNear + jitter + float(i) * stepSize;
      vec3 pos = ro + rd * t;

      float density = sampleDensity(pos);

      if (density > 0.001) {
        // Simple sun illumination with power falloff
        float sunIllum = pow(max(0.0, dot(normalize(sunDirection), normalize(pos - ro))), 10.0);

        // Combine sun + ambient lighting (original, unchanged for night)
        vec3 ambient = cloudShadowColor * 0.15;
        vec3 sunLit = sunColor * sunIllum * 0.8;

        // Use sun elevation to determine day vs night (not brightness, which is always bright)
        // sunDirection.y is positive when sun is above horizon (day), negative when below (night)
        float dayThreshold = smoothstep(-0.2, 0.15, sunDirection.y);
        vec3 cloudColorAdjusted = mix(cloudColor, vec3(1.0), dayThreshold * 0.8);
        vec3 luminance = (sunLit + ambient) * cloudColorAdjusted;

        // Beer-Lambert absorption
        float sampleTransmittance = exp(-density * stepSize * lightAbsorption * 0.008);
        vec3 integScatter = luminance * (1.0 - sampleTransmittance);
        scatteredLight += transmittance * integScatter;
        transmittance *= sampleTransmittance;
      }
    }

    // Add sun disk glow
    scatteredLight += sunColor * sunDisk * transmittance * 0.6;

    // Tone-map accumulated light to prevent HDR blowout
    scatteredLight = scatteredLight / (1.0 + scatteredLight);

    // Apply vignette darkening based on skyDarkening slider
    float radialDist = length(rd.xz);
    float vignette = smoothstep(1.5, 0.3, radialDist);
    float vignetteFade = mix(1.0, vignette, skyDarkening);
    scatteredLight *= vignetteFade;

    float alpha = (1.0 - transmittance) * 0.85;

    // Very subtle horizon fade to blend with ocean
    float horizonFade = smoothstep(-0.5, 1.0, rd.y);
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
    lightAbsorption,
    cloudColorHex,
    shadowColorHex,
  } = useControls({
    Clouds: folder({
      coverage:       { value: 0.44, min: 0, max: 1, step: 0.01, label: 'Coverage' },
      fluffiness:     { value: 0.47,  min: 0, max: 1, step: 0.01, label: 'Fluffiness' },
      cloudScale:     { value: 0.6,  min: 0.1, max: 5, step: 0.1, label: 'Scale' },
      cloudSpeed:     { value: 0.3,  min: 0, max: 2, step: 0.05, label: 'Wind Speed' },
      density:        { value: 0.65, min: 0.1, max: 3, step: 0.1, label: 'Density' },
      base:           { value: -100,  min: -100, max: 2000, step: 50, label: 'Base Altitude' },
      top:            { value: 2500, min: 500, max: 5000, step: 50, label: 'Top Altitude' },
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
    cloudBase:        { value: 200.0 },
    cloudTop:         { value: 2500.0 },
    lightAbsorption:  { value: 1.0 },
    skyDarkening:     { value: 0.87 },
  }), []);

  // Full sky sphere covering all directions
  const geometry = useMemo(
    () => new THREE.SphereGeometry(8000, 32, 16, 0, Math.PI * 2, 0, Math.PI),
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

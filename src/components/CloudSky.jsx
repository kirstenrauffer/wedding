import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

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
  uniform vec3 sunDirectionForFlare;
  uniform vec3 sunColor;
  uniform vec3 cloudColor;
  uniform vec3 cloudShadowColor;
  uniform vec3 cloudShadowColor2;
  uniform float coverage;
  uniform float fluffiness;
  uniform float cloudScale;
  uniform float cloudSpeed;
  uniform float cloudDensity;
  uniform float cloudBase;
  uniform float cloudTop;
  uniform float lightAbsorption;
  uniform float absorptionScale;
  uniform float skyDarkening;
  uniform float cloudInkStrength;
  uniform float lensFlareIntensity;
  uniform vec3 lensFlareColor;
  uniform vec3 cameraDir;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;

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

  // ─── Lens Flare for Midday ───
  // Strong starbursts + prominent screen-space ghosting
  vec3 lensFlare(vec3 rd, vec3 sunDir, vec3 flareColor) {
    float sunDot = clamp(dot(rd, sunDir), 0.0, 1.0);
    float angleDeg = degrees(acos(sunDot));

    // ── Camera-space 2D basis ──
    vec3 worldUp  = vec3(0.0, 1.0, 0.0);
    vec3 camRight = normalize(cross(worldUp, cameraDir));
    vec3 camUp    = normalize(cross(cameraDir, camRight));

    // 2D screen-space projections
    float rdU  = dot(rd,     camRight);
    float rdV  = dot(rd,     camUp);
    float sunU = dot(sunDir, camRight);
    float sunV = dot(sunDir, camUp);

    // ── Bright core ──
    vec3 core = flareColor * pow(sunDot, 15.0) * 2.5;

    // ── Veiling glare ──
    vec3 veilingGlare = flareColor * exp(-angleDeg * angleDeg / 200.0) * 0.35;

    // ── Strong starburst (12-pointed) ──
    vec3 rd_perp = rd - sunDot * sunDir;
    float perpLen = length(rd_perp);
    vec3 starburst = vec3(0.0);
    if (perpLen > 0.001) {
      rd_perp /= perpLen;
      float pA = dot(rd_perp, camRight);
      float pB = dot(rd_perp, camUp);
      float rayAngle = atan(pB, pA);

      // 6 primary rays (cos = broader than sin, max(0) = only bright peaks)
      float rays6  = pow(max(0.0, cos(rayAngle * 6.0)), 6.0);
      // 6 secondary rays offset by 15 degrees → 12-pointed star total
      float rays6b = pow(max(0.0, cos(rayAngle * 6.0 + 3.14159 / 2.0)), 6.0);

      float rayFade = smoothstep(30.0, 1.0, angleDeg);
      starburst = flareColor * (rays6 * 0.7 + rays6b * 0.5) * rayFade * 3.5;
    }

    // ── Screen-space ghosting ──
    // Ghosts at positions (-k*sunU, -k*sunV) on the screen plane.
    // Distance from fragment (rdU,rdV) to ghost k: length(vec2(rdU + k*sunU, rdV + k*sunV))
    vec3 ghosting = vec3(0.0);

    // Ghost 1: k=0.6, medium, blue-tinted
    {
      float dist = length(vec2(rdU + 0.6 * sunU, rdV + 0.6 * sunV));
      ghosting += vec3(0.6, 0.75, 1.0) * 0.5 * exp(-dist * dist / 0.004);
    }
    // Ghost 2: k=1.1, small, green-tinted
    {
      float dist = length(vec2(rdU + 1.1 * sunU, rdV + 1.1 * sunV));
      ghosting += vec3(0.5, 1.0, 0.6) * 0.35 * exp(-dist * dist / 0.002);
    }
    // Ghost 3: k=1.5, large diffuse, warm
    {
      float dist = length(vec2(rdU + 1.5 * sunU, rdV + 1.5 * sunV));
      ghosting += vec3(1.0, 0.8, 0.4) * 0.25 * exp(-dist * dist / 0.008);
    }
    // Ghost 4: k=2.0, small bright, neutral
    {
      float dist = length(vec2(rdU + 2.0 * sunU, rdV + 2.0 * sunV));
      ghosting += flareColor * 0.4 * exp(-dist * dist / 0.001);
    }
    // Ghost 5: k=-0.4, backscatter side (between sun and center), purple-tinted
    {
      float dist = length(vec2(rdU - 0.4 * sunU, rdV - 0.4 * sunV));
      ghosting += vec3(0.8, 0.6, 1.0) * 0.2 * exp(-dist * dist / 0.003);
    }

    // ── Anamorphic streak ──
    vec3 anamorphic = vec3(0.0);
    if (perpLen > 0.001) {
      float streakDot = abs(dot(rd_perp, camRight));
      anamorphic = flareColor * 0.2 * exp(-angleDeg / 15.0) * smoothstep(0.15, 0.0, streakDot);
    }

    return core + veilingGlare + starburst + ghosting + anamorphic;
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

    // Subtractive thresholding for sharp cloud structure (like reference shader)
    float cloudThreshold = coverage;
    float density = max(cloudThreshold - rawDensity, 0.0) * 1.8;

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

    // Subtractive thresholding for sharp cloud structure
    float cloudThreshold = coverage;
    float density = max(cloudThreshold - rawDensity, 0.0) * 1.8;

    return density * heightProfile * cloudDensity;
  }

  // ─── Main ───
  void main() {
    vec3 rd = normalize(vDirection);

    // Clip clouds below the horizon
    if (rd.y < 0.0) discard;

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

        // Use sun elevation to determine day vs night (not brightness, which is always bright)
        // sunDirection.y is positive when sun is above horizon (day), negative when below (night)
        float dayThreshold = smoothstep(-0.2, 0.15, sunDirection.y);

        // Color stratification based on density — dense core gets core color, edges get shadow colors
        // Normalize density to a ~0-1 range for color blending (adjusted for typical density range)
        float densityFraction = smoothstep(0.0, 0.4, density);

        // Three-color blend: shadow2 (darkest) → shadow1 → core (lightest)
        vec3 coreColor = mix(cloudColor, vec3(1.0), dayThreshold);
        vec3 midColor = mix(cloudColor * 0.9, vec3(1.0), dayThreshold * 0.9);
        vec3 darkColor = mix(cloudShadowColor2, vec3(0.95), dayThreshold * 0.85);

        // Blend between shadow colors and core based on density
        vec3 baseColor = mix(darkColor, coreColor, densityFraction);
        baseColor = mix(baseColor, midColor, smoothstep(0.0, 0.5, densityFraction) * 0.5);

        // Combine with lighting
        vec3 ambientColor = mix(cloudShadowColor, vec3(1.0), dayThreshold * 0.8);
        vec3 ambient = ambientColor * 0.6;
        vec3 sunLit = sunColor * sunIllum * 1.3;

        vec3 luminance = (sunLit + ambient) * baseColor;

        // Increased opacity: higher light absorption makes clouds more opaque
        float sampleTransmittance = exp(-density * stepSize * lightAbsorption * absorptionScale);
        vec3 integScatter = luminance * (1.0 - sampleTransmittance);
        scatteredLight += transmittance * integScatter;
        transmittance *= sampleTransmittance;
      }
    }

    // Add sun disk glow
    scatteredLight += sunColor * sunDisk * transmittance * 0.6;

    // Apply vignette darkening based on skyDarkening slider
    float radialDist = length(rd.xz);
    float vignette = smoothstep(1.5, 0.3, radialDist);
    float vignetteFade = mix(1.0, vignette, skyDarkening);
    scatteredLight *= vignetteFade;

    float alpha = (1.0 - transmittance) * 1.0;

    // Very subtle horizon fade to blend with ocean
    float horizonFade = smoothstep(-0.1, 0.4, rd.y);
    alpha *= horizonFade;

    // Cloud ink outlines — draw dark edges where transmittance is transitioning
    // (transmittance near 0.5 = the cloud silhouette boundary)
    float cloudEdge = 1.0 - smoothstep(0.0, 0.25, abs(transmittance - 0.5));
    float cloudInk = cloudEdge * cloudInkStrength * horizonFade;
    vec3 inkTone = vec3(0.05, 0.06, 0.08);
    scatteredLight = mix(scatteredLight, inkTone, cloudInk);
    // Brighten alpha at edge for crisp silhouette
    alpha = alpha * (1.0 + cloudInk * 0.1);

    // Apply atmospheric fog — fade sky toward horizon fog color with distance
    // Use the ray parameter (distance traveled) for proper distance-based fogging
    float viewDist = tFar;
    float fogFactor = smoothstep(fogNear, fogFar, viewDist);
    scatteredLight = mix(scatteredLight, fogColor, fogFactor * 0.6);

    // Compute lens flare as additive contribution (NOT gated by cloud alpha)
    float isDaytime = step(0.0, sunDirection.y);
    vec3 flare = lensFlare(rd, sunDirectionForFlare, lensFlareColor) * isDaytime * lensFlareIntensity;

    // Output: cloud scattering (pre-multiplied) + lens flare (additive)
    gl_FragColor = vec4(scatteredLight * alpha + flare, alpha);
  }
`;

// ─── React Component ───

export default function CloudSky({ timeOfDay, lightX, lightY, lightZ, sunColorHex, cloudColorHex, shadowColorHex, fogColor, fogNear, fogFar, moonLightIntensity, moonColorHex }) {
  const meshRef = useRef();
  const materialRef = useRef();
  const { camera } = useThree();
  const _cameraDir = useMemo(() => new THREE.Vector3(), []);

  // Hardcoded lens flare position (previously exposed in Leva)
  const lensFlarePositionH = 1;
  const lensFlarePositionV = 1;

  // Cloud parameters (locked - do not modify)
  const coverageDay = 0.30;
  const fluffiness = 0.55;
  const cloudScale = 0.5;
  const cloudSpeed = 0.3;
  const cloudDensity = 0.25;
  const lightAbsorption = 0.6;
  const absorptionScale = 0.045;
  const base = -200;
  const top = 4950;

  const sunDirection = useMemo(() => {
    return new THREE.Vector3(lightX, lightY, lightZ).normalize();
  }, [lightX, lightY, lightZ]);

  const uniforms = useMemo(() => ({
    time:             { value: 0 },
    cameraPos:        { value: new THREE.Vector3() },
    sunDirection:     { value: new THREE.Vector3() },
    sunDirectionForFlare: { value: new THREE.Vector3() },
    sunColor:         { value: new THREE.Color(1, 0.95, 0.85) },
    cloudColor:       { value: new THREE.Color() },
    cloudShadowColor: { value: new THREE.Color() },
    cloudShadowColor2:{ value: new THREE.Color() },
    coverage:         { value: 0.55 },
    fluffiness:       { value: 0.6 },
    cloudScale:       { value: 1.0 },
    cloudSpeed:       { value: 0.3 },
    cloudDensity:     { value: 0.5 },
    cloudBase:        { value: -200.0 },
    cloudTop:         { value: 2500.0 },
    lightAbsorption:  { value: 0.6 },
    absorptionScale:  { value: 0.045 },
    skyDarkening:     { value: 0.87 },
    cloudInkStrength: { value: 0.7 },
    lensFlareIntensity: { value: 0 },
    lensFlareColor:   { value: new THREE.Color(1, 0.95, 0.85) },
    cameraDir:        { value: new THREE.Vector3(0, 0, -1) },
    fogColor:         { value: new THREE.Color() },
    fogNear:          { value: 100.0 },
    fogFar:           { value: 4000.0 },
  }), []);

  // Full sky sphere covering all directions
  const geometry = useMemo(
    () => new THREE.SphereGeometry(8000, 32, 16, 0, Math.PI * 2, 0, Math.PI),
    [],
  );

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;

    // Cloud movement: scale timeOfDay changes heavily, add elapsed time for continuous motion
    mat.uniforms.time.value = timeOfDay * 100 + state.clock.elapsedTime;

    mat.uniforms.cameraPos.value.copy(camera.position);
    meshRef.current.position.copy(camera.position);

    // Update camera direction for screen-space lens flare effects
    camera.getWorldDirection(_cameraDir);
    mat.uniforms.cameraDir.value.copy(_cameraDir);

    // Calculate lens flare position based on time of day
    let flareDirection = sunDirection.clone();

    if (timeOfDay >= 4 && timeOfDay < 8) {
      // Sunrise (5:00-9:00): use specific H/V and red tint
      const sunriseProgress = (timeOfDay - 4) / 4;
      const sunriseH = 0.3;
      const sunriseV = 0.1;
      const offScreenShiftH = Math.sin(sunriseProgress * Math.PI) * 0.35 * sunriseH;
      const offScreenShiftV = Math.sin(sunriseProgress * Math.PI) * 0.35 * sunriseV;
      flareDirection.x -= offScreenShiftH * 40;
      flareDirection.y -= offScreenShiftV * 20;
      flareDirection.normalize();
    } else if (timeOfDay >= 10 && timeOfDay < 14) {
      // Midday: bring closer to center on x and y
      const midDayDir = new THREE.Vector3(0, 1, -1).normalize();
      const midDayProgress = (timeOfDay - 10) / 4;
      const blendFactorH = Math.sin(midDayProgress * Math.PI) * 0.4;
      const blendFactorV = Math.sin(midDayProgress * Math.PI) * 0.4;
      // lerp toward midDayDir, then nudge x/y independently
      flareDirection.lerp(midDayDir, (blendFactorH + blendFactorV) / 2);
      flareDirection.x += (lensFlarePositionH - 1) * 10;
      flareDirection.y += (lensFlarePositionV - 1) * 10;
      flareDirection.normalize();
    } else if (timeOfDay >= 16 && timeOfDay < 20) {
      // Sunset (15:00-19:00): use specific H/V
      const sunsetProgress = (timeOfDay - 16) / 4;
      const sunsetH = 1.1;
      const sunsetV = 0;
      const rightShiftH = Math.sin(sunsetProgress * Math.PI) * 0.15 * sunsetH;
      const rightShiftV = Math.sin(sunsetProgress * Math.PI) * 0.15 * sunsetV;
      flareDirection.x += rightShiftH * 25;
      flareDirection.y += rightShiftV * 10;
      flareDirection.normalize();
    } else {
      // Night: still allow position adjustments, just reduced visibility
      flareDirection.x += (lensFlarePositionH - 1) * 5;
      flareDirection.y += (lensFlarePositionV - 1) * 5;
      flareDirection.normalize();
    }

    // Apply position slider adjustments to all times of day
    flareDirection.x += (lensFlarePositionH - 1) * 3;
    flareDirection.y += (lensFlarePositionV - 1) * 3;
    flareDirection.normalize();

    // Tie lens flare intensity directly to solar elevation to guarantee 0 at night
    // smoothstep(0.05, 0.2, y): 0 when sun ≤ 5° above horizon, full 0.5 when ≥ ~12°
    const lensFlareIntensityValue = THREE.MathUtils.smoothstep(sunDirection.y, 0.05, 0.2) * 0.5;

    // ── Moon lighting blending at night ──
    // When sun goes below horizon, blend cloud lighting toward moon direction and color
    const MOON_DIR = new THREE.Vector3(0.455, 0.455, -0.809); // normalized (45, 45, -80)
    const sunElevation = sunDirection.y;
    const cloudNightFactor = THREE.MathUtils.smoothstep(-0.1, -0.3, sunElevation); // 0=day, 1=night
    const effectiveLightDir = sunDirection.clone().lerp(MOON_DIR, cloudNightFactor).normalize();
    const effectiveColor = new THREE.Color(sunColorHex)
      .lerp(new THREE.Color(moonColorHex), cloudNightFactor)
      .multiplyScalar(1.0 - cloudNightFactor * 0.6); // dim down: moon is much dimmer

    // Reduce cloud coverage by 50% at night
    const coverage = coverageDay * (1 - cloudNightFactor * 0.5);

    // Reactive uniform updates
    mat.uniforms.sunDirection.value.copy(effectiveLightDir);
    mat.uniforms.sunDirectionForFlare.value.copy(flareDirection);
    mat.uniforms.sunColor.value.copy(effectiveColor);
    mat.uniforms.cloudColor.value.set(cloudColorHex);
    mat.uniforms.cloudShadowColor.value.set(shadowColorHex);
    // Darker shadow color for depth layering
    mat.uniforms.cloudShadowColor2.value.set(new THREE.Color(shadowColorHex).multiplyScalar(0.6));
    mat.uniforms.coverage.value = coverage;
    mat.uniforms.fluffiness.value = fluffiness;
    mat.uniforms.cloudScale.value = cloudScale;
    mat.uniforms.cloudSpeed.value = cloudSpeed;
    mat.uniforms.cloudDensity.value = cloudDensity;
    mat.uniforms.cloudBase.value = base;
    mat.uniforms.cloudTop.value = top;
    mat.uniforms.lightAbsorption.value = lightAbsorption;
    mat.uniforms.absorptionScale.value = absorptionScale;
    mat.uniforms.cloudInkStrength.value = 0.7;
    mat.uniforms.lensFlareIntensity.value = lensFlareIntensityValue;

    // Set lens flare color based on time of day
    let lensFlareColorValue = new THREE.Color(sunColorHex);
    if (timeOfDay >= 4 && timeOfDay < 8) {
      // Sunrise: tint toward red/orange
      const sunriseProgress = (timeOfDay - 4) / 4;
      lensFlareColorValue.lerp(new THREE.Color(1, 0.4, 0.3), sunriseProgress * 0.6);
    }
    mat.uniforms.lensFlareColor.value.copy(lensFlareColorValue);

    mat.uniforms.fogColor.value.set(fogColor);
    mat.uniforms.fogNear.value = fogNear;
    mat.uniforms.fogFar.value = fogFar;
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

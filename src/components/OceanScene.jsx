import { useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  DepthOfField,
  ToneMapping,
  Vignette,
  SMAA,
  N8AO,
  wrapEffect,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { useControls, folder } from 'leva';
import CloudSky from './CloudSky';
import StarField from './StarField';
import Moon from './Moon';
import Sun from './Sun';
import { SOLAR, computeSolarParams } from '../utils/solar';
import { KuwaharaEffect } from '../effects/KuwaharaEffect';
import { OutlineEffect } from '../effects/OutlineEffect';

// ─── Custom Water Shader (Watercolor Style) ───
// Stylized watercolor aesthetic: flat color patches, colored moving shadows, painterly gradient easing, outlines, organic water movement

const CUSTOM_FRAGMENT_SHADER = /* glsl */ `
  uniform float alpha;
  uniform float time;
  uniform float size;
  uniform sampler2D normalSampler;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec3 eye;
  uniform vec3 waterColor;
  uniform vec3 deepWaterColor;
  uniform float foamStrength;
  uniform float ambientIntensity;
  uniform float directionalIntensity;

  // Watercolor uniforms
  uniform vec3 shadowColor;
  uniform vec3 highlightColor;
  uniform float shadowStrength;
  uniform float shadowSpeed;

  // Ink outline uniforms
  uniform float inkWidth;
  uniform float inkStrength;
  uniform vec3 inkColor;

  // Lighting uniforms
  uniform float fresnelStrength;
  uniform float absorptionCoeff;

  varying vec4 worldPosition;

  vec4 getNoise(vec2 uv) {
    vec2 uv0 = (uv / 103.0) + vec2(time / 17.0, time / 29.0);
    vec2 uv1 = uv / 107.0 - vec2(time / -19.0, time / 31.0);
    vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(time / 101.0, time / 97.0);
    vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(time / 109.0, time / -113.0);
    vec4 noise = texture2D(normalSampler, uv0) +
      texture2D(normalSampler, uv1) +
      texture2D(normalSampler, uv2) +
      texture2D(normalSampler, uv3);
    return noise * 0.5;
  }

  #include <common>
  #include <packing>
  #include <bsdfs>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>

  void main() {
    #include <logdepthbuf_fragment>

    // 1. Four-layer noise (getNoise function exactly as before)
    vec4 noise = getNoise(worldPosition.xz * size);
    float height = noise.y * 0.5 + 0.5;  // normalise to [0,1]

    // 2. Two offset shadow bands (smoothstep — like the blog's double lerp)
    //    Each band scrolls independently for the "moving shadow" effect
    float band1 = smoothstep(0.45, 0.55,
        height + sin(worldPosition.x * 0.008 + time * shadowSpeed) * 0.2);
    float band2 = smoothstep(0.38, 0.48,
        height - sin(worldPosition.z * 0.006 + time * shadowSpeed * 0.7) * 0.18);

    // 3. Dual lerp → produces that saturated dark watery edge from over-wet watercolor
    float shadow = mix(band1, 1.0 - band2, 0.35) * shadowStrength;

    // 3b. Ink outlines — draw thin contour lines at the center of each band's transition
    // Higher inkWidth = thinner lines. lineWidth safeguard prevents division issues.
    float lineWidth = 0.08 / max(inkWidth, 0.1);
    float ink1 = 1.0 - smoothstep(0.0, lineWidth, abs(band1 - 0.5));
    float ink2 = 1.0 - smoothstep(0.0, lineWidth, abs(band2 - 0.5));
    float inkMask = max(ink1, ink2) * inkStrength;

    // 4. Base color: lerp between shadowColor and waterColor by shadow factor
    vec3 color = mix(shadowColor, waterColor, shadow);

    // 5. Depth attenuation: exponential falloff toward deep water color with distance
    float dist = 1.0 - exp(-absorptionCoeff * 0.0001 * length(worldPosition.xz));
    color = mix(color, deepWaterColor, dist * 0.6);

    // 6. Sun directional response — brighter facing sun, darker away (not just warmth)
    float sunDiff = max(0.0, dot(vec3(0.0, 1.0, 0.0), sunDirection));
    color *= (0.6 + sunDiff * directionalIntensity * 0.6);

    // 7. Ambient sky tint — very subtle
    color += vec3(0.02, 0.04, 0.06) * ambientIntensity;

    // 8. Foam at peaks
    float foam = smoothstep(0.72, 0.95, height) * foamStrength;
    color = mix(color, highlightColor, foam);

    // 8b. Fresnel — camera-angle-dependent sheen at grazing angles
    vec3 worldToEye = eye - worldPosition.xyz;
    vec3 eyeDir = normalize(worldToEye);
    vec3 surfaceNormal = vec3(0.0, 1.0, 0.0); // flat plane normal
    float cosTheta = max(dot(eyeDir, surfaceNormal), 0.0);
    float fresnel = fresnelStrength * pow(1.0 - cosTheta, 4.0);
    vec3 fresnelColor = mix(waterColor, highlightColor, 0.6);
    color = mix(color, fresnelColor, fresnel * 0.35);

    // 9. Ink lines over the final color
    color = mix(color, inkColor, inkMask);

    gl_FragColor = vec4(color, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
// ─── Ocean Water Component ───

function OceanWater() {
  const { scene } = useThree();

  const {
    lightX,
    lightY,
    lightZ,
    sunColorHex,
    ambientIntensity,
    directionalIntensity,
  } = useControls({
    'Time of Day': folder({
      lightX: { value: SOLAR.lightX, render: () => false },
      lightY: { value: SOLAR.lightY, render: () => false },
      lightZ: { value: SOLAR.lightZ, render: () => false },
      sunColorHex: { value: SOLAR.sunColorHex, render: () => false },
      ambientIntensity: { value: SOLAR.ambientIntensity, render: () => false },
      directionalIntensity: { value: SOLAR.directionalIntensity, render: () => false },
    }),
  });

  // Water parameters (hardcoded)
  const waterColorHex = '#1A4A6A';
  const deepWaterColorHex = '#0A2540';
  const alpha = 1.0;
  const waveSize = 1.6;
  const waveSpeed = 0.3;
  const foamStrength = 0.3;

  // Watercolor uniforms
  const shadowColorHex = '#0A2A3E';
  const highlightColorHex = '#B0D8F0';
  const shadowStrength = 1.5;
  const shadowSpeed = 0.4;

  const waterNormals = useMemo(() => {
    const tex = new THREE.TextureLoader().load('/textures/waternormals.jpg');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  const sunDirection = useMemo(() => {
    return new THREE.Vector3(lightX, lightY, lightZ).normalize();
  }, [lightX, lightY, lightZ]);

  const water = useMemo(() => {
    const geom = new THREE.PlaneGeometry(30000, 30000);
    const w = new Water(geom, {
      textureWidth: 64,
      textureHeight: 64,
      waterNormals,
      sunDirection,
      sunColor: new THREE.Color(sunColorHex),
      waterColor: new THREE.Color(waterColorHex),
      distortionScale: 0,
      fog: false,
      alpha,
    });

    // Replace fragment shader with our custom one
    w.material.fragmentShader = CUSTOM_FRAGMENT_SHADER;

    // Add watercolor uniforms
    w.material.uniforms.shadowColor = { value: new THREE.Color(shadowColorHex) };
    w.material.uniforms.highlightColor = { value: new THREE.Color(highlightColorHex) };
    w.material.uniforms.shadowStrength = { value: shadowStrength };
    w.material.uniforms.shadowSpeed = { value: shadowSpeed };
    w.material.uniforms.deepWaterColor = { value: new THREE.Color(deepWaterColorHex) };
    w.material.uniforms.foamStrength = { value: foamStrength };
    w.material.uniforms.ambientIntensity = { value: ambientIntensity };
    w.material.uniforms.directionalIntensity = { value: directionalIntensity };

    // Add ink outline uniforms
    w.material.uniforms.inkWidth = { value: 1.0 };
    w.material.uniforms.inkStrength = { value: 1.2 };
    w.material.uniforms.inkColor = { value: new THREE.Color('#03050A') };

    // Add lighting uniforms
    w.material.uniforms.fresnelStrength = { value: 1.0 };
    w.material.uniforms.absorptionCoeff = { value: 0.8 };

    w.material.needsUpdate = true;
    w.rotation.x = -Math.PI / 2;

    return w;
    // Only recreate on waterNormals change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waterNormals]);

  // Update uniforms reactively without recreating the water object
  useEffect(() => {
    const u = water.material.uniforms;
    u.sunDirection.value.copy(sunDirection);
    u.sunColor.value.set(sunColorHex);
    u.waterColor.value.set(waterColorHex);
    u.alpha.value = alpha;
    u.size.value = waveSize;
    u.shadowColor.value.set(shadowColorHex);
    u.highlightColor.value.set(highlightColorHex);
    u.shadowStrength.value = shadowStrength;
    u.shadowSpeed.value = shadowSpeed;
    u.deepWaterColor.value.set(deepWaterColorHex);
    u.foamStrength.value = foamStrength;
    u.ambientIntensity.value = ambientIntensity;
    u.directionalIntensity.value = directionalIntensity;
    u.fresnelStrength.value = 1.0;
    u.absorptionCoeff.value = 0.8;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [water, sunDirection, sunColorHex, ambientIntensity, directionalIntensity]);

  useFrame(({ gl: renderer, scene: sc }, delta) => {
    if (water.material.uniforms.time) {
      water.material.uniforms.time.value += delta * waveSpeed;
    }
  });

  return <primitive object={water} />;
}

// ─── Gradient Sky (Ghibli palette) ───

const SKY_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 midColor;
  uniform vec3 horizonColor;

  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition - cameraPosition);
    float h = dir.y;

    // Three-stop gradient: horizon → mid → top
    vec3 color;
    if (h < 0.0) {
      color = horizonColor;
    } else if (h < 0.3) {
      color = mix(horizonColor, midColor, h / 0.3);
    } else {
      color = mix(midColor, topColor, (h - 0.3) / 0.7);
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

function GradientSky() {
  const { skyTopHex, skyMidHex, skyHorizonHex } = useControls({
    'Time of Day': folder({
      skyTopHex: { value: '#1E5B8E', render: () => false },
      skyMidHex: { value: '#4A90C4', render: () => false },
      skyHorizonHex: { value: '#87BBDA', render: () => false },
    }),
  });

  const uniforms = useMemo(() => ({
    topColor: { value: new THREE.Color('#1E5B8E') },
    midColor: { value: new THREE.Color('#4A90C4') },
    horizonColor: { value: new THREE.Color('#87BBDA') },
  }), []);

  useEffect(() => {
    uniforms.topColor.value.set(skyTopHex);
    uniforms.midColor.value.set(skyMidHex);
    uniforms.horizonColor.value.set(skyHorizonHex);
  }, [skyTopHex, skyMidHex, skyHorizonHex, uniforms]);

  return (
    <mesh>
      <sphereGeometry args={[400000, 32, 16]} />
      <shaderMaterial
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ─── Post Processing ───

const KuwaharaComponent = wrapEffect(KuwaharaEffect);
const OutlineComponent = wrapEffect(OutlineEffect);


function PostProcessing() {
  const {
    kuwaharaEnabled,
    kuwaharaRadius,
    kuwaharaSharpness,
    outlineEnabled,
    outlineThreshold,
    outlineStrength,
  } = useControls({
    Kuwahara: folder({
      kuwaharaEnabled: { value: true, label: 'Enabled' },
      kuwaharaRadius: { value: 7.0, min: 1, max: 8, step: 0.5, label: 'Radius' },
      kuwaharaSharpness: { value: 4.0, min: 1, max: 8, step: 0.5, label: 'Sharpness' },
    }),
    Outline: folder({
      outlineEnabled: { value: true, label: 'Enabled' },
      outlineThreshold: { value: 0.01, min: 0.0, max: 0.3, step: 0.01, label: 'Threshold' },
      outlineStrength: { value: 3.0, min: 0, max: 3, step: 0.1, label: 'Strength' },
    }),
  });

  // Hardcoded post-processing settings
  const bloomEnabled = true;
  const bloomIntensity = 0.3;
  const bloomThreshold = 0.95;
  const bloomSmoothing = 0.3;
  const dofEnabled = true;
  const dofFocusDistance = 0.01;
  const dofFocalLength = 0.02;
  const dofBokehScale = 2.0;
  const aoEnabled = true;
  const aoIntensity = 1.0;
  const vignetteEnabled = true;
  const vignetteIntensity = 0.9;

  return (
    <EffectComposer multisampling={8}>
      {aoEnabled && (
        <N8AO
          aoRadius={5}
          intensity={aoIntensity}
          aoSamples={16}
          denoiseSamples={4}
        />
      )}
      <ToneMapping mode={ToneMappingMode.AGX} />
      {bloomEnabled && (
        <Bloom
          intensity={bloomIntensity}
          luminanceThreshold={bloomThreshold}
          luminanceSmoothing={bloomSmoothing}
          mipmapBlur
        />
      )}
      {dofEnabled && (
        <DepthOfField
          focusDistance={dofFocusDistance}
          focalLength={dofFocalLength}
          bokehScale={dofBokehScale}
        />
      )}
      <SMAA />
      {outlineEnabled && (
        <OutlineComponent
          threshold={outlineThreshold}
          strength={outlineStrength}
        />
      )}
      {kuwaharaEnabled && (
        <KuwaharaComponent
          radius={kuwaharaRadius}
          sharpness={kuwaharaSharpness}
        />
      )}
      {vignetteEnabled && (
        <Vignette eskil={false} offset={0.1} darkness={vignetteIntensity} />
      )}
    </EffectComposer>
  );
}

// ─── Time-of-Day Controller ───
// Drives sun position, sky atmosphere, lighting, and cloud colors from a single slider.

function TimeOfDayController() {
  const currentHour = useMemo(() => {
    const now = new Date();
    return Math.round((now.getHours() + now.getMinutes() / 60) * 4) / 4;
  }, []);

  const [{ timeOfDay }, set] = useControls(() => ({
    'Time of Day': folder({
      timeOfDay: { value: currentHour, min: 0, max: 24, step: 0.25, label: 'Hour (0–24)' },
      lightX: { value: SOLAR.lightX, render: () => false },
      lightY: { value: SOLAR.lightY, render: () => false },
      lightZ: { value: SOLAR.lightZ, render: () => false },
      sunColorHex: { value: SOLAR.sunColorHex, render: () => false },
      ambientIntensity: { value: SOLAR.ambientIntensity, render: () => false },
      directionalIntensity: { value: SOLAR.directionalIntensity, render: () => false },
      skyTopHex: { value: SOLAR.skyTopHex, render: () => false },
      skyMidHex: { value: SOLAR.skyMidHex, render: () => false },
      skyHorizonHex: { value: SOLAR.skyHorizonHex, render: () => false },
    }),
  }));

  // Auto-update disabled - slider works manually
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     const now = new Date();
  //     const realTimeOfDay = Math.round((now.getHours() + now.getMinutes() / 60) * 4) / 4;
  //     set({ timeOfDay: realTimeOfDay });
  //   }, 1000);
  //   return () => clearInterval(interval);
  // }, [set]);

  useEffect(() => {
    const p = computeSolarParams(timeOfDay);
    set({
      lightX: p.lightX,
      lightY: p.lightY,
      lightZ: p.lightZ,
      sunColorHex: p.sunColorHex,
      ambientIntensity: p.ambientIntensity,
      directionalIntensity: p.directionalIntensity,
      skyTopHex: p.skyTopHex,
      skyMidHex: p.skyMidHex,
      skyHorizonHex: p.skyHorizonHex,
    });
  }, [timeOfDay, set]);

  return null;
}

// ─── Main Scene ───

function Scene() {
  const { timeOfDay } = useControls('Time of Day', {
    timeOfDay: { value: 12, min: 0, max: 24, step: 0.25, label: 'Hour (0–24)', render: () => false },
  });

  return (
    <>
      <TimeOfDayController />
      <GradientSky />
      <StarField />
      <Sun />
      <Moon timeOfDay={timeOfDay} />
      <CloudSky />
      <OceanWater />
      <PostProcessing />
    </>
  );
}

export default function OceanScene() {
  return (
    <div className="ocean-canvas">
      <Canvas
        camera={{ position: [0, 15, 80], fov: 55, near: 1, far: 500000 }}
        gl={{
          antialias: true,
          toneMapping: THREE.NoToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
          powerPreference: 'high-performance',
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        }}
        dpr={[1, 2]}
        shadows
      >
        <Scene />
      </Canvas>
    </div>
  );
}

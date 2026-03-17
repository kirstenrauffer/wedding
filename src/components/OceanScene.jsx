import { useMemo, useEffect, useRef } from 'react';
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

// ─── Ocean Water Component ───

function OceanWater() {
  const { lightX, lightY, lightZ, sunColorHex, timeOfDay } = useControls({
    'Time of Day': folder({
      lightX: { value: SOLAR.lightX, render: () => false },
      lightY: { value: SOLAR.lightY, render: () => false },
      lightZ: { value: SOLAR.lightZ, render: () => false },
      sunColorHex: { value: SOLAR.sunColorHex, render: () => false },
      timeOfDay: { value: 12, min: 0, max: 24, step: 0.25, render: () => false },
    }),
  });

  // Compute water color based on time of day
  const waterColorHex = useMemo(() => {
    const nightColor = '#1b2931';
    const dayColor = '#062a1f';
    const transitionColor = '#062429';

    // Sunrise: 5-8, Day: 8-18, Sunset: 18-20, Night: 20-5
    if (timeOfDay >= 8 && timeOfDay < 18) {
      // Daytime
      return dayColor;
    } else if (timeOfDay >= 5 && timeOfDay < 8) {
      // Sunrise transition
      return transitionColor;
    } else if (timeOfDay >= 18 && timeOfDay < 20) {
      // Sunset transition
      return transitionColor;
    } else {
      // Night
      return nightColor;
    }
  }, [timeOfDay]);

  const waterNormals = useMemo(() => {
    const tex = new THREE.TextureLoader().load('/textures/waternormals.jpg');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  // Calculate night factor for smooth transition (0 = fully night, 1 = day)
  const nightFactor = useMemo(() => {
    if (timeOfDay >= 7 && timeOfDay <= 17) return 1;       // full day
    if (timeOfDay >= 5 && timeOfDay < 7) return (timeOfDay - 5) / 2;  // dawn fade in
    if (timeOfDay > 17 && timeOfDay <= 19) return 1 - (timeOfDay - 17) / 2; // dusk fade out
    return 0;  // night
  }, [timeOfDay]);

  // Moon position (matches Moon.jsx)
  const MOON_POSITION = new THREE.Vector3(45, 45, -80);
  const moonDir = useMemo(() => MOON_POSITION.clone().normalize(), []);

  // Water reflection direction: points to sun during day, moon at night
  const waterSunDirection = useMemo(() => {
    const daytimeDir = new THREE.Vector3(lightX, lightY, lightZ).normalize();
    // Interpolate from daytime sun direction to moon direction
    return daytimeDir.clone().lerp(moonDir, 1 - nightFactor).normalize();
  }, [lightX, lightY, lightZ, nightFactor, moonDir]);

  // Water reflection color: fades to black at night
  const waterSunColor = useMemo(() => {
    const base = new THREE.Color(sunColorHex);
    return base.multiplyScalar(nightFactor);
  }, [sunColorHex, nightFactor]);

  // Reduce water distortion (reflections) at night
  const waterDistortion = useMemo(() => {
    return 3.7 * nightFactor + 2.0 * (1 - nightFactor); // 3.7 day, 2.0 night
  }, [nightFactor]);

  const water = useMemo(() => {
    const geom = new THREE.PlaneGeometry(30000, 30000);
    const w = new Water(geom, {
      textureWidth: 256,
      textureHeight: 256,
      waterNormals,
      sunDirection: waterSunDirection,
      sunColor: waterSunColor,
      waterColor: new THREE.Color(waterColorHex),
      distortionScale: waterDistortion,
      fog: true,
      alpha: 1.0,
    });
    w.rotation.x = -Math.PI / 2;
    return w;
  }, [waterNormals, waterSunDirection, waterSunColor, waterColorHex, waterDistortion]);

  useEffect(() => {
    water.material.uniforms.sunColor.value.copy(waterSunColor);
    water.material.uniforms.sunDirection.value.copy(waterSunDirection);
    water.material.uniforms.waterColor.value.set(waterColorHex);
  }, [water.material.uniforms, waterSunColor, waterSunDirection, waterColorHex]);

  useFrame((_, delta) => {
    if (water.material.uniforms.time) {
      water.material.uniforms.time.value += delta * 0.3;
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

function PostProcessing() {
  const {
    kuwaharaEnabled,
    kuwaharaRadius,
    kuwaharaSharpness,
    bloomEnabled,
    bloomIntensity,
    bloomThreshold,
    bloomSmoothing,
    dofEnabled,
    dofFocusDistance,
    dofFocalLength,
    dofBokehScale,
    aoEnabled,
    aoIntensity,
    vignetteEnabled,
    vignetteIntensity,
  } = useControls({
    'Post Processing': folder({
      kuwaharaEnabled: true,
      kuwaharaRadius: { value: 3.5, min: 0.5, max: 10, step: 0.1 },
      kuwaharaSharpness: { value: 4.0, min: 0.5, max: 10, step: 0.1 },
      bloomEnabled: true,
      bloomIntensity: { value: 0.4, min: 0, max: 2, step: 0.1 },
      bloomThreshold: { value: 0.9, min: 0, max: 1, step: 0.05 },
      bloomSmoothing: { value: 0.6, min: 0, max: 1, step: 0.05 },
      dofEnabled: true,
      dofFocusDistance: { value: 0.01, min: 0, max: 1, step: 0.01 },
      dofFocalLength: { value: 0.02, min: 0, max: 1, step: 0.01 },
      dofBokehScale: { value: 2.0, min: 0.5, max: 10, step: 0.5 },
      aoEnabled: true,
      aoIntensity: { value: 1.0, min: 0, max: 2, step: 0.1 },
      vignetteEnabled: true,
      vignetteIntensity: { value: 0.9, min: 0, max: 2, step: 0.1 },
    }),
  });

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

// ─── Lighting & Fog System ───
// Provides directional/ambient light and atmospheric fog based on sun position

function SceneLighting() {
  const directionalLightRef = useRef();
  const moonLightRef = useRef();
  const ambientLightRef = useRef();
  const { scene } = useThree();

  const { lightX, lightY, lightZ, sunColorHex, ambientIntensity, directionalIntensity, fogColor, fogFar, moonLightIntensity, moonAmbientIntensity, moonColorHex } = useControls({
    'Time of Day': folder({
      lightX: { value: SOLAR.lightX, render: () => false },
      lightY: { value: SOLAR.lightY, render: () => false },
      lightZ: { value: SOLAR.lightZ, render: () => false },
      sunColorHex: { value: SOLAR.sunColorHex, render: () => false },
      ambientIntensity: { value: SOLAR.ambientIntensity, render: () => false },
      directionalIntensity: { value: SOLAR.directionalIntensity, render: () => false },
      fogColor: { value: SOLAR.fogColor, render: () => false },
      fogFar: { value: 2500, render: () => false },
      moonLightIntensity: { value: SOLAR.moonLightIntensity, render: () => false },
      moonAmbientIntensity: { value: SOLAR.moonAmbientIntensity, render: () => false },
      moonColorHex: { value: SOLAR.moonColorHex, render: () => false },
    }),
  });

  // Moon light direction: from moon position (45, 45, -80)
  const MOON_LIGHT_DIR = useMemo(() => new THREE.Vector3(45, 45, -80).normalize(), []);

  useEffect(() => {
    if (directionalLightRef.current) {
      directionalLightRef.current.position.set(lightX, lightY, lightZ);
      directionalLightRef.current.intensity = directionalIntensity;
      directionalLightRef.current.color.set(sunColorHex);
    }
    if (moonLightRef.current) {
      moonLightRef.current.position.copy(MOON_LIGHT_DIR.clone().multiplyScalar(500));
      moonLightRef.current.intensity = moonLightIntensity;
      moonLightRef.current.color.set(moonColorHex);
    }
    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = ambientIntensity + moonAmbientIntensity;
      // Blend ambient color: white at day, cool blue at night
      const t = moonAmbientIntensity > 0 ? moonAmbientIntensity / 0.12 : 0;
      const ambientColor = new THREE.Color(1, 1, 1).lerp(new THREE.Color(moonColorHex), t);
      ambientLightRef.current.color.copy(ambientColor);
    }
    // Update fog
    if (scene.fog) {
      scene.fog.color.set(fogColor);
      scene.fog.far = fogFar;
    }
  }, [lightX, lightY, lightZ, sunColorHex, ambientIntensity, directionalIntensity, fogColor, fogFar, moonLightIntensity, moonAmbientIntensity, moonColorHex, MOON_LIGHT_DIR, scene]);

  return (
    <>
      <ambientLight ref={ambientLightRef} color={new THREE.Color(1, 1, 1)} intensity={ambientIntensity} />
      <directionalLight
        ref={directionalLightRef}
        position={[lightX, lightY, lightZ]}
        intensity={directionalIntensity}
        color={sunColorHex}
        castShadow
      />
      <directionalLight
        ref={moonLightRef}
        position={[MOON_LIGHT_DIR.x * 500, MOON_LIGHT_DIR.y * 500, MOON_LIGHT_DIR.z * 500]}
        intensity={0}
        color="#c8d8f0"
        castShadow={false}
      />
    </>
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
      fogColor: { value: SOLAR.fogColor, render: () => false },
      fogFar: { value: 2500, render: () => false },
      skyTopHex: { value: SOLAR.skyTopHex, render: () => false },
      skyMidHex: { value: SOLAR.skyMidHex, render: () => false },
      skyHorizonHex: { value: SOLAR.skyHorizonHex, render: () => false },
      moonLightIntensity: { value: SOLAR.moonLightIntensity, render: () => false },
      moonAmbientIntensity: { value: SOLAR.moonAmbientIntensity, render: () => false },
      moonColorHex: { value: SOLAR.moonColorHex, render: () => false },
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
      fogColor: p.fogColor,
      fogFar: p.fogFar,
      skyTopHex: p.skyTopHex,
      skyMidHex: p.skyMidHex,
      skyHorizonHex: p.skyHorizonHex,
      moonLightIntensity: p.moonLightIntensity,
      moonAmbientIntensity: p.moonAmbientIntensity,
      moonColorHex: p.moonColorHex,
    });
  }, [timeOfDay, set]);

  return null;
}

// ─── Main Scene ───

function Scene() {
  const { timeOfDay, fogColor, fogFar } = useControls('Time of Day', {
    timeOfDay: { value: 12, min: 0, max: 24, step: 0.25, label: 'Hour (0–24)', render: () => false },
    fogColor: { value: SOLAR.fogColor, render: () => false },
    fogFar: { value: 2500, render: () => false },
  });

  const { scene } = useThree();

  // Initialize fog on first render
  useEffect(() => {
    if (!scene.fog) {
      scene.fog = new THREE.Fog(fogColor, 50, fogFar);
    }
  }, [scene, fogColor, fogFar]);

  return (
    <>
      <TimeOfDayController />
      <SceneLighting />
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

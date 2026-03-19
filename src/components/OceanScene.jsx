import { useMemo, useEffect, useRef, useState } from 'react';
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
import CloudSky from './CloudSky';
import StarField from './StarField';
import Moon from './Moon';
import Sun from './Sun';
import Slider from './Slider';
import { computeSolarParams } from '../utils/solar';
import { KuwaharaEffect } from '../effects/KuwaharaEffect';

function OceanWater({ timeOfDay, lightX, lightY, lightZ, sunColorHex, moonLightIntensity, moonColorHex }) {

  // Compute water color based on time of day
  const waterColorHex = useMemo(() => {
    const nightColor = '#0a191c';
    const dayColor = '#062a1f';
    const transitionColor = '#062429';

    // Sunrise: 5-8, Day: 8-18, Sunset: 18-20, Night: 20-5
    if (timeOfDay >= 8 && timeOfDay < 18) {
      // Daytime
      return dayColor;
    } else if (timeOfDay >= 5 && timeOfDay < 8) {
      // Sunrise transition
      return transitionColor;
    } else if (timeOfDay >= 18 && timeOfDay < 21) {
      // Sunset transition (smooth fade to night until 9 PM)
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

  // Check if sun is visible (6 AM to 6 PM)
  const isSunVisible = timeOfDay >= 6 && timeOfDay <= 18;

  // Calculate night factor for smooth transition (0 = fully night, 1 = day)
  const nightFactor = useMemo(() => {
    if (timeOfDay >= 7 && timeOfDay <= 17) return 1;       // full day
    if (timeOfDay >= 5 && timeOfDay < 7) return (timeOfDay - 5) / 2;  // dawn fade in
    if (timeOfDay > 17 && timeOfDay <= 21) return 1 - (timeOfDay - 17) / 4; // dusk fade out over 4 hours
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

  // Water reflection color: moon shimmer at night, fades to sun during day
  const waterSunColor = useMemo(() => {
    const moonColor = new THREE.Color(moonColorHex).multiplyScalar(moonLightIntensity * 1.5);
    if (!isSunVisible) return moonColor;
    const base = new THREE.Color(sunColorHex);
    return base.multiplyScalar(nightFactor).lerp(moonColor, 1 - nightFactor);
  }, [sunColorHex, nightFactor, isSunVisible, moonColorHex, moonLightIntensity]);

  // Reduce water distortion (reflections) at night
  const waterDistortion = useMemo(() => {
    return 3.7 * nightFactor + 2.0 * (1 - nightFactor); // 3.7 day, 2.0 night
  }, [nightFactor]);

  // Scale reflection visibility based on time of day
  const reflectionScale = useMemo(() => {
    return 0.4 + nightFactor * 0.5; // 0.4 at night → 0.9 at day
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

    // Reduce star reflection intensity by scaling the reflection texture contribution
    w.material.onBeforeCompile = (shader) => {
      shader.uniforms.uReflectionScale = { value: reflectionScale };

      // Inject uniform and modify the albedo line to scale reflections
      shader.fragmentShader = shader.fragmentShader.replace(
        'uniform vec3 waterColor;',
        'uniform vec3 waterColor;\nuniform float uReflectionScale;'
      );

      // Target the exact line from Water.js where reflections are used:
      // vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), reflectionSample + specularLight, reflectance );
      shader.fragmentShader = shader.fragmentShader.replace(
        'reflectionSample + specularLight, reflectance );',
        '(reflectionSample * uReflectionScale) + specularLight, reflectance );'
      );
    };

    return w;
  }, [waterNormals, waterSunDirection, waterSunColor, waterColorHex, waterDistortion, reflectionScale]);

  useEffect(() => {
    water.material.uniforms.sunColor.value.copy(waterSunColor);
    water.material.uniforms.sunDirection.value.copy(waterSunDirection);
    water.material.uniforms.waterColor.value.set(waterColorHex);
    if (water.material.uniforms.uReflectionScale) {
      water.material.uniforms.uReflectionScale.value = reflectionScale;
    }
  }, [water.material.uniforms, waterSunColor, waterSunDirection, waterColorHex, reflectionScale]);

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

function GradientSky({ skyTopHex, skyMidHex, skyHorizonHex }) {

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

function PostProcessing({ timeOfDay }) {
  // Receive timeOfDay as prop for bloom intensity scaling

  // Compute solar elevation for bloom intensity scaling
  const elevation = useMemo(() => {
    const progress = Math.max(0, Math.min(1, (timeOfDay - 6) / 12));
    const solarAngle = progress * Math.PI;
    return Math.sin(solarAngle);
  }, [timeOfDay]);

  // Hardcoded post-processing settings (previously exposed in Leva)
  const kuwaharaEnabled = true;
  const kuwaharaRadius = 2.0;
  const kuwaharaSharpness = 6.0;
  const bloomEnabled = true;
  const bloomIntensity = 0.4 + elevation * 0.5; // 0.4 at night/horizon → 0.9 at noon
  const bloomThreshold = 0.9;
  const bloomSmoothing = 0.6;
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

function SceneLighting({ lightX, lightY, lightZ, sunColorHex, ambientIntensity, directionalIntensity, fogColor, fogFar, moonLightIntensity, moonAmbientIntensity, moonColorHex }) {
  const directionalLightRef = useRef();
  const moonLightRef = useRef();
  const ambientLightRef = useRef();
  const { scene } = useThree();

  // Moon light direction: from moon position (35, 45, -80)
  const MOON_LIGHT_DIR = useMemo(() => new THREE.Vector3(35, 45, -80).normalize(), []);

  useEffect(() => {
    if (directionalLightRef.current) {
      directionalLightRef.current.position.set(lightX, lightY, lightZ);
      directionalLightRef.current.intensity = directionalIntensity;
      directionalLightRef.current.color.set(sunColorHex);
    }
    if (moonLightRef.current) {
      moonLightRef.current.position.copy(MOON_LIGHT_DIR.clone().multiplyScalar(500));
      moonLightRef.current.intensity = moonLightIntensity * 10;
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
        intensity={moonLightIntensity * 10}
        color="#c8d8f0"
        castShadow={false}
      />
    </>
  );
}

// ─── Main Scene ───

function Scene({ timeOfDay }) {
  const { scene } = useThree();

  // Compute all solar parameters once per timeOfDay change
  const solar = useMemo(() => computeSolarParams(timeOfDay), [timeOfDay]);

  // Initialize fog on first render with computed fog values
  useEffect(() => {
    if (!scene.fog) {
      scene.fog = new THREE.Fog(solar.fogColor, solar.fogNear, solar.fogFar);
    } else {
      // Update fog if it exists
      scene.fog.color.set(solar.fogColor);
      scene.fog.near = solar.fogNear;
      scene.fog.far = solar.fogFar;
    }
  }, [scene, solar.fogColor, solar.fogNear, solar.fogFar]);

  return (
    <>
      <SceneLighting
        lightX={solar.lightX}
        lightY={solar.lightY}
        lightZ={solar.lightZ}
        sunColorHex={solar.sunColorHex}
        ambientIntensity={solar.ambientIntensity}
        directionalIntensity={solar.directionalIntensity}
        fogColor={solar.fogColor}
        fogFar={solar.fogFar}
        moonLightIntensity={solar.moonLightIntensity}
        moonAmbientIntensity={solar.moonAmbientIntensity}
        moonColorHex={solar.moonColorHex}
      />
      <GradientSky
        skyTopHex={solar.skyTopHex}
        skyMidHex={solar.skyMidHex}
        skyHorizonHex={solar.skyHorizonHex}
      />
      <StarField timeOfDay={timeOfDay} />
      <Sun timeOfDay={timeOfDay} />
      <Moon timeOfDay={timeOfDay} />
      <CloudSky
        timeOfDay={timeOfDay}
        lightX={solar.lightX}
        lightY={solar.lightY}
        lightZ={solar.lightZ}
        sunColorHex={solar.sunColorHex}
        cloudColorHex={solar.cloudColorHex}
        shadowColorHex={solar.shadowColorHex}
        fogColor={solar.fogColor}
        fogNear={solar.fogNear}
        fogFar={solar.fogFar}
        moonLightIntensity={solar.moonLightIntensity}
        moonColorHex={solar.moonColorHex}
      />
      <OceanWater
        timeOfDay={timeOfDay}
        lightX={solar.lightX}
        lightY={solar.lightY}
        lightZ={solar.lightZ}
        sunColorHex={solar.sunColorHex}
        moonLightIntensity={solar.moonLightIntensity}
        moonColorHex={solar.moonColorHex}
      />
      <PostProcessing timeOfDay={timeOfDay} />
    </>
  );
}

export default function OceanScene({ isModalOpen }) {
  const [timeOfDay, setTimeOfDay] = useState(17); // Start at 5:00 PM

  return (
    <div className={`ocean-canvas${isModalOpen ? ' ocean-canvas--fullscreen' : ''}`}>
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
        <Scene timeOfDay={timeOfDay} />
      </Canvas>
      <div className='ocean-canvas__slider'>
         <Slider min={0} max={24} step={0.05} value={timeOfDay} onChange={setTimeOfDay} />

      </div>
    </div>
  );
}

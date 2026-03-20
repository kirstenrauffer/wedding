import { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
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
import GommageText from './GommageText';
import RippleSimulator from './RippleSimulator';
import Fireworks from './Fireworks';
import { computeSolarParams } from '../utils/solar';
import { usePetalWaterInteraction } from '../hooks/usePetalWaterInteraction';
import { KuwaharaEffect } from '../effects/KuwaharaEffect';
import { MOON_WORLD_POSITION, MOON_LIGHT_DIRECTION } from '../constants/scene';

// Helper to blend hex colors
const lerpHex = (hex1, hex2, t) => {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const lerp = (a, b, t) => a + (b - a) * t;
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  const hex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};

// Smoothstep helper for smooth transitions
const smoothstep = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function OceanWater({ timeOfDay, lightX, lightY, lightZ, sunColorHex, moonLightIntensity, moonColorHex, skyHorizonHex, rippleNormalMap, rippleConfig }) {

  // Ref to hold current rippleNormalMap (updated via effect, used in onBeforeCompile)
  const rippleNormalMapRef = useRef(null);

  // Keep ref in sync with prop
  useEffect(() => {
    rippleNormalMapRef.current = rippleNormalMap;
  }, [rippleNormalMap]);

  // Compute water color based on sky colors and time of day
  // Water reflects the sky, so use the horizon/mid sky colors but darker and more saturated
  const waterColorHex = useMemo(() => {
    const nightWaterBase = '#0a0f18';   // Cool dark blue (matches moon lighting)
    const dayWaterBase = '#0a1f2e';    // Cool deep blue (no green)

    // Blend from night to day based on time
    const SUNRISE = 5;
    const SUNSET = 18;
    const dayProgress = (timeOfDay - SUNRISE) / (SUNSET - SUNRISE);
    const clampedProgress = Math.max(0, Math.min(1, dayProgress));

    // Start with base blend
    let baseColor = lerpHex(nightWaterBase, dayWaterBase, clampedProgress);

    // Layer in sky horizon color influence (subtle, water is darker than sky)
    if (skyHorizonHex) {
      baseColor = lerpHex(baseColor, skyHorizonHex, clampedProgress * 0.15);
    }

    return baseColor;
  }, [timeOfDay, skyHorizonHex]);

  // Check if sun is visible (6 AM to 6 PM)
  const isSunVisible = timeOfDay >= 6 && timeOfDay <= 18;

  const [waterNormals, setWaterNormals] = useState(null);

  // Load water normals texture asynchronously
  useEffect(() => {
    let mounted = true;
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('/textures/waternormals.jpg', (tex) => {
      if (!mounted) return; // Ignore if component unmounted
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      setWaterNormals(tex);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Calculate night factor for smooth transition (0 = fully night, 1 = day)
  const nightFactor = useMemo(() => {
    const dawn = smoothstep(5, 7.5, timeOfDay);
    const dusk = 1 - smoothstep(17, 21, timeOfDay);
    return Math.min(dawn, dusk);
  }, [timeOfDay]);

  // Moon light direction for water reflections
  const moonLightDir = useMemo(() => MOON_LIGHT_DIRECTION.clone().normalize(), []);

  // Water reflection direction: points to sun during day, moon light direction at night
  const waterSunDirection = useMemo(() => {
    // Use sun direction when there's significant daylight (nightFactor > 0.3)
    if (nightFactor > 0.3) {
      const clampedProgress = Math.max(0, Math.min(1, (timeOfDay - 6) / 12));
      const solarAngle = clampedProgress * (Math.PI / 2);
      const x = Math.cos(solarAngle) * 100;
      return new THREE.Vector3(x, 35, -80).normalize();
    }
    return moonLightDir.clone();
  }, [timeOfDay, nightFactor, moonLightDir]);

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
    return 0.1 + nightFactor * 0.8; // 0.1 at night → 0.9 at day
  }, [nightFactor]);

  const water = useMemo(() => {
    if (!waterNormals) {
      return null;
    }
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

    // Inject ripple normals with alpha guard to avoid flattening water
    w.material.onBeforeCompile = (shader) => {
      // Create placeholder texture (1x1 neutral normal) for initialization
      // Will be replaced with actual ripple normal map when RippleSimulator is ready
      const placeholderData = new Uint8Array([127, 127, 255, 255]); // neutral normal (0, 0, 1) encoded
      const placeholderTexture = new THREE.DataTexture(placeholderData, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
      placeholderTexture.needsUpdate = true;
      shader.uniforms.uRippleNormals   = { value: rippleNormalMapRef.current || placeholderTexture };
      shader.uniforms.uRippleIntensity = { value: 0.6 };
      shader.uniforms.uRippleMinX      = { value: -60 };
      shader.uniforms.uRippleMaxX      = { value:  20 };
      shader.uniforms.uRippleMinZ      = { value: -40 };
      shader.uniforms.uRippleMaxZ      = { value:  40 };

      shader.fragmentShader = shader.fragmentShader.replace(
        'uniform vec3 waterColor;',
        `uniform vec3 waterColor;
uniform sampler2D uRippleNormals;
uniform float uRippleIntensity;
uniform float uRippleMinX;
uniform float uRippleMaxX;
uniform float uRippleMinZ;
uniform float uRippleMaxZ;`
      );

      const surfaceNormalLine = 'vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );';
      shader.fragmentShader = shader.fragmentShader.replace(
        surfaceNormalLine,
        `${surfaceNormalLine}
    {
      vec2 rippleUV = vec2(
        (worldPosition.x - uRippleMinX) / (uRippleMaxX - uRippleMinX),
        (worldPosition.z - uRippleMinZ) / (uRippleMaxZ - uRippleMinZ)
      );
      vec4 rippleData = texture2D(uRippleNormals, rippleUV);
      if (rippleData.a > 0.01) {
        vec3 rippleN = rippleData.xyz * 2.0 - 1.0;
        surfaceNormal = normalize(surfaceNormal + rippleN.xzy * uRippleIntensity);
      }
    }`
      );
    };

    return w;
  }, [waterNormals]);

  useEffect(() => {
    if (!water?.material?.uniforms) return;

    water.material.uniforms.sunColor.value.copy(waterSunColor);
    water.material.uniforms.sunDirection.value.copy(waterSunDirection);
    water.material.uniforms.waterColor.value.set(waterColorHex);
    if (water.material.uniforms.size) {
      water.material.uniforms.size.value = waterDistortion;
    }

    if (rippleConfig && water.material.uniforms.uRippleMinX) {
      water.material.uniforms.uRippleMinX.value = rippleConfig.spawnMinX;
      water.material.uniforms.uRippleMaxX.value = rippleConfig.spawnMaxX;
      water.material.uniforms.uRippleMinZ.value = rippleConfig.spawnMinZ;
      water.material.uniforms.uRippleMaxZ.value = rippleConfig.spawnMaxZ;
    }
  }, [water, waterSunColor, waterSunDirection, waterColorHex, waterDistortion, rippleConfig]);

  useFrame((_, delta) => {
    if (water?.material?.uniforms?.time) {
      water.material.uniforms.time.value += delta * 0.3;
    }
    // Keep ripple uniform updated every frame in case it changes
    if (water?.material?.uniforms?.uRippleNormals && rippleNormalMapRef.current) {
      water.material.uniforms.uRippleNormals.value = rippleNormalMapRef.current;
    }
  });

  if (!water) return null;
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

  // Moon light direction: separate from visual moon position for balanced lighting
  const MOON_LIGHT_DIR = useMemo(() => MOON_LIGHT_DIRECTION.clone().normalize(), []);

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
  const petalDataRef = useRef();
  const rippleSimulatorRef = useRef();
  const [rippleNormalMap, setRippleNormalMap] = useState(null);

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

  // Ripple system configuration (must match petal spawn ranges from GommageText)
  const rippleConfig = useMemo(() => ({
    spawnMinX: -60,
    spawnMaxX: 20,
    spawnMinZ: -40,
    spawnMaxZ: 40,
  }), []);

  // Memoize the ripple simulator onReady callback to prevent infinite loops
  const handleRippleReady = useCallback((api) => {
    rippleSimulatorRef.current = api;
    setRippleNormalMap(api.getNormalMap());
  }, []);

  // Set up petal-water interaction with ripple simulator
  usePetalWaterInteraction(
    petalDataRef,
    (normalizedX, normalizedZ) => {
      if (rippleSimulatorRef.current?.addDrop) {
        rippleSimulatorRef.current.addDrop(normalizedX, normalizedZ);
      }
    },
    rippleConfig,
    timeOfDay
  );

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
      <Fireworks timeOfDay={timeOfDay} />
      <GommageText ref={petalDataRef} timeOfDay={timeOfDay} />
      <RippleSimulator onReady={handleRippleReady} />
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
        skyHorizonHex={solar.skyHorizonHex}
        rippleNormalMap={rippleNormalMap}
        rippleConfig={rippleConfig}
      />
      <PostProcessing timeOfDay={timeOfDay} />
    </>
  );
}

export default function OceanScene({ isModalOpen }) {
  const [timeOfDay, setTimeOfDay] = useState(17); // Start at 5:00 PM
  const [sliderVisible, setSliderVisible] = useState(true);
  const containerRef = useRef();
  const homeRectRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (isModalOpen) {
      // Clear any pending close animation timeout
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }

      // Hide slider (fades via CSS transition)
      setSliderVisible(false);

      // Capture current viewport position before style change
      const rect = el.getBoundingClientRect();
      homeRectRef.current = rect;

      // Calculate transforms to make fullscreen element appear at original position/size
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const scaleX = rect.width / window.innerWidth;
      const scaleY = rect.height / window.innerHeight;
      const tX = centerX - window.innerWidth / 2;
      const tY = centerY - window.innerHeight / 2;

      // Set to fullscreen size with transform that makes it look like original position/size
      Object.assign(el.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        maxHeight: 'none',
        margin: '0',
        zIndex: '500',
        overflow: 'hidden',
        borderRadius: '40px',
        transformOrigin: 'center center',
        transform: `translate(${tX}px, ${tY}px) scale(${scaleX}, ${scaleY})`,
      });

      // Two rAFs: ensure browser paints initial state before transition fires
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Object.assign(el.style, {
            transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.4s ease',
            transform: 'translate(0, 0) scale(1)',
            borderRadius: '0',
          });
        });
      });

    } else if (homeRectRef.current) {
      // Calculate transforms to animate back to original position/size
      const rect = homeRectRef.current;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const scaleX = rect.width / window.innerWidth;
      const scaleY = rect.height / window.innerHeight;
      const tX = centerX - window.innerWidth / 2;
      const tY = centerY - window.innerHeight / 2;

      // Two rAFs: ensure browser paints expanded state before transition to card state fires
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          Object.assign(el.style, {
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.3s ease',
            transform: `translate(${tX}px, ${tY}px) scale(${scaleX}, ${scaleY})`,
            borderRadius: '40px',
          });
        });
      });

      // After collapse animation completes, restore to normal CSS flow and fade slider back in
      // console.log('Setting up close animation timeout...');
      closeTimeoutRef.current = setTimeout(() => {
        // console.log('Close animation timeout fired, clearing styles', el.getAttribute('style'));
        // Explicitly remove all inline styles
        el.style.position = '';
        el.style.top = '';
        el.style.left = '';
        el.style.width = '';
        el.style.height = '';
        el.style.maxHeight = '';
        el.style.margin = '';
        el.style.zIndex = '';
        el.style.overflow = '';
        el.style.borderRadius = '';
        el.style.transform = '';
        el.style.transition = '';
        el.style.transformOrigin = '';

        // console.log('After clearing:', el.getAttribute('style'));
        homeRectRef.current = null;
        setSliderVisible(true);
        closeTimeoutRef.current = null;
      }, 350); // 0.3s animation + 50ms buffer
    }
  }, [isModalOpen]);

  // Handle scroll wheel to adjust time-of-day slider
  useEffect(() => {
    const handleWheel = (e) => {
      if (isModalOpen) return; // let modal content scroll normally
      e.preventDefault();
      const step = 0.25; // 15 minutes per scroll tick
      setTimeOfDay(prev => Math.min(24, Math.max(0, prev + (e.deltaY > 0 ? step : -step))));
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [isModalOpen]);

  return (
    <div ref={containerRef} className="ocean-canvas">
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
      <div className={`ocean-canvas__slider${sliderVisible ? '' : ' ocean-canvas__slider--hidden'}`}>
        <Slider min={0} max={24} step={0.05} value={timeOfDay} onChange={setTimeOfDay} />
      </div>
    </div>
  );
}

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  DepthOfField,
  ToneMapping,
  Vignette,
  SMAA,
  N8AO,
} from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { useControls, folder } from 'leva';
import CloudSky from './CloudSky';
import StarField from './StarField';
import { SOLAR, computeSolarParams } from '../utils/solar';

// ─── Custom Water Shader (extended from Three.js Water) ───
// Adds: Fresnel attenuation, depth-based absorption, subsurface scattering,
// caustics pattern, soft foam, distance fog/blur

const CUSTOM_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D mirrorSampler;
  uniform float alpha;
  uniform float time;
  uniform float size;
  uniform float distortionScale;
  uniform sampler2D normalSampler;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec3 eye;
  uniform vec3 waterColor;

  // Custom uniforms
  uniform float choppiness;
  uniform float fresnelStrength;
  uniform float absorptionCoeff;
  uniform vec3 deepWaterColor;
  uniform float foamStrength;
  uniform float scatterStrength;
  uniform vec3 scatterColor;
  uniform float specularShininess;
  uniform float specularStrength;
  uniform float refractionStrength;
  uniform samplerCube envMap;
  uniform float envMapIntensity;

  varying vec4 mirrorCoord;
  varying vec4 worldPosition;

  vec4 getNoise(vec2 uv) {
    float chop = choppiness;
    vec2 uv0 = (uv / 103.0) + vec2(time / 17.0, time / 29.0);
    vec2 uv1 = uv / 107.0 - vec2(time / -19.0, time / 31.0);
    vec2 uv2 = uv / vec2(8907.0, 9803.0) + vec2(time / 101.0, time / 97.0);
    vec2 uv3 = uv / vec2(1091.0, 1027.0) - vec2(time / 109.0, time / -113.0);
    vec4 noise = texture2D(normalSampler, uv0) +
      texture2D(normalSampler, uv1) +
      texture2D(normalSampler, uv2) +
      texture2D(normalSampler, uv3);
    return noise * 0.5 * chop - chop;
  }

  void sunLight(const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor) {
    vec3 reflection = normalize(reflect(-sunDirection, surfaceNormal));
    float direction = max(0.0, dot(eyeDirection, reflection));
    specularColor += pow(direction, shiny) * sunColor * spec * specularStrength;
    diffuseColor += max(dot(sunDirection, surfaceNormal), 0.0) * sunColor * diffuse;
  }

  #include <common>
  #include <packing>
  #include <bsdfs>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  // Reinhard tone-map — clamps unbounded HDR sky values to [0,1) range
  vec3 envTonemap(vec3 c) {
    return c / (1.0 + c);
  }

  void main() {
    #include <logdepthbuf_fragment>

    vec4 noise = getNoise(worldPosition.xz * size);
    vec3 surfaceNormal = normalize(noise.xzy * vec3(1.5, 1.0, 1.5));

    vec3 diffuseLight = vec3(0.0);
    vec3 specularLight = vec3(0.0);

    vec3 worldToEye = eye - worldPosition.xyz;
    vec3 eyeDirection = normalize(worldToEye);
    float distanceToEye = length(worldToEye);

    sunLight(surfaceNormal, eyeDirection, specularShininess, 1.0, 0.3, diffuseLight, specularLight);

    // Refraction distortion
    vec2 distortion = surfaceNormal.xz * (0.001 + 1.0 / distanceToEye) * distortionScale;
    vec2 refrDistortion = distortion * refractionStrength;

    // Planar mirror reflection sample — tone-map since it captures raw HDR scene
    vec3 mirrorReflection = envTonemap(vec3(texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion)));

    // Refraction sample
    vec3 refractionSample = envTonemap(vec3(texture2D(mirrorSampler, mirrorCoord.xy / mirrorCoord.w + refrDistortion * 1.5)));

    // Environment map samples — tone-mapped so HDR sky doesn't blow out to white
    vec3 smoothReflDir = reflect(-eyeDirection, mix(vec3(0.0, 1.0, 0.0), surfaceNormal, 0.6));
    vec3 envReflection = envTonemap(textureCube(envMap, smoothReflDir).rgb);

    vec3 horizonDir = normalize(vec3(eyeDirection.x, 0.01, eyeDirection.z));
    vec3 envHorizon = envTonemap(textureCube(envMap, horizonDir).rgb);

    vec3 envSkyUp = envTonemap(textureCube(envMap, vec3(0.0, 1.0, 0.0)).rgb);
    vec3 envSkyAmbient = mix(envSkyUp, envHorizon, 0.3);

    // Blend env reflection into planar mirror — keep subtle, mirror is more accurate
    vec3 reflectionSample = mix(mirrorReflection, envReflection, envMapIntensity * 0.35);

    // Fresnel (Schlick approximation) with configurable strength
    float cosTheta = max(dot(eyeDirection, surfaceNormal), 0.0);
    float rf0 = 0.02 * fresnelStrength;
    float reflectance = rf0 + (1.0 - rf0) * pow(1.0 - cosTheta, 5.0);

    // Depth-based absorption / attenuation
    float depthFactor = 1.0 - exp(-absorptionCoeff * 0.01 * distanceToEye);
    vec3 absorbedColor = mix(waterColor, deepWaterColor, depthFactor);

    // Subtle sky ambient tint — lerp toward sky-tinted version, not raw multiply
    float skyTintAmt = envMapIntensity * 0.15;
    absorbedColor = mix(absorbedColor, absorbedColor * (vec3(0.5) + envSkyAmbient * 0.5), skyTintAmt);

    // Subsurface scattering — mostly sun colored, slight sky tint
    float sss = pow(max(0.0, dot(eyeDirection, -sunDirection)), 4.0) * scatterStrength;
    vec3 sssLight = mix(sunColor, sunColor * (vec3(0.7) + envSkyAmbient * 0.3), envMapIntensity * 0.2);
    vec3 subsurface = sss * scatterColor * sssLight;

    // Foam at wave peaks
    float foamFactor = smoothstep(0.5, 1.0, noise.y * 0.5 + 0.5) * foamStrength;
    vec3 foam = vec3(foamFactor) * sssLight;

    // Combine: scatter + absorbed color base, blend with reflections via fresnel
    vec3 scatter = max(0.0, dot(surfaceNormal, eyeDirection)) * absorbedColor;
    vec3 waterBase = sunColor * diffuseLight * 0.3 + scatter + subsurface;

    // Mix refraction into the base
    vec3 refractedBase = mix(waterBase, refractionSample * absorbedColor, (1.0 - reflectance) * 0.3);

    vec3 albedo = mix(refractedBase * getShadowMask(), reflectionSample, reflectance);
    albedo += specularLight * (1.0 - reflectance) * 0.5;
    albedo += foam;

    gl_FragColor = vec4(albedo, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ─── Ocean Water Component ───

function OceanWater() {
  const needsEnvUpdate = useRef(true);
  const { scene } = useThree();

  // CubeCamera for capturing sky into an environment map
  const cubeRenderTarget = useMemo(
    () => new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }),
    []
  );
  const cubeCamera = useMemo(
    () => new THREE.CubeCamera(1, 500000, cubeRenderTarget),
    [cubeRenderTarget]
  );

  const {
    lightX,
    lightY,
    lightZ,
    waterColorHex,
    deepWaterColorHex,
    sunColorHex,
    distortionScale,
    waveSize,
    waveSpeed,
    choppiness,
    fresnelStrength,
    absorptionCoeff,
    foamStrength,
    scatterStrength,
    scatterColorHex,
    specularShininess,
    specularStrength,
    refractionStrength,
    reflectionResolution,
    alpha,
    envMapIntensity,
  } = useControls({
    'Light Position': folder({
      lightX: { value: SOLAR.lightX, min: -500, max: 500, step: 1, label: 'X' },
      lightY: { value: SOLAR.lightY, min: -100, max: 500, step: 1, label: 'Y' },
      lightZ: { value: SOLAR.lightZ, min: -500, max: 500, step: 1, label: 'Z' },
      sunColorHex: { value: SOLAR.sunColorHex, label: 'Color' },
    }),
    Water: folder({
      waterColorHex: { value: '#1A4A6A', label: 'Shallow Color' },
      deepWaterColorHex: { value: '#0A2540', label: 'Deep Color' },
      alpha: { value: 1.0, min: 0, max: 1, step: 0.01, label: 'Alpha' },
    }),
    Waves: folder({
      distortionScale: { value: 3.7, min: 0, max: 20, step: 0.1, label: 'Distortion' },
      waveSize: { value: 1.0, min: 0.1, max: 10, step: 0.1, label: 'Size' },
      waveSpeed: { value: 0.3, min: 0, max: 5, step: 0.1, label: 'Speed' },
      choppiness: { value: 1.0, min: 0.1, max: 3.0, step: 0.05, label: 'Choppiness' },
    }),
    Reflections: folder({
      fresnelStrength: { value: 1.0, min: 0, max: 5, step: 0.1, label: 'Fresnel' },
      reflectionResolution: { value: 1024, min: 256, max: 2048, step: 256, label: 'Resolution' },
      specularShininess: { value: 100, min: 10, max: 500, step: 10, label: 'Shininess' },
      specularStrength: { value: 1.0, min: 0, max: 3, step: 0.1, label: 'Specular' },
    }),
    Refraction: folder({
      refractionStrength: { value: 1.0, min: 0, max: 3, step: 0.1, label: 'Strength' },
      absorptionCoeff: { value: 0.8, min: 0, max: 5, step: 0.1, label: 'Absorption' },
    }),
    Foam: folder({
      foamStrength: { value: 0.15, min: 0, max: 1, step: 0.01, label: 'Strength' },
    }),
    Scattering: folder({
      scatterStrength: { value: 0.05, min: 0, max: 2, step: 0.05, label: 'Strength' },
      scatterColorHex: { value: '#228ba3', label: 'Color' },
    }),
    'Environment': folder({
      envMapIntensity: { value: 1.0, min: 0, max: 2, step: 0.05, label: 'Sky Influence' },
    }),
  });

  // Read sky colors so env map updates when sky changes
  const { skyTopHex, skyMidHex, skyHorizonHex } = useControls({
    Sky: folder({
      skyTopHex: { value: '#1E5B8E' },
      skyMidHex: { value: '#4A90C4' },
      skyHorizonHex: { value: '#87BBDA' },
    }),
  });

  // Flag env map update when sky colors change
  useEffect(() => {
    needsEnvUpdate.current = true;
  }, [skyTopHex, skyMidHex, skyHorizonHex]);

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
      textureWidth: reflectionResolution,
      textureHeight: reflectionResolution,
      waterNormals,
      sunDirection,
      sunColor: new THREE.Color(sunColorHex),
      waterColor: new THREE.Color(waterColorHex),
      distortionScale,
      fog: false,
      alpha,
    });

    // Replace fragment shader with our custom one
    w.material.fragmentShader = CUSTOM_FRAGMENT_SHADER;

    // Add custom uniforms
    w.material.uniforms.choppiness = { value: choppiness };
    w.material.uniforms.fresnelStrength = { value: fresnelStrength };
    w.material.uniforms.absorptionCoeff = { value: absorptionCoeff };
    w.material.uniforms.deepWaterColor = { value: new THREE.Color(deepWaterColorHex) };
    w.material.uniforms.foamStrength = { value: foamStrength };
    w.material.uniforms.scatterStrength = { value: scatterStrength };
    w.material.uniforms.scatterColor = { value: new THREE.Color(scatterColorHex) };
    w.material.uniforms.specularShininess = { value: specularShininess };
    w.material.uniforms.specularStrength = { value: specularStrength };
    w.material.uniforms.refractionStrength = { value: refractionStrength };
    w.material.uniforms.envMap = { value: cubeRenderTarget.texture };
    w.material.uniforms.envMapIntensity = { value: envMapIntensity };

    w.material.needsUpdate = true;
    w.rotation.x = -Math.PI / 2;

    return w;
    // Only recreate on resolution change (requires new render target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reflectionResolution, waterNormals, cubeRenderTarget]);

  // Update uniforms reactively without recreating the water object
  useEffect(() => {
    const u = water.material.uniforms;
    u.sunDirection.value.copy(sunDirection);
    u.sunColor.value.set(sunColorHex);
    u.waterColor.value.set(waterColorHex);
    u.distortionScale.value = distortionScale;
    u.alpha.value = alpha;
    u.size.value = waveSize;
    u.choppiness.value = choppiness;
    u.fresnelStrength.value = fresnelStrength;
    u.absorptionCoeff.value = absorptionCoeff;
    u.deepWaterColor.value.set(deepWaterColorHex);
    u.foamStrength.value = foamStrength;
    u.scatterStrength.value = scatterStrength;
    u.scatterColor.value.set(scatterColorHex);
    u.specularShininess.value = specularShininess;
    u.specularStrength.value = specularStrength;
    u.refractionStrength.value = refractionStrength;
    u.envMapIntensity.value = envMapIntensity;
    needsEnvUpdate.current = true;
  }, [
    water, sunDirection, sunColorHex, waterColorHex, distortionScale, alpha,
    waveSize, choppiness, fresnelStrength, absorptionCoeff, deepWaterColorHex,
    foamStrength, scatterStrength, scatterColorHex,
    specularShininess, specularStrength, refractionStrength, envMapIntensity,
  ]);

  useFrame(({ gl: renderer, scene: sc }, delta) => {
    // Update env map when sky/light params changed
    if (needsEnvUpdate.current) {
      water.visible = false;
      cubeCamera.position.set(0, 0, 0);
      cubeCamera.update(renderer, sc);
      water.visible = true;
      water.material.uniforms.envMap.value = cubeRenderTarget.texture;
      needsEnvUpdate.current = false;
    }
    water.material.uniforms.time.value += delta * waveSpeed;
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
    Sky: folder({
      skyTopHex: { value: '#1E5B8E', label: 'Top' },
      skyMidHex: { value: '#4A90C4', label: 'Mid' },
      skyHorizonHex: { value: '#87BBDA', label: 'Horizon' },
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

// ─── Lighting ───

function SceneLighting() {
  const { lightX, lightY, lightZ, sunColorHex } = useControls({
    'Light Position': folder({
      lightX: { value: SOLAR.lightX },
      lightY: { value: SOLAR.lightY },
      lightZ: { value: SOLAR.lightZ },
      sunColorHex: { value: SOLAR.sunColorHex },
    }),
  });

  const {
    ambientIntensity,
    directionalIntensity,
    shadowsEnabled,
  } = useControls({
    Lighting: folder({
      ambientIntensity: { value: SOLAR.ambientIntensity, min: 0, max: 2, step: 0.05, label: 'Ambient' },
      directionalIntensity: { value: SOLAR.directionalIntensity, min: 0, max: 5, step: 0.1, label: 'Directional' },
      shadowsEnabled: { value: true, label: 'Soft Shadows' },
    }),
  });

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight
        position={[lightX, lightY, lightZ]}
        color={sunColorHex}
        intensity={directionalIntensity}
        castShadow={shadowsEnabled}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0001}
        shadow-camera-far={500}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-radius={4}
      />
    </>
  );
}

// ─── Post Processing ───

function PostProcessing() {
  const {
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
      Bloom: folder({
        bloomEnabled: { value: true, label: 'Enabled' },
        bloomIntensity: { value: 0.3, min: 0, max: 3, step: 0.05, label: 'Intensity' },
        bloomThreshold: { value: 0.95, min: 0, max: 1, step: 0.01, label: 'Threshold' },
        bloomSmoothing: { value: 0.3, min: 0, max: 1, step: 0.01, label: 'Smoothing' },
      }),
      'Depth of Field': folder({
        dofEnabled: { value: true, label: 'Enabled' },
        dofFocusDistance: { value: 0.01, min: 0, max: 1, step: 0.001, label: 'Focus Distance' },
        dofFocalLength: { value: 0.02, min: 0, max: 0.1, step: 0.001, label: 'Focal Length' },
        dofBokehScale: { value: 2.0, min: 0, max: 10, step: 0.1, label: 'Bokeh Scale' },
      }),
      'Ambient Occlusion': folder({
        aoEnabled: { value: true, label: 'Enabled' },
        aoIntensity: { value: 1.0, min: 0, max: 5, step: 0.1, label: 'Intensity' },
      }),
      Vignette: folder({
        vignetteEnabled: { value: true, label: 'Enabled' },
        vignetteIntensity: { value: 0.9, min: 0, max: 1, step: 0.01, label: 'Intensity' },
      }),
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
    }),
    'Light Position': folder({
      lightX: { value: SOLAR.lightX },
      lightY: { value: SOLAR.lightY },
      lightZ: { value: SOLAR.lightZ },
      sunColorHex: { value: SOLAR.sunColorHex },
    }),
    Sky: folder({
      skyTopHex: { value: SOLAR.skyTopHex },
      skyMidHex: { value: SOLAR.skyMidHex },
      skyHorizonHex: { value: SOLAR.skyHorizonHex },
    }),
    Clouds: folder({
      cloudColorHex: { value: SOLAR.cloudColorHex },
      shadowColorHex: { value: SOLAR.shadowColorHex },
    }),
    Lighting: folder({
      ambientIntensity: { value: SOLAR.ambientIntensity },
      directionalIntensity: { value: SOLAR.directionalIntensity },
    }),
  }));

  useEffect(() => {
    const p = computeSolarParams(timeOfDay);
    set({
      lightX: p.lightX,
      lightY: p.lightY,
      lightZ: p.lightZ,
      sunColorHex: p.sunColorHex,
      skyTopHex: p.skyTopHex,
      skyMidHex: p.skyMidHex,
      skyHorizonHex: p.skyHorizonHex,
      cloudColorHex: p.cloudColorHex,
      shadowColorHex: p.shadowColorHex,
      ambientIntensity: p.ambientIntensity,
      directionalIntensity: p.directionalIntensity,
    });
  }, [timeOfDay, set]);

  return null;
}

// ─── Main Scene ───

function Scene() {
  return (
    <>
      <TimeOfDayController />
      <SceneLighting />
      <GradientSky />
      <StarField />
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

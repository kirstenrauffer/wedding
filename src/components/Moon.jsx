import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useControls, folder } from 'leva';
import { SOLAR } from '../utils/solar';

const MOON_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vViewDir = normalize(cameraPosition - worldPos);
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MOON_FRAGMENT = /* glsl */ `
  uniform sampler2D moonTexture;
  uniform float moonOpacity;
  uniform vec3 moonLightDir;
  uniform vec3 moonTint;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    // Sample crater texture
    vec3 textureColor = texture2D(moonTexture, vUv).rgb;

    // Strong directional lighting from dynamic light direction
    vec3 lightDir = normalize(moonLightDir);
    float diffuse = max(0.15, dot(vNormal, lightDir));

    // Rim lighting for depth
    float rim = pow(1.0 - dot(vNormal, vViewDir), 2.0) * 0.25;

    // Combine texture with lighting (preserves crater detail)
    vec3 lit = textureColor * (diffuse + 0.5) + rim;

    // Apply sunset tint
    lit = mix(lit, lit * moonTint, 0.6);

    gl_FragColor = vec4(lit, moonOpacity);
  }
`;

// Calculate moon opacity based on time of day
function calculateMoonOpacity(hour) {
  // Sunrise: fade out from 5:00 to 7:00
  if (hour >= 5 && hour < 7) {
    return 1.0 - (hour - 5) / 2.0; // smoothly fade 1 → 0
  }
  // Daytime: fully invisible
  if (hour >= 7 && hour < 17) {
    return 0.0;
  }
  // Sunset: fade in from 17:00 to 19:00
  if (hour >= 17 && hour < 19) {
    return (hour - 17) / 2.0; // smoothly fade 0 → 1
  }
  // Nighttime: fully visible (including 0:00–5:00)
  return 1.0;
}

// Calculate moon tint based on time of day
function calculateMoonTint(hour) {
  // Red tint during sunset (17:00-19:00)
  if (hour >= 17 && hour < 19) {
    // Peak red intensity around 18:00 (midpoint)
    const sunsetProgress = (hour - 17) / 2.0;
    const tintIntensity = Math.sin(sunsetProgress * Math.PI) * 0.8; // peak at 0.8
    // Blend from white (1,1,1) to red (1,0.4,0.2)
    return new THREE.Color(1, 1, 1).lerp(new THREE.Color(1, 0.4, 0.2), tintIntensity);
  }
  // Default white (no tint)
  return new THREE.Color(1, 1, 1);
}

// Create moon texture with detailed craters
function createMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Fill with base color
  ctx.fillStyle = '#9c9c96';
  ctx.fillRect(0, 0, 512, 512);

  // Add lunar maria (dark patches) before craters
  const mariaCount = 4;
  for (let i = 0; i < mariaCount; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = Math.random() * 70 + 60;

    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, 'rgba(80, 80, 75, 0.4)');
    grad.addColorStop(1, 'rgba(80, 80, 75, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Generate crater positions upfront for consistency
  const craters = [];

  // Small craters (75 total, radius 4.5–9px)
  for (let i = 0; i < 75; i++) {
    craters.push({
      x: Math.random() * 512,
      y: Math.random() * 512,
      radius: Math.random() * 4.5 + 4.5,
      size: 'small'
    });
  }

  // Medium craters (22 total, radius 9–21px)
  for (let i = 0; i < 22; i++) {
    craters.push({
      x: Math.random() * 512,
      y: Math.random() * 512,
      radius: Math.random() * 12 + 9,
      size: 'medium'
    });
  }

  // Large craters (8 total, radius 22.5–42px)
  for (let i = 0; i < 8; i++) {
    craters.push({
      x: Math.random() * 512,
      y: Math.random() * 512,
      radius: Math.random() * 19.5 + 22.5,
      size: 'large'
    });
  }

  // Draw each crater with depth layers
  craters.forEach(crater => {
    const { x, y, radius, size } = crater;

    if (size === 'small') {
      // Small craters: dark center
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, 'rgba(50, 50, 48, 1.0)');
      grad.addColorStop(1, 'rgba(70, 70, 68, 0.4)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Medium and large: full crater with layers

      // Ejecta halo (outermost)
      const haloGrad = ctx.createRadialGradient(x, y, radius, x, y, radius * 1.8);
      haloGrad.addColorStop(0, 'rgba(200, 200, 195, 0.5)');
      haloGrad.addColorStop(1, 'rgba(200, 200, 195, 0.0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Bowl shadow (lower-right crescent) - larger
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      const shadowGrad = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
      shadowGrad.addColorStop(0, 'rgba(40, 40, 38, 0.0)');
      shadowGrad.addColorStop(0.4, 'rgba(40, 40, 38, 0.9)');
      shadowGrad.addColorStop(1, 'rgba(40, 40, 38, 0.1)');
      ctx.fillStyle = shadowGrad;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      ctx.restore();

      // Rim highlight (upper-left crescent)
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.clip();
      const rimGrad = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
      rimGrad.addColorStop(0, 'rgba(255, 255, 250, 0.9)');
      rimGrad.addColorStop(0.5, 'rgba(255, 255, 250, 0.3)');
      rimGrad.addColorStop(1, 'rgba(255, 255, 250, 0.0)');
      ctx.fillStyle = rimGrad;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius);
      ctx.restore();

      // Crater floor (subtle bright center)
      const floorGrad = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.3);
      floorGrad.addColorStop(0, 'rgba(160, 160, 155, 0.4)');
      floorGrad.addColorStop(1, 'rgba(160, 160, 155, 0.0)');
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Add subtle surface noise to break up smoothness
  for (let y = 0; y < 512; y += 8) {
    for (let x = 0; x < 512; x += 8) {
      const noise = Math.random() * 50 + 100; // 100–150 gray
      ctx.fillStyle = `rgba(${noise}, ${noise}, ${noise}, 0.12)`;
      ctx.fillRect(x, y, 8, 8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

export default function Moon({ timeOfDay = 12 }) {
  const meshRef = useRef();
  const materialRef = useRef();

  // Moon position: in the sky, visible from camera
  const moonPosition = new THREE.Vector3(45, 45, -80);

  // Read light direction from Leva (solar system)
  const { lightX, lightY, lightZ } = useControls({
    'Time of Day': folder({
      lightX: { value: SOLAR.lightX, render: () => false },
      lightY: { value: SOLAR.lightY, render: () => false },
      lightZ: { value: SOLAR.lightZ, render: () => false },
    }),
  });

  // Create crater texture once
  const craterTexture = useMemo(() => createMoonTexture(), []);

  // Create uniforms once, mutate in-place when opacity changes
  const uniforms = useMemo(() => ({
    moonTexture: { value: craterTexture },
    moonOpacity: { value: 1.0 },
    moonLightDir: { value: new THREE.Vector3(0.3, 0.5, 0.2) },
    moonTint: { value: new THREE.Color(1, 1, 1) },
  }), [craterTexture]);

  // Calculate opacity and tint based on time of day
  const moonOpacity = useMemo(() => calculateMoonOpacity(timeOfDay), [timeOfDay]);
  const moonTint = useMemo(() => calculateMoonTint(timeOfDay), [timeOfDay]);

  // Update uniform values when opacity, tint, or light direction changes
  useEffect(() => {
    uniforms.moonOpacity.value = moonOpacity;
    uniforms.moonTint.value.copy(moonTint);
    uniforms.moonLightDir.value.set(lightX, lightY, lightZ).normalize();
  }, [moonOpacity, moonTint, lightX, lightY, lightZ, uniforms]);

  return (
    <mesh ref={meshRef} position={moonPosition} scale={3.75}>
      <sphereGeometry args={[1, 128, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={MOON_VERTEX}
        fragmentShader={MOON_FRAGMENT}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';

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

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec2 vUv;

  void main() {
    // Sample crater texture
    vec3 textureColor = texture2D(moonTexture, vUv).rgb;

    // Strong directional lighting
    vec3 lightDir = normalize(vec3(0.3, 0.5, 0.2));
    float diffuse = max(0.15, dot(vNormal, lightDir));

    // Rim lighting for depth
    float rim = pow(1.0 - dot(vNormal, vViewDir), 2.0) * 0.25;

    // Combine texture with lighting (preserves crater detail)
    vec3 lit = textureColor * (diffuse + 0.5) + rim;

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

// Create moon texture with craters
function createMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Fill with base color
  ctx.fillStyle = '#d0d0c8';
  ctx.fillRect(0, 0, 512, 512);

  // Add visible but stylized craters
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = Math.random() * 12 + 2;

    ctx.fillStyle = `rgba(150, 150, 145, 0.4)`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
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
  const moonPosition = new THREE.Vector3(20, 45, -80);

  // Create crater texture once
  const craterTexture = useMemo(() => createMoonTexture(), []);

  // Create uniforms once, mutate in-place when opacity changes
  const uniforms = useMemo(() => ({
    moonTexture: { value: craterTexture },
    moonOpacity: { value: 1.0 },
  }), [craterTexture]);

  // Calculate opacity based on time of day
  const moonOpacity = useMemo(() => calculateMoonOpacity(timeOfDay), [timeOfDay]);

  // Update uniform value when opacity changes
  useEffect(() => {
    uniforms.moonOpacity.value = moonOpacity;
  }, [moonOpacity, uniforms]);

  return (
    <mesh ref={meshRef} position={moonPosition} scale={5}>
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

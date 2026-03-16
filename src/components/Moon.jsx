import { useRef, useMemo, useEffect } from 'react';
import { useControls, folder } from 'leva';
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

    gl_FragColor = vec4(lit, 1.0);
  }
`;

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

export default function Moon() {
  const meshRef = useRef();
  const materialRef = useRef();

  const { timeOfDay } = useControls({
    'Time of Day': folder({
      timeOfDay: { value: 12, min: 0, max: 24, step: 0.25, label: 'Hour (0–24)', render: () => false },
    }),
  });

  // Moon only visible between sunset (18) and sunrise (6)
  const isNighttime = timeOfDay >= 18 || timeOfDay < 6;

  // Update material opacity when timeOfDay changes
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.opacity = isNighttime ? 1 : 0;
    }
  }, [isNighttime]);

  // Moon position: in the sky, visible from camera
  const moonPosition = new THREE.Vector3(20, 45, -80);

  // Create crater texture once
  const craterTexture = useMemo(() => createMoonTexture(), []);

  return (
    <mesh ref={meshRef} position={moonPosition} scale={5}>
      <sphereGeometry args={[1, 128, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={MOON_VERTEX}
        fragmentShader={MOON_FRAGMENT}
        uniforms={{
          moonTexture: { value: craterTexture },
        }}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

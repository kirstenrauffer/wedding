import { useRef, useMemo, useEffect } from 'react';
import { useControls, folder } from 'leva';
import * as THREE from 'three';

const SUN_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vViewDir = normalize(cameraPosition - worldPos);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAGMENT = /* glsl */ `
  uniform vec3 sunColor;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec3 viewDir = normalize(vViewDir);
    float facing = dot(vNormal, viewDir);
    if (facing < 0.0) discard;
    gl_FragColor = vec4(sunColor * 1.5, 1.0);
  }
`;

export default function Sun() {
  const meshRef = useRef();

  // Read timeOfDay from leva like Moon does
  const { timeOfDay } = useControls({
    'Time of Day': folder({
      timeOfDay: { value: 12, min: 0, max: 24, step: 0.25, label: 'Hour (0–24)' },
    }),
  });

  // Calculate sun color based on timeOfDay
  const sunColor = useMemo(() => {
    let colorHex;
    if (timeOfDay < 6.5) colorHex = '#FF4444'; // Red
    else if (timeOfDay < 9) colorHex = '#FF8844'; // Orange
    else if (timeOfDay < 15) colorHex = '#FFFFFF'; // White
    else if (timeOfDay < 18) colorHex = '#FF8844'; // Orange
    else colorHex = '#FF4444'; // Red
    return new THREE.Color(colorHex);
  }, [timeOfDay]);

  // Memoize uniforms so React detects changes
  const uniforms = useMemo(() => ({
    sunColor: { value: sunColor },
  }), [sunColor]);

  // Sun position based on time of day
  const sunPosition = useMemo(() => {
    const progress = (timeOfDay - 6) / 12;
    const angle = progress * Math.PI;
    return new THREE.Vector3(
      Math.sin(angle) * 60,
      Math.sin(angle) * 25 + 20,
      -80
    );
  }, [timeOfDay]);

  const isSunAboveOcean = sunPosition.y > 5;
  const isSunVisible = timeOfDay >= 6 && timeOfDay <= 18;

  // Force material update when uniforms change
  useEffect(() => {
    if (meshRef.current?.material) {
      meshRef.current.material.needsUpdate = true;
    }
  }, [uniforms]);

  if (!isSunVisible || !isSunAboveOcean) return null;

  return (
    <>
      <pointLight position={sunPosition} color={sunColor} intensity={1.5} distance={800} />
      <mesh ref={meshRef} position={sunPosition} scale={5}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          vertexShader={SUN_VERTEX}
          fragmentShader={SUN_FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

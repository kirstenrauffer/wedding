import { useRef, useMemo, useEffect, forwardRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { PETAL_VERT, PETAL_FRAG, GOMMAGE_CONFIG } from '../shaders/gommage';

const { maxPetals } = GOMMAGE_CONFIG;

// ─── Ghibli Color Palette ────────────────────────────────────────────────────

const PETAL_PALETTE = [
  [0xff, 0x3d, 0x5f], // 0: vibrant red
  [0xff, 0x9d, 0x5c], // 1: warm coral
  [0x5f, 0xff, 0xb3], // 2: bright mint
  [0xdd, 0x7f, 0xff], // 3: bright magenta
  [0xff, 0xf0, 0x4d], // 4: bright yellow
  [0xff, 0x2d, 0x7f], // 5: bright pink
  [0x4d, 0xff, 0xe6], // 6: bright cyan
  [0xff, 0xb3, 0x4d], // 7: bright amber
];

// ─── Utility: Seeded PRNG ────────────────────────────────────────────────────

function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ─── Build Petal Instanced Data ──────────────────────────────────────────────

function buildPetalData(count, seed) {
  const rng = makeRng(seed);

  const spawnPositions = new Float32Array(count * 3);
  const birthLifeSeedScale = new Float32Array(count * 4); // [birthTime, lifeDuration, seed, scale]
  const colorIndices = new Float32Array(count);

  const lifeDuration = 6.0; // Each petal lives for 6 seconds

  for (let i = 0; i < count; i++) {
    // Spawn position: petals start in the scene, distributed throughout
    const rx = rng() * 100 - 100;   // x ∈ [-100, 0] — further left off-screen, blown right
    const ry = rng() * 40 + 5;   // y ∈ [5, 45] — height range
    const rz = rng() * 120 - 40;   // z ∈ [-40, 80] — wider spread in depth
    spawnPositions[i * 3]     = rx;
    spawnPositions[i * 3 + 1] = ry;
    spawnPositions[i * 3 + 2] = rz;

    // Birth time: stagger births so petals spawn continuously
    // Spread births evenly across the first 6 seconds to create continuous stream
    const birthTime = (i / count) * lifeDuration;
    const seedVal = rng();
    const scaleVal = 0.625 + rng() * 0.625; // Scale ∈ [0.625, 1.25] (25% larger)

    birthLifeSeedScale[i * 4]     = birthTime;
    birthLifeSeedScale[i * 4 + 1] = lifeDuration;
    birthLifeSeedScale[i * 4 + 2] = seedVal;
    birthLifeSeedScale[i * 4 + 3] = scaleVal;

    // Color index: 0–7
    colorIndices[i] = Math.floor(rng() * 8);
  }

  return { spawnPositions, birthLifeSeedScale, colorIndices };
}

// ─── GommageText Component (3D Petal Particles) ──────────────────────────────

const GommageText = forwardRef(({ timeOfDay }, ref) => {
  const petalMeshRef = useRef();
  const petalDataRef = useRef(); // Separate ref to expose petal data without interfering with mesh ref
  const { nodes } = useGLTF('/models/petal.glb');

  // Uniforms refs — stable objects passed to ShaderMaterial
  const petalUniforms = useRef({
    uTime: { value: 0 },
    uPalette: { value: null },
    uWindDir: { value: new THREE.Vector2(1.0, 0.0) },
    uWindSpeed: { value: 3.0 },
    uWindGustStrength: { value: 0.35 },
    uWindGustFreq: { value: 0.12 },
    uDespawnX: { value: 100 },
  });

  // ── Palette DataTexture (8×1 RGBA) ──────────────────────────────────────────

  const paletteTexture = useMemo(() => {
    const data = new Uint8Array(8 * 1 * 4); // 8 pixels, RGBA
    PETAL_PALETTE.forEach(([r, g, b], i) => {
      data[i * 4]     = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255; // alpha = 1.0
    });
    const tex = new THREE.DataTexture(data, 8, 1, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);

  // ── Petal instance data ──────────────────────────────────────────────────────

  const petalData = useMemo(() => buildPetalData(maxPetals, 42), []);

  // ── Petal geometry: Clone from GLB + InstancedBufferAttributes ──────────────

  const petalGeo = useMemo(() => {
    if (!nodes?.PetalV2?.geometry) return null;

    const geo = nodes.PetalV2.geometry.clone();

    // Add per-instance attributes
    geo.setAttribute('aSpawnPos', new THREE.InstancedBufferAttribute(petalData.spawnPositions, 3));
    geo.setAttribute('aBirthLifeSeedScale', new THREE.InstancedBufferAttribute(petalData.birthLifeSeedScale, 4));
    geo.setAttribute('aColorIndex', new THREE.InstancedBufferAttribute(petalData.colorIndices, 1));

    return geo;
  }, [nodes, petalData]);

  // ── Petal material ──────────────────────────────────────────────────────────

  const petalMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: PETAL_VERT,
    fragmentShader: PETAL_FRAG,
    uniforms: petalUniforms.current,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending, // Switch from AdditiveBlending to show true colors
    side: THREE.DoubleSide, // Render both sides so petals don't disappear when spinning
  }), []);

  // ── Link palette texture to uniforms ────────────────────────────────────────

  useEffect(() => {
    petalUniforms.current.uPalette.value = paletteTexture;
  }, [paletteTexture]);

  // ── Initialize instance matrices (identity, since positioning is in shader) ──

  useEffect(() => {
    const mesh = petalMeshRef.current;
    if (!mesh) return;

    const m4 = new THREE.Matrix4();
    for (let i = 0; i < maxPetals; i++) {
      m4.identity(); // Identity matrix for all instances
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  // ── Dispose GPU resources on unmount ────────────────────────────────────────

  useEffect(() => {
    return () => {
      petalGeo?.dispose();
      petalMat.dispose();
      paletteTexture.dispose();
    };
  }, [petalGeo, petalMat, paletteTexture]);

  // ── Per-frame: Update uTime and despawn position uniforms ──────────────────

  useFrame(({ camera }, delta) => {
    petalUniforms.current.uTime.value += delta;

    // Calculate despawn x position based on viewport right edge
    // For a PerspectiveCamera, visible width at distance z is: 2 * tan(fov/2) * distance
    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = Math.abs(camera.position.z); // Distance from camera to z=0 plane
      const vFOV = camera.fov * Math.PI / 180; // Convert to radians
      const height = 2 * Math.tan(vFOV / 2) * distance;
      const width = height * camera.aspect;
      const rightEdge = camera.position.x + width / 2;
      petalUniforms.current.uDespawnX.value = rightEdge;
    }

    if (petalMeshRef.current) {
      petalMeshRef.current.count = maxPetals;
    }
  });

  // Expose petal data for CPU-side tracking via forwardRef
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref({
          petalData,
          petalUniforms: petalUniforms.current,
          meshRef: petalMeshRef,
        });
      } else {
        ref.current = {
          petalData,
          petalUniforms: petalUniforms.current,
          meshRef: petalMeshRef,
        };
      }
    }
  }, [petalData, ref]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!petalGeo) return null;

  // Show petals during the wedding reception (5:00 PM to 6:00 PM, or timeOfDay prop if provided)
  let shouldShowPetals = true;
  if (timeOfDay !== undefined) {
    shouldShowPetals = timeOfDay >= 17 && timeOfDay < 18; // 5 PM to 6 PM
  } else {
    // Fall back to system time if timeOfDay prop not provided
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const currentTimeInMinutes = hour * 60 + minutes;
    const startTime = 17 * 60; // 5:00 PM (17:00)
    const endTime = 18 * 60;   // 6:00 PM (18:00)
    shouldShowPetals = currentTimeInMinutes >= startTime && currentTimeInMinutes < endTime;
  }

  if (!shouldShowPetals) {
    return null;
  }

  return (
    <instancedMesh
      ref={petalMeshRef}
      args={[petalGeo, petalMat, maxPetals]}
      frustumCulled={false}
    />
  );
});

GommageText.displayName = 'GommageText';

export default GommageText;

// Preload the GLB asset
useGLTF.preload('/models/petal.glb');

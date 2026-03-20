import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PETAL_VERT, PETAL_FRAG, GOMMAGE_CONFIG } from '../shaders/gommage';

const { maxPetals } = GOMMAGE_CONFIG;

// ─── Ghibli Color Palette ────────────────────────────────────────────────────

const PETAL_PALETTE = [
  [0xf4, 0xa7, 0xb9], // 0: soft pink
  [0xff, 0xd1, 0xa9], // 1: peach/apricot
  [0xc8, 0xe6, 0xc9], // 2: mint green
  [0xb3, 0x9d, 0xdb], // 3: lavender
  [0xff, 0xe0, 0x82], // 4: warm yellow
  [0xf4, 0x8f, 0xb1], // 5: rose
  [0x80, 0xcb, 0xc4], // 6: teal mint
  [0xff, 0xcc, 0x80], // 7: warm amber
];

// ─── Utility: Seeded PRNG ────────────────────────────────────────────────────

function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ─── Build Petal Instanced Data ──────────────────────────────────────────────

function buildPetalData(count, seed) {
  const rng = makeRng(seed);
  const matrices = new Float32Array(count * 16);
  const lifeOffsets = new Float32Array(count);
  const petalTypes = new Float32Array(count);
  const colorIndices = new Float32Array(count);
  const rotationSeeds = new Float32Array(count);

  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    // Spawn position: petals start left off-screen, blow rightward
    // Wind physics in the shader handles the drift
    const rx = rng() * 80 - 60;   // x ∈ [-60, 20] — start left, blow right
    const ry = rng() * 30 + 15;   // y ∈ [15, 45]  — high in scene
    const rz = rng() * 80 - 40;   // z ∈ [-40, 40] — spread depth
    dummy.position.set(rx, ry, rz);
    dummy.updateMatrix();
    dummy.matrix.toArray(matrices, i * 16);

    // Life offset: [0, 1] for continuous spawning
    lifeOffsets[i] = rng();

    // Petal type: 0–3
    petalTypes[i] = Math.floor(rng() * 4);

    // Color index: 0–7
    colorIndices[i] = Math.floor(rng() * 8);

    // Rotation seed: [0, 1] also used as turbulence phase seed in wind shader
    rotationSeeds[i] = rng();
  }

  return { matrices, lifeOffsets, petalTypes, colorIndices, rotationSeeds };
}

// ─── GommageText Component (Ambient Petal Particles) ────────────────────────────

export default function GommageText() {
  const petalMeshRef = useRef();

  // Uniforms refs — stable objects passed to ShaderMaterial
  const petalUniforms = useRef({
    uTime: { value: 0 },
    uPhase: { value: 0 },
    uPalette: { value: null },
    uWindDir: { value: new THREE.Vector2(1.0, 0.0) },
    uWindSpeed: { value: 4.0 },
    uWindGustStrength: { value: 0.35 },
    uWindGustFreq: { value: 0.12 },
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

  // ── Petal geometry: PlaneGeometry(1,1) + InstancedBufferAttributes ──────────

  const petalGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aLifeOffset',   new THREE.InstancedBufferAttribute(petalData.lifeOffsets,   1));
    geo.setAttribute('aPetalType',    new THREE.InstancedBufferAttribute(petalData.petalTypes,    1));
    geo.setAttribute('aColorIndex',   new THREE.InstancedBufferAttribute(petalData.colorIndices,  1));
    geo.setAttribute('aRotationSeed', new THREE.InstancedBufferAttribute(petalData.rotationSeeds, 1));
    return geo;
  }, [petalData]);

  // ── Petal material ──────────────────────────────────────────────────────────

  const petalMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: PETAL_VERT,
    fragmentShader: PETAL_FRAG,
    uniforms: petalUniforms.current,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  // ── Upload instance matrices ────────────────────────────────────────────────

  useEffect(() => {
    const mesh = petalMeshRef.current;
    if (!mesh) return;

    const m4 = new THREE.Matrix4();
    for (let i = 0; i < maxPetals; i++) {
      m4.fromArray(petalData.matrices, i * 16);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [petalData.matrices]);

  // ── Link palette texture to uniforms ────────────────────────────────────────

  useEffect(() => {
    petalUniforms.current.uPalette.value = paletteTexture;
  }, [paletteTexture]);

  // ── Dispose GPU resources on unmount ────────────────────────────────────────

  useEffect(() => {
    return () => {
      petalGeo.dispose();
      petalMat.dispose();
      paletteTexture.dispose();
    };
  }, [petalGeo, petalMat, paletteTexture]);

  // ── Per-frame: continuous petal animation ──────────────────────────────────

  useFrame((_, delta) => {
    // Continuous animation: uPhase cycles from 0 to 1 continuously
    // All petals visible all the time, with continuous life cycling
    petalUniforms.current.uTime.value += delta;

    // uPhase drives the particle lifecycle in a repeating pattern
    // Based on uTime, petals spawn continuously
    const phase = (petalUniforms.current.uTime.value % 5.0) / 5.0; // 5-second lifecycle cycle
    petalUniforms.current.uPhase.value = phase;

    // All petals visible at all times
    if (petalMeshRef.current) {
      petalMeshRef.current.count = maxPetals;
    }
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <instancedMesh
      ref={petalMeshRef}
      args={[petalGeo, petalMat, maxPetals]}
      frustumCulled={false}
    />
  );
}

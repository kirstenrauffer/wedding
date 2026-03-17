import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STAR_VERT, STAR_FRAG, STAR_CONFIG } from '../shaders/stars';
import starTexture from '../assets/star.png';

// ─── Config ───────────────────────────────────────────────────────────────────

const RADIUS     = 390_000; // just inside the sky sphere (400k)
const MAX_BG     = 8000;    // max allocation for background stars
const MAX_BRIGHT = 500;     // max allocation for bright/coloured stars

// ─── Night factor (mirrors solar.js smoothstep logic) ─────────────────────────

function ss(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function computeNightFactor(hours) {
  const dayFactor = Math.min(ss(5.5, 6.5, hours), 1 - ss(17.5, 18.5, hours));
  return 1 - dayFactor;
}

// ─── Seeded pseudo-random (LCG) ───────────────────────────────────────────────

function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ─── Milky Way density for a unit direction vector ───────────────────────────
// Gaussian falloff across a tilted "galactic band" — peaks around 1.0 at the
// band centre and drops toward 0 away from it.

function milkyWayDensity(dir) {
  const tilt = Math.PI * 0.28;
  const galY = dir.y * Math.cos(tilt) - dir.z * Math.sin(tilt);
  return Math.exp(-galY * galY * 5.0);
}

// ─── Star colour palette (stellar temperature distribution) ───────────────────

const PALETTE = [
  { color: new THREE.Color('#E8F0F8'), weight: 0.12 }, // subtle cool blue
  { color: new THREE.Color('#F5F5F5'), weight: 0.38 }, // off-white
  { color: new THREE.Color('#F8F5F0'), weight: 0.25 }, // subtle warm white
  { color: new THREE.Color('#F5EFE5'), weight: 0.15 }, // pale yellow
  { color: new THREE.Color('#F0E6D8'), weight: 0.07 }, // soft yellow
  { color: new THREE.Color('#EDD8CC'), weight: 0.03 }, // light warm
];

const CUM_WEIGHTS = (() => {
  let acc = 0;
  return PALETTE.map(p => { acc += p.weight; return acc; });
})();

function pickColor(rng) {
  const r = rng();
  const idx = CUM_WEIGHTS.findIndex(w => r <= w);
  return PALETTE[Math.max(0, idx)].color;
}

// ─── Build instanced star placement data ──────────────────────────────────────
// Returns flat arrays for instance matrices, sizes, twinkle offsets, and colours.
// milkyWayBias=true clusters stars along the galactic band via rejection sampling.

function buildStarData(count, seed, minSize, maxSize, milkyWayBias) {
  const rng      = makeRng(seed);
  const matrices = new Float32Array(count * 16);
  const sizes    = new Float32Array(count);
  const twinkles = new Float32Array(count);
  const colors   = new Float32Array(count * 3);

  const dummy = new THREE.Object3D();
  let placed   = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 25) {
    attempts++;

    // Random point on upper hemisphere (y ∈ [-0.15, 1.0] to include near-horizon)
    const phi      = rng() * Math.PI * 2;
    const cosTheta = rng() * 1.15 - 0.15;
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const dir = new THREE.Vector3(sinTheta * Math.cos(phi), cosTheta, sinTheta * Math.sin(phi));

    // Reject based on Milky Way density to create the galactic band
    if (milkyWayBias && rng() > 0.25 + milkyWayDensity(dir) * 0.75) continue;

    dir.multiplyScalar(RADIUS);
    dummy.position.copy(dir);
    dummy.updateMatrix();
    dummy.matrix.toArray(matrices, placed * 16);

    sizes[placed]    = minSize + rng() * (maxSize - minSize);
    twinkles[placed] = rng(); // unique phase offset per star

    const col = pickColor(rng);
    colors[placed * 3]     = col.r;
    colors[placed * 3 + 1] = col.g;
    colors[placed * 3 + 2] = col.b;

    placed++;
  }

  return { matrices, placed, sizes, twinkles, colors };
}

// ─── StarField component ──────────────────────────────────────────────────────

export default function StarField({ timeOfDay }) {
  const groupRef  = useRef();
  const bgRef     = useRef();
  const brightRef = useRef();

  // Star parameters (hardcoded)
  const bgCount = STAR_CONFIG.bgCount;
  const brightCount = STAR_CONFIG.brightCount;
  const brightness = STAR_CONFIG.brightness;

  // ── Generate star data at max capacity (seeded so it's stable) ─────────────
  // We pre-allocate for MAX counts so changing the slider only adjusts
  // mesh.count — no geometry regeneration, no GC pressure.
  const bgData     = useMemo(() => buildStarData(MAX_BG,     42,  200,  700, true),  []);
  const brightData = useMemo(() => buildStarData(MAX_BRIGHT, 137, 700, 2200, false), []);

  // ── Load star texture ──────────────────────────────────────────────────────────
  const starTex = useMemo(() => {
    const texture = new THREE.TextureLoader().load(starTexture);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    return texture;
  }, []);

  // ── Geometries — PlaneGeometry with per-instance buffer attributes ──────────
  const bgGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aSize',    new THREE.InstancedBufferAttribute(bgData.sizes,    1));
    geo.setAttribute('aTwinkle', new THREE.InstancedBufferAttribute(bgData.twinkles, 1));
    geo.setAttribute('aColor',   new THREE.InstancedBufferAttribute(bgData.colors,   3));
    return geo;
  }, [bgData]);

  const brightGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('aSize',    new THREE.InstancedBufferAttribute(brightData.sizes,    1));
    geo.setAttribute('aTwinkle', new THREE.InstancedBufferAttribute(brightData.twinkles, 1));
    geo.setAttribute('aColor',   new THREE.InstancedBufferAttribute(brightData.colors,   3));
    return geo;
  }, [brightData]);

  // ── Materials ───────────────────────────────────────────────────────────────
  const bgMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uTime:              { value: 0 },
      uOpacity:           { value: 0 },
      uBrightness:        { value: 1.0 },
      uTwinkleIntensity:  { value: 1.0 },
      uStarTexture:       { value: starTex },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), [starTex]);

  const brightMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   STAR_VERT,
    fragmentShader: STAR_FRAG,
    uniforms: {
      uTime:              { value: 0 },
      uOpacity:           { value: 0 },
      uBrightness:        { value: 1.0 },
      uTwinkleIntensity:  { value: 2.5 },
      uStarTexture:       { value: starTex },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
  }), [starTex]);

  // ── Upload instance matrices ────────────────────────────────────────────────
  useEffect(() => {
    const mesh = bgRef.current;
    if (!mesh) return;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < bgData.placed; i++) {
      m4.fromArray(bgData.matrices, i * 16);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [bgData]);

  useEffect(() => {
    const mesh = brightRef.current;
    if (!mesh) return;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < brightData.placed; i++) {
      m4.fromArray(brightData.matrices, i * 16);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [brightData]);

  // ── Dispose GPU resources on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      bgGeo.dispose();
      brightGeo.dispose();
      bgMat.dispose();
      brightMat.dispose();
      starTex.dispose();
    };
  }, [bgGeo, brightGeo, bgMat, brightMat, starTex]);

  // ── Per-frame: advance time, fade opacity, set count, drift ────────────────
  useFrame((_, delta) => {
    const night = computeNightFactor(timeOfDay);

    bgMat.uniforms.uTime.value     += delta;
    brightMat.uniforms.uTime.value += delta;

    // Smooth opacity transitions as time of day changes
    bgMat.uniforms.uOpacity.value     = THREE.MathUtils.lerp(bgMat.uniforms.uOpacity.value,     night * 0.65, delta * 1.5);
    brightMat.uniforms.uOpacity.value = THREE.MathUtils.lerp(brightMat.uniforms.uOpacity.value, night,        delta * 1.5);

    // Brightness control — applied in vertex shader as a multiplier
    bgMat.uniforms.uBrightness.value     = brightness;
    brightMat.uniforms.uBrightness.value = brightness;

    // Dynamically control visible instance count (no reallocation)
    if (bgRef.current)     bgRef.current.count     = Math.min(bgCount, bgData.placed);
    if (brightRef.current) brightRef.current.count = Math.min(brightCount, brightData.placed);

    // Slow sky drift — simulates Earth's rotation
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.0008;
  });

  return (
    <group ref={groupRef}>
      {/* Background: dense, small, Milky Way–biased */}
      <instancedMesh
        ref={bgRef}
        args={[bgGeo, bgMat, MAX_BG]}
        frustumCulled={false}
      />
      {/* Foreground: sparse, larger, coloured bright stars */}
      <instancedMesh
        ref={brightRef}
        args={[brightGeo, brightMat, MAX_BRIGHT]}
        frustumCulled={false}
      />
    </group>
  );
}

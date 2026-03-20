import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  FIREWORKS_CONFIG,
  FIREWORKS_PALETTE,
  SHELL_TYPES,
  FW_VERT_PREAMBLE,
  FW_VERT_POSITION,
  FW_FRAG_COLOR,
} from '../shaders/fireworks';

// ─── Smoothstep Helper ────────────────────────────────────────────────────

const smoothstep = (edge0, edge1, x) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// ─── Module-level Helpers ────────────────────────────────────────────────

function pickShell() {
  const totalWeight = SHELL_TYPES.reduce((sum, st) => sum + st.weight, 0);
  let rnd = Math.random() * totalWeight;
  for (const shell of SHELL_TYPES) {
    rnd -= shell.weight;
    if (rnd <= 0) return shell;
  }
  return SHELL_TYPES[0];
}

function pickColor(shell) {
  if (shell.rainbow) return null;
  const [r, g, b] = FIREWORKS_PALETTE[Math.floor(Math.random() * FIREWORKS_PALETTE.length)];
  return new THREE.Color(r, g, b);
}

function createFireworkPoints(shell, color, startPos, endPos) {
  const { particles, grav, step, rainbow } = shell;
  const count = particles;
  const times = 10;

  // ─── Build geometry ───
  const geometry = new THREE.BufferGeometry();

  // Position: random seeds (not actual positions)
  const positionArray = new Float32Array(count * times * 3);
  for (let i = 0; i < positionArray.length; i++) {
    positionArray[i] = Math.random();
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));

  // Delay: stagger per-particle delays
  const delayArray = new Float32Array(count * times * 2);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < times; j++) {
      const idx = (i * times + j) * 2;
      delayArray[idx]     = j * step;  // delay increases with copy index
      delayArray[idx + 1] = 0;
    }
  }
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delayArray, 2));

  // Color (if rainbow mode)
  if (rainbow) {
    const colorArray = new Float32Array(count * times * 3);
    for (let i = 0; i < count; i++) {
      const [r, g, b] = FIREWORKS_PALETTE[Math.floor(Math.random() * FIREWORKS_PALETTE.length)];
      for (let j = 0; j < times; j++) {
        const idx = (i * times + j) * 3;
        colorArray[idx]     = r;
        colorArray[idx + 1] = g;
        colorArray[idx + 2] = b;
      }
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
  }

  // ─── Build custom ShaderMaterial ───
  const vertexShader = `
    ${FW_VERT_PREAMBLE}

    uniform vec3 uBaseColor;
    varying vec3 vColor;

    void main() {
      vColor = ${rainbow ? 'color' : 'uBaseColor'};

      float seed = position.x * 65521.0 + position.y * 65521.0 + position.z * 65521.0 + floor(uTime);
      vec3 hashVals = hash3(seed);
      vec3 dir = randomInSphere(hashVals.x, hashVals.y, hashVals.z);

      float t = max(0.0, uTime - aDelay.x);
      float expand = 1.0 - (1.0-t)*(1.0-t)*(1.0-t);
      vec3 grav_vec = vec3(0.0, -1.0, 0.0) * t * t * uGravity * 0.5;
      float twinkle = 1.0 + 0.10 * sin(uTime * 32.0 + aDelay.x * 85.0);

      vec3 pos = (dir * expand + grav_vec) * uScale;
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = 12.0 * (1.0 - aDelay.x * 7.5) * twinkle * (1.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = `
    uniform float uTime;
    varying vec3 vColor;

    void main() {
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      if (r > 1.0) discard;

      float frac = fract(uTime);
      float brightness = clamp((0.92 - frac*frac) * 3.5, 0.0, 1.0) * (1.0 - r*r);
      float timeFade = max(0.0, 1.0 - uTime * 0.25);  // very slow fade as particles fall
      float op = brightness * timeFade;

      gl_FragColor = vec4(vColor, op);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGravity: { value: grav },
      uScale: { value: FIREWORKS_CONFIG.EXPAND_SCALE },
      uBaseColor: { value: color ?? new THREE.Color(1, 1, 1) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexColors: rainbow,
  });

  const points = new THREE.Points(geometry, material);
  points.userData = {
    timeUniform: material.uniforms.uTime,
    clock: new THREE.Timer(),
    startPos: startPos.clone(),
    endPos: endPos.clone(),
    color,
    flashed: false,
  };

  return points;
}

function spawnFirework(state, group, config) {
  const { fireworks } = state;

  // Guard: pool exhausted
  if (fireworks.length >= config.MAX_FIREWORKS) return;

  const shell = pickShell();
  const color = pickColor(shell);

  // Spawn positions
  const startX = (Math.random() - 0.5) * 2 * config.SPREAD_X;
  const startZ = config.Z_NEAR + Math.random() * (config.Z_FAR - config.Z_NEAR);
  const startY = config.LAUNCH_Y_MIN + Math.random() * (config.LAUNCH_Y_MAX - config.LAUNCH_Y_MIN);

  const startPos = new THREE.Vector3(startX, startY, startZ);

  // End (burst) positions: slight drift for visual interest
  const endX = startX + (Math.random() - 0.5) * 8;
  const endY = config.BURST_Y_MIN + Math.random() * (config.BURST_Y_MAX - config.BURST_Y_MIN);
  const endZ = startZ + (Math.random() - 0.5) * 6;

  const endPos = new THREE.Vector3(endX, endY, endZ);

  // Create and add points
  const points = createFireworkPoints(shell, color, startPos, endPos);
  group.add(points);

  // Store in state
  fireworks.push({
    points,
    clock: points.userData.clock,
    timeUniform: points.userData.timeUniform,
    startPos,
    endPos,
    color,
    flashed: false,
  });
}

function spawnFlashLight(state, scene, pos, color) {
  const { flashLights } = state;

  // Guard: too many lights already
  if (flashLights.length >= 3) return;

  const lightColor = color ? new THREE.Color().copy(color).multiplyScalar(1.2) : new THREE.Color('#fff8e7');
  const light = new THREE.PointLight(lightColor, 12.0, 120, 2);
  light.position.copy(pos);
  scene.add(light);

  flashLights.push({
    light,
    clock: new THREE.Timer(),
  });
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function Fireworks({ timeOfDay }) {
  // Smooth intensity: 0 outside window, 1 during peak, fades at edges
  const intensity = smoothstep(
    FIREWORKS_CONFIG.TIME_START - FIREWORKS_CONFIG.FADE_IN,
    FIREWORKS_CONFIG.TIME_START,
    timeOfDay
  ) * (1 - smoothstep(
    FIREWORKS_CONFIG.TIME_END - FIREWORKS_CONFIG.FADE_OUT,
    FIREWORKS_CONFIG.TIME_END,
    timeOfDay
  ));

  if (intensity <= 0) return null;

  return <FireworksInner timeOfDay={timeOfDay} intensity={intensity} />;
}

function FireworksInner({ timeOfDay, intensity }) {
  const { scene } = useThree();
  const groupRef = useRef(null);
  const timeOfDayRef = useRef(timeOfDay);
  const stateRef = useRef({
    fireworks: [],
    flashLights: [],
    nextSpawnIn: 0.8,
    elapsedSinceSpawn: 0,
  });

  // Keep timeOfDay in sync for useFrame
  useEffect(() => {
    timeOfDayRef.current = timeOfDay;
  }, [timeOfDay]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const tod = timeOfDayRef.current;
    const s = stateRef.current;

    // ── Auto-spawn ──────────────────────────────────────────────────
    s.elapsedSinceSpawn += delta;
    if (s.elapsedSinceSpawn >= s.nextSpawnIn) {
      s.elapsedSinceSpawn = 0;

      // Finale mode: more frequent near 22–23h
      const finale = smoothstep(22, 23, tod);
      const interval = FIREWORKS_CONFIG.BASE_INTERVAL * (1 - finale * 0.8)
                     + FIREWORKS_CONFIG.FINALE_INTERVAL * finale;
      s.nextSpawnIn = interval * (0.7 + Math.random() * 0.6);

      spawnFirework(s, groupRef.current, FIREWORKS_CONFIG);
    }

    // ── Update active fireworks ─────────────────────────────────────
    const toRemove = [];
    for (const fw of s.fireworks) {
      fw.clock.update();
      const t = fw.clock.getElapsed() * 0.23;
      const launchT = Math.min(t * 2, 1);
      const bloomT = Math.max(0, t * 2 - 1);

      if (bloomT === 0) {
        // Launch phase: position moves from start → end with ease-out quad
        const ease = 1 - (1 - launchT) * (1 - launchT);
        fw.points.position.lerpVectors(fw.startPos, fw.endPos, ease);
        fw.timeUniform.value = 0;
      } else {
        // Burst phase: particles expand from endPos
        fw.points.position.copy(fw.endPos);
        fw.timeUniform.value = bloomT;

        // Trigger flash light on first burst frame
        if (!fw.flashed) {
          fw.flashed = true;
          spawnFlashLight(s, scene, fw.endPos, fw.color);
        }
      }

      if (bloomT >= 1.0) {
        toRemove.push(fw);
      }
    }

    // Remove finished fireworks
    for (const fw of toRemove) {
      groupRef.current.remove(fw.points);
      fw.points.geometry.dispose();
      fw.points.material.dispose();
      s.fireworks.splice(s.fireworks.indexOf(fw), 1);
    }

    // ── Decay flash lights ──────────────────────────────────────────
    const removeLights = [];
    for (const fl of s.flashLights) {
      fl.clock.update();
      const age = fl.clock.getElapsed();
      fl.light.intensity = Math.max(0, 5.0 * (1 - age / 0.35));
      if (age > 0.35) {
        removeLights.push(fl);
      }
    }

    for (const fl of removeLights) {
      scene.remove(fl.light);
      s.flashLights.splice(s.flashLights.indexOf(fl), 1);
    }
  });

  return <group ref={groupRef} />;
}

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * RippleSimulator: GPU-based water ripple propagation using ping-pong heightfield FBOs.
 * Manages two render targets that simulate wave propagation via wave equation.
 * Exposes normalMap texture for injection into ocean shader.
 */
export default function RippleSimulator({ onReady, disabled = false }) {
  const { gl } = useThree();
  const rtPair = useRef(null);
  const normalMapRef = useRef(null);
  const camera = useRef(new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10));
  const quadGeom = useRef(null);
  const materials = useRef(null);
  const dropQueue = useRef([]);

  const RESOLUTION = 256;
  const DAMPING = 0.96; // Wave energy loss per frame (higher = more persistence)
  const RIPPLE_RADIUS = 0.08; // UV-space radius of ripple splat (larger = wider ripples)
  const RIPPLE_FORCE = 0.8; // Amplitude of initial displacement (higher = stronger ripples)
  const NORMAL_STRENGTH = 2.0; // Exaggeration factor for normal extraction (higher = more visible)

  // Create fullscreen quad geometry (only once)
  useEffect(() => {
    if (!quadGeom.current) {
      quadGeom.current = new THREE.PlaneGeometry(2, 2);
    }
    return () => {
      // Don't dispose - keep it around for the render loop
    };
  }, []);

  // Initialize render targets and shaders
  useEffect(() => {
    if (disabled) return;

    // Create three render targets to avoid feedback loops
    // We need 3 buffers: current, previous, and output
    const rt1 = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
      type: THREE.FloatType,
      format: THREE.RGFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });

    const rt2 = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
      type: THREE.FloatType,
      format: THREE.RGFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });

    const rt3 = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
      type: THREE.FloatType,
      format: THREE.RGFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });

    rtPair.current = { current: rt1, prev: rt2, next: rt3 };

    // Create normal map render target
    const rtNormal = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });

    normalMapRef.current = rtNormal.texture;

    // Simulation shader: wave equation propagation
    const simulationShader = new THREE.ShaderMaterial({
      uniforms: {
        u_currentHeight: { value: rt1.texture },
        u_prevHeight: { value: rt2.texture },
        u_texelSize: { value: new THREE.Vector2(1 / RESOLUTION, 1 / RESOLUTION) },
        u_damping: { value: DAMPING },
        u_dropCenter: { value: new THREE.Vector2(0, 0) },
        u_dropRadius: { value: 0 },
        u_dropForce: { value: 0 },
      },
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        uniform sampler2D u_currentHeight;
        uniform sampler2D u_prevHeight;
        uniform vec2 u_texelSize;
        uniform float u_damping;
        uniform vec2 u_dropCenter;
        uniform float u_dropRadius;
        uniform float u_dropForce;

        void main() {
          vec2 uv = gl_FragCoord.xy * u_texelSize;

          // Sample 4 neighbors (Von Neumann stencil)
          float left  = texture2D(u_currentHeight, uv + vec2(-u_texelSize.x, 0.0)).r;
          float right = texture2D(u_currentHeight, uv + vec2( u_texelSize.x, 0.0)).r;
          float up    = texture2D(u_currentHeight, uv + vec2(0.0,  u_texelSize.y)).r;
          float down  = texture2D(u_currentHeight, uv + vec2(0.0, -u_texelSize.y)).r;
          float curr  = texture2D(u_currentHeight, uv).r;
          float prev  = texture2D(u_prevHeight, uv).r;

          // Wave equation: new = avg_neighbors * 2 - prev, with damping
          float avg = (left + right + up + down) * 0.25;
          float newHeight = (avg * 2.0 - prev) * u_damping;

          // Add drop splat if active
          float dist = length(uv - u_dropCenter);
          if (dist < u_dropRadius) {
            float drop = max(0.0, 1.0 - dist / u_dropRadius);
            drop = drop * drop * u_dropForce;
            newHeight += drop;
          }

          // Kill very small heights to prevent stuck oscillations
          if (abs(newHeight) < 0.0001) newHeight = 0.0;

          gl_FragColor = vec4(newHeight, 0.0, 0.0, 1.0);
        }
      `,
    });

    // Normal extraction shader: heightfield -> normal map
    const normalShader = new THREE.ShaderMaterial({
      uniforms: {
        u_heightfield: { value: rt1.texture },
        u_texelSize: { value: new THREE.Vector2(1 / RESOLUTION, 1 / RESOLUTION) },
        u_normalStrength: { value: NORMAL_STRENGTH },
      },
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;

        uniform sampler2D u_heightfield;
        uniform vec2 u_texelSize;
        uniform float u_normalStrength;

        void main() {
          vec2 uv = gl_FragCoord.xy * u_texelSize;

          float left  = texture2D(u_heightfield, uv + vec2(-u_texelSize.x, 0.0)).r;
          float right = texture2D(u_heightfield, uv + vec2( u_texelSize.x, 0.0)).r;
          float up    = texture2D(u_heightfield, uv + vec2(0.0,  u_texelSize.y)).r;
          float down  = texture2D(u_heightfield, uv + vec2(0.0, -u_texelSize.y)).r;

          // Central differences for gradient
          float dx = (right - left) * u_normalStrength;
          float dy = (up - down) * u_normalStrength;

          vec3 normal = normalize(vec3(dx, dy, 1.0));

          // Encode normal to [0,1] range
          gl_FragColor = vec4(normal * 0.5 + 0.5, 1.0);
        }
      `,
    });

    materials.current = { simulation: simulationShader, normal: normalShader, rtNormal };

    // Call onReady callback with simulator interface
    if (onReady) {
      onReady({
        addDrop: (normalizedX, normalizedZ) => {
          // Queue drop for processing in useFrame (up to 3 per frame)
          dropQueue.current.push({ x: normalizedX, z: normalizedZ });
        },
        getNormalMap: () => normalMapRef.current,
      });
    }

    // Cleanup
    return () => {
      rt1.dispose();
      rt2.dispose();
      rt3.dispose();
      rtNormal.dispose();
      simulationShader.dispose();
      normalShader.dispose();
      quadGeom.current?.dispose();
    };
  }, []);

  // Create persistent quad mesh and scene for render passes (only after geometry is ready)
  const quadMesh = useRef(null);
  const quadScene = useRef(null);

  useEffect(() => {
    if (quadGeom.current && !quadMesh.current) {
      quadMesh.current = new THREE.Mesh(quadGeom.current, undefined);
      quadScene.current = new THREE.Scene();
      quadScene.current.add(quadMesh.current);
    }

    return () => {
      if (quadMesh.current) quadMesh.current.geometry.dispose();
      if (quadScene.current) {
        quadScene.current.children.forEach(c => c.geometry?.dispose());
      }
    };
  }, []);

  // Per-frame simulation and normal extraction
  useFrame(() => {
    if (disabled || !rtPair.current || !materials.current || !quadMesh.current || !quadScene.current) {
      return;
    }

    const simMat = materials.current.simulation;
    const normMat = materials.current.normal;
    const rtNormal = materials.current.rtNormal;

    // Drain exactly one drop per frame — cap queue to prevent unbounded growth
    const drop = dropQueue.current.shift() ?? null;
    if (dropQueue.current.length > 4) {
      dropQueue.current.length = 4;
    }

    const { current: rtCurrent, prev: rtPrev, next: rtNext } = rtPair.current;

    // Simulation pass: wave equation
    simMat.uniforms.u_currentHeight.value = rtCurrent.texture;
    simMat.uniforms.u_prevHeight.value = rtPrev.texture;
    if (drop) {
      simMat.uniforms.u_dropCenter.value.set(drop.x, drop.z);
      simMat.uniforms.u_dropRadius.value = RIPPLE_RADIUS;
      simMat.uniforms.u_dropForce.value = RIPPLE_FORCE;
    } else {
      simMat.uniforms.u_dropRadius.value = 0;
      simMat.uniforms.u_dropForce.value = 0;
    }
    quadMesh.current.material = simMat;
    gl.setRenderTarget(rtNext);
    gl.clear();
    gl.render(quadScene.current, camera.current);
    simMat.uniforms.u_dropRadius.value = 0;
    simMat.uniforms.u_dropForce.value = 0;

    // Normal extraction pass: derive normals from just-simulated heights
    normMat.uniforms.u_heightfield.value = rtNext.texture;
    quadMesh.current.material = normMat;
    gl.setRenderTarget(rtNormal);
    gl.clear();
    gl.render(quadScene.current, camera.current);

    // Rotate buffers: next becomes current, current becomes prev, prev becomes next
    rtPair.current.current = rtNext;
    rtPair.current.prev = rtCurrent;
    rtPair.current.next = rtPrev;

    gl.setRenderTarget(null);
  });

  return null;
}

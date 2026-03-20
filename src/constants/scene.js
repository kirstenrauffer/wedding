import * as THREE from 'three';

// Single source of truth for moon world position
// Used by: visual moon mesh, water reflection direction
export const MOON_WORLD_POSITION = new THREE.Vector3(0, 30, -80);

// Moon light direction (separate from visual position for lighting balance)
// Centered (X=0) to align with the visual moon position for night lighting
export const MOON_LIGHT_DIRECTION = new THREE.Vector3(0, 35, -80);

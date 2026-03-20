import * as THREE from 'three';

// Single source of truth for moon world position
// Used by: visual moon mesh, water reflection direction
export const MOON_WORLD_POSITION = new THREE.Vector3(0, 30, -80);

// Moon light direction (separate from visual position for lighting balance)
// Positioned center-right for balanced water lighting
export const MOON_LIGHT_DIRECTION = new THREE.Vector3(100, 35, -80);

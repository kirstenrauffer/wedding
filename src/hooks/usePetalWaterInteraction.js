import { useRef, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Custom hook to track petal positions and detect water surface intersections.
 * Replicates the petal vertex shader physics on the CPU for collision detection.
 *
 * @param {Object} petalDataRef - Ref to the petal data and uniforms { petalData, petalUniforms }
 * @param {Function} onPetalHitWater - Callback(normalizedX, normalizedZ) when petal hits water
 * @param {Object} config - Configuration { spawnBoxSize, lifeDuration, windDir, windSpeed, etc. }
 */
export function usePetalWaterInteraction(petalDataRef, onPetalHitWater, config = {}) {
  const defaultConfig = {
    // Petal spawn ranges (from GommageText.jsx buildPetalData):
    // X: [-60, 20] (center -20, half-width 40)
    // Z: [-40, 40] (center 0, half-width 40)
    spawnMinX: -60,
    spawnMaxX: 20,
    spawnMinZ: -40,
    spawnMaxZ: 40,
    lifeDuration: 6.0,
    waterYLevel: 0,
  };

  const cfg = { ...defaultConfig, ...config };
  const hitStateRef = useRef(new Map()); // Track which petals have already triggered ripples

  // Compute per-frame petal world position (replicates vertex shader physics)
  const computePetalWorldY = useCallback((petalIndex, spawnPos, birthLifeSeedScale, uTime) => {
    const birthTime = birthLifeSeedScale[0];
    const lifeDuration = birthLifeSeedScale[1];
    const seed = birthLifeSeedScale[2];

    // Age calculation: repeats every lifeDuration
    const age = ((uTime - birthTime) % lifeDuration) / lifeDuration;

    // Fade in/out
    const fadeIn = age < 0.05 ? (age / 0.05) * (age / 0.05) * (3 - 2 * age / 0.05) : 1;
    const fadeOut = age > 0.8 ? 1 - ((age - 0.8) / 0.2) * ((age - 0.8) / 0.2) * (3 - 2 * (age - 0.8) / 0.2) : 1;
    const vAlpha = fadeIn * fadeOut;

    // Gravity: petals fall over their lifetime
    // gravityAmount = 0.5 * 1.2 * (age * lifeDuration)^2
    const gravityAmount = 0.5 * 1.2 * (age * lifeDuration) * (age * lifeDuration);

    // Upward burst at birth (simplified): peak at age=0.2, 0 outside [0, 0.3]
    const burst = age < 0.3 ? 1.5 * Math.max(0, 1 - Math.abs((age - 0.15) / 0.15)) : 0;

    // Wind displacement (simplified — y component only)
    const windTime = age * lifeDuration;
    let windDispY = 0; // Wind primarily affects x, z; y effect is minimal

    // World position: spawn position + gravity - wind
    const worldY = spawnPos[1] + windDispY - gravityAmount + burst;

    return { worldY, vAlpha };
  }, []);

  useFrame(() => {
    if (!petalDataRef?.current || !onPetalHitWater) {
      if (!petalDataRef?.current && typeof window !== 'undefined') {
        // Only warn once - set a flag to avoid spam
        if (!window.__petalTrackerWarned) {
          console.warn('[Petal Tracker] petalDataRef not available yet');
          window.__petalTrackerWarned = true;
        }
      }
      return;
    }

    const refData = petalDataRef.current;
    const petalData = refData.petalData || refData;
    const petalUniforms = refData.petalUniforms || refData;

    if (!petalData || !petalUniforms) {
      console.warn('[Petal Tracker] Missing petal data or uniforms', { petalData, petalUniforms });
      return;
    }

    const { spawnPositions, birthLifeSeedScale } = petalData;
    if (!spawnPositions || !birthLifeSeedScale) {
      console.warn('[Petal Tracker] Missing spawn positions or birth/life data');
      return;
    }

    const uTime = petalUniforms.uTime;
    if (!uTime) {
      console.warn('[Petal Tracker] Missing uTime uniform');
      return;
    }

    const uTimeVal = uTime.value;
    const maxPetals = spawnPositions.length / 3;

    for (let i = 0; i < maxPetals; i++) {
      const spawnX = spawnPositions[i * 3];
      const spawnY = spawnPositions[i * 3 + 1];
      const spawnZ = spawnPositions[i * 3 + 2];

      const bIdx = i * 4;
      const birthTime = birthLifeSeedScale[bIdx];
      const lifeDuration = birthLifeSeedScale[bIdx + 1];
      const seed = birthLifeSeedScale[bIdx + 2];

      // Compute world Y
      const { worldY, vAlpha } = computePetalWorldY(
        i,
        [spawnX, spawnY, 0],
        [birthTime, lifeDuration, seed],
        uTimeVal
      );

      // Skip if petal is fading out
      if (vAlpha < 0.1) continue;

      // Detect water crossing: petal crosses y=0 and was above water before
      const waterLevel = cfg.waterYLevel;
      const hasHitKey = `${i}_${Math.floor(birthTime * 10)}`; // Use birth time epoch to track per-lifecycle
      const alreadyHit = hitStateRef.current.has(hasHitKey);

      if (worldY <= waterLevel && !alreadyHit && spawnY > waterLevel) {
        // Petal hit the water!
        hitStateRef.current.set(hasHitKey, true);

        // Compute normalized ripple position (map spawn position to [0, 1])
        // Using the petal spawn ranges
        const normX = (spawnX - cfg.spawnMinX) / (cfg.spawnMaxX - cfg.spawnMinX);
        const normZ = (spawnZ - cfg.spawnMinZ) / (cfg.spawnMaxZ - cfg.spawnMinZ);

        // Clamp to valid range (though they should already be [0, 1])
        const clampedX = Math.max(0, Math.min(1, normX));
        const clampedZ = Math.max(0, Math.min(1, normZ));

        if (typeof window !== 'undefined') {
          window.__petalHitCount = (window.__petalHitCount || 0) + 1;
          console.log(`[Ripple] Petal ${i} hit water (count: ${window.__petalHitCount}) at (${clampedX.toFixed(2)}, ${clampedZ.toFixed(2)})`);
        }

        onPetalHitWater(clampedX, clampedZ);
      }

      // Clean up hit state for dead petals
      if (worldY < waterLevel - 5) {
        hitStateRef.current.delete(hasHitKey);
      }
    }
  });
}

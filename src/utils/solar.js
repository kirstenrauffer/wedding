// ─── Time-of-Day Solar Computation ───
// Computes sun position, sky gradient colors, lighting, and cloud colors
// from the current local time. Palette inspired by Kiki's Delivery Service.

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerpHex(hex1, hex2, t) {
  const r1 = parseInt(hex1.slice(1, 3), 16);
  const g1 = parseInt(hex1.slice(3, 5), 16);
  const b1 = parseInt(hex1.slice(5, 7), 16);
  const r2 = parseInt(hex2.slice(1, 3), 16);
  const g2 = parseInt(hex2.slice(3, 5), 16);
  const b2 = parseInt(hex2.slice(5, 7), 16);
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  const hex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function computeSolarParams(hours) {
  const SUNRISE = 6;
  const SUNSET = 18;

  const dayProgress = (hours - SUNRISE) / (SUNSET - SUNRISE);
  const clampedProgress = Math.max(0, Math.min(1, dayProgress));
  const solarAngle = clampedProgress * Math.PI;

  const elevation = Math.sin(solarAngle);
  const eastWest = Math.cos(solarAngle);

  const isDaytime = hours >= SUNRISE && hours <= SUNSET;

  const dawnFactor = smoothstep(SUNRISE - 0.5, SUNRISE + 0.5, hours);
  const duskFactor = 1 - smoothstep(SUNSET - 0.5, SUNSET + 0.5, hours);
  const dayFactor = Math.min(dawnFactor, duskFactor);

  const goldenHour = isDaytime ? Math.pow(1 - elevation, 1.5) : 0;

  // Separate dawn vs dusk golden hour intensity (asymmetric — sunsets linger longer)
  const dawnGolden = goldenHour * smoothstep(4.5, 6, hours) * (1 - smoothstep(7.5, 9, hours));
  const duskGolden = goldenHour * smoothstep(16, 17.5, hours) * (1 - smoothstep(19, 20, hours));

  // ── Moon lighting factor ──
  // Moon is fully visible during night (19:00–5:00), fades in 17:00–19:00, fades out 5:00–7:00
  let moonNightFactor;
  if (hours >= 19 || hours < 5) {
    moonNightFactor = 1; // full night
  } else if (hours >= 17) {
    moonNightFactor = smoothstep(17, 19, hours); // fade in
  } else {
    moonNightFactor = 1 - smoothstep(5, 7, hours); // fade out
  }

  // ── Light position ──
  const lightX = Math.round(eastWest * 200);
  const lightY = isDaytime
    ? Math.max(5, Math.round(elevation * 300))
    : Math.round(-20 - (1 - dayFactor) * 30);
  const lightZ = -200;

  const hex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');

  // ── Sun / light color ──
  // Midday: warm tan. Dawn: pinkish warmth. Dusk: deeper orange-red.
  const middaySunHex = '#b79e7d';
  const dawnSunHex = '#FFD4B0';
  const duskSunHex = '#FF8C42';

  let sunColorHex = middaySunHex;

  if (dawnGolden > 0) {
    sunColorHex = lerpHex(middaySunHex, dawnSunHex, dawnGolden);
  } else if (duskGolden > 0) {
    sunColorHex = lerpHex(middaySunHex, duskSunHex, duskGolden);
  }

  // ── Sky gradient colors (Ghibli palette) ──
  // Night:   deep navy → dark blue → dark horizon
  // Day:     rich blue → medium blue → light warm blue
  // Golden:  deep orange-blue → warm peach → golden horizon
  const nightTop = '#0C1223';
  const nightMid = '#121929';
  const nightHorizon = '#141E2D';

  const dayTop = '#1A3A70';
  const dayMid = '#2A5FA8';
  const dayHorizon = '#3A7AC8';

  // Sunrise palette — soft pinks, lavender, warm peach (Kiki's dawn over the ocean)
  const sunriseTop = '#3A2A5E';     // dusky lavender-blue
  const sunriseMid = '#FF6B9D';     // vibrant rose-pink
  const sunriseHorizon = '#FFAA77'; // intense warm peach-apricot

  // Sunset palette — deeper pinks, coral, magenta (Kiki's iconic sunset flight)
  const sunsetTop = '#4A2050';      // deep magenta-purple
  const sunsetMid = '#FF5555';      // vivid coral-pink
  const sunsetHorizon = '#FFA035';  // intense warm salmon-orange

  // Blend night → day based on dayFactor
  let skyTopHex = lerpHex(nightTop, dayTop, dayFactor);
  let skyMidHex = lerpHex(nightMid, dayMid, dayFactor);
  let skyHorizonHex = lerpHex(nightHorizon, dayHorizon, dayFactor);

  // Layer in sunrise warmth during dawn golden hour
  if (dawnGolden > 0) {
    skyTopHex = lerpHex(skyTopHex, sunriseTop, dawnGolden * 0.9);
    skyMidHex = lerpHex(skyMidHex, sunriseMid, dawnGolden * 0.83);
    skyHorizonHex = lerpHex(skyHorizonHex, sunriseHorizon, dawnGolden * 1.0);
  }

  // Layer in sunset warmth during dusk golden hour
  if (duskGolden > 0) {
    skyTopHex = lerpHex(skyTopHex, sunsetTop, duskGolden * 0.98);
    skyMidHex = lerpHex(skyMidHex, sunsetMid, duskGolden * 0.9);
    skyHorizonHex = lerpHex(skyHorizonHex, sunsetHorizon, duskGolden * 1.0);
  }

  // ── Lighting intensities ──
  const ambientIntensity =
    Math.round(lerp(0.1, lerp(0.25, 0.5, elevation), dayFactor) * 100) / 100;
  const directionalIntensity = isDaytime
    ? Math.round(lerp(0.1, lerp(1.5, 3.0, elevation), dayFactor) * 10) / 10
    : 0; // Sun light off when sun is not visible; moon light takes over

  // At night, use the frozen sunset lighting from 18.75 instead of the computed sun position
  let finalLightX = lightX;
  let finalLightY = lightY;
  let finalSunColorHex = sunColorHex;

  let finalElevation = elevation;

  if (!isDaytime) {
    // Compute what the sunset params would be at 18.75 (without full recursion)
    const sunsetHour = 18.75;
    const sunsetProgress = (sunsetHour - SUNRISE) / (SUNSET - SUNRISE);
    const sunsetSolarAngle = sunsetProgress * Math.PI;
    const sunsetElevation = Math.sin(sunsetSolarAngle);
    const sunsetEastWest = Math.cos(sunsetSolarAngle);

    finalLightX = Math.round(sunsetEastWest * 200);
    finalLightY = Math.round(sunsetElevation * 300);
    finalElevation = sunsetElevation;
    // Use white tone for night
    finalSunColorHex = '#FFFFFF';
  }

  // ── Cloud colors ──
  // Day: bright white. Night: dark gray-blue. Golden: warm cream. Moonlit: subtle blue-gray.
  const dayCloud = '#FFFFFF';
  const nightCloud = '#263040';
  const moonlitCloud = '#3A4A5C';    // subtle blue-gray under moonlight
  const sunriseCloud = '#F5A890';   // warm pink-cream clouds at dawn
  const sunsetCloud = '#F58860';    // coral-tinged clouds at dusk
  const sunriseShadow = '#A83860';  // dusty rose shadow
  const sunsetShadow = '#A82020';   // deep warm shadow

  const dayShadow = '#7A8EA0';
  const nightShadow = '#0D1520';
  const moonlitShadow = '#1A2B3A';   // subtle shadow under moonlight

  let cloudColorHex = lerpHex(nightCloud, dayCloud, dayFactor);
  let shadowColorHex = lerpHex(nightShadow, dayShadow, dayFactor);

  if (dawnGolden > 0) {
    cloudColorHex = lerpHex(cloudColorHex, sunriseCloud, dawnGolden * 0.75);
    shadowColorHex = lerpHex(shadowColorHex, sunriseShadow, dawnGolden * 0.6);
  }
  if (duskGolden > 0) {
    cloudColorHex = lerpHex(cloudColorHex, sunsetCloud, duskGolden * 0.83);
    shadowColorHex = lerpHex(shadowColorHex, sunsetShadow, duskGolden * 0.68);
  }
  // Layer in moonlit tint when moon is visible at night
  if (moonNightFactor > 0 && dayFactor < 0.3) {
    cloudColorHex = lerpHex(cloudColorHex, moonlitCloud, moonNightFactor * 0.4);
    shadowColorHex = lerpHex(shadowColorHex, moonlitShadow, moonNightFactor * 0.3);
  }

  // ── Fog ──
  // Fog color matches horizon, varies based on time of day
  // Shorter range at night for moodier atmosphere; longer at day
  // Near: 80-150m, Far: 2500-5500m with time-of-day variation
  const fogNear = isDaytime ? 100 : 80;
  const fogFar = isDaytime
    ? 4000 + 1500 * Math.max(0, elevation) // brighter days see farther
    : 1800 + 500 * Math.max(0, dayFactor);  // nights are hazier
  const fogColor = skyHorizonHex;

  // ── Moon light intensity ──
  const moonLightIntensity = Math.round(moonNightFactor * 0.35 * 100) / 100;
  const moonAmbientIntensity = Math.round(moonNightFactor * 0.12 * 100) / 100;
  const moonColorHex = '#c8d8f0'; // cool silver-blue

  return {
    lightX: finalLightX,
    lightY: finalLightY,
    lightZ,
    sunColorHex: finalSunColorHex,
    elevation: finalElevation,
    skyTopHex,
    skyMidHex,
    skyHorizonHex,
    cloudColorHex,
    shadowColorHex,
    ambientIntensity,
    directionalIntensity,
    fogColor,
    fogNear,
    fogFar,
    moonLightIntensity,
    moonAmbientIntensity,
    moonColorHex,
  };
}

const _now = new Date();
export const SOLAR = computeSolarParams(_now.getHours() + _now.getMinutes() / 60);

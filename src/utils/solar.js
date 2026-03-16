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
  const nightTop = '#0A1628';
  const nightMid = '#152238';
  const nightHorizon = '#1A2A40';

  const dayTop = '#1E5B8E';
  const dayMid = '#4A90C4';
  const dayHorizon = '#82bbe2';

  // Sunrise palette — soft pinks, lavender, warm peach (Kiki's dawn over the ocean)
  const sunriseTop = '#4A3A6E';     // dusky lavender-blue
  const sunriseMid = '#C4788E';     // soft rose-pink
  const sunriseHorizon = '#E8A880'; // warm peach-apricot

  // Sunset palette — deeper pinks, coral, magenta (Kiki's iconic sunset flight)
  const sunsetTop = '#5A3060';      // deep magenta-purple
  const sunsetMid = '#D06878';      // rich coral-pink
  const sunsetHorizon = '#E8906A';  // warm salmon-orange

  // Blend night → day based on dayFactor
  let skyTopHex = lerpHex(nightTop, dayTop, dayFactor);
  let skyMidHex = lerpHex(nightMid, dayMid, dayFactor);
  let skyHorizonHex = lerpHex(nightHorizon, dayHorizon, dayFactor);

  // Layer in sunrise warmth during dawn golden hour
  if (dawnGolden > 0) {
    skyTopHex = lerpHex(skyTopHex, sunriseTop, dawnGolden * 0.6);
    skyMidHex = lerpHex(skyMidHex, sunriseMid, dawnGolden * 0.55);
    skyHorizonHex = lerpHex(skyHorizonHex, sunriseHorizon, dawnGolden * 0.7);
  }

  // Layer in sunset warmth during dusk golden hour
  if (duskGolden > 0) {
    skyTopHex = lerpHex(skyTopHex, sunsetTop, duskGolden * 0.65);
    skyMidHex = lerpHex(skyMidHex, sunsetMid, duskGolden * 0.6);
    skyHorizonHex = lerpHex(skyHorizonHex, sunsetHorizon, duskGolden * 0.75);
  }

  // ── Lighting intensities ──
  const ambientIntensity =
    Math.round(lerp(0.03, lerp(0.10, 0.22, elevation), dayFactor) * 100) / 100;
  const directionalIntensity =
    Math.round(lerp(0.03, lerp(0.35, 0.8, elevation), dayFactor) * 10) / 10;

  // ── Cloud colors ──
  // Day: bright white. Night: dark gray-blue. Golden: warm cream.
  const dayCloud = '#FFFFFF';
  const nightCloud = '#263040';
  const sunriseCloud = '#E8C0B0';   // warm pink-cream clouds at dawn
  const sunsetCloud = '#E8A890';    // coral-tinged clouds at dusk
  const sunriseShadow = '#8A5A60';  // dusty rose shadow
  const sunsetShadow = '#7A4040';   // deep warm shadow

  const dayShadow = '#7A8EA0';
  const nightShadow = '#0D1520';

  let cloudColorHex = lerpHex(nightCloud, dayCloud, dayFactor);
  let shadowColorHex = lerpHex(nightShadow, dayShadow, dayFactor);

  if (dawnGolden > 0) {
    cloudColorHex = lerpHex(cloudColorHex, sunriseCloud, dawnGolden * 0.5);
    shadowColorHex = lerpHex(shadowColorHex, sunriseShadow, dawnGolden * 0.4);
  }
  if (duskGolden > 0) {
    cloudColorHex = lerpHex(cloudColorHex, sunsetCloud, duskGolden * 0.55);
    shadowColorHex = lerpHex(shadowColorHex, sunsetShadow, duskGolden * 0.45);
  }

  return {
    lightX,
    lightY,
    lightZ,
    sunColorHex,
    skyTopHex,
    skyMidHex,
    skyHorizonHex,
    cloudColorHex,
    shadowColorHex,
    ambientIntensity,
    directionalIntensity,
  };
}

const _now = new Date();
export const SOLAR = computeSolarParams(_now.getHours() + _now.getMinutes() / 60);

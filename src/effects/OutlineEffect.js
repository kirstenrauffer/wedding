import { Effect } from 'postprocessing';
import { Uniform } from 'three';
import { Vector3 } from 'three';

const fragmentShader = /* glsl */ `
  uniform float threshold;
  uniform float strength;
  uniform vec3 outlineColor;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 texel = 1.0 / resolution.xy;

    // Sample 3x3 neighborhood — use direct offset calculations to ensure proper sampling
    vec4 tl = texture2D(inputBuffer, uv + texel * vec2(-1.0, -1.0));
    vec4 t  = texture2D(inputBuffer, uv + texel * vec2(0.0, -1.0));
    vec4 tr = texture2D(inputBuffer, uv + texel * vec2(1.0, -1.0));
    vec4 l  = texture2D(inputBuffer, uv + texel * vec2(-1.0, 0.0));
    vec4 r  = texture2D(inputBuffer, uv + texel * vec2(1.0, 0.0));
    vec4 bl = texture2D(inputBuffer, uv + texel * vec2(-1.0, 1.0));
    vec4 b  = texture2D(inputBuffer, uv + texel * vec2(0.0, 1.0));
    vec4 br = texture2D(inputBuffer, uv + texel * vec2(1.0, 1.0));

    // Convert to grayscale for edge detection
    float gtl = dot(tl.rgb, vec3(0.299, 0.587, 0.114));
    float gt  = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    float gtr = dot(tr.rgb, vec3(0.299, 0.587, 0.114));
    float gl  = dot(l.rgb, vec3(0.299, 0.587, 0.114));
    float gr  = dot(r.rgb, vec3(0.299, 0.587, 0.114));
    float gbl = dot(bl.rgb, vec3(0.299, 0.587, 0.114));
    float gb  = dot(b.rgb, vec3(0.299, 0.587, 0.114));
    float gbr = dot(br.rgb, vec3(0.299, 0.587, 0.114));

    // Sobel operator
    float gx = -gtl - 2.0 * gl - gbl + gtr + 2.0 * gr + gbr;
    float gy = -gtl - 2.0 * gt - gtr + gbl + 2.0 * gb + gbr;
    float edge = sqrt(gx * gx + gy * gy);

    // Normalize edge magnitude and apply threshold
    edge = edge / (8.0 + 0.0001); // Normalize by max possible Sobel value
    float ink = smoothstep(threshold, threshold + 0.1, edge) * strength;

    // Blend outline color over input
    outputColor = vec4(mix(inputColor.rgb, outlineColor, ink), inputColor.a);
  }
`;

export class OutlineEffect extends Effect {
  constructor({ threshold = 0.1, strength = 1.5, outlineColor = [1.0, 0.2, 0.2] } = {}) {
    super('OutlineEffect', fragmentShader, {
      uniforms: new Map([
        ['threshold', new Uniform(threshold)],
        ['strength', new Uniform(strength)],
        ['outlineColor', new Uniform(new Vector3(...outlineColor))],
      ]),
    });
  }
}

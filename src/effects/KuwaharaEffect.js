import { Effect } from 'postprocessing';
import { Uniform } from 'three';

const fragmentShader = /* glsl */ `
  uniform float radius;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float size = radius;

    // Four quadrants
    vec3 quadrants[4];
    float variances[4];

    // Top-left
    {
      vec3 colorSum = vec3(0.0);
      vec3 colorSum2 = vec3(0.0);
      float count = 0.0;

      for (float i = -size; i <= 0.0; i += 1.0) {
        for (float j = -size; j <= 0.0; j += 1.0) {
          vec3 color = texture2D(inputBuffer, uv + vec2(i, j) * texelSize).rgb;
          colorSum += color;
          colorSum2 += color * color;
          count += 1.0;
        }
      }

      vec3 avg = colorSum / count;
      vec3 var = colorSum2 / count - avg * avg;
      quadrants[0] = avg;
      variances[0] = dot(var, vec3(0.299, 0.587, 0.114));
    }

    // Top-right
    {
      vec3 colorSum = vec3(0.0);
      vec3 colorSum2 = vec3(0.0);
      float count = 0.0;

      for (float i = 0.0; i <= size; i += 1.0) {
        for (float j = -size; j <= 0.0; j += 1.0) {
          vec3 color = texture2D(inputBuffer, uv + vec2(i, j) * texelSize).rgb;
          colorSum += color;
          colorSum2 += color * color;
          count += 1.0;
        }
      }

      vec3 avg = colorSum / count;
      vec3 var = colorSum2 / count - avg * avg;
      quadrants[1] = avg;
      variances[1] = dot(var, vec3(0.299, 0.587, 0.114));
    }

    // Bottom-left
    {
      vec3 colorSum = vec3(0.0);
      vec3 colorSum2 = vec3(0.0);
      float count = 0.0;

      for (float i = -size; i <= 0.0; i += 1.0) {
        for (float j = 0.0; j <= size; j += 1.0) {
          vec3 color = texture2D(inputBuffer, uv + vec2(i, j) * texelSize).rgb;
          colorSum += color;
          colorSum2 += color * color;
          count += 1.0;
        }
      }

      vec3 avg = colorSum / count;
      vec3 var = colorSum2 / count - avg * avg;
      quadrants[2] = avg;
      variances[2] = dot(var, vec3(0.299, 0.587, 0.114));
    }

    // Bottom-right
    {
      vec3 colorSum = vec3(0.0);
      vec3 colorSum2 = vec3(0.0);
      float count = 0.0;

      for (float i = 0.0; i <= size; i += 1.0) {
        for (float j = 0.0; j <= size; j += 1.0) {
          vec3 color = texture2D(inputBuffer, uv + vec2(i, j) * texelSize).rgb;
          colorSum += color;
          colorSum2 += color * color;
          count += 1.0;
        }
      }

      vec3 avg = colorSum / count;
      vec3 var = colorSum2 / count - avg * avg;
      quadrants[3] = avg;
      variances[3] = dot(var, vec3(0.299, 0.587, 0.114));
    }

    // Find quadrant with minimum variance
    vec3 result = quadrants[0];
    float minVar = variances[0];

    if (variances[1] < minVar) {
      minVar = variances[1];
      result = quadrants[1];
    }
    if (variances[2] < minVar) {
      minVar = variances[2];
      result = quadrants[2];
    }
    if (variances[3] < minVar) {
      minVar = variances[3];
      result = quadrants[3];
    }

    outputColor = vec4(result, inputColor.a);
  }
`;

export class KuwaharaEffect extends Effect {
  constructor(options = {}) {
    const { radius = 4.0, sharpness = 8.0 } = options;

    super('KuwaharaEffect', fragmentShader, {
      uniforms: new Map([
        ['radius', new Uniform(radius)],
        ['sharpness', new Uniform(sharpness)],
      ]),
    });
  }
}

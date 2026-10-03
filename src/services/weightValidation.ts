export const DEFAULT_WEIGHTS: [number, number, number, number] = [0.25, 0.40, 0.20, 0.15];

export interface WeightValidationResult {
  valid: boolean;
  normalizedWeights: [number, number, number, number];
  error?: string;
}

/**
 * Validates weight parameters and normalizes them so that sum equals 1.0.
 *
 * Rules:
 * - Must be an array of exactly 4 numbers.
 * - Each number must be finite, non-NaN, and >= 0 (0 to 1 range or unscaled weights).
 * - Sum of weights must be strictly greater than 0.
 * - If valid, returns normalized weights where w0 + w1 + w2 + w3 = 1.0.
 */
export function validateAndNormalizeWeights(inputWeights?: any): WeightValidationResult {
  if (inputWeights === undefined || inputWeights === null) {
    return {
      valid: true,
      normalizedWeights: [...DEFAULT_WEIGHTS],
    };
  }

  if (!Array.isArray(inputWeights) || inputWeights.length !== 4) {
    return {
      valid: false,
      normalizedWeights: [...DEFAULT_WEIGHTS],
      error: '가중치(weights)는 4개의 숫자를 포함하는 배열이어야 합니다.',
    };
  }

  for (let i = 0; i < 4; i++) {
    const val = inputWeights[i];
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val) || val < 0) {
      return {
        valid: false,
        normalizedWeights: [...DEFAULT_WEIGHTS],
        error: '가중치(weights)의 각 요소는 0 이상의 유효한 숫자여야 합니다.',
      };
    }
  }

  const numericWeights = inputWeights as [number, number, number, number];
  const sum = numericWeights[0] + numericWeights[1] + numericWeights[2] + numericWeights[3];

  if (sum <= 0) {
    return {
      valid: false,
      normalizedWeights: [...DEFAULT_WEIGHTS],
      error: '가중치(weights)의 합은 0보다 커야 합니다.',
    };
  }

  // Normalize so that sum = 1.0
  const norm0 = Math.round((numericWeights[0] / sum) * 10000) / 10000;
  const norm1 = Math.round((numericWeights[1] / sum) * 10000) / 10000;
  const norm2 = Math.round((numericWeights[2] / sum) * 10000) / 10000;
  const norm3 = Math.round((numericWeights[3] / sum) * 10000) / 10000;

  const normalizedWeights: [number, number, number, number] = [norm0, norm1, norm2, norm3];

  return {
    valid: true,
    normalizedWeights,
  };
}

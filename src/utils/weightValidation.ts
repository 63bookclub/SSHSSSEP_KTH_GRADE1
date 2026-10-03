/**
 * Utility for validating and normalizing scoring weights.
 * Default weights: [0.25, 0.40, 0.20, 0.15]
 */

export interface WeightValidationResult {
  isValid: boolean;
  error?: string;
  normalizedWeights: [number, number, number, number];
}

export const DEFAULT_WEIGHTS: [number, number, number, number] = [0.25, 0.40, 0.20, 0.15];

export function validateAndNormalizeWeights(
  inputWeights: any
): WeightValidationResult {
  if (inputWeights === undefined || inputWeights === null) {
    return {
      isValid: true,
      normalizedWeights: [...DEFAULT_WEIGHTS],
    };
  }

  if (!Array.isArray(inputWeights) || inputWeights.length !== 4) {
    return {
      isValid: false,
      error: '가중치(weights)는 정확히 4개의 원소를 포함하는 배열이어야 합니다.',
      normalizedWeights: [...DEFAULT_WEIGHTS],
    };
  }

  const parsed: number[] = [];
  for (let i = 0; i < 4; i++) {
    const val = inputWeights[i];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') {
        return {
          isValid: false,
          error: `가중치 배열의 ${i + 1}번째 항목이 비어 있거나 올바른 숫자가 아닙니다.`,
          normalizedWeights: [...DEFAULT_WEIGHTS],
        };
      }
      const num = Number(trimmed);
      if (isNaN(num) || !isFinite(num)) {
        return {
          isValid: false,
          error: `가중치 배열의 ${i + 1}번째 항목('${val}')은 유효한 숫자가 아닙니다.`,
          normalizedWeights: [...DEFAULT_WEIGHTS],
        };
      }
      parsed.push(num);
    } else if (typeof val === 'number') {
      if (isNaN(val) || !isFinite(val)) {
        return {
          isValid: false,
          error: `가중치 배열의 ${i + 1}번째 항목은 유효한 숫자가 아닙니다.`,
          normalizedWeights: [...DEFAULT_WEIGHTS],
        };
      }
      parsed.push(val);
    } else {
      return {
        isValid: false,
        error: `가중치 배열의 ${i + 1}번째 항목은 숫자이어야 합니다.`,
        normalizedWeights: [...DEFAULT_WEIGHTS],
      };
    }
  }

  for (let i = 0; i < 4; i++) {
    if (parsed[i] < 0) {
      return {
        isValid: false,
        error: `가중치는 음수일 수 없습니다: ${parsed[i]}`,
        normalizedWeights: [...DEFAULT_WEIGHTS],
      };
    }
  }

  const totalSum = parsed.reduce((a, b) => a + b, 0);
  if (totalSum <= 0) {
    return {
      isValid: false,
      error: '가중치 요소의 합은 0보다 커야 합니다.',
      normalizedWeights: [...DEFAULT_WEIGHTS],
    };
  }

  const norm0 = Math.round((parsed[0] / totalSum) * 10000) / 10000;
  const norm1 = Math.round((parsed[1] / totalSum) * 10000) / 10000;
  const norm2 = Math.round((parsed[2] / totalSum) * 10000) / 10000;
  const norm3 = Math.round((1 - norm0 - norm1 - norm2) * 10000) / 10000;

  const normalizedWeights: [number, number, number, number] = [norm0, norm1, norm2, norm3];

  return {
    isValid: true,
    normalizedWeights,
  };
}

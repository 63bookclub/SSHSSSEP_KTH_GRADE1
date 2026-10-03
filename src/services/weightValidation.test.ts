import { describe, expect, it } from 'bun:test';
import { validateAndNormalizeWeights, DEFAULT_WEIGHTS } from './weightValidation';

describe('Weight Validation and Normalization', () => {
  it('should return default weights when input is undefined or null', () => {
    const res1 = validateAndNormalizeWeights(undefined);
    expect(res1.valid).toBe(true);
    expect(res1.normalizedWeights).toEqual(DEFAULT_WEIGHTS);

    const res2 = validateAndNormalizeWeights(null);
    expect(res2.valid).toBe(true);
    expect(res2.normalizedWeights).toEqual(DEFAULT_WEIGHTS);
  });

  it('should accept valid weights that sum to 1.0', () => {
    const res = validateAndNormalizeWeights([0.25, 0.4, 0.2, 0.15]);
    expect(res.valid).toBe(true);
    expect(res.normalizedWeights).toEqual([0.25, 0.4, 0.2, 0.15]);
  });

  it('should normalize valid weights that sum to something other than 1.0', () => {
    const res = validateAndNormalizeWeights([1, 2, 1, 1]); // sum = 5
    expect(res.valid).toBe(true);
    expect(res.normalizedWeights).toEqual([0.2, 0.4, 0.2, 0.2]);
  });

  it('should reject non-array inputs or wrong array length', () => {
    const res1 = validateAndNormalizeWeights('invalid');
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain('가중치');

    const res2 = validateAndNormalizeWeights([0.5, 0.5]);
    expect(res2.valid).toBe(false);
    expect(res2.error).toContain('4개');
  });

  it('should reject array with negative numbers', () => {
    const res = validateAndNormalizeWeights([0.5, -0.2, 0.5, 0.2]);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('0 이상의 유효한 숫자');
  });

  it('should reject array with NaN or string values', () => {
    const res1 = validateAndNormalizeWeights([0.5, NaN, 0.3, 0.2]);
    expect(res1.valid).toBe(false);

    const res2 = validateAndNormalizeWeights([0.5, '0.3' as any, 0.1, 0.1]);
    expect(res2.valid).toBe(false);
  });

  it('should reject array with all zeroes (sum = 0)', () => {
    const res = validateAndNormalizeWeights([0, 0, 0, 0]);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('0보다 커야 합니다');
  });
});

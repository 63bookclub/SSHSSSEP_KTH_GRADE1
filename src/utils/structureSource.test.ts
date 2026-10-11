import { describe, test, expect } from 'bun:test';
import {
  resolveStructureSourceType,
  getStructureSourceInfo,
} from './structureSource.ts';

describe('Structure Source & Confidence Grade Utility', () => {
  test('should resolve correct structure source types', () => {
    expect(resolveStructureSourceType('experimental', true, false)).toBe('experimental');
    expect(resolveStructureSourceType('alphafold', false, false)).toBe('alphafold');
    expect(resolveStructureSourceType('esmfold', false, false)).toBe('esmfold');
    expect(resolveStructureSourceType('esmfold', false, true)).toBe('simulated');
    expect(resolveStructureSourceType('simulated', false, false)).toBe('simulated');
  });

  test('should return correct source info and confidence grade for simulated structures', () => {
    const info = getStructureSourceInfo('simulated', false, true, 0);
    expect(info.type).toBe('simulated');
    expect(info.label).toBe('모사(대체) 구조');
    expect(info.badgeText).toContain('모사(대체)');
    expect(info.confidenceGrade).toContain('모사 대체');
  });

  test('should return correct source info and confidence grade for experimental structures', () => {
    const info = getStructureSourceInfo('experimental', true, false, null);
    expect(info.type).toBe('experimental');
    expect(info.confidenceGrade).toContain('실험 결정 구조');
  });

  test('should return high confidence grade for AlphaFold/ESMFold with sConf >= 0.9', () => {
    const info = getStructureSourceInfo('alphafold', false, false, 0.95);
    expect(info.type).toBe('alphafold');
    expect(info.badgeText).toContain('AlphaFold DB');
    expect(info.confidenceGrade).toContain('매우 높음');
  });
});

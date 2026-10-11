import { describe, test, expect } from 'bun:test';
import { getStructureSourceInfo } from './structureSource.ts';

describe('Candidate Structure Source & Confidence Grade Utility', () => {
  test('should classify experimental PDB structure correctly', () => {
    const info = getStructureSourceInfo('experimental', true, false);
    expect(info.source).toBe('experimental');
    expect(info.badgeText).toBe('실험 결정 (PDB)');
    expect(info.confidenceGrade).toContain('실험 결정');
  });

  test('should classify AlphaFold DB structure correctly', () => {
    const info = getStructureSourceInfo('alphafold', false, false, 88.5);
    expect(info.source).toBe('alphafold');
    expect(info.badgeText).toBe('AlphaFold DB');
    expect(info.confidenceGrade).toContain('높음 (High: pLDDT 88.5 ≥ 70)');
  });

  test('should classify ESMFold prediction structure with high pLDDT correctly', () => {
    const info = getStructureSourceInfo('esmfold', false, false, 92.3);
    expect(info.source).toBe('esmfold');
    expect(info.badgeText).toBe('ESMFold 예측');
    expect(info.confidenceGrade).toContain('매우 높음 (Very High: pLDDT 92.3 ≥ 90)');
  });

  test('should classify simulated fallback structure correctly', () => {
    const info = getStructureSourceInfo('simulated', false, true);
    expect(info.source).toBe('simulated');
    expect(info.badgeText).toBe('모사 대체 (Simulated)');
    expect(info.confidenceGrade).toContain('모사 대체 구조');
  });
});

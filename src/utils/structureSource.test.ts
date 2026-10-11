import { describe, test, expect } from 'bun:test';
import { getStructureSourceInfo, getConfidenceGradeInfo } from './structureSource.ts';

describe('Structure Source Utility (getStructureSourceInfo)', () => {
  test('should classify experimental PDB structures', () => {
    const info = getStructureSourceInfo('experimental', false, true);
    expect(info.key).toBe('experimental');
    expect(info.badgeText).toBe('실험');
    expect(info.label).toContain('실험 결정 구조');
  });

  test('should classify AlphaFold DB structures', () => {
    const info = getStructureSourceInfo('alphafold', false, false);
    expect(info.key).toBe('alphafold');
    expect(info.badgeText).toBe('AlphaFold DB');
  });

  test('should classify ESMFold predicted structures', () => {
    const info = getStructureSourceInfo('esmfold', false, false);
    expect(info.key).toBe('esmfold');
    expect(info.badgeText).toBe('ESMFold 예측');
  });

  test('should classify simulated (threading) structures', () => {
    const info = getStructureSourceInfo('simulated', true, false);
    expect(info.key).toBe('simulated');
    expect(info.badgeText).toBe('모사(대체)');
  });
});

describe('Confidence Grade Utility (getConfidenceGradeInfo)', () => {
  test('should return High grade for score >= 75', () => {
    const grade = getConfidenceGradeInfo(82.5, false, false);
    expect(grade.level).toBe('high');
    expect(grade.label).toContain('높음 (High)');
    expect(grade.colorHex).toBe('#059669');
  });

  test('should return Moderate grade for score between 50 and 74.9', () => {
    const grade = getConfidenceGradeInfo(65.0, false, false);
    expect(grade.level).toBe('moderate');
    expect(grade.label).toContain('중간 (Moderate)');
    expect(grade.colorHex).toBe('#d97706');
  });

  test('should return Low grade for score < 50', () => {
    const grade = getConfidenceGradeInfo(42.0, false, false);
    expect(grade.level).toBe('low');
    expect(grade.label).toContain('낮음 (Low)');
    expect(grade.colorHex).toBe('#e11d48');
  });

  test('should append temporary epitope modifier label', () => {
    const grade = getConfidenceGradeInfo(80.0, true, false);
    expect(grade.label).toContain('(임시 에피톱)');
  });

  test('should append simulated structure modifier label', () => {
    const grade = getConfidenceGradeInfo(80.0, false, true);
    expect(grade.label).toContain('(모사 구조)');
  });
});

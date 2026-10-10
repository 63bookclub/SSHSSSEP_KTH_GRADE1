import { describe, test, expect } from 'bun:test';
import { getStructureSourceInfo, getConfidenceGrade } from './structureSource.ts';

describe('Structure Source Utilities (structureSource)', () => {
  describe('getStructureSourceInfo', () => {
    test('should classify simulated structures correctly', () => {
      const info = getStructureSourceInfo('simulated', true, false);
      expect(info.type).toBe('simulated');
      expect(info.badgeText).toBe('모사(대체)');
      expect(info.label).toContain('모사(대체) 구조');
    });

    test('should classify AlphaFold DB structures correctly', () => {
      const info = getStructureSourceInfo('alphafold', false, false);
      expect(info.type).toBe('alphafold');
      expect(info.badgeText).toBe('AlphaFold DB');
      expect(info.label).toContain('AlphaFold DB');
    });

    test('should classify experimental PDB structures correctly', () => {
      const info = getStructureSourceInfo('experimental', false, true);
      expect(info.type).toBe('experimental');
      expect(info.badgeText).toBe('실험');
      expect(info.label).toContain('실험 결정 구조');
    });

    test('should default to ESMFold prediction', () => {
      const info = getStructureSourceInfo('esmfold', false, false);
      expect(info.type).toBe('esmfold');
      expect(info.badgeText).toBe('ESMFold 예측');
      expect(info.label).toContain('ESMFold 예측 구조');
    });
  });

  describe('getConfidenceGrade', () => {
    test('should return High grade for score >= 75', () => {
      const grade = getConfidenceGrade(82.5, false, false);
      expect(grade.grade).toBe('High');
      expect(grade.label).toContain('높음');
    });

    test('should return Moderate grade for score between 50 and 75', () => {
      const grade = getConfidenceGrade(62.0, false, false);
      expect(grade.grade).toBe('Moderate');
      expect(grade.label).toContain('중간');
    });

    test('should return Low grade for score < 50', () => {
      const grade = getConfidenceGrade(35.0, false, false);
      expect(grade.grade).toBe('Low');
      expect(grade.label).toContain('낮음');
    });

    test('should append temporary epitope note when isTemporaryEpitope is true', () => {
      const grade = getConfidenceGrade(80.0, true, false);
      expect(grade.label).toContain('임시 에피톱 적용');
    });

    test('should append simulated note when isSimulated is true', () => {
      const grade = getConfidenceGrade(80.0, false, true);
      expect(grade.label).toContain('모사 구조 적용');
    });
  });
});

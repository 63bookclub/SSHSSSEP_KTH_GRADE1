import { describe, test, expect } from 'bun:test';
import { getStructureSourceInfo, getConfidenceGrade } from './structureSource.ts';

describe('Structure Source Utility (src/utils/structureSource.ts)', () => {
  describe('getStructureSourceInfo', () => {
    test('should classify simulated template structure when isSimulated is true', () => {
      const info = getStructureSourceInfo('sequence', false, true);
      expect(info.type).toBe('simulated');
      expect(info.label).toBe('모사 대체 구조 (Simulated Template)');
      expect(info.shortLabel).toBe('모사 대체');
      expect(info.isSimulated).toBe(true);
      expect(info.isExperimental).toBe(false);
    });

    test('should classify simulated structure when source is "simulated"', () => {
      const info = getStructureSourceInfo('simulated');
      expect(info.type).toBe('simulated');
      expect(info.label).toBe('모사 대체 구조 (Simulated Template)');
    });

    test('should classify AlphaFold DB structure when source is "alphafold"', () => {
      const info = getStructureSourceInfo('alphafold');
      expect(info.type).toBe('alphafold');
      expect(info.label).toBe('AlphaFold DB (pLDDT)');
      expect(info.shortLabel).toBe('AlphaFold DB');
      expect(info.isSimulated).toBe(false);
      expect(info.isExperimental).toBe(false);
    });

    test('should classify experimental PDB structure when isExperimental is true or source is "experimental"', () => {
      const info1 = getStructureSourceInfo('pdb', true, false);
      expect(info1.type).toBe('experimental');
      expect(info1.label).toBe('실험 결정 구조 (PDB)');
      expect(info1.isExperimental).toBe(true);

      const info2 = getStructureSourceInfo('experimental');
      expect(info2.type).toBe('experimental');
      expect(info2.label).toBe('실험 결정 구조 (PDB)');
    });

    test('should default to ESMFold prediction when no specific source match', () => {
      const info = getStructureSourceInfo('sequence');
      expect(info.type).toBe('esmfold');
      expect(info.label).toBe('ESMFold 예측 구조 (pLDDT)');
      expect(info.shortLabel).toBe('ESMFold 예측');
      expect(info.isSimulated).toBe(false);
      expect(info.isExperimental).toBe(false);
    });
  });

  describe('getConfidenceGrade', () => {
    test('should classify high grade for scores >= 75', () => {
      const grade = getConfidenceGrade(85.5);
      expect(grade.grade).toBe('high');
      expect(grade.label).toBe('높음 (High)');
      expect(grade.fullLabel).toBe('높음 (High)');
    });

    test('should classify moderate grade for scores >= 50 and < 75', () => {
      const grade = getConfidenceGrade(62.0);
      expect(grade.grade).toBe('moderate');
      expect(grade.label).toBe('중간 (Moderate)');
    });

    test('should classify low grade for scores < 50', () => {
      const grade = getConfidenceGrade(35.0);
      expect(grade.grade).toBe('low');
      expect(grade.label).toBe('낮음 (Low)');
    });

    test('should append temporary epitope modifier to fullLabel', () => {
      const grade = getConfidenceGrade(80.0, { isTemporaryEpitope: true });
      expect(grade.fullLabel).toBe('높음 (High) (임시 에피톱)');
    });

    test('should append simulated structure modifier to fullLabel', () => {
      const grade = getConfidenceGrade(80.0, { isSimulated: true });
      expect(grade.fullLabel).toBe('높음 (High) (모사 구조)');
    });
  });
});

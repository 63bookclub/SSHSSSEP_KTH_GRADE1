import { describe, it, expect } from 'bun:test';
import {
  getStructureSourceInfo,
  getStructureSourceReportLabel,
  getConfidenceGrade,
} from './structureSource.ts';

describe('Structure Source & Grade Utility', () => {
  describe('getStructureSourceInfo', () => {
    it('should correctly classify simulated structures', () => {
      const info = getStructureSourceInfo('simulated', true, false);
      expect(info.type).toBe('simulated');
      expect(info.label).toBe('모사 대체 (Simulated Template)');
      expect(info.isSimulated).toBe(true);
    });

    it('should correctly classify AlphaFold structures', () => {
      const info = getStructureSourceInfo('alphafold', false, false);
      expect(info.type).toBe('alphafold');
      expect(info.label).toBe('AlphaFold DB (pLDDT)');
    });

    it('should correctly classify experimental PDB structures', () => {
      const info = getStructureSourceInfo('experimental', false, true);
      expect(info.type).toBe('experimental');
      expect(info.label).toBe('실험 결정 구조 (PDB)');
    });

    it('should default to ESMFold prediction', () => {
      const info = getStructureSourceInfo('esmfold', false, false);
      expect(info.type).toBe('esmfold');
      expect(info.label).toBe('ESMFold 예측 (pLDDT)');
    });
  });

  describe('getStructureSourceReportLabel', () => {
    it('should return report labels for PDF export', () => {
      expect(getStructureSourceReportLabel('simulated')).toBe('모사 대체 구조 (Simulated Template)');
      expect(getStructureSourceReportLabel('alphafold')).toBe('AlphaFold DB (pLDDT)');
      expect(getStructureSourceReportLabel('experimental')).toBe('실험 결정 구조 (PDB)');
      expect(getStructureSourceReportLabel('esmfold')).toBe('ESMFold 예측 구조 (pLDDT)');
    });
  });

  describe('getConfidenceGrade', () => {
    it('should assign High grade for scores >= 75', () => {
      const grade = getConfidenceGrade(80.5);
      expect(grade.level).toBe('high');
      expect(grade.label).toBe('높음 (High)');
    });

    it('should assign Moderate grade for scores between 50 and 74.9', () => {
      const grade = getConfidenceGrade(65.0);
      expect(grade.level).toBe('moderate');
      expect(grade.label).toBe('중간 (Moderate)');
    });

    it('should assign Low grade for scores < 50', () => {
      const grade = getConfidenceGrade(30.0);
      expect(grade.level).toBe('low');
      expect(grade.label).toBe('낮음 (Low)');
    });

    it('should append annotations for temporary epitopes or simulated structures', () => {
      const tempGrade = getConfidenceGrade(80.0, { isTemporaryEpitope: true });
      expect(tempGrade.label).toBe('높음 (High) (임시 에피톱)');

      const simGrade = getConfidenceGrade(80.0, { isSimulated: true });
      expect(simGrade.label).toBe('높음 (High) (모사 구조)');
    });
  });
});

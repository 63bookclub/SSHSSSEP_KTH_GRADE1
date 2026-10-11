import { describe, expect, it } from 'bun:test';
import { getStructureSourceInfo, getConfidenceGradeInfo } from './structureSource.ts';

describe('structureSource utility', () => {
  it('correctly identifies simulated structure sources', () => {
    const info = getStructureSourceInfo('simulated', true, false);
    expect(info.source).toBe('simulated');
    expect(info.isSimulated).toBe(true);
    expect(info.label).toContain('모사');
  });

  it('correctly identifies alphafold structure sources', () => {
    const info = getStructureSourceInfo('alphafold', false, false);
    expect(info.source).toBe('alphafold');
    expect(info.label).toContain('AlphaFold DB');
  });

  it('correctly identifies experimental PDB structure sources', () => {
    const info = getStructureSourceInfo('experimental', false, true);
    expect(info.source).toBe('experimental');
    expect(info.isExperimental).toBe(true);
  });

  it('defaults to esmfold for unclassified or prediction sources', () => {
    const info = getStructureSourceInfo(undefined, false, false);
    expect(info.source).toBe('esmfold');
    expect(info.label).toContain('ESMFold');
  });

  it('calculates confidence grades and labels accurately', () => {
    const highGrade = getConfidenceGradeInfo(85.0, false, false);
    expect(highGrade.shortLabel).toBe('높음 (High)');
    expect(highGrade.gradeLabel).toBe('높음 (High)');

    const modGrade = getConfidenceGradeInfo(60.0, true, false);
    expect(modGrade.shortLabel).toBe('중간 (Moderate)');
    expect(modGrade.gradeLabel).toBe('중간 (Moderate) (임시 에피톱)');

    const lowGrade = getConfidenceGradeInfo(30.0, false, true);
    expect(lowGrade.shortLabel).toBe('낮음 (Low)');
    expect(lowGrade.gradeLabel).toBe('낮음 (Low) (모사 구조)');
  });
});

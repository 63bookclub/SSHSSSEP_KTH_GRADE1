import { describe, it, expect } from 'bun:test';
import { getStructureSourceInfo, getConfidenceGradeInfo } from './structureSource.ts';

describe('Structure Source Utility (getStructureSourceInfo)', () => {
  it('should return simulated source metadata when isSimulated is true', () => {
    const info = getStructureSourceInfo('esmfold', true, false);
    expect(info.key).toBe('simulated');
    expect(info.label).toContain('모사 대체 구조');
    expect(info.shortLabel).toBe('모사 구조');
  });

  it('should return experimental source metadata when isExperimental is true', () => {
    const info = getStructureSourceInfo('experimental', false, true);
    expect(info.key).toBe('experimental');
    expect(info.label).toContain('실험 결정 구조');
    expect(info.shortLabel).toBe('실험 결정 구조');
  });

  it('should return alphafold source metadata when candidateSource is alphafold', () => {
    const info = getStructureSourceInfo('alphafold', false, false);
    expect(info.key).toBe('alphafold');
    expect(info.label).toContain('AlphaFold DB');
    expect(info.shortLabel).toBe('AlphaFold DB');
  });

  it('should default to esmfold when candidateSource is empty or default', () => {
    const info = getStructureSourceInfo(undefined, false, false);
    expect(info.key).toBe('esmfold');
    expect(info.label).toContain('ESMFold 예측');
    expect(info.shortLabel).toBe('ESMFold 예측');
  });
});

describe('Confidence Grade Utility (getConfidenceGradeInfo)', () => {
  it('should return High grade with correct labels for score >= 75', () => {
    const grade = getConfidenceGradeInfo(82.5, {
      candidateSource: 'alphafold',
    });
    expect(grade.level).toBe('high');
    expect(grade.baseGrade).toBe('높음 (High)');
    expect(grade.fullGrade).toContain('AlphaFold DB');
  });

  it('should return Moderate grade for score between 50 and 75', () => {
    const grade = getConfidenceGradeInfo(60.0, {
      candidateSource: 'experimental',
      isExperimental: true,
    });
    expect(grade.level).toBe('moderate');
    expect(grade.baseGrade).toBe('중간 (Moderate)');
    expect(grade.fullGrade).toContain('실험 결정 구조');
  });

  it('should include temporary epitope suffix when isTemporaryEpitope is true', () => {
    const grade = getConfidenceGradeInfo(40.0, {
      candidateSource: 'esmfold',
      isTemporaryEpitope: true,
    });
    expect(grade.level).toBe('low');
    expect(grade.baseGrade).toBe('낮음 (Low)');
    expect(grade.fullGrade).toContain('임시 에피톱');
  });
});

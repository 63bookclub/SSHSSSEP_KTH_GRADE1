import { describe, test, expect } from 'bun:test';
import { getStructureSourceInfo, getConfidenceGradeInfo } from './structureSource.ts';

describe('Structure Source & Confidence Grade Utility', () => {
  test('classifies experimental structure correctly', () => {
    const info = getStructureSourceInfo({ candidate_source: 'experimental', is_experimental_candidate: true });
    expect(info.category).toBe('실험');
    expect(info.isExperimental).toBe(true);
    expect(info.isSimulated).toBe(false);
  });

  test('classifies AlphaFold DB structure correctly', () => {
    const info = getStructureSourceInfo({ candidate_source: 'alphafold' });
    expect(info.category).toBe('AlphaFold DB');
    expect(info.isExperimental).toBe(false);
    expect(info.isSimulated).toBe(false);
  });

  test('classifies ESMFold predicted structure correctly', () => {
    const info = getStructureSourceInfo({ candidate_source: 'esmfold' });
    expect(info.category).toBe('ESMFold 예측');
    expect(info.isExperimental).toBe(false);
    expect(info.isSimulated).toBe(false);
  });

  test('classifies simulated structure correctly', () => {
    const info = getStructureSourceInfo({ candidate_source: 'simulated', is_simulated: true });
    expect(info.category).toBe('모사(대체)');
    expect(info.isSimulated).toBe(true);
  });

  test('formats confidence grades and modifiers correctly', () => {
    const highGrade = getConfidenceGradeInfo(85.0);
    expect(highGrade.grade).toBe('높음 (High)');
    expect(highGrade.fullLabel).toBe('높음 (High)');

    const moderateGrade = getConfidenceGradeInfo(62.0, { isTemporaryEpitope: true });
    expect(moderateGrade.grade).toBe('중간 (Moderate)');
    expect(moderateGrade.fullLabel).toBe('중간 (Moderate) (임시 에피톱)');

    const lowGrade = getConfidenceGradeInfo(35.0, { isSimulated: true });
    expect(lowGrade.grade).toBe('낮음 (Low)');
    expect(lowGrade.fullLabel).toBe('낮음 (Low) (모사 구조)');
  });
});

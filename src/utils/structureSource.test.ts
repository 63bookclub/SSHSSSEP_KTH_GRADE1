import { describe, test, expect } from 'bun:test';
import { classifyStructureSource, getConfidenceGrade } from './structureSource.ts';

describe('Structure Source Classification & Confidence Grade', () => {
  test('classifyStructureSource returns simulated structure info for simulated structures', () => {
    const res = classifyStructureSource({ candidate_source: 'simulated' });
    expect(res.type).toBe('simulated');
    expect(res.label).toBe('모사(대체)');
    expect(res.badgeLabel).toBe('모사 대체 구조 (Simulated Template)');
    expect(res.isSimulated).toBe(true);
  });

  test('classifyStructureSource returns alphafold structure info', () => {
    const res = classifyStructureSource({ candidate_source: 'alphafold' });
    expect(res.type).toBe('alphafold');
    expect(res.badgeLabel).toBe('AlphaFold DB (pLDDT)');
    expect(res.isSimulated).toBe(false);
  });

  test('classifyStructureSource returns experimental structure info', () => {
    const res = classifyStructureSource({ is_experimental_candidate: true });
    expect(res.type).toBe('experimental');
    expect(res.badgeLabel).toBe('실험 결정 구조 (PDB)');
    expect(res.isExperimental).toBe(true);
  });

  test('classifyStructureSource defaults to ESMFold prediction', () => {
    const res = classifyStructureSource({});
    expect(res.type).toBe('esmfold');
    expect(res.badgeLabel).toBe('ESMFold 예측 (pLDDT)');
  });

  test('getConfidenceGrade calculates correct grades for high, moderate, and low scores', () => {
    const high = getConfidenceGrade(82.5);
    expect(high.grade).toBe('high');
    expect(high.label).toBe('높음 (High)');

    const moderate = getConfidenceGrade(65.0, { isTemporaryEpitope: true });
    expect(moderate.grade).toBe('moderate');
    expect(moderate.fullBadgeLabel).toBe('중간 (Moderate) (임시 에피톱)');

    const low = getConfidenceGrade(30.0, { isSimulated: true });
    expect(low.grade).toBe('low');
    expect(low.fullBadgeLabel).toBe('낮음 (Low) (모사 구조)');
  });
});

import { describe, expect, test } from 'bun:test';
import { getFitnessGrade, FITNESS_THRESHOLDS } from './gradeService.ts';

describe('Grade Service (getFitnessGrade)', () => {
  test('should assign HIGH grade for scores >= 75.0', () => {
    const res = getFitnessGrade(80.5);
    expect(res.level).toBe('HIGH');
    expect(res.label).toBe('높음 (High)');
    expect(res.scoreText).toBe('80.5');
    expect(res.note).toBeUndefined();
  });

  test('should assign MEDIUM grade for scores between 50.0 and 74.9', () => {
    const res = getFitnessGrade(55.0);
    expect(res.level).toBe('MEDIUM');
    expect(res.label).toBe('중간 (Medium)');
    expect(res.scoreText).toBe('55.0');
  });

  test('should assign LOW grade for scores < 50.0', () => {
    const res = getFitnessGrade(42.3);
    expect(res.level).toBe('LOW');
    expect(res.label).toBe('낮음 (Low)');
    expect(res.scoreText).toBe('42.3');
  });

  test('should attach note for temporary epitope flag', () => {
    const res = getFitnessGrade(85.0, { isTemporaryEpitope: true });
    expect(res.level).toBe('HIGH');
    expect(res.note).toContain('임시 에피톱');
  });

  test('should attach note for simulated structure flag', () => {
    const res = getFitnessGrade(60.0, { isSimulatedStructure: true });
    expect(res.level).toBe('MEDIUM');
    expect(res.note).toContain('모사');
  });

  test('should attach combined notes when both flags are true', () => {
    const res = getFitnessGrade(30.0, { isTemporaryEpitope: true, isSimulatedStructure: true });
    expect(res.level).toBe('LOW');
    expect(res.note).toContain('임시 에피톱');
    expect(res.note).toContain('모사');
  });

  test('should include threshold rationale text', () => {
    const res = getFitnessGrade(75.0);
    expect(res.thresholdRationale).toContain(`${FITNESS_THRESHOLDS.HIGH}점 이상`);
    expect(res.thresholdRationale).toContain(`${FITNESS_THRESHOLDS.MEDIUM}점 이상`);
  });
});

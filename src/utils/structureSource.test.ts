import { describe, it, expect } from 'bun:test';
import { getStructureSourceInfo, getGradeInfo } from './structureSource.ts';

describe('Structure Source & Grade Utilities', () => {
  it('should resolve simulated structure source correctly', () => {
    const info = getStructureSourceInfo('simulated', true, false);
    expect(info.type).toBe('simulated');
    expect(info.badgeText).toBe('모사(대체)');
    expect(info.isSimulated).toBe(true);
  });

  it('should resolve AlphaFold DB structure source correctly', () => {
    const info = getStructureSourceInfo('alphafold', false, false);
    expect(info.type).toBe('alphafold');
    expect(info.badgeText).toBe('AlphaFold DB');
    expect(info.isSimulated).toBe(false);
  });

  it('should resolve experimental structure source correctly', () => {
    const info = getStructureSourceInfo('experimental', false, true);
    expect(info.type).toBe('experimental');
    expect(info.badgeText).toBe('실험');
    expect(info.isSimulated).toBe(false);
  });

  it('should resolve ESMFold prediction as default structure source', () => {
    const info = getStructureSourceInfo('esmfold', false, false);
    expect(info.type).toBe('esmfold');
    expect(info.badgeText).toBe('ESMFold 예측');
    expect(info.isSimulated).toBe(false);
  });

  it('should compute grade info for high, moderate, and low scores', () => {
    const highGrade = getGradeInfo(85.0, false, false);
    expect(highGrade.grade).toBe('high');
    expect(highGrade.label).toBe('높음 (High)');

    const modGrade = getGradeInfo(60.0, true, false);
    expect(modGrade.grade).toBe('moderate');
    expect(modGrade.fullLabel).toContain('(임시 에피톱)');

    const lowGrade = getGradeInfo(30.0, false, true);
    expect(lowGrade.grade).toBe('low');
    expect(lowGrade.fullLabel).toContain('(모사 구조)');
  });
});

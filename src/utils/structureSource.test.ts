import { describe, expect, it } from 'bun:test';
import { getStructureSourceInfo } from './structureSource.ts';

describe('Structure Source Helper (getStructureSourceInfo)', () => {
  it('should return simulated category when isSimulated is true', () => {
    const info = getStructureSourceInfo('esmfold', false, true);
    expect(info.category).toBe('simulated');
    expect(info.badgeLabel).toBe('모사(대체)');
    expect(info.confidenceGrade).toContain('낮음');
    expect(info.fullLabel).toContain('[모사(대체)]');
  });

  it('should return alphafold category when candidateSource is alphafold', () => {
    const info = getStructureSourceInfo('alphafold', false, false);
    expect(info.category).toBe('alphafold');
    expect(info.badgeLabel).toBe('AlphaFold DB');
    expect(info.confidenceGrade).toContain('높음');
    expect(info.fullLabel).toContain('[AlphaFold DB]');
  });

  it('should return experimental category when isExperimental is true', () => {
    const info = getStructureSourceInfo('experimental', true, false);
    expect(info.category).toBe('experimental');
    expect(info.badgeLabel).toBe('실험');
    expect(info.confidenceGrade).toContain('실험 검증');
    expect(info.fullLabel).toContain('[실험]');
  });

  it('should return esmfold category by default for predicted candidate sequences', () => {
    const info = getStructureSourceInfo('esmfold', false, false);
    expect(info.category).toBe('esmfold');
    expect(info.badgeLabel).toBe('ESMFold 예측');
    expect(info.confidenceGrade).toContain('pLDDT');
    expect(info.fullLabel).toContain('[ESMFold 예측]');
  });
});

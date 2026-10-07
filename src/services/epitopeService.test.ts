import { describe, expect, it } from 'bun:test';
import { parsePdb } from './bioAlgorithms.ts';
import { resolveEpitopeInput } from './epitopeService.ts';

const mockTargetPdb = `
ATOM      1  CA  ALA A 100     0.000   0.000   0.000  1.00 80.00           C
ATOM      2  CA  GLY A 101     3.800   0.000   0.000  1.00 85.00           C
ATOM      3  CA  SER A 102     7.600   0.000   0.000  1.00 90.00           C
ATOM      4  CA  VAL A 103    11.400   0.000   0.000  1.00 95.00           C
ATOM      5  CA  LYS A 104    15.200   0.000   0.000  1.00 70.00           C
TER
END
`.trim();

const targetStructure = parsePdb(mockTargetPdb);

describe('Epitope Resolution Service (resolveEpitopeInput)', () => {
  it('should resolve valid manual residue range correctly', async () => {
    const result = await resolveEpitopeInput({
      targetStructure,
      targetChain: 'A',
      method: 'manual',
      manualRange: '100-102',
    });

    expect(result.isTemporary).toBe(false);
    expect(result.method).toBe('manual');
    expect(result.residues.length).toBe(3);
    expect(result.residues).toContain(100);
    expect(result.residues).toContain(101);
    expect(result.residues).toContain(102);
  });

  it('should throw explicit error for invalid manual range when fallback is disabled', async () => {
    expect(
      resolveEpitopeInput({
        targetStructure,
        targetChain: 'A',
        method: 'manual',
        manualRange: '990-995', // Out of target bounds
        allowTemporaryFallback: false,
      })
    ).rejects.toThrow('존재하지 않거나 유효하지 않습니다');
  });

  it('should throw explicit error when prediction CSV parsing yields 0 residues above threshold', async () => {
    const csvContent = `Residue_ID,Score
100,0.10
101,0.20
102,0.15`;

    expect(
      resolveEpitopeInput({
        targetStructure,
        targetChain: 'A',
        method: 'prediction_csv',
        predictionCsvText: csvContent,
        threshold: 0.80, // Scores are all below 0.80
        allowTemporaryFallback: false,
      })
    ).rejects.toThrow('임계값(0.8) 이상인 잔기가 0개입니다');
  });

  it('should throw explicit error when intersection mode yields 0 common residues', async () => {
    expect(
      resolveEpitopeInput({
        targetStructure,
        targetChain: 'A',
        method: 'manual',
        manualRange: '100-101',
        combinationMode: 'intersect',
        additionalRanges: '103-104', // No overlap with 100-101
        allowTemporaryFallback: false,
      })
    ).rejects.toThrow('교집합(Intersection) 모드 적용 결과 추출된 공통 에피톱 잔기가 0개입니다');
  });

  it('should use surface exposed residues when explicit temporary mode is requested', async () => {
    const result = await resolveEpitopeInput({
      targetStructure,
      targetChain: 'A',
      method: 'temporary_rsa',
    });

    expect(result.isTemporary).toBe(true);
    expect(result.method).toBe('temporary_rsa_fallback');
    expect(result.residues.length).toBeGreaterThan(0);
    expect(result.note).toContain('명시적으로 선택되었습니다');
  });

  it('should fall back to temporary mode when allowTemporaryFallback is true on invalid input', async () => {
    const result = await resolveEpitopeInput({
      targetStructure,
      targetChain: 'A',
      method: 'manual',
      manualRange: '999',
      allowTemporaryFallback: true,
    });

    expect(result.isTemporary).toBe(true);
    expect(result.method).toBe('temporary_rsa_fallback');
    expect(result.residues.length).toBeGreaterThan(0);
  });

  it('should record method as manual when complex epitope extraction fails and falls back to manualRange', async () => {
    const result = await resolveEpitopeInput({
      targetStructure,
      targetChain: 'A',
      method: 'complex',
      complexPdbId: 'INVALID_PDB_ID_9999',
      manualRange: '100-102',
    });

    expect(result.isTemporary).toBe(false);
    expect(result.method).toBe('manual');
    expect(result.residues.length).toBe(3);
    expect(result.note).toContain('수동 범위로 대체됨');
  });

  it('should throw explicit error when complex PDB download fails with non-OK or HTML error without manual range', async () => {
    expect(
      resolveEpitopeInput({
        targetStructure,
        targetChain: 'A',
        method: 'complex',
        complexPdbId: 'INVALID_PDB_ID_9999',
        allowTemporaryFallback: false,
      })
    ).rejects.toThrow('복합체 PDB (INVALID_PDB_ID_9999) 접촉 분석 실패');
  });
});

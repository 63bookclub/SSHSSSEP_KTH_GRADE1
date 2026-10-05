import { describe, it, expect, mock } from 'bun:test';
import { resolveTargetStructure } from './targetService.ts';

describe('Target Structure Resolution Service', () => {
  const samplePdbText = `HEADER    TEST PDB
ATOM      1  CA  ALA A   1      10.000  10.000  10.000  1.00 90.00           C
ATOM      2  CA  GLY A   2      13.800  10.000  10.000  1.00 90.00           C
END`;

  it('should resolve target from valid raw PDB content', async () => {
    const res = await resolveTargetStructure({
      rawContent: samplePdbText,
      filename: 'my_target.pdb',
    });

    expect(res.sourceType).toBe('file');
    expect(res.identifier).toBe('my_target.pdb');
    expect(res.parsedStructure.chains).toContain('A');
    expect(res.parsedStructure.allAtoms.length).toBe(2);
  });

  it('should resolve target from raw PDB string passed via inputString', async () => {
    const res = await resolveTargetStructure({
      inputString: samplePdbText,
    });

    expect(res.sourceType).toBe('file');
    expect(res.identifier).toBe('Custom_Target_PDB');
    expect(res.parsedStructure.chains).toContain('A');
  });

  it('should throw error for invalid UniProt ID', async () => {
    expect(
      resolveTargetStructure({ uniprotId: 'INVALID_ID_123!' })
    ).rejects.toThrow('유효하지 않은 UniProt ID 형식입니다');
  });

  it('should throw error for invalid PDB ID', async () => {
    expect(
      resolveTargetStructure({ pdbId: 'INVALID_PDB_ID' })
    ).rejects.toThrow('유효하지 않은 PDB ID 형식입니다');
  });

  it('should throw error when no input is provided', async () => {
    expect(resolveTargetStructure({})).rejects.toThrow(
      'UniProt ID, PDB ID, 구조 파일, 또는 타겟 서열 중 하나를 입력해야 합니다.'
    );
  });

  it('should throw error when PDB ID is not found and NOT fall back to synthetic helix', async () => {
    expect(
      resolveTargetStructure({ pdbId: '999X' })
    ).rejects.toThrow('RCSB PDB에서 999X를 다운로드할 수 없습니다.');
  });
});

import { describe, test, expect, spyOn, afterEach } from 'bun:test';
import { resolveTargetStructure } from './targetService.ts';
import * as esmFoldService from './esmFoldService.ts';

const SAMPLE_PDB = `ATOM      1  N   ALA A   1      10.000  10.000  10.000  1.00 90.00           N
ATOM      2  CA  ALA A   1      11.000  10.000  10.000  1.00 90.00           C
ATOM      3  C   ALA A   1      11.500  11.000  10.000  1.00 90.00           C
ATOM      4  O   ALA A   1      11.000  12.000  10.000  1.00 90.00           O
ATOM      5  N   GLY A   2      12.500  11.000  10.000  1.00 90.00           N
ATOM      6  CA  GLY A   2      13.000  12.000  10.000  1.00 90.00           C
END`;

describe('Target Resolution Service Unit Tests', () => {
  afterEach(() => {
    // Restore any mocks
  });

  test('should resolve raw PDB content correctly', async () => {
    const res = await resolveTargetStructure({ raw_content: SAMPLE_PDB, filename: 'test.pdb' });
    expect(res.sourceType).toBe('file');
    expect(res.identifier).toBe('test.pdb');
    expect(res.structure.chains).toContain('A');
    expect(res.structure.allAtoms.length).toBe(6);
  });

  test('should resolve raw PDB text via target_input', async () => {
    const res = await resolveTargetStructure({ target_input: SAMPLE_PDB });
    expect(res.sourceType).toBe('file');
    expect(res.identifier).toBe('Custom_Target_PDB');
    expect(res.structure.chains).toContain('A');
  });

  test('should throw error when PDB ID lookup fails instead of silent fallback', async () => {
    // Mock fetchWithTimeout to simulate 404
    const spy = spyOn(esmFoldService, 'fetchWithTimeout').mockImplementation(async () => {
      return new Response('Not Found', { status: 404 });
    });

    expect(resolveTargetStructure({ pdb_id: '9ZZZ' })).rejects.toThrow('RCSB PDB에서 9ZZZ를 다운로드할 수 없습니다.');

    spy.mockRestore();
  });

  test('should throw error when UniProt lookup fails instead of returning fake helix for P0DTC2', async () => {
    const spy = spyOn(esmFoldService, 'fetchWithTimeout').mockImplementation(async () => {
      return new Response('Not Found', { status: 404 });
    });

    expect(resolveTargetStructure({ uniprot_id: 'P0DTC2' })).rejects.toThrow('AlphaFold DB에서 해당 UniProt ID (P0DTC2)를 찾을 수 없습니다.');

    spy.mockRestore();
  });

  test('should call ESMFold when target_input is an amino acid sequence and throw if ESMFold fails', async () => {
    const spy = spyOn(esmFoldService, 'predictStructureWithESMFold').mockResolvedValue({
      success: false,
      error: 'ESMFold server error',
    });

    const seq = 'MKTIIALSYIFCLVFADYKDDDDK';
    expect(resolveTargetStructure({ target_input: seq })).rejects.toThrow('ESMFold 타겟 구조 예측 실패');

    spy.mockRestore();
  });

  test('should successfully resolve sequence via ESMFold prediction', async () => {
    const spy = spyOn(esmFoldService, 'predictStructureWithESMFold').mockResolvedValue({
      success: true,
      pdbText: SAMPLE_PDB,
    });

    const seq = 'MKTIIALSYIFCLVFADYKDDDDK';
    const res = await resolveTargetStructure({ target_input: seq });
    expect(res.sourceType).toBe('file');
    expect(res.identifier).toBe('Target_Sequence_ESMFold');
    expect(res.structure.allAtoms.length).toBe(6);

    spy.mockRestore();
  });

  test('should throw error when no valid target option is provided', async () => {
    expect(resolveTargetStructure({})).rejects.toThrow('UniProt ID, PDB ID, 구조 파일(raw_content), 또는 타겟 입력(target_input) 중 하나를 제공해야 합니다.');
  });
});

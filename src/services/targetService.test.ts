import { describe, test, expect } from 'bun:test';
import {
  resolveTargetStructure,
  fetchTargetByPdbId,
  fetchTargetByUniprotId,
} from './targetService.ts';

const SAMPLE_PDB = `HEADER    TEST STRUCTURE
ATOM      1  N   ALA A   1      10.000  10.000  10.000  1.00 20.00           N
ATOM      2  CA  ALA A   1      11.500  10.000  10.000  1.00 20.00           C
ATOM      3  C   ALA A   1      12.000  11.500  10.000  1.00 20.00           C
ATOM      4  O   ALA A   1      11.200  12.500  10.000  1.00 20.00           O
ATOM      5  CB  ALA A   1      12.000   9.000  11.000  1.00 20.00           C
END`;

describe('targetService Unit Tests', () => {
  describe('fetchTargetByPdbId', () => {
    test('should reject invalid PDB ID format without network calls', async () => {
      const res = await fetchTargetByPdbId('INVALID_PDB_ID_FORMAT');
      expect(res.success).toBe(false);
      expect(res.error).toContain('유효하지 않은 PDB ID');
    });
  });

  describe('fetchTargetByUniprotId', () => {
    test('should reject invalid UniProt ID format without network calls', async () => {
      const res = await fetchTargetByUniprotId('INVALID_UNIPROT_ID');
      expect(res.success).toBe(false);
      expect(res.error).toContain('유효하지 않은 UniProt ID');
    });
  });

  describe('resolveTargetStructure', () => {
    test('should parse raw PDB structure text correctly', async () => {
      const res = await resolveTargetStructure(SAMPLE_PDB);
      expect(res.success).toBe(true);
      expect(res.sourceType).toBe('file');
      expect(res.identifier).toBe('Custom_Target_PDB');
      expect(res.parsedStructure?.chains).toContain('A');
      expect(res.parsedStructure?.allAtoms.length).toBe(5);
    });

    test('should return error when raw PDB structure has no valid ATOM coordinates', async () => {
      const emptyPdb = `HEADER    EMPTY STRUCTURE\nEND`;
      const res = await resolveTargetStructure(emptyPdb);
      expect(res.success).toBe(false);
      expect(res.error).toContain('ATOM 원자 좌표를 파싱하지 못했습니다');
    });

    test('should reject unrecognized or empty target inputs', async () => {
      const emptyRes = await resolveTargetStructure('');
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toContain('비어 있습니다');

      const invalidRes = await resolveTargetStructure('XYZ!@#$%');
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.error).toContain('유효하지 않은 타겟 입력입니다');
    });

    test('should reject non-protein amino acid sequence target inputs gracefully', async () => {
      const invalidSeqRes = await resolveTargetStructure('ACDEFGHIKLMNPQRSTVWY12345');
      expect(invalidSeqRes.success).toBe(false);
      expect(invalidSeqRes.error).toContain('유효하지 않은 타겟 입력입니다');
    });
  });
});

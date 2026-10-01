// @ts-ignore
import { describe, test, expect } from 'bun:test';
import {
  parsePdb,
  parseMmcif,
  extractComplexContacts,
  mapComplexResiduesToTarget,
  getResidueKey,
  Residue,
} from './services/bioAlgorithms';

describe('Residue Key and Insertion Code / AltLoc Handling', () => {
  test('getResidueKey correctly formats composite key', () => {
    expect(getResidueKey(100)).toBe('100');
    expect(getResidueKey(100, 'A')).toBe('100A');
    expect(getResidueKey(100, ' ')).toBe('100');
    expect(getResidueKey(100, '?')).toBe('100');
  });

  test('parsePdb correctly handles insertion codes and altLoc', () => {
    const pdbContent = `
ATOM    100  N   VAL A 100    10.000  10.000  10.000  1.00 80.00           N
ATOM    101  CA  VAL A 100    11.000  10.000  10.000  1.00 80.00           C
ATOM    102  N   ALA A 100A   12.000  10.000  10.000  1.00 80.00           N
ATOM    103  CA  ALA A 100A   13.000  10.000  10.000  1.00 80.00           C
ATOM    104  N  AVAL A 101    14.000  10.000  10.000  0.50 80.00           N
ATOM    105  N  BVAL A 101    15.000  10.000  10.000  0.50 80.00           N
TER
END
`.trim();

    const struct = parsePdb(pdbContent);
    const chainA = struct.residuesByChain['A'];

    expect(chainA).toBeDefined();
    // Residues should include 100, 100A, and 101 (altLoc B skipped)
    expect(chainA.length).toBe(3);
    expect(chainA[0].resKey).toBe('100');
    expect(chainA[0].resName).toBe('VAL');
    expect(chainA[1].resKey).toBe('100A');
    expect(chainA[1].resName).toBe('ALA');
    expect(chainA[2].resKey).toBe('101');
    expect(chainA[2].atoms.length).toBe(1); // AltLoc 'A' kept, 'B' skipped
  });
});

describe('SIFTS and Complex Contact Mapping', () => {
  test('mapComplexResiduesToTarget maps via SIFTS dictionary', () => {
    const mockComplexRes: Residue[] = [
      { resSeq: 333, resKey: '333', resName: 'VAL', chain: 'E', caAtom: null, atoms: [] },
      { resSeq: 484, resKey: '484', resName: 'ELU', chain: 'E', caAtom: null, atoms: [] },
      { resSeq: 501, resKey: '501', resName: 'ASN', chain: 'E', caAtom: null, atoms: [] },
    ];

    const mockTargetRes: Residue[] = [
      { resSeq: 333, resKey: '333', resName: 'VAL', chain: 'A', caAtom: null, atoms: [] },
      { resSeq: 484, resKey: '484', resName: 'GLU', chain: 'A', caAtom: null, atoms: [] },
      { resSeq: 501, resKey: '501', resName: 'ASN', chain: 'A', caAtom: null, atoms: [] },
    ];

    const siftsMap = new Map<string, number>([
      ['333', 333],
      ['484', 484],
      ['501', 501],
    ]);

    const mapped = mapComplexResiduesToTarget(mockComplexRes, mockTargetRes, ['484', '501'], siftsMap);
    expect(mapped).toEqual([484, 501]);
  });

  test('mapComplexResiduesToTarget falls back to sequence alignment when numbering differs', () => {
    // Complex uses 333..335, Target fragment uses 1..3
    const mockComplexRes: Residue[] = [
      { resSeq: 333, resKey: '333', resName: 'VAL', chain: 'E', caAtom: null, atoms: [] },
      { resSeq: 334, resKey: '334', resName: 'GLU', chain: 'E', caAtom: null, atoms: [] },
      { resSeq: 335, resKey: '335', resName: 'ASN', chain: 'E', caAtom: null, atoms: [] },
    ];

    const mockTargetRes: Residue[] = [
      { resSeq: 1, resKey: '1', resName: 'VAL', chain: 'A', caAtom: null, atoms: [] },
      { resSeq: 2, resKey: '2', resName: 'GLU', chain: 'A', caAtom: null, atoms: [] },
      { resSeq: 3, resKey: '3', resName: 'ASN', chain: 'A', caAtom: null, atoms: [] },
    ];

    const mapped = mapComplexResiduesToTarget(mockComplexRes, mockTargetRes, ['334'], undefined);
    expect(mapped).toEqual([2]);
  });
});

import { expect, test, describe } from 'bun:test';
import { parsePdb, parseMmcif, formatResidueId, getResidueKey } from './bioAlgorithms';
import { alignResidueSequences, mapComplexResiduesToTarget } from './siftsMapping';

describe('bioAlgorithms - Insertion Code (iCode) & altLoc tests', () => {
  test('parsePdb correctly handles insertion codes without overwriting residues', () => {
    const pdbData = [
      'ATOM      1  N   ALA A 100      10.000  10.000  10.000  1.00 80.00           N',
      'ATOM      2  CA  ALA A 100      11.000  10.000  10.000  1.00 80.00           C',
      'ATOM      3  N   GLY A 100A     12.000  10.000  10.000  1.00 80.00           N',
      'ATOM      4  CA  GLY A 100A     13.000  10.000  10.000  1.00 80.00           C',
      'ATOM      5  N   SER A 100B     14.000  10.000  10.000  1.00 80.00           N',
      'ATOM      6  CA  SER A 100B     15.000  10.000  10.000  1.00 80.00           C',
      'ATOM      7  N   VAL A 101      16.000  10.000  10.000  1.00 80.00           N',
      'ATOM      8  CA  VAL A 101      17.000  10.000  10.000  1.00 80.00           C',
    ].join('\n');

    const parsed = parsePdb(pdbData);
    const chainA = parsed.residuesByChain['A'];

    expect(chainA).toBeDefined();
    expect(chainA.length).toBe(4);

    expect(chainA[0].resSeq).toBe(100);
    expect(chainA[0].iCode).toBe('');
    expect(chainA[0].resName).toBe('ALA');

    expect(chainA[1].resSeq).toBe(100);
    expect(chainA[1].iCode).toBe('A');
    expect(chainA[1].resName).toBe('GLY');

    expect(chainA[2].resSeq).toBe(100);
    expect(chainA[2].iCode).toBe('B');
    expect(chainA[2].resName).toBe('SER');

    expect(chainA[3].resSeq).toBe(101);
    expect(chainA[3].iCode).toBe('');
    expect(chainA[3].resName).toBe('VAL');
  });

  test('parsePdb filters out altLoc B conformations', () => {
    const pdbData = [
      'ATOM      1  N  AALA A 100      10.000  10.000  10.000  0.50 80.00           N',
      'ATOM      2  N  BALA A 100      10.500  10.500  10.500  0.50 80.00           N',
      'ATOM      3  CA AALA A 100      11.000  10.000  10.000  0.50 80.00           C',
      'ATOM      4  CA BALA A 100      11.500  10.500  10.500  0.50 80.00           C',
    ].join('\n');

    const parsed = parsePdb(pdbData);
    const chainA = parsed.residuesByChain['A'];

    expect(chainA.length).toBe(1);
    expect(chainA[0].atoms.length).toBe(2); // Only altLoc 'A' atoms kept
    expect(chainA[0].atoms[0].x).toBe(10.0);
  });

  test('formatResidueId and getResidueKey helpers produce accurate composite keys', () => {
    expect(getResidueKey('A', 100)).toBe('A:100');
    expect(getResidueKey('A', 100, 'A')).toBe('A:100A');
    expect(formatResidueId(100)).toBe(100);
    expect(formatResidueId(100, 'A')).toBe('100A');
  });
});

describe('siftsMapping - Residue Mapping Tests', () => {
  test('alignResidueSequences correctly aligns shifted numbering', () => {
    const complexPdb = [
      'ATOM      1  CA  ARG A 319      10.000  10.000  10.000  1.00 80.00           C',
      'ATOM      2  CA  VAL A 320      11.000  10.000  10.000  1.00 80.00           C',
      'ATOM      3  CA  GLN A 321      12.000  10.000  10.000  1.00 80.00           C',
      'ATOM      4  CA  PRO A 322      13.000  10.000  10.000  1.00 80.00           C',
    ].join('\n');

    const targetPdb = [
      'ATOM      1  CA  ARG A   1      10.000  10.000  10.000  1.00 80.00           C',
      'ATOM      2  CA  VAL A   2      11.000  10.000  10.000  1.00 80.00           C',
      'ATOM      3  CA  GLN A   3      12.000  10.000  10.000  1.00 80.00           C',
      'ATOM      4  CA  PRO A   4      13.000  10.000  10.000  1.00 80.00           C',
    ].join('\n');

    const complexStruct = parsePdb(complexPdb);
    const targetStruct = parsePdb(targetPdb);

    const aligned = alignResidueSequences(
      complexStruct.residuesByChain['A'],
      targetStruct.residuesByChain['A']
    );

    expect(aligned.length).toBe(4);
    expect(aligned[0].complexRes.resSeq).toBe(319);
    expect(aligned[0].targetRes.resSeq).toBe(1);
    expect(aligned[3].complexRes.resSeq).toBe(322);
    expect(aligned[3].targetRes.resSeq).toBe(4);
  });

  test('mapComplexResiduesToTarget maps complex contact residue numbers to target numbering', async () => {
    const complexPdb = [
      'ATOM      1  CA  ARG A 319       0.000   0.000   0.000  1.00 80.00           C',
      'ATOM      2  CA  VAL A 320      10.000  10.000  10.000  1.00 80.00           C',
      'ATOM      3  CA  GLN H   1      11.000  10.000  10.000  1.00 80.00           C', // antibody contact
    ].join('\n');

    const targetPdb = [
      'ATOM      1  CA  ARG A   1       0.000   0.000   0.000  1.00 80.00           C',
      'ATOM      2  CA  VAL A   2      10.000  10.000  10.000  1.00 80.00           C',
    ].join('\n');

    const complexStruct = parsePdb(complexPdb);
    const targetStruct = parsePdb(targetPdb);

    const result = await mapComplexResiduesToTarget(
      complexStruct,
      'A',
      targetStruct,
      'A',
      undefined,
      ['H'],
      4.5
    );

    expect(result.targetResidueSeqs).toContain(2); // Val (320 in complex) mapped to 2 in target
  });
});

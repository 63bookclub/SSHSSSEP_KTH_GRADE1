import { describe, test, expect } from 'bun:test';
import { applyNoiseToPdb, applyRigidTransformToPdb, truncatePdbResidues } from './pdbTransformations.ts';
import { parsePdb } from '../services/bioAlgorithms.ts';

const SAMPLE_PDB = `ATOM      1  N   THR E 333     -34.808  16.588  48.236  1.00107.78           N
ATOM      2  CA  THR E 333     -34.100  15.480  47.592  1.00115.74           C
ATOM      3  C   THR E 333     -34.909  14.801  46.465  1.00119.65           C
ATOM      4  O   THR E 333     -34.954  13.568  46.370  1.00119.56           O
ATOM      5  N   ASN E 334     -35.532  15.604  45.605  1.00112.95           N
ATOM      6  CA  ASN E 334     -36.287  15.087  44.474  1.00108.01           C
TER
END`;

describe('PDB Coordinate Transformations', () => {
  test('applyNoiseToPdb modifies coordinates', () => {
    const noisyPdb = applyNoiseToPdb(SAMPLE_PDB, 1.0);
    expect(noisyPdb).not.toBe(SAMPLE_PDB);
    const parsed = parsePdb(noisyPdb);
    expect(parsed.chains).toContain('E');
    expect(parsed.allAtoms.length).toBe(6);
  });

  test('applyRigidTransformToPdb translates coordinates', () => {
    const transformedPdb = applyRigidTransformToPdb(SAMPLE_PDB, [10, -20, 30], 90);
    expect(transformedPdb).not.toBe(SAMPLE_PDB);
    const parsed = parsePdb(transformedPdb);
    expect(parsed.allAtoms.length).toBe(6);
  });

  test('truncatePdbResidues limits maximum number of residues', () => {
    const truncated = truncatePdbResidues(SAMPLE_PDB, 1);
    const parsed = parsePdb(truncated);
    expect(parsed.residuesByChain['E'].length).toBe(1);
    expect(parsed.allAtoms.length).toBe(4); // THR 333 has 4 atoms in SAMPLE_PDB
  });
});

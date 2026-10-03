import { describe, expect, it } from 'bun:test';
import {
  parsePdb,
  parseMmcif,
  extractComplexContacts,
  alignStructures,
  evaluateAntigenicMimicry,
  getResidueKey,
  parseResidueRange,
  calculateSASA,
  parseFastaInput,
  normalizeAndValidateWeights,
} from './bioAlgorithms';
import { mapResiduesBySequenceAlignment, mapComplexResiduesToTarget } from './siftsService';

describe('PDB & mmCIF Parser with Insertion Codes & AltLoc', () => {
  it('should parse PDB lines with insertion codes without overwriting residues', () => {
    const pdbContent = `
ATOM      1  N   ALA A 100     10.000  10.000  10.000  1.00 80.00           N
ATOM      2  CA  ALA A 100     11.000  10.000  10.000  1.00 80.00           C
ATOM      3  N   GLY A 100A    12.000  10.000  10.000  1.00 80.00           N
ATOM      4  CA  GLY A 100A    13.000  10.000  10.000  1.00 80.00           C
ATOM      5  N   SER A 100B    14.000  10.000  10.000  1.00 80.00           N
ATOM      6  CA  SER A 100B    15.000  10.000  10.000  1.00 80.00           C
TER
END
`.trim();

    const struct = parsePdb(pdbContent);
    const chainA = struct.residuesByChain['A'];

    expect(chainA).toBeDefined();
    expect(chainA.length).toBe(3);

    expect(chainA[0].resSeq).toBe(100);
    expect(chainA[0].iCode).toBeUndefined();
    expect(chainA[0].resKey).toBe('100');
    expect(chainA[0].resName).toBe('ALA');

    expect(chainA[1].resSeq).toBe(100);
    expect(chainA[1].iCode).toBe('A');
    expect(chainA[1].resKey).toBe('100A');
    expect(chainA[1].resName).toBe('GLY');

    expect(chainA[2].resSeq).toBe(100);
    expect(chainA[2].iCode).toBe('B');
    expect(chainA[2].resKey).toBe('100B');
    expect(chainA[2].resName).toBe('SER');
  });

  it('should filter secondary alternate location indicators (altLoc) in PDB parser', () => {
    const pdbWithAltLoc = `
ATOM      1  N  AALA A 101     10.000  10.000  10.000  0.50 80.00           N
ATOM      2  N  BALA A 101     10.500  10.500  10.500  0.50 82.00           N
ATOM      3  CA AALA A 101     11.000  10.000  10.000  0.50 80.00           C
ATOM      4  CA BALA A 101     11.500  10.500  10.500  0.50 82.00           C
TER
END
`.trim();

    const struct = parsePdb(pdbWithAltLoc);
    const res = struct.residuesByChain['A'][0];

    expect(res).toBeDefined();
    // Only altLoc 'A' atoms should be parsed
    expect(res.atoms.length).toBe(2);
    expect(res.atoms[0].altLoc).toBe('A');
    expect(res.atoms[0].x).toBe(10.0);
  });

  it('should parse mmCIF loop format with insertion code and altLoc', () => {
    const mmcifContent = `
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.auth_atom_id
_atom_site.label_alt_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
ATOM 1 N  N . VAL A 50 . 1.0 2.0 3.0 1.00 80.00
ATOM 2 CA CA . VAL A 50 . 2.0 2.0 3.0 1.00 80.00
ATOM 3 N  N . LYS A 50 A 3.0 2.0 3.0 1.00 80.00
ATOM 4 CA CA . LYS A 50 A 4.0 2.0 3.0 1.00 80.00
#
`.trim();

    const struct = parseMmcif(mmcifContent);
    const chainA = struct.residuesByChain['A'];

    expect(chainA.length).toBe(2);
    expect(chainA[0].resKey).toBe('50');
    expect(chainA[0].resName).toBe('VAL');
    expect(chainA[1].resKey).toBe('50A');
    expect(chainA[1].resName).toBe('LYS');
  });
});

describe('SIFTS & Sequence Alignment Residue Mapping', () => {
  it('should map complex contact residues to target structure via sequence alignment when residue numbers differ', () => {
    const complexPdb = `
ATOM      1  CA  ARG A 500     0.000   0.000   0.000  1.00 80.00           C
ATOM      2  CA  HIS A 501     3.800   0.000   0.000  1.00 80.00           C
ATOM      3  CA  ASP A 502     7.600   0.000   0.000  1.00 80.00           C
ATOM      4  CA  ALA B   1     1.000   0.000   0.000  1.00 80.00           C
TER
END
`.trim();

    const targetPdb = `
ATOM      1  CA  ARG T 100     0.000   0.000   0.000  1.00 80.00           C
ATOM      2  CA  HIS T 101     3.800   0.000   0.000  1.00 80.00           C
ATOM      3  CA  ASP T 102     7.600   0.000   0.000  1.00 80.00           C
TER
END
`.trim();

    const complexStruct = parsePdb(complexPdb);
    const targetStruct = parsePdb(targetPdb);

    // Extract contacts between antigen chain A and antibody chain B
    const rawContacts = extractComplexContacts(complexStruct, 'A', ['B'], 4.5);
    expect(rawContacts).toContain('500');

    // Align & map complex antigen chain A (500..502) to target chain T (100..102)
    const mapResult = mapResiduesBySequenceAlignment(
      complexStruct.residuesByChain['A'],
      targetStruct.residuesByChain['T'],
      rawContacts
    );

    expect(mapResult.mappedResidues).toContain('100');
    expect(mapResult.mappedResidues).not.toContain('500');
  });

  it('should parse residue range inputs with insertion codes', () => {
    const rangeResult = parseResidueRange('100-103, 100A, 100B');
    expect(rangeResult).toContain(100);
    expect(rangeResult).toContain(101);
    expect(rangeResult).toContain(102);
    expect(rangeResult).toContain(103);
    expect(rangeResult).toContain('100A');
    expect(rangeResult).toContain('100B');
  });
});

describe('Assembly-wide SASA Calculation', () => {
  it('should reduce SASA for contact interface residues when full assembly context is provided', () => {
    // Two chains A and B in close contact
    const multiChainPdb = `
ATOM      1  N   ALA A   1     0.000   0.000   0.000  1.00 80.00           N
ATOM      2  CA  ALA A   1     1.450   0.000   0.000  1.00 80.00           C
ATOM      3  C   ALA A   1     2.000   1.200   0.000  1.00 80.00           C
ATOM      4  O   ALA A   1     1.300   2.200   0.000  1.00 80.00           O
ATOM      5  N   GLY B   1     0.000   0.000   2.800  1.00 80.00           N
ATOM      6  CA  GLY B   1     1.450   0.000   2.800  1.00 80.00           C
ATOM      7  C   GLY B   1     2.000   1.200   2.800  1.00 80.00           C
ATOM      8  O   GLY B   1     1.300   2.200   2.800  1.00 80.00           O
TER
END
`.trim();

    const struct1 = parsePdb(multiChainPdb);
    const chainA1 = struct1.residuesByChain['A'];
    // 1. Calculate chain A in isolation
    calculateSASA(chainA1);
    const isolatedSasa = chainA1[0].sasa ?? 0;

    const struct2 = parsePdb(multiChainPdb);
    const chainA2 = struct2.residuesByChain['A'];
    const allAssemblyResidues = Object.values(struct2.residuesByChain).flat();
    // 2. Calculate chain A in full assembly context
    calculateSASA(chainA2, 1.4, 96, allAssemblyResidues);
    const assemblySasa = chainA2[0].sasa ?? 0;

    expect(assemblySasa).toBeLessThan(isolatedSasa);
  });
});

describe('FASTA Input Parser', () => {
  it('should correctly parse single record FASTA', () => {
    const fasta = `>seq1 Target Protein\nACDE\nFGHIK\n`;
    const records = parseFastaInput(fasta);
    expect(records.length).toBe(1);
    expect(records[0].header).toBe('seq1 Target Protein');
    expect(records[0].sequence).toBe('ACDEFGHIK');
  });

  it('should correctly detect multiple FASTA records', () => {
    const multiFasta = `>seq1\nACDEF\n>seq2\nGHIKL\n`;
    const records = parseFastaInput(multiFasta);
    expect(records.length).toBe(2);
    expect(records[0].header).toBe('seq1');
    expect(records[0].sequence).toBe('ACDEF');
    expect(records[1].header).toBe('seq2');
    expect(records[1].sequence).toBe('GHIKL');
  });
});

describe('Antigenic Mimicry Evaluation: Epitope Residue Filtering & Weight Normalization', () => {
  it('should filter out non-existent target epitope residue numbers and keep S_epi, S_conf, and S_exp denominators consistent', () => {
    const targetPdb = `
ATOM      1  CA  ARG A   1     0.000   0.000   0.000  1.00 80.00           C
ATOM      2  CA  HIS A   2     3.800   0.000   0.000  1.00 80.00           C
ATOM      3  CA  ASP A   3     7.600   0.000   0.000  1.00 80.00           C
TER
END
`.trim();

    const candPdb = `
ATOM      1  CA  ARG A   1     0.100   0.000   0.000  1.00 80.00           C
ATOM      2  CA  HIS A   2     3.900   0.000   0.000  1.00 80.00           C
ATOM      3  CA  ASP A   3     7.700   0.000   0.000  1.00 80.00           C
TER
END
`.trim();

    const targetStruct = parsePdb(targetPdb);
    const candStruct = parsePdb(candPdb);
    const align = alignStructures(targetStruct.residuesByChain['A'], candStruct.residuesByChain['A']);

    // Pass epitope numbers 1, 2 (exist) and 99, 100 (do NOT exist in target)
    const epitopeWithNonExistent = [1, 2, 99, 100];
    const result = evaluateAntigenicMimicry(align, epitopeWithNonExistent);

    // Effective epitope count should be 2 (only residues 1 and 2 exist in target)
    const epiResidues = result.residues.filter(r => r.in_epitope);
    expect(epiResidues.length).toBe(2);
    expect(epiResidues.map(r => r.res_id)).toEqual(['1', '2']);

    // S_epi should be calculated based on the 2 valid epitope residues, not 4
    expect(result.subScores.s_epi).toBeGreaterThan(0.9);
    // S_conf should also be calculated out of 2 valid epitope residues
    expect(result.subScores.s_conf).toBe(1.0);
  });

  it('should validate and normalize custom weights correctly', () => {
    // Normalization test: sum > 1
    const w1 = normalizeAndValidateWeights([0.5, 0.5, 0.5, 0.5]);
    expect(w1).toEqual([0.25, 0.25, 0.25, 0.25]);

    // String input parsing
    const w2 = normalizeAndValidateWeights(['0.1', '0.2', '0.3', '0.4'] as any);
    expect(w2).toEqual([0.1, 0.2, 0.3, 0.4]);

    // Negative weight fallback
    const w3 = normalizeAndValidateWeights([-0.1, 0.4, 0.2, 0.15]);
    expect(w3).toEqual([0.25, 0.40, 0.20, 0.15]);

    // Invalid length or NaN fallback
    const w4 = normalizeAndValidateWeights([0.25, 'invalid', 0.20, 0.15] as any);
    expect(w4).toEqual([0.25, 0.40, 0.20, 0.15]);

    // Zero sum fallback
    const w5 = normalizeAndValidateWeights([0, 0, 0, 0]);
    expect(w5).toEqual([0.25, 0.40, 0.20, 0.15]);
  });
});

import { describe, test, expect } from 'bun:test';
import {
  parsePdb,
  parseMmcif,
  extractComplexContacts,
  mapComplexResiduesToTarget,
  getResKey,
} from './bioAlgorithms';

describe('PDB and mmCIF Parsers with iCode and altLoc', () => {
  test('parsePdb correctly handles insertion codes (iCode)', () => {
    // Sample PDB text with insertion codes 60, 60A, 60B
    const pdbData = `
ATOM      1  N   TRP A  60      10.000  10.000  10.000  1.00 90.00           N
ATOM      2  CA  TRP A  60      11.000  10.000  10.000  1.00 90.00           C
ATOM      3  N   ALA A  60A     12.000  10.000  10.000  1.00 90.00           N
ATOM      4  CA  ALA A  60A     13.000  10.000  10.000  1.00 90.00           C
ATOM      5  N   GLY A  60B     14.000  10.000  10.000  1.00 90.00           N
ATOM      6  CA  GLY A  60B     15.000  10.000  10.000  1.00 90.00           C
TER
END
`.trim();

    const parsed = parsePdb(pdbData);
    const chainA = parsed.residuesByChain['A'];

    expect(chainA).toBeDefined();
    expect(chainA.length).toBe(3);

    expect(chainA[0].resSeq).toBe(60);
    expect(chainA[0].iCode).toBe('');
    expect(chainA[0].resName).toBe('TRP');

    expect(chainA[1].resSeq).toBe(60);
    expect(chainA[1].iCode).toBe('A');
    expect(chainA[1].resName).toBe('ALA');

    expect(chainA[2].resSeq).toBe(60);
    expect(chainA[2].iCode).toBe('B');
    expect(chainA[2].resName).toBe('GLY');
  });

  test('parsePdb filters alternate location (altLoc) duplicates', () => {
    // Sample PDB with altLoc A and B for residue 10
    const pdbData = `
ATOM      1  N  AARG A  10      10.000  10.000  10.000  0.50 90.00           N
ATOM      2  N  BARG A  10      10.200  10.100  10.000  0.50 90.00           N
ATOM      3  CA AARG A  10      11.000  10.000  10.000  0.50 90.00           C
ATOM      4  CA BARG A  10      11.200  10.100  10.000  0.50 90.00           C
TER
END
`.trim();

    const parsed = parsePdb(pdbData);
    const res10 = parsed.residuesByChain['A'][0];

    expect(res10).toBeDefined();
    // Primary altLoc 'A' should be preserved and duplicate altLoc 'B' ignored
    expect(res10.atoms.length).toBe(2);
    expect(res10.atoms[0].altLoc).toBe('A');
    expect(res10.caAtom?.x).toBe(11.000);
  });

  test('parseMmcif handles insertion code and altLoc', () => {
    const cifData = `
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
ATOM 1 N N . ARG A 50 . 10.0 10.0 10.0 1.0 80.0
ATOM 2 CA CA . ARG A 50 . 11.0 10.0 10.0 1.0 80.0
ATOM 3 N N . LYS A 50 A 12.0 10.0 10.0 1.0 80.0
ATOM 4 CA CA . LYS A 50 A 13.0 10.0 10.0 1.0 80.0
`.trim();

    const parsed = parseMmcif(cifData);
    const chainA = parsed.residuesByChain['A'];

    expect(chainA.length).toBe(2);
    expect(chainA[0].resSeq).toBe(50);
    expect(chainA[0].iCode).toBe('');
    expect(chainA[1].resSeq).toBe(50);
    expect(chainA[1].iCode).toBe('A');
  });
});

describe('Epitope Extraction and SIFTS/Sequence Residue Mapping', () => {
  test('mapComplexResiduesToTarget maps complex residue numbers to target sequence numbers when numbering differs', async () => {
    // Complex PDB antigen starting at residue 300
    const complexPdb = `
ATOM      1  N   ARG A 300      10.000  10.000  10.000  1.00 90.00           N
ATOM      2  CA  ARG A 300      11.000  10.000  10.000  1.00 90.00           C
ATOM      3  N   VAL A 301      12.000  10.000  10.000  1.00 90.00           N
ATOM      4  CA  VAL A 301      13.000  10.000  10.000  1.00 90.00           C
ATOM      5  N   GLN A 302      14.000  10.000  10.000  1.00 90.00           N
ATOM      6  CA  GLN A 302      15.000  10.000  10.000  1.00 90.00           C
ATOM      7  N   GLY H   1      12.500  10.000  10.000  1.00 90.00           N
ATOM      8  CA  GLY H   1      12.500  11.000  10.000  1.00 90.00           C
TER
END
`.trim();

    // Target structure starting at residue 1
    const targetPdb = `
ATOM      1  N   ARG A   1      10.000  10.000  10.000  1.00 90.00           N
ATOM      2  CA  ARG A   1      11.000  10.000  10.000  1.00 90.00           C
ATOM      3  N   VAL A   2      12.000  10.000  10.000  1.00 90.00           N
ATOM      4  CA  VAL A   2      13.000  10.000  10.000  1.00 90.00           C
ATOM      5  N   GLN A   3      14.000  10.000  10.000  1.00 90.00           N
ATOM      6  CA  GLN A   3      15.000  10.000  10.000  1.00 90.00           C
TER
END
`.trim();

    const complexStruct = parsePdb(complexPdb);
    const targetStruct = parsePdb(targetPdb);

    const mapping = await mapComplexResiduesToTarget(
      complexStruct,
      'A',
      ['H'],
      targetStruct,
      'A',
      undefined,
      4.5
    );

    // In complex PDB, atom at VAL 301 is close (dist <= 4.5) to antibody H chain atom
    // Mapping should map complex residue 301 (VAL) to target residue 2 (VAL)
    expect(mapping.contactResidues.length).toBeGreaterThan(0);
    expect(mapping.mappedResSeqs).toContain(2);
    expect(mapping.mappedResSeqs).not.toContain(301);
  });
});

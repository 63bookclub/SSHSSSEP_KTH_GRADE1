import { describe, expect, it } from 'bun:test';
import { validateEpitopeResidues } from './epitopeValidation';
import { Residue } from './bioAlgorithms';

function mockResidue(resSeq: number, resName = 'ALA', rsa = 0.5): Residue {
  return {
    resSeq,
    resKey: resSeq.toString(),
    resName,
    chain: 'A',
    caAtom: null,
    atoms: [],
    rsa,
  };
}

describe('Epitope Residue Validation', () => {
  it('should accept epitope residues that exist in target structure', () => {
    const target = [mockResidue(100), mockResidue(101), mockResidue(102)];
    const res = validateEpitopeResidues(target, [100, 101]);

    expect(res.validEpitopeSet.size).toBe(2);
    expect(res.validEpitopeSet.has('100')).toBe(true);
    expect(res.validEpitopeSet.has('101')).toBe(true);
    expect(res.invalidEpitopeList.length).toBe(0);
    expect(res.warnings.length).toBe(0);
    expect(res.isFallbackTemporary).toBe(false);
  });

  it('should filter out non-existent epitope residues and issue warning', () => {
    const target = [mockResidue(100), mockResidue(101), mockResidue(102)];
    const res = validateEpitopeResidues(target, [100, 999]);

    expect(res.validEpitopeSet.size).toBe(1);
    expect(res.validEpitopeSet.has('100')).toBe(true);
    expect(res.validEpitopeSet.has('999')).toBe(false);
    expect(res.invalidEpitopeList).toContain('999');
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0]).toContain('999');
    expect(res.isFallbackTemporary).toBe(false);
  });

  it('should fall back to surface residues when all input epitope residues are invalid', () => {
    const target = [mockResidue(100, 'ALA', 0.3), mockResidue(101, 'GLY', 0.05)];
    const res = validateEpitopeResidues(target, [999, 1000]);

    expect(res.isFallbackTemporary).toBe(true);
    expect(res.validEpitopeSet.has('100')).toBe(true);
    expect(res.validEpitopeSet.has('101')).toBe(false); // RSA 0.05 < 0.2
    expect(res.warnings.length).toBe(2);
    expect(res.warnings[1]).toContain('임시 에피톱');
  });

  it('should validate multi-epitope entities and filter invalid residues per group', () => {
    const target = [mockResidue(100), mockResidue(101)];
    const multi = [
      {
        id: 'ep1',
        name: 'Site A',
        range: '100, 999',
        weight: 1.0,
      },
    ];

    const res = validateEpitopeResidues(target, [], multi);
    expect(res.validEpitopeSet.has('100')).toBe(true);
    expect(res.validEpitopeSet.has('999')).toBe(false);
    expect(res.warnings.length).toBe(1);
    expect(res.warnings[0]).toContain('Site A');
    expect(res.validatedMultiEpitopes?.[0].residues).toEqual([100]);
  });
});

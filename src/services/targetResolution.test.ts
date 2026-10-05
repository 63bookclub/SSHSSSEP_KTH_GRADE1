import { describe, it, expect, mock } from 'bun:test';
import { isValidPdbId, isValidUniprotId, validateAminoAcidSequence } from '../utils/validation.ts';

describe('Target Resolution and Error Validation Tests', () => {
  it('should validate PDB ID format strictly', () => {
    expect(isValidPdbId('6M0J')).toBe(true);
    expect(isValidPdbId('P0DTC2')).toBe(false);
    expect(isValidPdbId('INVALID_PDB_123')).toBe(false);
  });

  it('should validate UniProt ID format strictly', () => {
    expect(isValidUniprotId('P0DTC2')).toBe(true);
    expect(isValidUniprotId('Q9BYF1')).toBe(true);
    expect(isValidUniprotId('6M0J')).toBe(false);
    expect(isValidUniprotId('NOT_A_UNIPROT_ACCESSION')).toBe(false);
  });

  it('should validate sequence inputs correctly for target resolution', () => {
    const validSeqResult = validateAminoAcidSequence('NLCPFGEVFNATRFASVYAWNRKRISNCVADYSVLYNSASFSTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGKIADYNYKLPDDFTGCVIAWNSNNLDSKVGGNYNYLYRLFRKSNLKPFERDISTEIYQAGSTPCNGVEGFNCYFPLQSYGFQPTNGVGYQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF', { minLen: 5, maxLen: 600 });
    expect(validSeqResult.isValid).toBe(true);

    const invalidSeqResult = validateAminoAcidSequence('INVALID_XYZ_SEQ_123', { minLen: 5, maxLen: 600 });
    expect(invalidSeqResult.isValid).toBe(false);
  });
});

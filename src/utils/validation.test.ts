import { describe, expect, test } from 'bun:test';
import {
  isValidPdbId,
  isValidUniprotId,
  validateAminoAcidSequence,
  validateAndNormalizeWeights,
} from './validation.ts';

describe('Validation Utilities', () => {
  describe('isValidPdbId', () => {
    test('should return true for valid 4-character PDB IDs', () => {
      expect(isValidPdbId('6M0J')).toBe(true);
      expect(isValidPdbId('1A2B')).toBe(true);
      expect(isValidPdbId('7T9K')).toBe(true);
      expect(isValidPdbId(' 6m0j ')).toBe(true);
    });

    test('should return false for invalid PDB IDs', () => {
      expect(isValidPdbId('')).toBe(false);
      expect(isValidPdbId('INVALID')).toBe(false);
      expect(isValidPdbId('ABC')).toBe(false);
      expect(isValidPdbId('A000')).toBe(false); // standard PDB IDs start with a digit 1-9
      expect(isValidPdbId('6M0J1')).toBe(false);
    });
  });

  describe('isValidUniprotId', () => {
    test('should return true for valid UniProt accession IDs', () => {
      expect(isValidUniprotId('P0DTC2')).toBe(true);
      expect(isValidUniprotId('Q9Y6X1')).toBe(true);
      expect(isValidUniprotId('P12345')).toBe(true);
      expect(isValidUniprotId(' p0dtc2 ')).toBe(true);
      expect(isValidUniprotId('A0A024RBG1')).toBe(true);
    });

    test('should return false for invalid UniProt IDs', () => {
      expect(isValidUniprotId('')).toBe(false);
      expect(isValidUniprotId('INVALID_UNIPROT_ID')).toBe(false);
      expect(isValidUniprotId('12345')).toBe(false);
      expect(isValidUniprotId('XYZ!!!')).toBe(false);
    });
  });

  describe('validateAminoAcidSequence', () => {
    test('should validate standard 20 amino acid sequence', () => {
      const res = validateAminoAcidSequence('ACDEFGHIKLMNPQRSTVWY');
      expect(res.isValid).toBe(true);
      expect(res.sequence).toBe('ACDEFGHIKLMNPQRSTVWY');
    });

    test('should trim whitespace and parse FASTA formatting', () => {
      const fasta = `>sp|P0DTC2|Spike protein
ACDEF GHIKL
MNPQR STVWY`;
      const res = validateAminoAcidSequence(fasta);
      expect(res.isValid).toBe(true);
      expect(res.sequence).toBe('ACDEFGHIKLMNPQRSTVWY');
    });

    test('should reject sequences with non-standard amino acids', () => {
      const res = validateAminoAcidSequence('ACDEFGHIKLMNPQRSTVWYXZB');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('20종 표준 아미노산');
    });

    test('should reject sequences under minimum length limit', () => {
      const res = validateAminoAcidSequence('ACD', { minLen: 5 });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('최소 제한');
    });

    test('should reject sequences exceeding maximum length limit', () => {
      const longSeq = 'A'.repeat(601);
      const res = validateAminoAcidSequence(longSeq, { maxLen: 600 });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('제한(600 aa)을 초과했습니다');
    });
  });

  describe('validateAndNormalizeWeights', () => {
    test('should return default weights if undefined or null', () => {
      const res1 = validateAndNormalizeWeights(undefined);
      expect(res1.isValid).toBe(true);
      expect(res1.normalizedWeights).toEqual([0.25, 0.40, 0.20, 0.15]);

      const res2 = validateAndNormalizeWeights(null);
      expect(res2.isValid).toBe(true);
      expect(res2.normalizedWeights).toEqual([0.25, 0.40, 0.20, 0.15]);
    });

    test('should accept valid weights that sum to 1.0', () => {
      const res = validateAndNormalizeWeights([0.25, 0.40, 0.20, 0.15]);
      expect(res.isValid).toBe(true);
      expect(res.normalizedWeights).toEqual([0.25, 0.40, 0.20, 0.15]);
    });

    test('should normalize unnormalized positive weights so sum equals 1.0', () => {
      const res = validateAndNormalizeWeights([1, 2, 1, 1]); // sum = 5
      expect(res.isValid).toBe(true);
      const sum = res.normalizedWeights.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-4);
      expect(res.normalizedWeights).toEqual([0.2, 0.4, 0.2, 0.2]);
    });

    test('should reject invalid input types and array lengths', () => {
      expect(validateAndNormalizeWeights('invalid').isValid).toBe(false);
      expect(validateAndNormalizeWeights(123).isValid).toBe(false);
      expect(validateAndNormalizeWeights([0.25, 0.4]).isValid).toBe(false);
      expect(validateAndNormalizeWeights([0.2, 0.2, 0.2, 0.2, 0.2]).isValid).toBe(false);
    });

    test('should reject negative values, strings, NaN, or non-positive sums', () => {
      expect(validateAndNormalizeWeights([-0.1, 0.5, 0.3, 0.3]).isValid).toBe(false);
      expect(validateAndNormalizeWeights(['0.25', 0.4, 0.2, 0.15]).isValid).toBe(false);
      expect(validateAndNormalizeWeights([NaN, 0.4, 0.2, 0.15]).isValid).toBe(false);
      expect(validateAndNormalizeWeights([0, 0, 0, 0]).isValid).toBe(false);
    });
  });
});

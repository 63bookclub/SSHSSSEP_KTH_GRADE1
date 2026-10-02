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

  describe('validateAndNormalizeWeights', () => {
    test('should return default weights when input is not an array or has invalid length', () => {
      expect(validateAndNormalizeWeights(null)).toEqual([0.25, 0.40, 0.20, 0.15]);
      expect(validateAndNormalizeWeights([0.2, 0.3])).toEqual([0.25, 0.40, 0.20, 0.15]);
      expect(validateAndNormalizeWeights('invalid')).toEqual([0.25, 0.40, 0.20, 0.15]);
    });

    test('should return default weights when input contains NaN, negative, or non-numeric values', () => {
      expect(validateAndNormalizeWeights([0.2, -0.1, 0.3, 0.4])).toEqual([0.25, 0.40, 0.20, 0.15]);
      expect(validateAndNormalizeWeights([0.2, 'abc', 0.3, 0.4])).toEqual([0.25, 0.40, 0.20, 0.15]);
      expect(validateAndNormalizeWeights([0, 0, 0, 0])).toEqual([0.25, 0.40, 0.20, 0.15]);
    });

    test('should normalize valid unnormalized weights so sum equals 1.0', () => {
      const normalized = validateAndNormalizeWeights([2, 2, 1, 1]);
      const sum = normalized.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
      expect(normalized[0]).toBeCloseTo(0.3333, 3);
      expect(normalized[1]).toBeCloseTo(0.3333, 3);
      expect(normalized[2]).toBeCloseTo(0.1667, 3);
    });

    test('should preserve already normalized weights', () => {
      expect(validateAndNormalizeWeights([0.25, 0.40, 0.20, 0.15])).toEqual([0.25, 0.40, 0.20, 0.15]);
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
});

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
    test('should return default normalized weights when input is undefined or null', () => {
      const res1 = validateAndNormalizeWeights(undefined);
      expect(res1.isValid).toBe(true);
      expect(res1.normalizedWeights).toEqual([0.25, 0.40, 0.20, 0.15]);

      const res2 = validateAndNormalizeWeights(null);
      expect(res2.isValid).toBe(true);
      expect(res2.normalizedWeights).toEqual([0.25, 0.40, 0.20, 0.15]);
    });

    test('should normalize positive weights that do not sum to 1.0', () => {
      const res = validateAndNormalizeWeights([2, 4, 2, 2]);
      expect(res.isValid).toBe(true);
      expect(res.normalizedWeights).toEqual([0.2, 0.4, 0.2, 0.2]);
      const sum = res.normalizedWeights.reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(1e-5);
    });

    test('should reject weights array with length not equal to 4', () => {
      const res1 = validateAndNormalizeWeights([0.5, 0.5]);
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain('4개의 숫자로 구성된 배열');

      const res2 = validateAndNormalizeWeights([0.2, 0.3, 0.2, 0.2, 0.1]);
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain('4개의 숫자로 구성된 배열');
    });

    test('should reject weights containing non-numeric strings or booleans', () => {
      const res1 = validateAndNormalizeWeights(['abc', 0.4, 0.2, 0.15]);
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain('유효한 숫자가 아닙니다');

      const res2 = validateAndNormalizeWeights([0.25, true, 0.2, 0.15]);
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain('유효한 숫자가 아닙니다');
    });

    test('should reject negative weights or sum <= 0', () => {
      const res1 = validateAndNormalizeWeights([-0.1, 0.5, 0.3, 0.3]);
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain('음수일 수 없습니다');

      const res2 = validateAndNormalizeWeights([0, 0, 0, 0]);
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain('0보다 커야 합니다');
    });
  });
});

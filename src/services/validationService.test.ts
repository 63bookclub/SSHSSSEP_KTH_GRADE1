import { describe, expect, it } from 'bun:test';
import {
  isValidPdbId,
  isValidUniprotId,
  validateAminoAcidSequence,
} from './validationService';

describe('Validation Service', () => {
  describe('isValidPdbId', () => {
    it('should validate valid 4-character PDB IDs', () => {
      expect(isValidPdbId('6M0J')).toBe(true);
      expect(isValidPdbId('1a00')).toBe(true);
      expect(isValidPdbId('7X21')).toBe(true);
    });

    it('should reject invalid PDB IDs', () => {
      expect(isValidPdbId('P0DTC2')).toBe(false);
      expect(isValidPdbId('6M0J1')).toBe(false);
      expect(isValidPdbId('ABC')).toBe(false);
      expect(isValidPdbId('M0J1')).toBe(false); // Must start with digit
      expect(isValidPdbId('')).toBe(false);
    });
  });

  describe('isValidUniprotId', () => {
    it('should validate valid UniProt IDs', () => {
      expect(isValidUniprotId('P0DTC2')).toBe(true);
      expect(isValidUniprotId('Q9Y263')).toBe(true);
      expect(isValidUniprotId('A0A024RBG1')).toBe(true);
    });

    it('should reject invalid UniProt IDs', () => {
      expect(isValidUniprotId('6M0J')).toBe(false);
      expect(isValidUniprotId('INVALID_ID')).toBe(false);
      expect(isValidUniprotId('123456')).toBe(false);
      expect(isValidUniprotId('')).toBe(false);
    });
  });

  describe('validateAminoAcidSequence', () => {
    it('should accept valid standard amino acid sequences', () => {
      const seq = 'ACDEFGHIKLMNPQRSTVWY';
      const result = validateAminoAcidSequence(seq);
      expect(result.valid).toBe(true);
      expect(result.cleanedSeq).toBe(seq);
    });

    it('should handle lowercase and whitespace in sequence', () => {
      const seq = ' acd efg  hikl\nmnpq rstv wy ';
      const result = validateAminoAcidSequence(seq);
      expect(result.valid).toBe(true);
      expect(result.cleanedSeq).toBe('ACDEFGHIKLMNPQRSTVWY');
    });

    it('should reject non-standard amino acids (e.g. B, Z, X, numbers, special characters)', () => {
      const invalidSeq = 'ACDEFGHIKLMNPQRSTVWX';
      const result = validateAminoAcidSequence(invalidSeq);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('20종 표준 아미노산');
    });

    it('should enforce minLength constraints', () => {
      const shortSeq = 'ACD';
      const result = validateAminoAcidSequence(shortSeq, { minLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('최소 기준');
    });

    it('should enforce maxLength constraints', () => {
      const longSeq = 'A'.repeat(601);
      const result = validateAminoAcidSequence(longSeq, { maxLength: 600 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('초과');
    });
  });
});

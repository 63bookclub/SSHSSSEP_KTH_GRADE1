import { describe, expect, it } from 'bun:test';
import {
  isValidSequence,
  isValidPdbId,
  isValidUniprotId,
  validateSequence,
} from './validation';

describe('Sequence Validation Utilities', () => {
  describe('isValidSequence', () => {
    it('should return true for valid 20 standard amino acid sequences', () => {
      expect(isValidSequence('ACDEFGHIKLMNPQRSTVWY')).toBe(true);
      expect(isValidSequence('acdefghiklmnpqrstvwy')).toBe(true);
      expect(isValidSequence('  MKTIIALSYIFCLVFA  ')).toBe(true);
    });

    it('should return false for invalid amino acids or non-alphabet characters', () => {
      expect(isValidSequence('ACDEFGHIKLMNPQRSTVWX')).toBe(false); // X
      expect(isValidSequence('ACDEFGHIKLMNPQRSTVWZ')).toBe(false); // Z
      expect(isValidSequence('ACDEF123')).toBe(false); // numbers
      expect(isValidSequence('ACDEF!@#')).toBe(false); // special chars
      expect(isValidSequence('')).toBe(false);
    });
  });

  describe('validateSequence', () => {
    it('should validate and clean a valid sequence', () => {
      const res = validateSequence('  acde fghi klmn pqrst vwy  ');
      expect(res.valid).toBe(true);
      expect(res.cleanSeq).toBe('ACDEFGHIKLMNPQRSTVWY');
      expect(res.error).toBeUndefined();
    });

    it('should fail when sequence length is below minLength', () => {
      const res = validateSequence('ACD', { minLength: 5 });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('서열은 최소 5개 이상의 아미노산이어야 합니다');
    });

    it('should fail when sequence length exceeds maxLength', () => {
      const longSeq = 'A'.repeat(601);
      const res = validateSequence(longSeq, { maxLength: 600 });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('제한(600 aa)을 초과했습니다');
    });

    it('should fail when sequence contains non-standard amino acids', () => {
      const res = validateSequence('ACDEFGHIKLMNPQRSTVWX');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('20종 표준 아미노산(ACDEFGHIKLMNPQRSTVWY)만 허용됩니다');
    });

    it('should fail when sequence is empty', () => {
      const res = validateSequence('');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('아미노산 서열이 입력되지 않았습니다.');
    });
  });
});

describe('ID Validation Utilities', () => {
  describe('isValidPdbId', () => {
    it('should return true for valid 4-character PDB IDs', () => {
      expect(isValidPdbId('6M0J')).toBe(true);
      expect(isValidPdbId('1tsr')).toBe(true);
      expect(isValidPdbId('7P1N')).toBe(true);
    });

    it('should return false for invalid PDB IDs', () => {
      expect(isValidPdbId('ABCD')).toBe(false); // Must start with a digit
      expect(isValidPdbId('6M0J1')).toBe(false); // 5 chars
      expect(isValidPdbId('6M')).toBe(false); // 2 chars
      expect(isValidPdbId('')).toBe(false);
    });
  });

  describe('isValidUniprotId', () => {
    it('should return true for valid UniProt IDs', () => {
      expect(isValidUniprotId('P0DTC2')).toBe(true);
      expect(isValidUniprotId('Q9BYF1')).toBe(true);
      expect(isValidUniprotId('A0A024RBG1')).toBe(true);
    });

    it('should return false for invalid UniProt IDs', () => {
      expect(isValidUniprotId('NOT_A_UNIPROT_ID_12345')).toBe(false);
      expect(isValidUniprotId('12345')).toBe(false);
      expect(isValidUniprotId('')).toBe(false);
    });
  });
});

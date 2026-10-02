/**
 * Shared sequence and identifier validation utilities for SSBD
 */

export const STANDARD_AMINO_ACIDS = /^[ACDEFGHIKLMNPQRSTVWY]+$/;

export const PDB_ID_REGEX = /^[0-9][A-Za-z0-9]{3}$/;

export const UNIPROT_ID_REGEX = /^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$/i;

/**
 * Validates whether a sequence consists solely of the 20 standard amino acids.
 */
export function isValidSequence(seq: string): boolean {
  if (!seq) return false;
  return STANDARD_AMINO_ACIDS.test(seq.trim().toUpperCase());
}

/**
 * Validates a PDB ID format (4 characters, digit followed by 3 alphanumeric).
 */
export function isValidPdbId(id: string): boolean {
  if (!id) return false;
  return PDB_ID_REGEX.test(id.trim());
}

/**
 * Validates a UniProt accession format.
 */
export function isValidUniprotId(id: string): boolean {
  if (!id) return false;
  return UNIPROT_ID_REGEX.test(id.trim());
}

export interface SequenceValidationResult {
  valid: boolean;
  error?: string;
  cleanSeq: string;
}

export interface SequenceValidationOptions {
  minLength?: number;
  maxLength?: number;
}

/**
 * Clean whitespace and validate sequence against standard amino acids and length constraints.
 */
export function validateSequence(
  seq: string,
  options: SequenceValidationOptions = {}
): SequenceValidationResult {
  const minLength = options.minLength ?? 5;
  const maxLength = options.maxLength ?? 600;

  const cleanSeq = (seq || '').replace(/\s+/g, '').toUpperCase();

  if (!cleanSeq) {
    return {
      valid: false,
      error: '아미노산 서열이 입력되지 않았습니다.',
      cleanSeq: '',
    };
  }

  if (cleanSeq.length < minLength) {
    return {
      valid: false,
      error: `서열은 최소 ${minLength}개 이상의 아미노산이어야 합니다.`,
      cleanSeq,
    };
  }

  if (cleanSeq.length > maxLength) {
    return {
      valid: false,
      error: `서열 길이가 ${cleanSeq.length} aa로 제한(${maxLength} aa)을 초과했습니다. 더 긴 단백질은 직접 예측한 PDB 파일을 업로드해 주세요.`,
      cleanSeq,
    };
  }

  if (!STANDARD_AMINO_ACIDS.test(cleanSeq)) {
    return {
      valid: false,
      error: '서열에 유효하지 않은 아미노산 문자가 포함되어 있습니다. 20종 표준 아미노산(ACDEFGHIKLMNPQRSTVWY)만 허용됩니다.',
      cleanSeq,
    };
  }

  return {
    valid: true,
    cleanSeq,
  };
}

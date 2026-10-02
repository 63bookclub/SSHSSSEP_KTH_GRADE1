/**
 * Shared Validation Utilities for Biological IDs and Amino Acid Sequences.
 */

// Regex for standard 20 amino acids (IUPAC single-letter codes)
export const STANDARD_AA_REGEX = /^[ACDEFGHIKLMNPQRSTVWY]+$/;

// Regex for 4-character RCSB PDB ID (typically 1 digit followed by 3 alphanumeric chars, e.g., 6M0J, 1A2B)
export const PDB_ID_REGEX = /^[1-9][A-Za-z0-9]{3}$/;

// Regex for UniProt KB Accession numbers
// Format: [OPQ][0-9][A-Z0-9]{3}[0-9] OR [A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2}
export const UNIPROT_ID_REGEX = /^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$/i;

/**
 * Validates whether a given string is a valid PDB ID format.
 */
export function isValidPdbId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return PDB_ID_REGEX.test(id.trim());
}

/**
 * Validates whether a given string is a valid UniProt Accession ID format.
 */
export function isValidUniprotId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return UNIPROT_ID_REGEX.test(id.trim());
}

export interface SequenceValidationOptions {
  minLen?: number;
  maxLen?: number;
}

export interface SequenceValidationResult {
  isValid: boolean;
  error?: string;
  sequence: string;
}

/**
 * Validates an amino acid sequence string.
 * Strips whitespace / FASTA header if present, checks for 20 standard amino acids, and validates length.
 */
export function validateAminoAcidSequence(
  input: string,
  options: SequenceValidationOptions = {}
): SequenceValidationResult {
  const { minLen = 5, maxLen = 600 } = options;

  if (!input || typeof input !== 'string') {
    return { isValid: false, error: '서열 입력값이 비어 있거나 올바르지 않습니다.', sequence: '' };
  }

  let cleanSeq = input.trim();

  // Handle FASTA header if present
  if (cleanSeq.startsWith('>')) {
    const lines = cleanSeq.split('\n');
    cleanSeq = lines.slice(1).join('').trim();
  }

  // Remove whitespace and newlines
  cleanSeq = cleanSeq.replace(/\s+/g, '').toUpperCase();

  if (!cleanSeq) {
    return { isValid: false, error: '유효한 아미노산 서열이 없습니다.', sequence: '' };
  }

  if (cleanSeq.length < minLen) {
    return {
      isValid: false,
      error: `서열 길이가 ${cleanSeq.length} aa로 최소 제한(${minLen} aa)에 미달합니다.`,
      sequence: cleanSeq,
    };
  }

  if (maxLen && cleanSeq.length > maxLen) {
    return {
      isValid: false,
      error: `서열 길이가 ${cleanSeq.length} aa로 제한(${maxLen} aa)을 초과했습니다. 더 긴 단백질은 직접 예측한 PDB 파일을 업로드해 주세요.`,
      sequence: cleanSeq,
    };
  }

  if (!STANDARD_AA_REGEX.test(cleanSeq)) {
    return {
      isValid: false,
      error: '서열에 유효하지 않은 아미노산 문자가 포함되어 있습니다. 20종 표준 아미노산(ACDEFGHIKLMNPQRSTVWY)만 허용됩니다.',
      sequence: cleanSeq,
    };
  }

  return { isValid: true, sequence: cleanSeq };
}

export interface WeightsValidationResult {
  isValid: boolean;
  error?: string;
  weights: [number, number, number, number];
}

/**
 * Validates and normalizes 4-element custom weights for antigenic mimicry evaluation.
 * Ensures all elements are finite non-negative numbers in range [0, 1] and sum > 0.
 * Returns normalized weights where sum = 1.0.
 */
export function validateAndNormalizeWeights(
  input: any,
  defaultWeights: [number, number, number, number] = [0.25, 0.40, 0.20, 0.15]
): WeightsValidationResult {
  if (input === undefined || input === null) {
    return { isValid: true, weights: defaultWeights };
  }

  if (!Array.isArray(input) || input.length !== 4) {
    return {
      isValid: false,
      error: '가중치(weights)는 4개의 숫자로 구성된 배열이어야 합니다.',
      weights: defaultWeights,
    };
  }

  const nums: number[] = [];
  for (let i = 0; i < 4; i++) {
    const item = input[i];
    if (typeof item === 'boolean' || item === null || item === undefined || typeof item === 'symbol') {
      return {
        isValid: false,
        error: `가중치 [${i}]번째 항목은 유효한 숫자이어야 합니다.`,
        weights: defaultWeights,
      };
    }
    const num = typeof item === 'number' ? item : parseFloat(String(item));
    if (isNaN(num) || !isFinite(num)) {
      return {
        isValid: false,
        error: `가중치 [${i}]번째 항목이 숫자가 아니거나 유효하지 않습니다.`,
        weights: defaultWeights,
      };
    }
    if (num < 0 || num > 1) {
      return {
        isValid: false,
        error: `가중치 [${i}]번째 항목(${num})은 0~1 범위 내의 숫자이어야 합니다.`,
        weights: defaultWeights,
      };
    }
    nums.push(num);
  }

  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return {
      isValid: false,
      error: '가중치의 총합은 0보다 커야 합니다.',
      weights: defaultWeights,
    };
  }

  const normWeights: [number, number, number, number] = [
    Math.round((nums[0] / sum) * 10000) / 10000,
    Math.round((nums[1] / sum) * 10000) / 10000,
    Math.round((nums[2] / sum) * 10000) / 10000,
    Math.round((nums[3] / sum) * 10000) / 10000,
  ];

  return { isValid: true, weights: normWeights };
}

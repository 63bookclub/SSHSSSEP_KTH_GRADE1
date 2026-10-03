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

export interface WeightValidationResult {
  isValid: boolean;
  error?: string;
  weights: [number, number, number, number];
}

/**
 * Validates and normalizes weights array (length 4).
 * Ensures all elements are non-negative numbers in range [0, 1] and sum to 1.0.
 */
export function validateAndNormalizeWeights(
  inputWeights: any,
  defaultWeights: [number, number, number, number] = [0.25, 0.40, 0.20, 0.15]
): WeightValidationResult {
  if (inputWeights === undefined || inputWeights === null) {
    return { isValid: true, weights: defaultWeights };
  }

  if (!Array.isArray(inputWeights) || inputWeights.length !== 4) {
    return {
      isValid: false,
      error: '가중치(weights)는 정확히 4개의 숫자 요소로 구성된 배열이어야 합니다.',
      weights: defaultWeights,
    };
  }

  const parsedNumbers: number[] = [];
  for (let i = 0; i < 4; i++) {
    const val = inputWeights[i];
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      return {
        isValid: false,
        error: `가중치 배열의 ${i + 1}번째 요소가 유효한 숫자가 아닙니다.`,
        weights: defaultWeights,
      };
    }
    if (val < 0 || val > 1) {
      return {
        isValid: false,
        error: `가중치는 0 이상 1 이하의 범위 내에 있어야 합니다. (${i + 1}번째 값: ${val})`,
        weights: defaultWeights,
      };
    }
    parsedNumbers.push(val);
  }

  const sum = parsedNumbers.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return {
      isValid: false,
      error: '가중치의 합은 0보다 커야 합니다.',
      weights: defaultWeights,
    };
  }

  // Normalize weights so their sum equals 1.0
  const normalized: [number, number, number, number] = [
    parsedNumbers[0] / sum,
    parsedNumbers[1] / sum,
    parsedNumbers[2] / sum,
    parsedNumbers[3] / sum,
  ];

  return { isValid: true, weights: normalized };
}

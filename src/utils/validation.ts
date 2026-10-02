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

export const DEFAULT_WEIGHTS: [number, number, number, number] = [0.25, 0.40, 0.20, 0.15];

/**
 * Validates and normalizes weights for the 4 sub-scores (S_global, S_epi, S_exp, S_conf).
 * - Ensures weights input is an array of length 4 with valid non-negative finite numbers.
 * - Normalizes the values so their sum equals 1.0.
 * - Falls back to DEFAULT_WEIGHTS [0.25, 0.40, 0.20, 0.15] if invalid, string/NaN/Infinity, negative, or sum is 0.
 */
export function normalizeAndValidateWeights(
  inputWeights?: any
): [number, number, number, number] {
  if (!Array.isArray(inputWeights) || inputWeights.length !== 4) {
    return [...DEFAULT_WEIGHTS];
  }

  const nums: number[] = [];
  for (let i = 0; i < 4; i++) {
    const raw = inputWeights[i];
    if (typeof raw === 'boolean' || raw === null || raw === undefined) {
      return [...DEFAULT_WEIGHTS];
    }
    const val = Number(raw);
    if (isNaN(val) || !isFinite(val) || val < 0) {
      return [...DEFAULT_WEIGHTS];
    }
    nums.push(val);
  }

  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum <= 0 || !isFinite(sum) || isNaN(sum)) {
    return [...DEFAULT_WEIGHTS];
  }

  // Normalize so the sum equals 1.0
  const normalized: [number, number, number, number] = [
    Math.round((nums[0] / sum) * 10000) / 10000,
    Math.round((nums[1] / sum) * 10000) / 10000,
    Math.round((nums[2] / sum) * 10000) / 10000,
    Math.round((nums[3] / sum) * 10000) / 10000,
  ];

  const normSum = normalized[0] + normalized[1] + normalized[2] + normalized[3];
  if (Math.abs(normSum - 1.0) > 1e-6) {
    const diff = Math.round((1.0 - normSum) * 10000) / 10000;
    normalized[1] = Math.round((normalized[1] + diff) * 10000) / 10000;
  }

  for (const w of normalized) {
    if (w < 0 || w > 1 || isNaN(w)) {
      return [...DEFAULT_WEIGHTS];
    }
  }

  return normalized;
}

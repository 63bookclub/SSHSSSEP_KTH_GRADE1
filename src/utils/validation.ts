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
 * Validates and normalizes weights for score calculation.
 * Ensures weights are an array of 4 non-negative finite numbers with sum > 0.
 * Normalizes the weights so their sum equals 1.0.
 * Falls back to DEFAULT_WEIGHTS if validation fails.
 */
export function validateAndNormalizeWeights(
  inputWeights: any,
  defaultWeights: [number, number, number, number] = DEFAULT_WEIGHTS
): [number, number, number, number] {
  if (!Array.isArray(inputWeights) || inputWeights.length !== 4) {
    return defaultWeights;
  }

  const parsed = inputWeights.map(w => Number(w));
  for (const w of parsed) {
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
      return defaultWeights;
    }
  }

  const sum = parsed[0] + parsed[1] + parsed[2] + parsed[3];
  if (sum <= 0 || !Number.isFinite(sum)) {
    return defaultWeights;
  }

  // Normalize each weight so sum is 1
  const rawNorm = parsed.map(w => w / sum);

  // Round to 4 decimal places for clean UI representation
  const roundedNorm = rawNorm.map(w => Math.round(w * 10000) / 10000) as [number, number, number, number];

  // Adjust floating point error on the largest weight to guarantee exact sum of 1.0
  const normSum = roundedNorm[0] + roundedNorm[1] + roundedNorm[2] + roundedNorm[3];
  const diff = Math.round((1.0 - normSum) * 10000) / 10000;
  if (Math.abs(diff) > 0) {
    let maxIdx = 0;
    for (let i = 1; i < 4; i++) {
      if (roundedNorm[i] > roundedNorm[maxIdx]) maxIdx = i;
    }
    roundedNorm[maxIdx] = Math.round((roundedNorm[maxIdx] + diff) * 10000) / 10000;
  }

  return roundedNorm;
}

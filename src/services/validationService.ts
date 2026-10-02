export const PDB_ID_REGEX = /^[0-9][a-zA-Z0-9]{3}$/;
export const UNIPROT_ID_REGEX = /^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$/i;
export const STANDARD_AA_REGEX = /^[ACDEFGHIKLMNPQRSTVWY]+$/i;

export interface SequenceValidationOptions {
  minLength?: number;
  maxLength?: number;
}

export interface ValidationResult {
  valid: boolean;
  cleanedSeq: string;
  error?: string;
}

export function isValidPdbId(pdbId: string): boolean {
  if (!pdbId || typeof pdbId !== 'string') return false;
  return PDB_ID_REGEX.test(pdbId.trim());
}

export function isValidUniprotId(uniprotId: string): boolean {
  if (!uniprotId || typeof uniprotId !== 'string') return false;
  return UNIPROT_ID_REGEX.test(uniprotId.trim());
}

export function validateAminoAcidSequence(
  rawSequence: string,
  options: SequenceValidationOptions = {}
): ValidationResult {
  const minLength = options.minLength ?? 5;
  const maxLength = options.maxLength ?? 600;

  if (!rawSequence || typeof rawSequence !== 'string') {
    return { valid: false, cleanedSeq: '', error: '서열 입력값이 올바르지 않거나 비어 있습니다.' };
  }

  // Clean sequence: remove all whitespace and newlines, convert to uppercase
  const cleanedSeq = rawSequence.replace(/\s+/g, '').toUpperCase();

  if (cleanedSeq.length === 0) {
    return { valid: false, cleanedSeq: '', error: '서열이 비어 있습니다.' };
  }

  if (cleanedSeq.length < minLength) {
    return {
      valid: false,
      cleanedSeq,
      error: `서열 길이가 ${cleanedSeq.length} aa로 최소 기준(${minLength} aa)에 미달합니다.`,
    };
  }

  if (cleanedSeq.length > maxLength) {
    return {
      valid: false,
      cleanedSeq,
      error: `서열 길이가 ${cleanedSeq.length} aa로 제한(${maxLength} aa)을 초과했습니다. 더 긴 단백질은 직접 예측한 PDB 파일을 업로드해 주세요.`,
    };
  }

  if (!STANDARD_AA_REGEX.test(cleanedSeq)) {
    return {
      valid: false,
      cleanedSeq,
      error: '서열에 유효하지 않은 아미노산 문자가 포함되어 있습니다. 20종 표준 아미노산(ACDEFGHIKLMNPQRSTVWY)만 허용됩니다.',
    };
  }

  return { valid: true, cleanedSeq };
}

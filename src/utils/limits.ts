export const MAX_BODY_PAYLOAD_SIZE = '5mb';
export const MAX_BATCH_CANDIDATES = 20;
export const MAX_STRUCTURE_ATOMS = 50000;

export function checkAtomCountLimit(atomCount: number): { isWithinLimit: boolean; error?: string } {
  if (atomCount > MAX_STRUCTURE_ATOMS) {
    return {
      isWithinLimit: false,
      error: `단백질 구조의 원자 수(${atomCount.toLocaleString()}개)가 허용 한도(${MAX_STRUCTURE_ATOMS.toLocaleString()}개)를 초과했습니다. 더 작은 체인/도메인 구조를 업로드해 주세요.`,
    };
  }
  return { isWithinLimit: true };
}

export function checkBatchCandidatesLimit(candidateCount: number): { isWithinLimit: boolean; error?: string } {
  if (candidateCount > MAX_BATCH_CANDIDATES) {
    return {
      isWithinLimit: false,
      error: `한 번에 분석 가능한 최대 후보 물질 수는 ${MAX_BATCH_CANDIDATES}개입니다. (요청된 후보 수: ${candidateCount}개)`,
    };
  }
  return { isWithinLimit: true };
}

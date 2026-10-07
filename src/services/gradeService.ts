export interface GradeEvaluationOptions {
  isTemporaryEpitope?: boolean;
  isSimulatedStructure?: boolean;
}

export type GradeLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface FitnessGradeResult {
  level: GradeLevel;
  label: string; // e.g. '높음 (High)', '중간 (Medium)', '낮음 (Low)'
  badgeClass: string;
  scoreText: string;
  thresholdRationale: string;
  isDemoted: boolean;
  note?: string;
}

/** Standard threshold constants for antigenic mimicry evaluation */
export const FITNESS_THRESHOLDS = {
  HIGH: 75.0,
  MEDIUM: 50.0,
} as const;

/**
 * Calculates fitness grade based on fitness score and context flags (temporary epitope, simulated structure).
 * Standard criteria:
 * - High: Score >= 75.0 (Strong structural mimicry and antigenic surface exposure)
 * - Medium: 50.0 <= Score < 75.0 (Moderate mimicry, potential candidate requiring refinement)
 * - Low: Score < 50.0 (Insufficient structural alignment or epitope deviation)
 *
 * If temporary epitope or simulated structure is used, a note is attached and low confidence warning is noted.
 */
export function getFitnessGrade(
  score: number,
  options: GradeEvaluationOptions = {}
): FitnessGradeResult {
  const { isTemporaryEpitope = false, isSimulatedStructure = false } = options;

  let level: GradeLevel = 'LOW';
  let label = '낮음 (Low)';
  let badgeClass = 'bg-rose-950 text-rose-300 border-rose-800';

  if (score >= FITNESS_THRESHOLDS.HIGH) {
    level = 'HIGH';
    label = '높음 (High)';
    badgeClass = 'bg-emerald-950 text-emerald-300 border-emerald-800';
  } else if (score >= FITNESS_THRESHOLDS.MEDIUM) {
    level = 'MEDIUM';
    label = '중간 (Medium)';
    badgeClass = 'bg-amber-950 text-amber-300 border-amber-800';
  }

  const notes: string[] = [];
  if (isTemporaryEpitope) {
    notes.push('임시 에피톱(표면 노출 잔기) 기준 평가이므로 등급 신뢰도가 낮습니다.');
  }
  if (isSimulatedStructure) {
    notes.push('모사(템플릿 서열 매핑) 구조 기준 평가이므로 실제 구조 검증이 필요합니다.');
  }

  const thresholdRationale = `기준: ${FITNESS_THRESHOLDS.HIGH}점 이상 (높음), ${FITNESS_THRESHOLDS.MEDIUM}점 이상 (중간), ${FITNESS_THRESHOLDS.MEDIUM}점 미만 (낮음).`;

  return {
    level,
    label,
    badgeClass,
    scoreText: score.toFixed(1),
    thresholdRationale,
    isDemoted: false,
    note: notes.length > 0 ? notes.join(' ') : undefined,
  };
}

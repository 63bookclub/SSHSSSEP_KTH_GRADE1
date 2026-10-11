export type StructureSourceCategory = '실험' | 'AlphaFold DB' | 'ESMFold 예측' | '모사(대체)';

export interface StructureSourceInfo {
  category: StructureSourceCategory;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  isSimulated: boolean;
  isExperimental: boolean;
}

export interface ConfidenceGradeInfo {
  grade: '높음 (High)' | '중간 (Moderate)' | '낮음 (Low)';
  fullLabel: string;
  level: 'high' | 'moderate' | 'low';
  badgeBg: string;
  textColor: string;
  borderColor: string;
}

/**
 * Centrally classifies candidate structure source into 4 standard categories:
 * 1. 실험 (Experimental PDB)
 * 2. AlphaFold DB
 * 3. ESMFold 예측 (ESMFold Prediction)
 * 4. 모사(대체) (Simulated / Fallback)
 */
export function getStructureSourceInfo(autoSettings?: {
  candidate_source?: string;
  candidateSource?: string;
  is_experimental_candidate?: boolean;
  isExperimentalCandidate?: boolean;
  is_simulated?: boolean;
  isSimulated?: boolean;
}): StructureSourceInfo {
  const isSimulated =
    !!autoSettings?.is_simulated ||
    !!autoSettings?.isSimulated ||
    autoSettings?.candidate_source === 'simulated' ||
    autoSettings?.candidateSource === 'simulated';

  const isExperimental =
    !!autoSettings?.is_experimental_candidate ||
    !!autoSettings?.isExperimentalCandidate ||
    autoSettings?.candidate_source === 'experimental' ||
    autoSettings?.candidateSource === 'experimental';

  const src = autoSettings?.candidate_source || autoSettings?.candidateSource;

  if (isSimulated) {
    return {
      category: '모사(대체)',
      label: '모사(대체) 구조 (Simulated Template)',
      badgeBg: 'bg-rose-950/80',
      badgeText: 'text-rose-300',
      badgeBorder: 'border-rose-700',
      isSimulated: true,
      isExperimental: false,
    };
  }

  if (src === 'alphafold') {
    return {
      category: 'AlphaFold DB',
      label: 'AlphaFold DB (pLDDT)',
      badgeBg: 'bg-indigo-950/80',
      badgeText: 'text-indigo-300',
      badgeBorder: 'border-indigo-700',
      isSimulated: false,
      isExperimental: false,
    };
  }

  if (isExperimental) {
    return {
      category: '실험',
      label: '실험 결정 구조 (PDB)',
      badgeBg: 'bg-emerald-950/80',
      badgeText: 'text-emerald-300',
      badgeBorder: 'border-emerald-700',
      isSimulated: false,
      isExperimental: true,
    };
  }

  // Default to ESMFold prediction
  return {
    category: 'ESMFold 예측',
    label: 'ESMFold 예측 (pLDDT)',
    badgeBg: 'bg-cyan-950/80',
    badgeText: 'text-cyan-300',
    badgeBorder: 'border-cyan-700',
    isSimulated: false,
    isExperimental: false,
  };
}

/**
 * Centrally manages confidence grades based on score and auto settings
 */
export function getConfidenceGradeInfo(
  finalScore: number,
  options?: {
    isTemporaryEpitope?: boolean;
    isSimulated?: boolean;
  }
): ConfidenceGradeInfo {
  let grade: '높음 (High)' | '중간 (Moderate)' | '낮음 (Low)' = '낮음 (Low)';
  let level: 'high' | 'moderate' | 'low' = 'low';
  let badgeBg = 'bg-rose-950 text-rose-300 border-rose-800';
  let textColor = '#e11d48';
  let borderColor = '#e11d48';

  if (finalScore >= 75.0) {
    grade = '높음 (High)';
    level = 'high';
    badgeBg = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    textColor = '#059669';
    borderColor = '#059669';
  } else if (finalScore >= 50.0) {
    grade = '중간 (Moderate)';
    level = 'moderate';
    badgeBg = 'bg-amber-950 text-amber-300 border-amber-800';
    textColor = '#d97706';
    borderColor = '#d97706';
  }

  let fullLabel = grade;
  if (options?.isTemporaryEpitope) {
    fullLabel += ' (임시 에피톱)';
  } else if (options?.isSimulated) {
    fullLabel += ' (모사 구조)';
  }

  return {
    grade,
    fullLabel,
    level,
    badgeBg,
    textColor,
    borderColor,
  };
}

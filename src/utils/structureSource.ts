export type StructureSourceType = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  type: StructureSourceType;
  label: string;
  badgeLabel: string;
  shortLabel: string;
  badgeColorClass: string;
  isSimulated: boolean;
  isExperimental: boolean;
}

export interface ConfidenceGradeInfo {
  grade: 'high' | 'moderate' | 'low';
  label: string;
  fullBadgeLabel: string;
  bgClass: string;
  colorHex: string;
  bgHex: string;
}

/**
 * Classifies the structure source for candidate structures centrally across
 * Result Dashboards, Batch Screening Views, and PDF Reports.
 */
export function classifyStructureSource(autoSettings?: {
  candidate_source?: string;
  candidateSource?: string;
  is_simulated?: boolean;
  isSimulated?: boolean;
  is_experimental_candidate?: boolean;
  isExperimentalCandidate?: boolean;
}): StructureSourceInfo {
  const source = autoSettings?.candidate_source || autoSettings?.candidateSource;
  const isSim = !!(autoSettings?.is_simulated || autoSettings?.isSimulated || source === 'simulated');
  const isExp = !!(autoSettings?.is_experimental_candidate || autoSettings?.isExperimentalCandidate || source === 'experimental');

  if (isSim) {
    return {
      type: 'simulated',
      label: '모사(대체)',
      badgeLabel: '모사 대체 구조 (Simulated Template)',
      shortLabel: '모사(대체)',
      badgeColorClass: 'bg-rose-950/80 text-rose-300 border-rose-800',
      isSimulated: true,
      isExperimental: false,
    };
  }

  if (source === 'alphafold') {
    return {
      type: 'alphafold',
      label: 'AlphaFold DB',
      badgeLabel: 'AlphaFold DB (pLDDT)',
      shortLabel: 'AlphaFold DB',
      badgeColorClass: 'bg-sky-950/80 text-sky-300 border-sky-800',
      isSimulated: false,
      isExperimental: false,
    };
  }

  if (source === 'esmfold') {
    return {
      type: 'esmfold',
      label: 'ESMFold 예측',
      badgeLabel: 'ESMFold 예측 (pLDDT)',
      shortLabel: 'ESMFold 예측',
      badgeColorClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
      isSimulated: false,
      isExperimental: false,
    };
  }

  if (isExp) {
    return {
      type: 'experimental',
      label: '실험',
      badgeLabel: '실험 결정 구조 (PDB)',
      shortLabel: '실험',
      badgeColorClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
      isSimulated: false,
      isExperimental: true,
    };
  }

  return {
    type: 'esmfold',
    label: 'ESMFold 예측',
    badgeLabel: 'ESMFold 예측 (pLDDT)',
    shortLabel: 'ESMFold 예측',
    badgeColorClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
    isSimulated: false,
    isExperimental: false,
  };
}

/**
 * Derives the confidence grade and label for candidate evaluations centrally.
 */
export function getConfidenceGrade(
  score: number,
  options?: {
    isTemporaryEpitope?: boolean;
    isSimulated?: boolean;
  }
): ConfidenceGradeInfo {
  let grade: 'high' | 'moderate' | 'low' = 'low';
  let label = '낮음 (Low)';
  let bgClass = 'bg-rose-950 text-rose-300 border-rose-800';
  let colorHex = '#e11d48';
  let bgHex = '#ffe4e6';

  if (score >= 75.0) {
    grade = 'high';
    label = '높음 (High)';
    bgClass = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    colorHex = '#059669';
    bgHex = '#d1fae5';
  } else if (score >= 50.0) {
    grade = 'moderate';
    label = '중간 (Moderate)';
    bgClass = 'bg-amber-950 text-amber-300 border-amber-800';
    colorHex = '#d97706';
    bgHex = '#fef3c7';
  }

  let fullBadgeLabel = label;
  if (options?.isTemporaryEpitope) {
    fullBadgeLabel += ' (임시 에피톱)';
  } else if (options?.isSimulated) {
    fullBadgeLabel += ' (모사 구조)';
  }

  return {
    grade,
    label,
    fullBadgeLabel,
    bgClass,
    colorHex,
    bgHex,
  };
}

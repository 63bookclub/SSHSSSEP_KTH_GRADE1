export type StructureSourceType = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  type: StructureSourceType;
  label: string;
  shortLabel: string;
  badgeClass: string;
  isSimulated: boolean;
  isExperimental: boolean;
}

export interface ConfidenceGradeInfo {
  grade: 'high' | 'moderate' | 'low';
  label: string;
  fullLabel: string;
  badgeClass: string;
}

/**
  * Resolves candidate structure source classification, human-readable labels, and UI badge styles.
  */
export function getStructureSourceInfo(
  source?: string,
  isExperimental?: boolean,
  isSimulated?: boolean
): StructureSourceInfo {
  const normSource = (source || '').toLowerCase();

  if (isSimulated || normSource === 'simulated') {
    return {
      type: 'simulated',
      label: '모사 대체 구조 (Simulated Template)',
      shortLabel: '모사 대체',
      badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800',
      isSimulated: true,
      isExperimental: false,
    };
  }

  if (normSource === 'alphafold') {
    return {
      type: 'alphafold',
      label: 'AlphaFold DB (pLDDT)',
      shortLabel: 'AlphaFold DB',
      badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-800',
      isSimulated: false,
      isExperimental: false,
    };
  }

  if (isExperimental || normSource === 'experimental' || normSource === 'pdb') {
    return {
      type: 'experimental',
      label: '실험 결정 구조 (PDB)',
      shortLabel: '실험 (PDB)',
      badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
      isSimulated: false,
      isExperimental: true,
    };
  }

  // Default fallback is ESMFold prediction
  return {
    type: 'esmfold',
    label: 'ESMFold 예측 구조 (pLDDT)',
    shortLabel: 'ESMFold 예측',
    badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-800',
    isSimulated: false,
    isExperimental: false,
  };
}

/**
  * Determines overall confidence/fitness grade and labels from numerical fitness score.
  */
export function getConfidenceGrade(
  finalScore: number,
  options?: { isTemporaryEpitope?: boolean; isSimulated?: boolean }
): ConfidenceGradeInfo {
  let grade: 'high' | 'moderate' | 'low' = 'low';
  let label = '낮음 (Low)';
  let badgeClass = 'bg-rose-950 text-rose-300 border-rose-800';

  if (finalScore >= 75.0) {
    grade = 'high';
    label = '높음 (High)';
    badgeClass = 'bg-emerald-950 text-emerald-300 border-emerald-800';
  } else if (finalScore >= 50.0) {
    grade = 'moderate';
    label = '중간 (Moderate)';
    badgeClass = 'bg-amber-950 text-amber-300 border-amber-800';
  }

  let fullLabel = label;
  if (options?.isTemporaryEpitope) {
    fullLabel += ' (임시 에피톱)';
  } else if (options?.isSimulated) {
    fullLabel += ' (모사 구조)';
  }

  return {
    grade,
    label,
    fullLabel,
    badgeClass,
  };
}

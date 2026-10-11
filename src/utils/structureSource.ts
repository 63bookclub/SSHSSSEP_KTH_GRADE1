export type StructureSourceType = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  source: StructureSourceType;
  label: string;
  badgeStyle: string; // Tailwind CSS classes for styling
  isExperimental: boolean;
  isSimulated: boolean;
}

export interface ConfidenceGradeInfo {
  gradeLabel: string;
  shortLabel: '높음 (High)' | '중간 (Moderate)' | '낮음 (Low)';
  badgeStyle: string;
  score: number;
  isTemporaryEpitope: boolean;
  isSimulated: boolean;
}

/**
 * Returns structured information about the candidate structure source.
 */
export function getStructureSourceInfo(
  source?: StructureSourceType,
  isSimulated?: boolean,
  isExperimental?: boolean
): StructureSourceInfo {
  const effectiveSimulated = isSimulated || source === 'simulated';
  const effectiveExperimental = isExperimental || source === 'experimental';

  if (effectiveSimulated) {
    return {
      source: 'simulated',
      label: '모사 대체 (Simulated Template)',
      badgeStyle: 'bg-rose-950/80 text-rose-300 border-rose-800',
      isExperimental: false,
      isSimulated: true,
    };
  }

  if (source === 'alphafold') {
    return {
      source: 'alphafold',
      label: 'AlphaFold DB (pLDDT)',
      badgeStyle: 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
      isExperimental: false,
      isSimulated: false,
    };
  }

  if (effectiveExperimental) {
    return {
      source: 'experimental',
      label: '실험 결정 구조 (PDB)',
      badgeStyle: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
      isExperimental: true,
      isSimulated: false,
    };
  }

  // Default to ESMFold prediction
  return {
    source: 'esmfold',
    label: 'ESMFold 예측 (pLDDT)',
    badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800',
    isExperimental: false,
    isSimulated: false,
  };
}

/**
 * Calculates confidence grade and label based on fitness score and structure metadata.
 */
export function getConfidenceGradeInfo(
  score: number,
  isTemporaryEpitope: boolean = false,
  isSimulated: boolean = false
): ConfidenceGradeInfo {
  let shortLabel: '높음 (High)' | '중간 (Moderate)' | '낮음 (Low)';
  let badgeStyle = 'bg-rose-950 text-rose-300 border-rose-800';

  if (score >= 75.0) {
    shortLabel = '높음 (High)';
    badgeStyle = 'bg-emerald-950 text-emerald-300 border-emerald-800';
  } else if (score >= 50.0) {
    shortLabel = '중간 (Moderate)';
    badgeStyle = 'bg-amber-950 text-amber-300 border-amber-800';
  } else {
    shortLabel = '낮음 (Low)';
  }

  let gradeLabel: string = shortLabel;
  if (isTemporaryEpitope) {
    gradeLabel += ' (임시 에피톱)';
  } else if (isSimulated) {
    gradeLabel += ' (모사 구조)';
  }

  return {
    gradeLabel,
    shortLabel,
    badgeStyle,
    score,
    isTemporaryEpitope,
    isSimulated,
  };
}

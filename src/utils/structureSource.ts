export interface StructureSourceInfo {
  label: string; // e.g., '실험 결정 구조 (PDB)', 'AlphaFold DB (pLDDT)', 'ESMFold 예측 (pLDDT)', '모사 대체 (Simulated Template)'
  badgeText: string; // '실험', 'AlphaFold DB', 'ESMFold 예측', '모사(대체)'
  type: 'experimental' | 'alphafold' | 'esmfold' | 'simulated';
  isSimulated: boolean;
}

export interface GradeInfo {
  grade: 'high' | 'moderate' | 'low';
  label: string; // '높음 (High)', '중간 (Moderate)', '낮음 (Low)'
  fullLabel: string; // '높음 (High) (임시 에피톱)'
  bgClass: string;
  textClass: string;
  colorHex: string;
  bgHex: string;
}

export function getStructureSourceInfo(
  candidateSource?: string,
  isSimulated?: boolean,
  isExperimentalCandidate?: boolean
): StructureSourceInfo {
  if (isSimulated || candidateSource === 'simulated') {
    return {
      label: '모사 대체 (Simulated Template)',
      badgeText: '모사(대체)',
      type: 'simulated',
      isSimulated: true,
    };
  }
  if (candidateSource === 'alphafold') {
    return {
      label: 'AlphaFold DB (pLDDT)',
      badgeText: 'AlphaFold DB',
      type: 'alphafold',
      isSimulated: false,
    };
  }
  if (candidateSource === 'experimental' || isExperimentalCandidate) {
    return {
      label: '실험 결정 구조 (PDB)',
      badgeText: '실험',
      type: 'experimental',
      isSimulated: false,
    };
  }
  return {
    label: 'ESMFold 예측 (pLDDT)',
    badgeText: 'ESMFold 예측',
    type: 'esmfold',
    isSimulated: false,
  };
}

export function getGradeInfo(
  score: number,
  isTemporaryEpitope?: boolean,
  isSimulated?: boolean
): GradeInfo {
  let grade: 'high' | 'moderate' | 'low' = 'low';
  let label = '낮음 (Low)';
  let bgClass = 'bg-rose-950 text-rose-300 border-rose-800';
  let textClass = 'text-rose-400';
  let colorHex = '#e11d48';
  let bgHex = '#ffe4e6';

  if (score >= 75.0) {
    grade = 'high';
    label = '높음 (High)';
    bgClass = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    textClass = 'text-emerald-400';
    colorHex = '#059669';
    bgHex = '#d1fae5';
  } else if (score >= 50.0) {
    grade = 'moderate';
    label = '중간 (Moderate)';
    bgClass = 'bg-amber-950 text-amber-300 border-amber-800';
    textClass = 'text-amber-400';
    colorHex = '#d97706';
    bgHex = '#fef3c7';
  }

  let fullLabel = label;
  if (isTemporaryEpitope) {
    fullLabel += ' (임시 에피톱)';
  } else if (isSimulated) {
    fullLabel += ' (모사 구조)';
  }

  return {
    grade,
    label,
    fullLabel,
    bgClass,
    textClass,
    colorHex,
    bgHex,
  };
}

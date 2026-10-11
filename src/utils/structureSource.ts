export type StructureSourceType = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceBadge {
  type: StructureSourceType;
  label: string;
  shortLabel: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  colorHex: string;
  isSimulated: boolean;
}

export interface ConfidenceGrade {
  score: number;
  label: string;
  shortLabel: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  colorHex: string;
  bgHex: string;
}

/**
 * Returns standardized badge metadata for structure source classification:
 * - 실험 결정 구조 (Experimental PDB)
 * - AlphaFold DB (pLDDT)
 * - ESMFold 예측 (pLDDT)
 * - 모사 대체 구조 (Simulated Template)
 */
export function getStructureSourceBadge(
  source?: string,
  isExperimental?: boolean,
  isSimulated?: boolean
): StructureSourceBadge {
  if (isSimulated || source === 'simulated') {
    return {
      type: 'simulated',
      label: '모사 대체 (Simulated Template)',
      shortLabel: '모사 대체',
      bgClass: 'bg-rose-950/80',
      textClass: 'text-rose-300',
      borderClass: 'border-rose-700',
      colorHex: '#f43f5e',
      isSimulated: true,
    };
  }

  if (source === 'alphafold') {
    return {
      type: 'alphafold',
      label: 'AlphaFold DB (pLDDT)',
      shortLabel: 'AlphaFold DB',
      bgClass: 'bg-purple-950/80',
      textClass: 'text-purple-300',
      borderClass: 'border-purple-700',
      colorHex: '#a855f7',
      isSimulated: false,
    };
  }

  if (isExperimental || source === 'experimental') {
    return {
      type: 'experimental',
      label: '실험 결정 구조 (PDB)',
      shortLabel: '실험 결정',
      bgClass: 'bg-cyan-950/80',
      textClass: 'text-cyan-300',
      borderClass: 'border-cyan-700',
      colorHex: '#06b6d4',
      isSimulated: false,
    };
  }

  // Default: ESMFold
  return {
    type: 'esmfold',
    label: 'ESMFold 예측 (pLDDT)',
    shortLabel: 'ESMFold 예측',
    bgClass: 'bg-emerald-950/80',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-700',
    colorHex: '#10b981',
    isSimulated: false,
  };
}

/**
 * Returns standardized confidence grade metadata based on composite fitness score
 */
export function getConfidenceGrade(
  score: number,
  options?: { isTemporaryEpitope?: boolean; isSimulated?: boolean }
): ConfidenceGrade {
  let label = '낮음 (Low)';
  let shortLabel = '낮음 (Low)';
  let bgClass = 'bg-rose-950 text-rose-300 border-rose-800';
  let textClass = 'text-rose-300';
  let borderClass = 'border-rose-800';
  let colorHex = '#e11d48';
  let bgHex = '#ffe4e6';

  if (score >= 75.0) {
    label = '높음 (High)';
    shortLabel = '높음 (High)';
    bgClass = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    textClass = 'text-emerald-300';
    borderClass = 'border-emerald-800';
    colorHex = '#059669';
    bgHex = '#d1fae5';
  } else if (score >= 50.0) {
    label = '중간 (Moderate)';
    shortLabel = '중간 (Moderate)';
    bgClass = 'bg-amber-950 text-amber-300 border-amber-800';
    textClass = 'text-amber-300';
    borderClass = 'border-amber-800';
    colorHex = '#d97706';
    bgHex = '#fef3c7';
  }

  if (options?.isTemporaryEpitope) {
    label += ' (임시 에피톱)';
    shortLabel += ' (임시)';
  } else if (options?.isSimulated) {
    label += ' (모사 구조)';
    shortLabel += ' (모사)';
  }

  return {
    score,
    label,
    shortLabel,
    bgClass,
    textClass,
    borderClass,
    colorHex,
    bgHex,
  };
}

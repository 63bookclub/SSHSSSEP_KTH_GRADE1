export type StructureSourceType = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  type: StructureSourceType;
  label: string; // Detailed description label
  badgeText: string; // Short badge label ("실험" | "AlphaFold DB" | "ESMFold 예측" | "모사(대체)")
  badgeClass: string; // Tailwind styling class
  colorHex: string; // Primary color hex code
}

export interface ConfidenceGradeInfo {
  grade: 'High' | 'Moderate' | 'Low';
  label: string; // "높음 (High)" | "중간 (Moderate)" | "낮음 (Low)" plus optional suffixes
  bgClass: string; // Tailwind bg & text styling
  colorHex: string;
  bgHex: string;
}

/**
 * Returns centralized structure source classification and styling info.
 */
export function getStructureSourceInfo(
  candidateSource?: string,
  isSimulated?: boolean,
  isExperimental?: boolean
): StructureSourceInfo {
  if (isSimulated || candidateSource === 'simulated') {
    return {
      type: 'simulated',
      label: '모사(대체) 구조 (Simulated Template)',
      badgeText: '모사(대체)',
      badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800',
      colorHex: '#e11d48',
    };
  }
  if (candidateSource === 'alphafold') {
    return {
      type: 'alphafold',
      label: 'AlphaFold DB (pLDDT)',
      badgeText: 'AlphaFold DB',
      badgeClass: 'bg-blue-950/80 text-blue-300 border-blue-800',
      colorHex: '#2563eb',
    };
  }
  if (isExperimental || candidateSource === 'experimental') {
    return {
      type: 'experimental',
      label: '실험 결정 구조 (PDB)',
      badgeText: '실험',
      badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
      colorHex: '#059669',
    };
  }
  // Default: ESMFold prediction
  return {
    type: 'esmfold',
    label: 'ESMFold 예측 구조 (pLDDT)',
    badgeText: 'ESMFold 예측',
    badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
    colorHex: '#6366f1',
  };
}

/**
 * Returns centralized confidence grade level and label.
 */
export function getConfidenceGrade(
  score: number,
  isTemporaryEpitope?: boolean,
  isSimulated?: boolean
): ConfidenceGradeInfo {
  let grade: 'High' | 'Moderate' | 'Low' = 'Low';
  let label = '낮음 (Low)';
  let bgClass = 'bg-rose-950 text-rose-300 border-rose-800';
  let colorHex = '#e11d48';
  let bgHex = '#ffe4e6';

  if (score >= 75.0) {
    grade = 'High';
    label = '높음 (High)';
    bgClass = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    colorHex = '#059669';
    bgHex = '#d1fae5';
  } else if (score >= 50.0) {
    grade = 'Moderate';
    label = '중간 (Moderate)';
    bgClass = 'bg-amber-950 text-amber-300 border-amber-800';
    colorHex = '#d97706';
    bgHex = '#fef3c7';
  }

  if (isTemporaryEpitope) {
    label += ' (임시 에피톱 적용)';
  } else if (isSimulated) {
    label += ' (모사 구조 적용)';
  }

  return {
    grade,
    label,
    bgClass,
    colorHex,
    bgHex,
  };
}

export type CandidateStructureSource = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  sourceKey: CandidateStructureSource;
  label: string;
  badgeBg: string;
  badgeTextColor: string;
  badgeBorderColor: string;
  isSimulated: boolean;
}

export interface ConfidenceGradeInfo {
  gradeLabel: string;
  gradeText: '높음 (High)' | '중간 (Moderate)' | '낮음 (Low)';
  colorHex: string;
  bgHex: string;
  bgClass: string;
}

export function getStructureSourceInfo(
  candidateSource?: string,
  isExperimentalCandidate?: boolean,
  isSimulatedSetting?: boolean
): StructureSourceInfo {
  const isSimulated = isSimulatedSetting || candidateSource === 'simulated';

  if (isSimulated) {
    return {
      sourceKey: 'simulated',
      label: '모사 대체 (Simulated Template)',
      badgeBg: 'bg-rose-950/80',
      badgeTextColor: 'text-rose-300',
      badgeBorderColor: 'border-rose-800',
      isSimulated: true,
    };
  }

  if (candidateSource === 'alphafold') {
    return {
      sourceKey: 'alphafold',
      label: 'AlphaFold DB (pLDDT)',
      badgeBg: 'bg-indigo-950/80',
      badgeTextColor: 'text-indigo-300',
      badgeBorderColor: 'border-indigo-800',
      isSimulated: false,
    };
  }

  if (candidateSource === 'experimental' || isExperimentalCandidate) {
    return {
      sourceKey: 'experimental',
      label: '실험 결정 구조 (PDB)',
      badgeBg: 'bg-emerald-950/80',
      badgeTextColor: 'text-emerald-300',
      badgeBorderColor: 'border-emerald-800',
      isSimulated: false,
    };
  }

  return {
    sourceKey: 'esmfold',
    label: 'ESMFold 예측 (pLDDT)',
    badgeBg: 'bg-cyan-950/80',
    badgeTextColor: 'text-cyan-300',
    badgeBorderColor: 'border-cyan-800',
    isSimulated: false,
  };
}

export function getConfidenceGradeInfo(
  fitnessScore: number,
  isTemporaryEpitope: boolean = false,
  isSimulated: boolean = false
): ConfidenceGradeInfo {
  let gradeText: '높음 (High)' | '중간 (Moderate)' | '낮음 (Low)' = '낮음 (Low)';
  let colorHex = '#e11d48';
  let bgHex = '#ffe4e6';
  let bgClass = 'bg-rose-950 text-rose-300 border-rose-800';

  if (fitnessScore >= 75.0) {
    gradeText = '높음 (High)';
    colorHex = '#059669';
    bgHex = '#d1fae5';
    bgClass = 'bg-emerald-950 text-emerald-300 border-emerald-800';
  } else if (fitnessScore >= 50.0) {
    gradeText = '중간 (Moderate)';
    colorHex = '#d97706';
    bgHex = '#fef3c7';
    bgClass = 'bg-amber-950 text-amber-300 border-amber-800';
  }

  let gradeLabel = gradeText as string;
  if (isTemporaryEpitope) {
    gradeLabel += ' (임시 에피톱)';
  } else if (isSimulated) {
    gradeLabel += ' (모사 구조)';
  }

  return {
    gradeLabel,
    gradeText,
    colorHex,
    bgHex,
    bgClass,
  };
}

export type CandidateSourceType = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  type: CandidateSourceType;
  label: string;
  isSimulated: boolean;
  isExperimental: boolean;
}

export interface ConfidenceGradeInfo {
  level: 'high' | 'moderate' | 'low';
  label: string;
  shortLabel: string;
  reportLabel: string;
  color: string;
  bg: string;
  border: string;
}

/**
 * Returns a standardized structure source label and classification info.
 */
export function getStructureSourceInfo(
  source?: string,
  isSimulated?: boolean,
  isExperimental?: boolean
): StructureSourceInfo {
  const simulated = !!isSimulated || source === 'simulated';
  const experimental = !simulated && (!!isExperimental || source === 'experimental');

  let type: CandidateSourceType = 'esmfold';
  let label = 'ESMFold 예측 (pLDDT)';

  if (simulated) {
    type = 'simulated';
    label = '모사 대체 (Simulated Template)';
  } else if (source === 'alphafold') {
    type = 'alphafold';
    label = 'AlphaFold DB (pLDDT)';
  } else if (experimental) {
    type = 'experimental';
    label = '실험 결정 구조 (PDB)';
  } else if (source === 'esmfold') {
    type = 'esmfold';
    label = 'ESMFold 예측 (pLDDT)';
  }

  return {
    type,
    label,
    isSimulated: simulated,
    isExperimental: experimental,
  };
}

/**
 * Returns a standardized structure source label for export reports (HTML/PDF).
 */
export function getStructureSourceReportLabel(
  source?: string,
  isSimulated?: boolean,
  isExperimental?: boolean
): string {
  const info = getStructureSourceInfo(source, isSimulated, isExperimental);
  switch (info.type) {
    case 'simulated':
      return '모사 대체 구조 (Simulated Template)';
    case 'alphafold':
      return 'AlphaFold DB (pLDDT)';
    case 'experimental':
      return '실험 결정 구조 (PDB)';
    case 'esmfold':
    default:
      return 'ESMFold 예측 구조 (pLDDT)';
  }
}

/**
 * Returns confidence grade details and badge styling based on final score and options.
 */
export function getConfidenceGrade(
  score: number,
  options?: {
    isTemporaryEpitope?: boolean;
    isSimulated?: boolean;
  }
): ConfidenceGradeInfo {
  let level: 'high' | 'moderate' | 'low' = 'low';
  let label = '낮음 (Low)';
  let shortLabel = '낮음 (Low)';
  let reportLabel = '낮음 (Low Mimicry)';
  let color = '#e11d48';
  let bg = 'bg-rose-950 text-rose-300 border-rose-800';
  let border = 'border-rose-800';

  if (score >= 75.0) {
    level = 'high';
    label = '높음 (High)';
    shortLabel = '높음 (High)';
    reportLabel = '높음 (High Mimicry)';
    color = '#059669';
    bg = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    border = 'border-emerald-800';
  } else if (score >= 50.0) {
    level = 'moderate';
    label = '중간 (Moderate)';
    shortLabel = '중간 (Mod)';
    reportLabel = '중간 (Moderate Mimicry)';
    color = '#d97706';
    bg = 'bg-amber-950 text-amber-300 border-amber-800';
    border = 'border-amber-800';
  }

  if (options?.isTemporaryEpitope) {
    label += ' (임시 에피톱)';
    reportLabel += ' (임시 에피톱 적용)';
  } else if (options?.isSimulated) {
    label += ' (모사 구조)';
    reportLabel += ' (모사 구조 적용)';
  }

  return {
    level,
    label,
    shortLabel,
    reportLabel,
    color,
    bg,
    border,
  };
}

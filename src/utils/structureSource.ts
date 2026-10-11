export type CandidateSourceKey = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  key: CandidateSourceKey;
  label: string;
  shortLabel: string;
  badgeClass: string;
  textClass: string;
  description: string;
}

export interface ConfidenceGradeInfo {
  level: 'high' | 'moderate' | 'low';
  baseGrade: string;
  fullGrade: string;
  contextSuffix: string;
  badgeBg: string;
  textColor: string;
  borderClass: string;
}

/**
 * Resolves candidate structure source metadata (classification, labels, badge styles)
 */
export function getStructureSourceInfo(
  candidateSource?: string,
  isSimulated?: boolean,
  isExperimental?: boolean
): StructureSourceInfo {
  const srcKey = (candidateSource || '').toLowerCase();

  if (isSimulated || srcKey === 'simulated') {
    return {
      key: 'simulated',
      label: '모사 대체 구조 (Simulated Template)',
      shortLabel: '모사 구조',
      badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-700',
      textClass: 'text-rose-400 font-extrabold',
      description: 'ESMFold API 응답 부재 시 서열 템플릿 모사(Sequence Threading)로 생성된 대체 구조',
    };
  }

  if (srcKey === 'alphafold') {
    return {
      key: 'alphafold',
      label: 'AlphaFold DB (pLDDT)',
      shortLabel: 'AlphaFold DB',
      badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-700',
      textClass: 'text-sky-300 font-bold',
      description: 'AlphaFold DB에서 조회된 3D 좌표 모델',
    };
  }

  if (isExperimental || srcKey === 'experimental') {
    return {
      key: 'experimental',
      label: '실험 결정 구조 (PDB)',
      shortLabel: '실험 결정 구조',
      badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-700',
      textClass: 'text-emerald-300 font-bold',
      description: 'X-선 결정학, cryo-EM 또는 NMR 실험으로 규명된 3D PDB 구조',
    };
  }

  // Default: ESMFold prediction
  return {
    key: 'esmfold',
    label: 'ESMFold 예측 (pLDDT)',
    shortLabel: 'ESMFold 예측',
    badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-700',
    textClass: 'text-indigo-300 font-bold',
    description: 'ESMFold 언어 모델 기반 3D 구조 예측',
  };
}

/**
 * Resolves confidence grade labels and badge styles with structure source / epitope context
 */
export function getConfidenceGradeInfo(
  finalScore: number,
  options: {
    isTemporaryEpitope?: boolean;
    isSimulated?: boolean;
    isExperimental?: boolean;
    candidateSource?: string;
  } = {}
): ConfidenceGradeInfo {
  let level: 'high' | 'moderate' | 'low' = 'low';
  let baseGrade = '낮음 (Low)';
  let badgeBg = 'bg-rose-950 text-rose-300 border-rose-800';
  let textColor = '#e11d48';
  let borderClass = 'border-rose-800';

  if (finalScore >= 75.0) {
    level = 'high';
    baseGrade = '높음 (High)';
    badgeBg = 'bg-emerald-950 text-emerald-300 border-emerald-800';
    textColor = '#059669';
    borderClass = 'border-emerald-800';
  } else if (finalScore >= 50.0) {
    level = 'moderate';
    baseGrade = '중간 (Moderate)';
    badgeBg = 'bg-amber-950 text-amber-300 border-amber-800';
    textColor = '#d97706';
    borderClass = 'border-amber-800';
  }

  const sourceInfo = getStructureSourceInfo(
    options.candidateSource,
    options.isSimulated,
    options.isExperimental
  );

  let contextSuffix = ` (${sourceInfo.shortLabel})`;
  if (options.isTemporaryEpitope) {
    contextSuffix += ' (임시 에피톱)';
  }

  const fullGrade = `${baseGrade}${contextSuffix}`;

  return {
    level,
    baseGrade,
    fullGrade,
    contextSuffix,
    badgeBg,
    textColor,
    borderClass,
  };
}

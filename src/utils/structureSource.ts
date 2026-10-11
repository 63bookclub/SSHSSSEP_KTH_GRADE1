export type StructureSourceType = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  key: StructureSourceType;
  label: string;
  badgeText: string;
  badgeBg: string;
  badgeBorder: string;
  badgeTextColor: string;
  description: string;
}

export interface ConfidenceGradeInfo {
  level: 'high' | 'moderate' | 'low';
  label: string;
  shortLabel: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  combinedClass: string;
  colorHex: string;
  bgHex: string;
}

/**
 * Resolves the candidate structure source details based on auto settings or flags.
 */
export function getStructureSourceInfo(
  source?: string,
  isSimulated?: boolean,
  isExperimental?: boolean
): StructureSourceInfo {
  if (isSimulated || source === 'simulated') {
    return {
      key: 'simulated',
      label: '모사 대체 (Simulated Template)',
      badgeText: '모사(대체)',
      badgeBg: 'bg-rose-950/70',
      badgeBorder: 'border-rose-500',
      badgeTextColor: 'text-rose-300',
      description: 'ESMFold API 응답 부재 시 서열 템플릿 모사(Sequence Threading)로 생성된 대체 구조',
    };
  }

  if (source === 'alphafold') {
    return {
      key: 'alphafold',
      label: 'AlphaFold DB (pLDDT)',
      badgeText: 'AlphaFold DB',
      badgeBg: 'bg-sky-950/70',
      badgeBorder: 'border-sky-500',
      badgeTextColor: 'text-sky-300',
      description: 'AlphaFold DB 고정밀 예측 3D 구조 좌표',
    };
  }

  if (source === 'experimental' || isExperimental) {
    return {
      key: 'experimental',
      label: '실험 결정 구조 (PDB)',
      badgeText: '실험',
      badgeBg: 'bg-emerald-950/70',
      badgeBorder: 'border-emerald-500',
      badgeTextColor: 'text-emerald-300',
      description: 'X-ray / Cryo-EM 등 실험으로 결정된 PDB 구조 좌표',
    };
  }

  return {
    key: 'esmfold',
    label: 'ESMFold 예측 (pLDDT)',
    badgeText: 'ESMFold 예측',
    badgeBg: 'bg-indigo-950/70',
    badgeBorder: 'border-indigo-500',
    badgeTextColor: 'text-indigo-300',
    description: 'ESMFold 언어모델 기반 고속 3D 구조 예측 좌표',
  };
}

/**
 * Computes confidence grade badge text, colors, and modifiers.
 */
export function getConfidenceGradeInfo(
  score: number,
  isTemporaryEpitope?: boolean,
  isSimulated?: boolean
): ConfidenceGradeInfo {
  let level: 'high' | 'moderate' | 'low' = 'low';
  let baseLabel = '낮음 (Low)';
  let shortLabel = '낮음 (Low)';
  let bgClass = 'bg-rose-950';
  let borderClass = 'border-rose-800';
  let textClass = 'text-rose-300';
  let colorHex = '#e11d48';
  let bgHex = '#ffe4e6';

  if (score >= 75.0) {
    level = 'high';
    baseLabel = '높음 (High)';
    shortLabel = '높음 (High)';
    bgClass = 'bg-emerald-950';
    borderClass = 'border-emerald-800';
    textClass = 'text-emerald-300';
    colorHex = '#059669';
    bgHex = '#d1fae5';
  } else if (score >= 50.0) {
    level = 'moderate';
    baseLabel = '중간 (Moderate)';
    shortLabel = '중간 (Mod)';
    bgClass = 'bg-amber-950';
    borderClass = 'border-amber-800';
    textClass = 'text-amber-300';
    colorHex = '#d97706';
    bgHex = '#fef3c7';
  }

  let fullLabel = baseLabel;
  if (isTemporaryEpitope) {
    fullLabel += ' (임시 에피톱)';
  } else if (isSimulated) {
    fullLabel += ' (모사 구조)';
  }

  return {
    level,
    label: fullLabel,
    shortLabel,
    bgClass,
    borderClass,
    textClass,
    combinedClass: `${bgClass} ${textClass} ${borderClass}`,
    colorHex,
    bgHex,
  };
}

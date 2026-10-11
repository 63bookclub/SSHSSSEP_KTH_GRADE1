export type StructureSourceType = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  type: StructureSourceType;
  label: string;
  badgeText: string;
  badgeBg: string;
  badgeTextClass: string;
  badgeBorderClass: string;
  confidenceGrade: string;
  confidenceScoreText: string;
}

export function resolveStructureSourceType(
  candidateSource?: string,
  isExperimental?: boolean,
  isSimulated?: boolean
): StructureSourceType {
  if (isSimulated || candidateSource === 'simulated') {
    return 'simulated';
  }
  if (candidateSource === 'alphafold') {
    return 'alphafold';
  }
  if (candidateSource === 'experimental' || isExperimental) {
    return 'experimental';
  }
  return 'esmfold';
}

export function getStructureSourceInfo(
  candidateSource?: string,
  isExperimental?: boolean,
  isSimulated?: boolean,
  sConf?: number | null
): StructureSourceInfo {
  const type = resolveStructureSourceType(candidateSource, isExperimental, isSimulated);

  let label = 'ESMFold 예측';
  let badgeText = 'ESMFold 예측 (pLDDT)';
  let badgeBg = 'bg-cyan-950/80';
  let badgeTextClass = 'text-cyan-300';
  let badgeBorderClass = 'border-cyan-800';
  let confidenceGrade = '중간/높음 (pLDDT ≥ 70)';
  let confidenceScoreText = sConf !== null && sConf !== undefined ? `${(sConf * 100).toFixed(1)}%` : '미측정';

  switch (type) {
    case 'simulated':
      label = '모사(대체) 구조';
      badgeText = '모사(대체) (Simulated Template)';
      badgeBg = 'bg-rose-950/80';
      badgeTextClass = 'text-rose-300';
      badgeBorderClass = 'border-rose-800';
      confidenceGrade = '모사 대체 (학습용 데모 / 낮은 신뢰도)';
      confidenceScoreText = '0% (모사)';
      break;

    case 'experimental':
      label = '실험 결정 구조 (PDB)';
      badgeText = '실험 결정 (PDB)';
      badgeBg = 'bg-emerald-950/80';
      badgeTextClass = 'text-emerald-300';
      badgeBorderClass = 'border-emerald-800';
      confidenceGrade = '해당 없음 (실험 결정 구조)';
      confidenceScoreText = '100% (실험 데이터)';
      break;

    case 'alphafold':
      label = 'AlphaFold DB';
      badgeText = 'AlphaFold DB (pLDDT)';
      badgeBg = 'bg-indigo-950/80';
      badgeTextClass = 'text-indigo-300';
      badgeBorderClass = 'border-indigo-800';
      if (sConf !== null && sConf !== undefined) {
        if (sConf >= 0.9) confidenceGrade = '매우 높음 (pLDDT ≥ 90)';
        else if (sConf >= 0.7) confidenceGrade = '높음 (pLDDT ≥ 70)';
        else confidenceGrade = '낮음 (pLDDT < 70)';
        confidenceScoreText = `${(sConf * 100).toFixed(1)}%`;
      } else {
        confidenceGrade = 'AlphaFold DB 신뢰도';
      }
      break;

    case 'esmfold':
    default:
      label = 'ESMFold 예측';
      badgeText = 'ESMFold 예측 (pLDDT)';
      badgeBg = 'bg-sky-950/80';
      badgeTextClass = 'text-sky-300';
      badgeBorderClass = 'border-sky-800';
      if (sConf !== null && sConf !== undefined) {
        if (sConf >= 0.9) confidenceGrade = '매우 높음 (pLDDT ≥ 90)';
        else if (sConf >= 0.7) confidenceGrade = '높음 (pLDDT ≥ 70)';
        else confidenceGrade = '낮음 (pLDDT < 70)';
        confidenceScoreText = `${(sConf * 100).toFixed(1)}%`;
      } else {
        confidenceGrade = 'ESMFold 예측 신뢰도';
      }
      break;
  }

  return {
    type,
    label,
    badgeText,
    badgeBg,
    badgeTextClass,
    badgeBorderClass,
    confidenceGrade,
    confidenceScoreText,
  };
}

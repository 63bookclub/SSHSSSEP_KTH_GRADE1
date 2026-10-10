export type StructureSourceCategory = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  category: StructureSourceCategory;
  badgeLabel: string; // '실험' | 'AlphaFold DB' | 'ESMFold 예측' | '모사(대체)'
  fullLabel: string;  // Detailed label including badge and confidence level
  confidenceGrade: string; // Confidence grade (신뢰 등급)
  colorClass: string;
}

/**
 * Returns normalized structure source badge and confidence level info for display in result cards and PDF reports.
 */
export function getStructureSourceInfo(
  candidateSource?: string,
  isExperimental?: boolean,
  isSimulated?: boolean
): StructureSourceInfo {
  if (isSimulated || candidateSource === 'simulated') {
    return {
      category: 'simulated',
      badgeLabel: '모사(대체)',
      fullLabel: '[모사(대체)] 대체 구조 · 신뢰 등급: 낮음 (학습용 데모)',
      confidenceGrade: '낮음 (학습용 데모)',
      colorClass: 'text-rose-400 font-extrabold',
    };
  }
  if (candidateSource === 'alphafold') {
    return {
      category: 'alphafold',
      badgeLabel: 'AlphaFold DB',
      fullLabel: '[AlphaFold DB] 예측 구조 · 신뢰 등급: 높음 (pLDDT)',
      confidenceGrade: '높음 (pLDDT)',
      colorClass: 'text-cyan-300 font-bold',
    };
  }
  if (candidateSource === 'experimental' || isExperimental) {
    return {
      category: 'experimental',
      badgeLabel: '실험',
      fullLabel: '[실험] 결정 구조 (PDB) · 신뢰 등급: 높음 (실험 검증)',
      confidenceGrade: '높음 (실험 검증)',
      colorClass: 'text-emerald-300 font-bold',
    };
  }
  return {
    category: 'esmfold',
    badgeLabel: 'ESMFold 예측',
    fullLabel: '[ESMFold 예측] AI 예측 구조 · 신뢰 등급: 중간/높음 (pLDDT)',
    confidenceGrade: '중간/높음 (pLDDT)',
    colorClass: 'text-amber-300 font-bold',
  };
}

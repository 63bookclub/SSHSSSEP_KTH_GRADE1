export type CandidateStructureSource = 'experimental' | 'alphafold' | 'esmfold' | 'simulated';

export interface StructureSourceInfo {
  source: CandidateStructureSource;
  label: string;
  badgeText: string;
  badgeClass: string;
  badgeColorHex: string;
  badgeBgHex: string;
  confidenceGrade: string;
  confidenceGradeShort: string;
}

/**
 * Resolves standardized structure source metadata and confidence grade.
 */
export function getStructureSourceInfo(
  candidateSource?: string,
  isExperimentalCandidate?: boolean,
  isSimulated?: boolean,
  meanPlddt?: number
): StructureSourceInfo {
  // Determine canonical source
  let canonicalSource: CandidateStructureSource = 'esmfold';

  if (isSimulated || candidateSource === 'simulated') {
    canonicalSource = 'simulated';
  } else if (candidateSource === 'alphafold') {
    canonicalSource = 'alphafold';
  } else if (candidateSource === 'experimental' || isExperimentalCandidate) {
    canonicalSource = 'experimental';
  } else {
    canonicalSource = 'esmfold';
  }

  // Determine confidence grade based on source and mean pLDDT
  let confidenceGrade = '';
  let confidenceGradeShort = '';

  if (canonicalSource === 'experimental') {
    confidenceGrade = '실험 결정 (X-ray/Cryo-EM 정밀 측정)';
    confidenceGradeShort = '실험 결정 (PDB)';
  } else if (canonicalSource === 'simulated') {
    confidenceGrade = '모사 대체 구조 (서열 템플릿 모사 / 연구용 사용 불가)';
    confidenceGradeShort = '모사 대체 (Simulated)';
  } else {
    // For AlphaFold or ESMFold prediction models
    const plddtVal = typeof meanPlddt === 'number' ? meanPlddt : undefined;
    if (plddtVal !== undefined) {
      if (plddtVal >= 90) {
        confidenceGrade = `매우 높음 (Very High: pLDDT ${plddtVal.toFixed(1)} ≥ 90)`;
        confidenceGradeShort = `매우 높음 (${plddtVal.toFixed(1)})`;
      } else if (plddtVal >= 70) {
        confidenceGrade = `높음 (High: pLDDT ${plddtVal.toFixed(1)} ≥ 70)`;
        confidenceGradeShort = `높음 (${plddtVal.toFixed(1)})`;
      } else if (plddtVal >= 50) {
        confidenceGrade = `중간 (Moderate: pLDDT ${plddtVal.toFixed(1)})`;
        confidenceGradeShort = `중간 (${plddtVal.toFixed(1)})`;
      } else {
        confidenceGrade = `낮음 (Low: pLDDT ${plddtVal.toFixed(1)} < 50)`;
        confidenceGradeShort = `낮음 (${plddtVal.toFixed(1)})`;
      }
    } else {
      confidenceGrade = canonicalSource === 'alphafold' ? 'AlphaFold DB (pLDDT 지표)' : 'ESMFold 예측 (pLDDT 지표)';
      confidenceGradeShort = canonicalSource === 'alphafold' ? 'AlphaFold DB' : 'ESMFold 예측';
    }
  }

  switch (canonicalSource) {
    case 'experimental':
      return {
        source: 'experimental',
        label: '실험 결정 구조 (PDB)',
        badgeText: '실험 결정 (PDB)',
        badgeClass: 'bg-sky-950 text-sky-300 border-sky-800',
        badgeColorHex: '#0284c7',
        badgeBgHex: '#e0f2fe',
        confidenceGrade,
        confidenceGradeShort,
      };
    case 'alphafold':
      return {
        source: 'alphafold',
        label: 'AlphaFold DB (pLDDT)',
        badgeText: 'AlphaFold DB',
        badgeClass: 'bg-indigo-950 text-indigo-300 border-indigo-800',
        badgeColorHex: '#4f46e5',
        badgeBgHex: '#e0e7ff',
        confidenceGrade,
        confidenceGradeShort,
      };
    case 'simulated':
      return {
        source: 'simulated',
        label: '모사 대체 구조 (Simulated Template)',
        badgeText: '모사 대체 (Simulated)',
        badgeClass: 'bg-rose-950 text-rose-300 border-rose-800 font-bold animate-pulse',
        badgeColorHex: '#e11d48',
        badgeBgHex: '#ffe4e6',
        confidenceGrade,
        confidenceGradeShort,
      };
    case 'esmfold':
    default:
      return {
        source: 'esmfold',
        label: 'ESMFold 예측 구조 (pLDDT)',
        badgeText: 'ESMFold 예측',
        badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-800',
        badgeColorHex: '#059669',
        badgeBgHex: '#d1fae5',
        confidenceGrade,
        confidenceGradeShort,
      };
  }
}

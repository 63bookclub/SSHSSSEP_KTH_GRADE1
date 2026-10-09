import { Atom, Residue, ParsedStructure, getResidueKey, AA3_TO_1, AA1_TO_3 } from './pdbParser.ts';
import { AlignmentResult, AlignedPair } from './kabschAlignment.ts';
import { validateAndNormalizeWeights } from '../../utils/validation.ts';

export interface MultiEpitopeEntity {
  id: string;
  name: string;
  range: string;
  weight: number;
  color?: string;
  residues?: (number | string)[];
  sEpi?: number;
  rmsd?: number;
}

export interface EvaluationResult {
  autoSettings: {
    mode: 'full' | 'fragment';
    epitopeSource: 'manual' | 'complex' | 'prediction_csv' | 'temporary_rsa_fallback';
    targetChain: string;
    isTemporaryEpitope: boolean;
    isExperimentalCandidate: boolean;
    candidateSource?: 'experimental' | 'alphafold' | 'esmfold' | 'simulated';
    isSimulated?: boolean;
    warnings?: string[];
  };
  alignment: {
    tmScoreTargetNorm: number;
    tmScoreCandidateNorm: number;
    rmsd: number;
    alignedLength: number;
    coverage: number;
  };
  subScores: {
    s_global: number;
    s_epi: number;
    s_exp: number;
    s_conf: number | null;
  };
  weights: [number, number, number, number];
  finalFitnessScore: number;
  evaluationRationale: string;
  epitopeBreakdown?: {
    id: string;
    name: string;
    range: string;
    residuesCount: number;
    sEpi: number;
    rmsd: number;
    color: string;
  }[];
  residues: {
    res_id: number | string;
    cand_res_id?: number | string;
    res_name: string;
    in_epitope: boolean;
    epitope_id?: string;
    distance: number;
    rsa_target: number;
    rsa_candidate: number;
    plddt: number;
    similarity: number;
  }[];
  reproducibility: {
    toolVersions: Record<string, string>;
    databaseVersions: Record<string, string>;
    parameters: Record<string, any>;
    timestamp: string;
    inputHash: string;
  };
}

export function extractComplexContacts(
  structure: ParsedStructure,
  antigenChain: string,
  antibodyChains: string[],
  cutoff = 4.5
): (number | string)[] {
  const agResidues = structure.residuesByChain[antigenChain] || [];
  const abAtoms: Atom[] = [];

  for (const abChain of antibodyChains) {
    const list = structure.residuesByChain[abChain] || [];
    for (const r of list) {
      abAtoms.push(...r.atoms);
    }
  }

  if (agResidues.length === 0 || abAtoms.length === 0) {
    return [];
  }

  const contactResKeys = new Set<string>();
  const cutoffSq = cutoff * cutoff;

  for (const agRes of agResidues) {
    let isContact = false;
    for (const agAtom of agRes.atoms) {
      for (const abAtom of abAtoms) {
        const dx = agAtom.x - abAtom.x;
        const dy = agAtom.y - abAtom.y;
        const dz = agAtom.z - abAtom.z;
        if (dx * dx + dy * dy + dz * dz <= cutoffSq) {
          contactResKeys.add(agRes.resKey || getResidueKey(agRes.resSeq, agRes.iCode));
          isContact = true;
          break;
        }
      }
      if (isContact) break;
    }
  }

  return agResidues
    .filter(r => contactResKeys.has(r.resKey || getResidueKey(r.resSeq, r.iCode)))
    .map(r => r.resKey || getResidueKey(r.resSeq, r.iCode));
}

export function parseResidueRange(input: string): (number | string)[] {
  const result: (number | string)[] = [];
  const resultSet = new Set<string>();
  const parts = input.split(/[,;\s]+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const [low, high] = start <= end ? [start, end] : [end, start];
        for (let r = low; r <= high; r++) {
          if (!resultSet.has(r.toString())) {
            resultSet.add(r.toString());
            result.push(r);
          }
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num.toString() === trimmed) {
        if (!resultSet.has(num.toString())) {
          resultSet.add(num.toString());
          result.push(num);
        }
      } else {
        if (!resultSet.has(trimmed)) {
          resultSet.add(trimmed);
          result.push(trimmed);
        }
      }
    }
  }
  return result;
}

export function computeInputHash(inputString: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < inputString.length; i++) {
    hash ^= inputString.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function evaluateAntigenicMimicry(
  alignmentResult: AlignmentResult,
  epitopeResidues: (number | string)[],
  isExperimentalCandidate = false,
  customWeights: [number, number, number, number] = [0.25, 0.40, 0.20, 0.15],
  epitopeSource: 'manual' | 'complex' | 'prediction_csv' | 'temporary_rsa_fallback' = 'manual',
  targetChain = 'A',
  multiEpitopes?: MultiEpitopeEntity[],
  inputMeta?: { targetId?: string; candidateId?: string; targetChain?: string; candChain?: string }
): EvaluationResult {
  const { sGlobal, tmScoreTargetNorm, tmScoreCandNorm, rmsd, alignedLength, coverage, alignedPairs, targetResidues, candResidues } = alignmentResult;

  const targetMap = new Map<string, Residue>();
  for (const r of targetResidues) {
    targetMap.set(r.resKey || getResidueKey(r.resSeq, r.iCode), r);
  }

  const candMap = new Map<string, Residue>();
  for (const r of candResidues) {
    candMap.set(r.resKey || getResidueKey(r.resSeq, r.iCode), r);
  }

  const pairByTargetRes = new Map<string, AlignedPair>();
  for (const p of alignedPairs) {
    const key = p.targetResKey || p.targetResSeq.toString();
    pairByTargetRes.set(key, p);
  }

  const isFragment = alignmentResult.candResidues.length < 0.7 * alignmentResult.targetResidues.length;

  const resToEpitopeId = new Map<string, string>();
  let rawEpitopeSet = new Set<string>();

  if (multiEpitopes && multiEpitopes.length > 0) {
    multiEpitopes.forEach((ep) => {
      const resList = ep.residues && ep.residues.length > 0 ? ep.residues : parseResidueRange(ep.range);
      resList.forEach((rSeq) => {
        const key = rSeq.toString();
        resToEpitopeId.set(key, ep.id);
        rawEpitopeSet.add(key);
      });
    });
  } else {
    epitopeResidues.forEach(r => rawEpitopeSet.add(r.toString()));
  }

  const warnings: string[] = [];
  const nonExistentResidues: string[] = [];
  const validEpitopeSet = new Set<string>();

  for (const epRes of rawEpitopeSet) {
    const exists = targetResidues.some(r => {
      const k1 = r.resKey || getResidueKey(r.resSeq, r.iCode);
      const k2 = r.resSeq.toString();
      return k1 === epRes || k2 === epRes;
    });
    if (exists) {
      validEpitopeSet.add(epRes);
    } else {
      nonExistentResidues.push(epRes);
    }
  }

  if (nonExistentResidues.length > 0) {
    warnings.push(`지정된 에피톱 잔기 중 타겟 구조에 존재하지 않는 잔기 (${nonExistentResidues.join(', ')}) ${nonExistentResidues.length}개가 제외되었습니다.`);
  }

  let isTemporary = false;
  if (validEpitopeSet.size === 0) {
    isTemporary = true;
    targetResidues
      .filter(r => (r.rsa || 0) >= 0.2)
      .forEach(r => validEpitopeSet.add(r.resKey || getResidueKey(r.resSeq, r.iCode)));
    if (validEpitopeSet.size === 0) {
      targetResidues.forEach(r => validEpitopeSet.add(r.resKey || getResidueKey(r.resSeq, r.iCode)));
    }
    warnings.push('유효한 에피톱 잔기가 없어 표면 노출 잔기(RSA ≥ 0.2)를 임시 에피톱으로 자동 적용하였습니다.');
  }

  const effectiveEpitopeSet = validEpitopeSet;

  const residueList: EvaluationResult['residues'] = [];
  const epiDistances: number[] = [];
  const rsaDiffs: number[] = [];
  let confHighCount = 0;
  const totalEpitopeCount = effectiveEpitopeSet.size;

  for (const targetRes of targetResidues) {
    const tKey = targetRes.resKey || getResidueKey(targetRes.resSeq, targetRes.iCode);
    const inEpi = effectiveEpitopeSet.has(tKey) || effectiveEpitopeSet.has(targetRes.resSeq.toString());
    const epId = resToEpitopeId.get(tKey) || resToEpitopeId.get(targetRes.resSeq.toString());
    const pair = pairByTargetRes.get(tKey) || pairByTargetRes.get(targetRes.resSeq.toString());

    const dist = pair ? pair.distance : 999.0;
    const rsaT = targetRes.rsa ?? 0.0;
    const candRes = pair ? candMap.get(pair.candResKey) : null;
    const rsaC = candRes?.rsa ?? 0.0;
    const plddtVal = pair ? (pair.plddt > 0 ? pair.plddt : 50.0) : 0.0;

    const sim = pair ? 1 / (1 + (dist / 3.0) ** 2) : 0.0;

    residueList.push({
      res_id: tKey,
      cand_res_id: pair ? pair.candResKey : undefined,
      res_name: targetRes.resName,
      in_epitope: inEpi,
      epitope_id: epId,
      distance: pair ? Math.round(dist * 100) / 100 : -1,
      rsa_target: Math.round(rsaT * 100) / 100,
      rsa_candidate: Math.round(rsaC * 100) / 100,
      plddt: Math.round(plddtVal * 10) / 10,
      similarity: Math.round(sim * 1000) / 1000,
    });

    if (inEpi) {
      if (pair) {
        epiDistances.push(dist);
        rsaDiffs.push(Math.abs(rsaC - rsaT));
        if (isExperimentalCandidate || plddtVal >= 70.0) {
          confHighCount++;
        }
      } else {
        epiDistances.push(999.0);
        rsaDiffs.push(1.0);
      }
    }
  }

  let sEpi = 0;
  let epitopeBreakdown: EvaluationResult['epitopeBreakdown'] = undefined;

  if (multiEpitopes && multiEpitopes.length > 0) {
    let weightedScoreSum = 0;
    let totalWeightSum = 0;
    epitopeBreakdown = [];

    const defaultColors = ['#e11d48', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899'];

    multiEpitopes.forEach((ep, idx) => {
      const resList = ep.residues && ep.residues.length > 0 ? ep.residues : parseResidueRange(ep.range);
      const epSet = new Set(resList);
      const epDists: number[] = [];

      for (const rSeq of epSet) {
        const key = rSeq.toString();
        const exists = targetResidues.some(r => (r.resKey || getResidueKey(r.resSeq, r.iCode)) === key || r.resSeq.toString() === key);
        if (!exists) continue;
        const pair = pairByTargetRes.get(key);
        if (pair) {
          epDists.push(pair.distance);
        } else {
          epDists.push(999.0);
        }
      }

      let epSEpi = 0;
      let epRmsd = 0;
      if (epDists.length > 0) {
        const sum = epDists.reduce((acc, d) => (d > 50 ? acc : acc + 1 / (1 + (d / 3.0) ** 2)), 0);
        epSEpi = sum / epDists.length;
        const validDists = epDists.filter(d => d < 50);
        epRmsd = validDists.length > 0
          ? Math.sqrt(validDists.reduce((acc, d) => acc + d * d, 0) / validDists.length)
          : 9.99;
      }

      const epWeight = ep.weight > 0 ? ep.weight : 1.0;
      weightedScoreSum += epSEpi * epWeight;
      totalWeightSum += epWeight;

      epitopeBreakdown!.push({
        id: ep.id,
        name: ep.name,
        range: ep.range,
        residuesCount: resList.length,
        sEpi: Math.round(epSEpi * 1000) / 1000,
        rmsd: Math.round(epRmsd * 100) / 100,
        color: ep.color || defaultColors[idx % defaultColors.length],
      });
    });

    sEpi = totalWeightSum > 0 ? weightedScoreSum / totalWeightSum : 0;
  } else {
    if (epiDistances.length > 0) {
      const sum = epiDistances.reduce((acc, d) => {
        if (d > 50) return acc;
        return acc + 1 / (1 + (d / 3.0) ** 2);
      }, 0);
      sEpi = sum / epiDistances.length;
    }
  }

  let sExp = 0;
  if (rsaDiffs.length > 0) {
    const meanDiff = rsaDiffs.reduce((a, b) => a + b, 0) / rsaDiffs.length;
    sExp = Math.max(0.0, Math.min(1.0, 1.0 - meanDiff));
  }

  const sConf = isExperimentalCandidate
    ? null
    : totalEpitopeCount > 0
    ? confHighCount / totalEpitopeCount
    : 0.85;

  const weightVal = validateAndNormalizeWeights(customWeights);
  let normalizedWeights = weightVal.normalizedWeights;

  if (isExperimentalCandidate) {
    const [origW0, origW1, origW2] = normalizedWeights;
    const sumW = origW0 + origW1 + origW2;
    if (sumW > 0) {
      normalizedWeights = [origW0 / sumW, origW1 / sumW, origW2 / sumW, 0];
    } else {
      normalizedWeights = [1 / 3, 1 / 3, 1 / 3, 0];
    }
  }

  const [w0, w1, w2, w3] = normalizedWeights;
  const rawScore = isExperimentalCandidate
    ? 100 * (w0 * sGlobal + w1 * sEpi + w2 * sExp)
    : 100 * (w0 * sGlobal + w1 * sEpi + w2 * sExp + w3 * (sConf ?? 0));
  const finalFitnessScore = Math.round(rawScore * 100) / 100;

  let level = '낮음 (Low)';
  if (finalFitnessScore >= 75.0) level = '높음 (High)';
  else if (finalFitnessScore >= 50.0) level = '중간 (Moderate)';

  let gradeContextNote = '';
  if (isTemporary) {
    gradeContextNote = ' (※ 지정 에피톱 부재로 표면 노출 잔기(RSA ≥ 0.20) 기반 임시 등급이 산출됨. 근거 약함)';
  } else if (!isExperimentalCandidate) {
    gradeContextNote = ' (※ 모사/예측 구조 기반 점수로 실험적 검증 필요)';
  }

  const validEpiDists = epiDistances.filter(d => d < 50);
  const epiDistMean = validEpiDists.length > 0
    ? (validEpiDists.reduce((a, b) => a + b, 0) / validEpiDists.length).toFixed(2)
    : 'N/A';

  const epiResidues = residueList.filter(r => r.in_epitope);
  const bestMatchingRes = epiResidues
    .filter(r => r.distance >= 0 && r.distance <= 1.0)
    .slice(0, 5)
    .map(r => `${r.res_name}${r.res_id}(${r.distance.toFixed(2)}Å)`)
    .join(', ');

  const devOutliers = epiResidues
    .filter(r => r.distance > 2.5)
    .slice(0, 4)
    .map(r => `${r.res_name}${r.res_id}(${r.distance.toFixed(2)}Å)`)
    .join(', ');

  const buriedResidues = epiResidues
    .filter(r => r.rsa_target >= 0.2 && r.rsa_candidate < 0.1)
    .slice(0, 3)
    .map(r => `${r.res_name}${r.res_id}`)
    .join(', ');

  const rationaleSections: string[] = [
    `【1. 종합 판정 요약】\n• 최종 항원성 모방 적합도: ${finalFitnessScore.toFixed(2)}점 / 100점 [등급: ${level}${gradeContextNote}]\n• 등급 산출 근거: 75점 이상(높음 - B세포/항체 교차 반응 유도 우수), 50점 이상(중간 - 일부 서열/구조 보완 필요), 50점 미만(낮음 - 모방도 저하)\n• 분석 모드: ${isFragment ? '단편 정규화 (Fragment Mode)' : '전체 골격 정규화 (Full Mode)'} | 타겟 분석 체인: ${targetChain}체인 | 에피톱 잔기 수: ${effectiveEpitopeSet.size}개`,

    `\n【2. 전체 골격 위상 및 3D 접힘 구조 정렬 (S_global = ${(sGlobal * 100).toFixed(1)}%)】\n• TM-score: 타겟 기준 ${tmScoreTargetNorm.toFixed(4)}, 후보 기준 ${tmScoreCandNorm.toFixed(4)} (Zhang & Skolnick 기준: TM > 0.5일 때 동일한 단백질 슈퍼패밀리 폴딩 구조 형성 확인)\n• Cα 중첩 RMSD: ${rmsd.toFixed(2)} Å (정렬된 잔기: ${alignedLength}개 / 서열 정렬 커버리지: ${(coverage * 100).toFixed(1)}%)\n• 백본 구조적 해석: ${sGlobal >= 0.7 ? '타겟 항원의 주쇄 2차 구조(Alpha-helix/Beta-sheet) 배열이 후보 물질과 높은 위상학적 일치도를 보입니다.' : '일부 코어 또는 도메인 접힘에서 국소적인 변형 및 루프 회전이 존재합니다.'}`,

    `\n【3. 항원 결정기(Epitope) 국소 3차원 입체 모방도 정밀 평가 (S_epi = ${(sEpi * 100).toFixed(1)}%)】\n• 에피톱 영역 평균 Cα 편차: ${epiDistMean} Å\n• 고일치도 핵심 잔기(Cα 편차 ≤ 1.0Å): ${bestMatchingRes || '없음 (전반적 중간 편차)'}\n• 구조적 뒤틀림 주의 잔기(Cα 편차 > 2.5Å): ${devOutliers || '없음 (전체 에피톱이 매우 안정적으로 정렬됨)'}\n• 결합면 형태학적 분석: ${sEpi >= 0.75 ? '타겟 항원의 중화항체 결합 포켓 3D 좌표가 후보 물질에 매우 정밀하게 재현되어 있어 교차 반응성 유도 가능성이 높습니다.' : '에피톱 일부 잔기에서 결합면 뒤틀림이 발생하여 항체 인식 친화도(Affinity)에 차이가 생길 수 있습니다.'}`,

    `\n【4. 용매 접근 표면적(RSA) 및 체액성 면역 노출도 분석 (S_exp = ${(sExp * 100).toFixed(1)}%)】\n• Shrake-Rupley 구면 적분 기반 상대적 용매 접근도(RSA) 일치율: ${(sExp * 100).toFixed(1)}%\n• 표면 매몰 위험 잔기(타겟 노출 대비 후보에서 가려진 잔기): ${buriedResidues || '없음 (항체 접근 표면 노출 패턴이 타겟과 일치함)'}\n• 면역 노출도 평가: ${sExp >= 0.75 ? '체액 내 B세포 수용체(BCR) 및 순환 항체가 에피톱에 물리적으로 접근할 수 있는 개방형 표면 구조를 유지하고 있습니다.' : '일부 핵심 잔기가 분자 내부로 매몰되거나 가려져 있어 실제 면역 반응 시 항체 형성 효율이 저하될 위험이 있습니다.'}`,

    isExperimentalCandidate
      ? `\n【5. 예측 모델 구조 신뢰도 및 국소 유연성 분석 (S_conf = 해당 없음)】\n• 에피톱 영역 고신뢰도 잔기 비율: 해당 없음 (X-선/Cryo-EM 등 실험 결정 구조 PDB이므로 pLDDT 신뢰도 지표가 적용되지 않음. 가중치가 재분배되었습니다.)\n• 신뢰도 진단: 실험 구조를 사용하므로 예측 불확실성 평가(S_conf)는 해당 없음 처리되었습니다.`
      : `\n【5. 예측 모델 구조 신뢰도 및 국소 유연성 분석 (S_conf = ${((sConf ?? 0) * 100).toFixed(1)}%)】\n• 에피톱 영역 고신뢰도 잔기 비율 (pLDDT ≥ 70): ${Math.round((sConf ?? 0) * 100)}%\n• 신뢰도 진단: ${(sConf ?? 0) >= 0.85 ? '에피톱 영역의 예측 불확실성이 극히 낮아 컴퓨터 시뮬레이션 결과의 신뢰성이 매우 높습니다.' : '에피톱 부위에 유연한 고리(Loop) 또는 비정형 구간이 포함되어 있어 추가적인 실험 검증이 권장됩니다.'}`,

    `\n【6. 연구자 가이드 및 후속 실험 제언 (Recommendations)】\n• 면역원성 최적화: ${finalFitnessScore >= 75 ? '현재 후보 물질의 3D 에피톱 형태가 우수하므로 SPR/BLI 결합력 측정 또는 동물 면역원성 평가 단계로 진행할 가치가 높습니다.' : '편차가 크게 발생한 잔기 부위를 타겟 서열 기반으로 재설계(Residue Back-mutation)하여 국소 모방도를 개선할 것을 권장합니다.'}\n• 추천 검증 실험: 표면 플라스몬 공명(SPR) 또는 ELISA 기반 결합 친화도 측정, Cryo-EM 고해상도 복합체 구조 분석.`
  ];

  if (nonExistentResidues.length > 0) {
    rationaleSections.push(`\n※ 경고: 지정된 에피톱 잔기 중 타겟 구조에 존재하지 않는 잔기 (${nonExistentResidues.join(', ')}) ${nonExistentResidues.length}개가 제외되었습니다.`);
  }

  if (isTemporary) {
    rationaleSections.push(`\n※ 참고: 지정된 실험 에피톱이 없어 표면 노출 잔기(RSA ≥ 0.2)를 임시 에피톱으로 자동 적용하여 분석되었습니다.`);
  }

  return {
    autoSettings: {
      mode: isFragment ? 'fragment' : 'full',
      epitopeSource: isTemporary ? 'temporary_rsa_fallback' : epitopeSource,
      targetChain,
      isTemporaryEpitope: isTemporary,
      isExperimentalCandidate,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    alignment: {
      tmScoreTargetNorm,
      tmScoreCandidateNorm: tmScoreCandNorm,
      rmsd,
      alignedLength,
      coverage,
    },
    subScores: {
      s_global: Math.round(sGlobal * 1000) / 1000,
      s_epi: Math.round(sEpi * 1000) / 1000,
      s_exp: Math.round(sExp * 1000) / 1000,
      s_conf: sConf === null ? null : Math.round(sConf * 1000) / 1000,
    },
    weights: normalizedWeights,
    finalFitnessScore,
    evaluationRationale: rationaleSections.join('\n'),
    epitopeBreakdown,
    residues: residueList,
    reproducibility: {
      toolVersions: {
        'SSBD-Engine': '1.0.0 (TM-score approximation algorithm)',
        'SASA-Engine': 'Shrake-Rupley 96-pt sphere numerical integration',
      },
      databaseVersions: {
        'RCSB-PDB': 'REST API v1 / mmCIF',
        'AlphaFold-DB': 'v4 Structure Database',
        'ESMFold': 'ESM Metagenomic Atlas API v1',
      },
      parameters: {
        weights: normalizedWeights,
        probeRadius: 1.4,
        d0_target: alignmentResult.tmScoreTargetNorm,
        epitopeCount: effectiveEpitopeSet.size,
        epitopeSource,
        targetChain,
        isExperimentalCandidate,
      },
      timestamp: new Date().toISOString(),
      inputHash: computeInputHash(
        JSON.stringify({
          targetId: inputMeta?.targetId || targetChain,
          candidateId: inputMeta?.candidateId || 'candidate',
          targetChain,
          candChain: inputMeta?.candChain || 'A',
          epitopes: Array.from(effectiveEpitopeSet).sort(),
          weights: normalizedWeights,
          epitopeSource,
          targetResCount: targetResidues.length,
          candResCount: candResidues.length,
        })
      ),
    },
  };
}

export function threadSequenceOnTemplate(
  candidateSeq: string,
  templateResidues: Residue[],
  candChain = 'A'
): string {
  const lines: string[] = [];
  let serial = 1;
  const tempCaResidues = templateResidues.filter(r => r.caAtom !== null);

  if (tempCaResidues.length === 0) {
    throw new Error('Template residues list is empty. Cannot thread sequence.');
  }

  let matches = 0;
  const minLen = Math.min(candidateSeq.length, tempCaResidues.length);
  for (let i = 0; i < minLen; i++) {
    const tAa1 = AA3_TO_1[tempCaResidues[i].resName] || 'X';
    if (tAa1 === candidateSeq[i]) matches++;
  }

  const denom = Math.max(candidateSeq.length, tempCaResidues.length);
  const seqIdentity = denom > 0 ? matches / denom : 0;

  if (seqIdentity < 0.25) {
    throw new Error(
      `서열 동일성이 ${ (seqIdentity * 100).toFixed(1) }%로 기준치(25%) 미만입니다. 모사 구조 생성이 거부되었습니다.`
    );
  }

  for (let i = 0; i < candidateSeq.length; i++) {
    const aa1 = candidateSeq[i];
    const res3 = AA1_TO_3[aa1] || 'ALA';
    const resSeq =
      i < tempCaResidues.length
        ? tempCaResidues[i].resSeq
        : (tempCaResidues[tempCaResidues.length - 1]?.resSeq ?? 0) + (i - tempCaResidues.length + 1);

    let isMutated = false;

    if (i < tempCaResidues.length) {
      const tempRes = tempCaResidues[i];
      const tAa1 = AA3_TO_1[tempRes.resName] || 'X';
      isMutated = tAa1 !== aa1;

      const nx = isMutated ? (i % 3 === 0 ? 0.2 : i % 3 === 1 ? -0.15 : 0.1) : 0.0;
      const ny = isMutated ? (i % 2 === 0 ? -0.2 : 0.15) : 0.0;
      const nz = isMutated ? (i % 4 === 0 ? 0.15 : -0.1) : 0.0;
      const baseTemp = tempRes.caAtom?.tempFactor && tempRes.caAtom.tempFactor > 0 ? tempRes.caAtom.tempFactor : 92.0;
      const plddt = isMutated ? Math.max(50.0, Math.min(85.0, baseTemp - 12.0)) : Math.min(99.0, baseTemp);
      const bStr = plddt.toFixed(2).padStart(6);

      const nAtom = tempRes.atoms.find((a) => a.name === 'N');
      const caAtom = tempRes.atoms.find((a) => a.name === 'CA') || tempRes.caAtom!;
      const cAtom = tempRes.atoms.find((a) => a.name === 'C');
      const oAtom = tempRes.atoms.find((a) => a.name === 'O');

      if (nAtom) {
        const x = (nAtom.x + nx).toFixed(3).padStart(8);
        const y = (nAtom.y + ny).toFixed(3).padStart(8);
        const z = (nAtom.z + nz).toFixed(3).padStart(8);
        lines.push(
          `ATOM  ${serial.toString().padStart(5)}  N   ${res3} ${candChain}${resSeq.toString().padStart(4)}    ${x}${y}${z}  1.00${bStr}           N`
        );
        serial++;
      }

      if (caAtom) {
        const x = (caAtom.x + nx).toFixed(3).padStart(8);
        const y = (caAtom.y + ny).toFixed(3).padStart(8);
        const z = (caAtom.z + nz).toFixed(3).padStart(8);
        lines.push(
          `ATOM  ${serial.toString().padStart(5)}  CA  ${res3} ${candChain}${resSeq.toString().padStart(4)}    ${x}${y}${z}  1.00${bStr}           C`
        );
        serial++;
      }

      if (cAtom) {
        const x = (cAtom.x + nx).toFixed(3).padStart(8);
        const y = (cAtom.y + ny).toFixed(3).padStart(8);
        const z = (cAtom.z + nz).toFixed(3).padStart(8);
        lines.push(
          `ATOM  ${serial.toString().padStart(5)}  C   ${res3} ${candChain}${resSeq.toString().padStart(4)}    ${x}${y}${z}  1.00${bStr}           C`
        );
        serial++;
      }

      if (oAtom) {
        const x = (oAtom.x + nx).toFixed(3).padStart(8);
        const y = (oAtom.y + ny).toFixed(3).padStart(8);
        const z = (oAtom.z + nz).toFixed(3).padStart(8);
        lines.push(
          `ATOM  ${serial.toString().padStart(5)}  O   ${res3} ${candChain}${resSeq.toString().padStart(4)}    ${x}${y}${z}  1.00${bStr}           O`
        );
        serial++;
      }
    } else {
      const lastRes = tempCaResidues[tempCaResidues.length - 1];
      const lastCa = lastRes.caAtom!;
      const extensionIndex = i - tempCaResidues.length + 1;
      const offset = extensionIndex * 3.8;
      const loopPlddt = Math.max(40.0, 70.0 - extensionIndex * 3.0);
      const bStr = loopPlddt.toFixed(2).padStart(6);

      const nX = (lastCa.x + offset - 1.2).toFixed(3).padStart(8);
      const caX = (lastCa.x + offset).toFixed(3).padStart(8);
      const cX = (lastCa.x + offset + 1.2).toFixed(3).padStart(8);
      const oX = (lastCa.x + offset + 1.5).toFixed(3).padStart(8);
      const y = lastCa.y.toFixed(3).padStart(8);
      const oY = (lastCa.y + 1.0).toFixed(3).padStart(8);
      const z = lastCa.z.toFixed(3).padStart(8);

      lines.push(`ATOM  ${serial.toString().padStart(5)}  N   ${res3} ${candChain}${resSeq.toString().padStart(4)}    ${nX}${y}${z}  1.00${bStr}           N`);
      serial++;
      lines.push(`ATOM  ${serial.toString().padStart(5)}  CA  ${res3} ${candChain}${resSeq.toString().padStart(4)}    ${caX}${y}${z}  1.00${bStr}           C`);
      serial++;
      lines.push(`ATOM  ${serial.toString().padStart(5)}  C   ${res3} ${candChain}${resSeq.toString().padStart(4)}    ${cX}${y}${z}  1.00${bStr}           C`);
      serial++;
      lines.push(`ATOM  ${serial.toString().padStart(5)}  O   ${res3} ${candChain}${resSeq.toString().padStart(4)}    ${oX}${oY}${z}  1.00${bStr}           O`);
      serial++;
    }
  }

  lines.push('TER');
  lines.push('END');
  return lines.join('\n');
}

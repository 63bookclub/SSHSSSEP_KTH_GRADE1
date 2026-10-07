import {
  ParsedStructure,
  Residue,
  parseResidueRange,
  extractComplexContacts,
  parseMmcif,
  parsePdb,
} from './bioAlgorithms.ts';
import { mapComplexResiduesToTarget } from './siftsService.ts';

export interface ResolveEpitopeOptions {
  targetStructure: ParsedStructure;
  targetChain?: string;
  method: 'manual' | 'complex' | 'prediction_csv' | 'temporary_rsa' | 'temporary_rsa_fallback';
  manualRange?: string;
  complexPdbId?: string;
  antigenChain?: string;
  antibodyChains?: string;
  predictionCsvText?: string;
  threshold?: number;
  combinationMode?: 'single' | 'union' | 'intersect';
  additionalRanges?: string;
  allowTemporaryFallback?: boolean;
  targetIdentifier?: string;
  fetchTimeoutMs?: number;
}

export interface ResolvedEpitopeResult {
  method: 'manual' | 'complex' | 'prediction_csv' | 'temporary_rsa_fallback';
  isTemporary: boolean;
  residues: (number | string)[];
  note: string;
}

/**
 * Modular service for resolving and validating epitope inputs.
 * Throws an explicit error if input yields 0 residues and explicit temporary mode was not requested.
 */
export async function resolveEpitopeInput(
  options: ResolveEpitopeOptions
): Promise<ResolvedEpitopeResult> {
  const {
    targetStructure,
    targetChain = 'A',
    method,
    manualRange,
    complexPdbId,
    antigenChain,
    antibodyChains,
    predictionCsvText,
    threshold = 0.5,
    combinationMode = 'single',
    additionalRanges,
    allowTemporaryFallback = false,
    targetIdentifier = '',
    fetchTimeoutMs = 10000,
  } = options;

  const targetResList = targetStructure.residuesByChain[targetChain] || [];
  if (targetResList.length === 0) {
    throw new Error(`타겟 체인 (${targetChain})에 분석 가능한 잔기가 없습니다.`);
  }

  // Helper function to extract surface exposed residues (RSA >= 0.20)
  const getTemporarySurfaceResidues = (): (number | string)[] => {
    const exposed = targetResList
      .filter((r) => (r.rsa ?? 0) >= 0.2)
      .map((r) => r.resKey || r.resSeq);
    if (exposed.length > 0) return exposed;
    return targetResList.map((r) => r.resKey || r.resSeq);
  };

  // Explicit temporary RSA fallback requested
  if (method === 'temporary_rsa' || method === 'temporary_rsa_fallback') {
    const res = getTemporarySurfaceResidues();
    return {
      method: 'temporary_rsa_fallback',
      isTemporary: true,
      residues: res,
      note: '표면 노출 잔기 (RSA ≥ 0.20) 모드가 사용자에 의해 명시적으로 선택되었습니다.',
    };
  }

  let resolvedResidues: (number | string)[] = [];
  let effectiveMethod: 'manual' | 'complex' | 'prediction_csv' | 'temporary_rsa_fallback' = method;

  if (method === 'manual') {
    if (!manualRange || !manualRange.trim()) {
      if (allowTemporaryFallback) {
        return {
          method: 'temporary_rsa_fallback',
          isTemporary: true,
          residues: getTemporarySurfaceResidues(),
          note: '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)',
        };
      }
      throw new Error(
        '수동 에피톱 잔기 범위가 입력되지 않았습니다. 번호 범위를 입력하거나 "표면 노출 잔기 자동 설정"을 선택해 주세요.'
      );
    }

    const requestedKeys = parseResidueRange(manualRange);
    const validTargetKeys = new Set(targetResList.map((r) => String(r.resKey || r.resSeq)));

    // Match requested ranges with target structure
    resolvedResidues = requestedKeys.filter((k) => validTargetKeys.has(String(k)));

    if (resolvedResidues.length === 0) {
      if (allowTemporaryFallback) {
        return {
          method: 'temporary_rsa_fallback',
          isTemporary: true,
          residues: getTemporarySurfaceResidues(),
          note: '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)',
        };
      }
      throw new Error(
        `입력한 수동 에피톱 범위('${manualRange}')의 잔기가 타겟 구조(체인 ${targetChain})에 존재하지 않거나 유효하지 않습니다. 잔기 번호를 확인해 주세요.`
      );
    }
  } else if (method === 'prediction_csv') {
    if (!predictionCsvText || !predictionCsvText.trim()) {
      if (allowTemporaryFallback) {
        return {
          method: 'temporary_rsa_fallback',
          isTemporary: true,
          residues: getTemporarySurfaceResidues(),
          note: '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)',
        };
      }
      throw new Error('예측 도구 CSV/TSV 결과 데이터가 입력되지 않았습니다.');
    }

    const lines = predictionCsvText.split('\n');
    const filteredResNums: number[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/[,;\t\s]+/);
      if (parts.length >= 2) {
        const resNum = parseInt(parts[0], 10);
        const score = parseFloat(parts[1]);
        if (!isNaN(resNum) && !isNaN(score) && score >= threshold) {
          filteredResNums.push(resNum);
        }
      }
    }

    const validTargetKeys = new Set(targetResList.map((r) => String(r.resKey || r.resSeq)));
    resolvedResidues = Array.from(new Set(filteredResNums))
      .filter((num) => validTargetKeys.has(String(num)))
      .sort((a, b) => a - b);

    if (resolvedResidues.length === 0) {
      if (allowTemporaryFallback) {
        return {
          method: 'temporary_rsa_fallback',
          isTemporary: true,
          residues: getTemporarySurfaceResidues(),
          note: '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)',
        };
      }
      throw new Error(
        `예측 CSV 파싱 결과 임계값(${threshold}) 이상인 잔기가 0개입니다. CSV 데이터 또는 임계값 설정을 확인해 주세요.`
      );
    }
  } else if (method === 'complex') {
    if (!complexPdbId || !complexPdbId.trim()) {
      if (allowTemporaryFallback) {
        return {
          method: 'temporary_rsa_fallback',
          isTemporary: true,
          residues: getTemporarySurfaceResidues(),
          note: '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)',
        };
      }
      throw new Error('복합체 PDB ID가 입력되지 않았습니다.');
    }

    try {
      const cleanPdbId = complexPdbId.trim().toUpperCase();
      const cifUrl = `https://files.rcsb.org/download/${cleanPdbId}.cif`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), fetchTimeoutMs);

      let complexText = '';
      try {
        const resp = await fetch(cifUrl, { signal: controller.signal });
        if (resp.ok) {
          complexText = await resp.text();
        } else {
          const pdbUrl = `https://files.rcsb.org/download/${cleanPdbId}.pdb`;
          const fbResp = await fetch(pdbUrl, { signal: controller.signal });
          if (fbResp.ok) {
            complexText = await fbResp.text();
          } else {
            throw new Error(`RCSB에서 복합체 ${cleanPdbId} 다운로드 실패 (CIF: HTTP ${resp.status}, PDB: HTTP ${fbResp.status})`);
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }

      const complexStruct = complexText.includes('_atom_site.')
        ? parseMmcif(complexText)
        : parsePdb(complexText);

      const abChains = (antibodyChains || 'H,L')
        .split(/[,;\s]+/)
        .map((c) => c.trim())
        .filter(Boolean);
      const agChain = antigenChain || targetChain;

      const rawContacts = extractComplexContacts(complexStruct, agChain, abChains, 4.5);
      const complexAgResidues = complexStruct.residuesByChain[agChain] || [];

      const mappingResult = await mapComplexResiduesToTarget(
        complexAgResidues,
        targetResList,
        rawContacts,
        cleanPdbId,
        targetIdentifier
      );

      resolvedResidues = mappingResult.mappedResidues;
    } catch (cErr: any) {
      if (manualRange && manualRange.trim()) {
        resolvedResidues = parseResidueRange(manualRange);
        effectiveMethod = 'manual';
      } else if (allowTemporaryFallback) {
        return {
          method: 'temporary_rsa_fallback',
          isTemporary: true,
          residues: getTemporarySurfaceResidues(),
          note: '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)',
        };
      } else {
        throw new Error(
          `복합체 PDB (${complexPdbId}) 접촉 분석 실패: ${
            cErr.message || '접촉 잔기를 추출하지 못했습니다'
          }. 복합체 PDB ID 및 체인 정보를 확인해 주세요.`
        );
      }
    }
  }

  // Handle combination mode (Union / Intersect) if additional ranges are supplied
  if (additionalRanges && additionalRanges.trim() && combinationMode !== 'single') {
    const extraKeys = parseResidueRange(additionalRanges);
    if (combinationMode === 'union') {
      const merged = new Set([...resolvedResidues, ...extraKeys]);
      resolvedResidues = Array.from(merged).sort((a, b) =>
        String(a).localeCompare(String(b), undefined, { numeric: true })
      );
    } else if (combinationMode === 'intersect') {
      const extraSet = new Set(extraKeys.map(String));
      resolvedResidues = resolvedResidues.filter((r) => extraSet.has(String(r)));

      if (resolvedResidues.length === 0) {
        if (allowTemporaryFallback) {
          return {
            method: 'temporary_rsa_fallback',
            isTemporary: true,
            residues: getTemporarySurfaceResidues(),
            note: '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)',
          };
        }
        throw new Error(
          `교집합(Intersection) 모드 적용 결과 추출된 공통 에피톱 잔기가 0개입니다. 기본 범위 및 추가 범위('${additionalRanges}')를 확인해 주세요.`
        );
      }
    }
  }

  // Final sanity check
  if (resolvedResidues.length === 0) {
    if (allowTemporaryFallback) {
      return {
        method: 'temporary_rsa_fallback',
        isTemporary: true,
        residues: getTemporarySurfaceResidues(),
        note: '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)',
      };
    }
    throw new Error(
      `선택한 방법(${method})으로 추출된 에피톱 잔기가 0개입니다. 입력 범위를 수정하거나 표면 노출 잔기 모드를 선택하세요.`
    );
  }

  return {
    method: effectiveMethod,
    isTemporary: false,
    residues: resolvedResidues,
    note: effectiveMethod === 'manual' && method === 'complex'
      ? '복합체 추출 실패로 수동 범위로 대체됨'
      : '사용자 정의 에피톱',
  };
}

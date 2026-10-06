import { Residue, parseResidueRange, getResidueKey } from './bioAlgorithms.ts';

export interface EpitopeResolutionOptions {
  method: 'manual' | 'complex' | 'prediction_csv' | 'temporary_rsa_fallback';
  manualRange?: string;
  complexPdbId?: string;
  antigenChain?: string;
  antibodyChains?: string;
  predictionCsvText?: string;
  threshold?: number;
  combinationMode?: 'single' | 'union' | 'intersect';
  additionalRanges?: string;
  targetResidues: Residue[];
  targetChain?: string;
  complexContacts?: (number | string)[];
  allowTemporaryFallback?: boolean;
}

export interface EpitopeResolutionResult {
  success: boolean;
  residues: (number | string)[];
  method: 'manual' | 'complex' | 'prediction_csv' | 'temporary_rsa_fallback';
  isTemporary: boolean;
  error?: string;
  note: string;
}

/**
 * Modular Service for Epitope Resolution & Explicit Failure Handling.
 * Prevents silent fallbacks when user-specified epitope ranges fail or yield 0 residues.
 */
export function resolveEpitopeResidues(
  options: EpitopeResolutionOptions
): EpitopeResolutionResult {
  const {
    method,
    manualRange = '',
    predictionCsvText = '',
    threshold = 0.5,
    combinationMode = 'single',
    additionalRanges = '',
    targetResidues = [],
    targetChain = 'A',
    complexContacts = [],
    allowTemporaryFallback = false,
  } = options;

  // Build target key lookup set
  const targetKeys = new Set<string>();
  targetResidues.forEach(r => {
    targetKeys.add(r.resKey || getResidueKey(r.resSeq, r.iCode));
    targetKeys.add(r.resSeq.toString());
  });

  // Explicit surface exposed temporary mode chosen by user
  if (method === 'temporary_rsa_fallback') {
    const surfaceRes = targetResidues
      .filter(r => (r.rsa ?? 0) >= 0.2)
      .map(r => r.resKey || getResidueKey(r.resSeq, r.iCode));
    const fallbackList = surfaceRes.length > 0 ? surfaceRes : targetResidues.map(r => r.resKey || getResidueKey(r.resSeq, r.iCode));
    return {
      success: true,
      residues: fallbackList,
      method: 'temporary_rsa_fallback',
      isTemporary: true,
      note: '사용자가 직접 선택한 표면 노출 잔기 임시 에피톱 (RSA ≥ 0.2)',
    };
  }

  let resolvedResidues: (number | string)[] = [];
  let failureReason = '';

  if (method === 'manual') {
    const trimmedRange = manualRange.trim();
    if (!trimmedRange) {
      failureReason = `수동 에피톱 잔기 범위가 입력되지 않았습니다. 잔기 번호(예: 330-520)를 입력하시거나 표면 노출 잔기 모드를 직접 선택해 주세요.`;
    } else {
      const parsed = parseResidueRange(trimmedRange);
      resolvedResidues = parsed.filter(r => targetKeys.has(r.toString()));
      if (resolvedResidues.length === 0) {
        failureReason = `입력하신 수동 범위 ('${trimmedRange}')에 해당하는 유효한 잔기가 타겟 구조(${targetChain} 체인)에 존재하지 않습니다.`;
      }
    }
  } else if (method === 'prediction_csv') {
    const trimmedCsv = predictionCsvText.trim();
    if (!trimmedCsv) {
      failureReason = `예측 도구 결과 CSV 또는 텍스트 데이터가 입력되지 않았습니다.`;
    } else {
      const lines = trimmedCsv.split('\n');
      const filtered: number[] = [];
      for (const line of lines) {
        const parts = line.split(/[,;\t\s]+/);
        if (parts.length >= 2) {
          const resNum = parseInt(parts[0], 10);
          const score = parseFloat(parts[1]);
          if (!isNaN(resNum) && !isNaN(score) && score >= threshold) {
            filtered.push(resNum);
          }
        }
      }
      const rawRes = Array.from(new Set(filtered)).sort((a, b) => a - b);
      resolvedResidues = rawRes.filter(r => targetKeys.has(r.toString()));
      if (resolvedResidues.length === 0) {
        if (rawRes.length === 0) {
          failureReason = `예측 CSV 데이터에서 설정한 임계값(${threshold}) 이상을 만족하는 잔기가 0개입니다. 임계값을 낮추거나 CSV 내용을 확인해 주세요.`;
        } else {
          failureReason = `예측 CSV 데이터에서 추출된 잔기들(${rawRes.join(', ')})이 타겟 구조(${targetChain} 체인)와 일치하지 않습니다.`;
        }
      }
    }
  } else if (method === 'complex') {
    resolvedResidues = complexContacts.filter(r => targetKeys.has(r.toString()));
    if (resolvedResidues.length === 0) {
      failureReason = `복합체 4.5 Å 자동 추출 결과 타겟 ${targetChain} 체인과 접촉하는 유효 에피톱 잔기가 0개입니다. PDB ID 및 체인 지정을 확인해 주세요.`;
    }
  }

  // Handle combination mode (union / intersect)
  if (resolvedResidues.length > 0 && additionalRanges.trim() && combinationMode !== 'single') {
    const extraParsed = parseResidueRange(additionalRanges.trim());
    const validExtra = extraParsed.filter(r => targetKeys.has(r.toString()));

    if (combinationMode === 'union') {
      const merged = new Set([...resolvedResidues, ...validExtra]);
      resolvedResidues = Array.from(merged).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    } else if (combinationMode === 'intersect') {
      const extraSet = new Set(validExtra.map(r => r.toString()));
      resolvedResidues = resolvedResidues.filter(r => extraSet.has(r.toString()));
      if (resolvedResidues.length === 0) {
        failureReason = `교집합(Intersection) 모드 적용 결과, 기본 에피톱과 추가 잔기 범위 간의 공통 잔기가 0개입니다.`;
      }
    }
  }

  // If resolution failed (0 residues)
  if (resolvedResidues.length === 0) {
    if (allowTemporaryFallback) {
      const surfaceRes = targetResidues
        .filter(r => (r.rsa ?? 0) >= 0.2)
        .map(r => r.resKey || getResidueKey(r.resSeq, r.iCode));
      const fallbackList = surfaceRes.length > 0 ? surfaceRes : targetResidues.map(r => r.resKey || getResidueKey(r.resSeq, r.iCode));
      return {
        success: true,
        residues: fallbackList,
        method: 'temporary_rsa_fallback',
        isTemporary: true,
        note: `에피톱 지정 실패로 인한 자동 표면 노출 잔기 모드 (원인: ${failureReason || '유효 잔기 없음'})`,
      };
    }

    return {
      success: false,
      residues: [],
      method,
      isTemporary: false,
      error: failureReason || `입력된 조건으로 에피톱 잔기를 찾을 수 없습니다.`,
      note: '에피톱 지정 실패',
    };
  }

  return {
    success: true,
    residues: resolvedResidues,
    method,
    isTemporary: false,
    note: '사용자 정의 에피톱',
  };
}

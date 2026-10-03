/**
 * Utility for validating epitope residue numbers against target chain residues.
 */

import { Residue, getResidueKey } from '../services/bioAlgorithms.ts';

export interface EpitopeValidationResult {
  validResidues: (number | string)[];
  missingResidues: (number | string)[];
  hasMissing: boolean;
  warningMessage?: string;
}

export function validateEpitopeResidues(
  requestedEpitopes: (number | string)[],
  targetResidues: Residue[],
  targetChain = 'A'
): EpitopeValidationResult {
  const targetKeysSet = new Set<string>();
  const targetResSeqSet = new Set<string>();

  for (const r of targetResidues) {
    const key = r.resKey || getResidueKey(r.resSeq, r.iCode);
    targetKeysSet.add(key.toUpperCase());
    targetResSeqSet.add(r.resSeq.toString());
  }

  const validResidues: (number | string)[] = [];
  const missingResidues: (number | string)[] = [];

  for (const item of requestedEpitopes) {
    const itemStr = String(item).trim();
    if (!itemStr) continue;

    if (targetKeysSet.has(itemStr.toUpperCase()) || targetResSeqSet.has(itemStr)) {
      if (!validResidues.map(String).includes(itemStr)) {
        validResidues.push(item);
      }
    } else {
      if (!missingResidues.map(String).includes(itemStr)) {
        missingResidues.push(item);
      }
    }
  }

  const hasMissing = missingResidues.length > 0;
  let warningMessage: string | undefined;

  if (hasMissing) {
    warningMessage = `경고: 타겟 체인(${targetChain})에 존재하지 않는 에피톱 잔기 번호(${missingResidues.join(', ')})가 지정되어 점수 계산 분모에서 제외되었습니다.`;
  }

  return {
    validResidues,
    missingResidues,
    hasMissing,
    warningMessage,
  };
}

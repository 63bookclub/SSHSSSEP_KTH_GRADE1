import { Residue, MultiEpitopeEntity, parseResidueRange, getResidueKey } from './bioAlgorithms';

export interface EpitopeValidationResult {
  validEpitopeSet: Set<string>;
  invalidEpitopeList: string[];
  warnings: string[];
  validatedMultiEpitopes?: MultiEpitopeEntity[];
  isFallbackTemporary: boolean;
}

/**
 * Validates requested epitope residues against the target structure residues.
 * Filters out non-existent epitope numbers, generates user-facing warnings,
 * and unifies the denominator across S_epi, S_exp, and S_conf.
 */
export function validateEpitopeResidues(
  targetResidues: Residue[],
  epitopeResidues: (number | string)[],
  multiEpitopes?: MultiEpitopeEntity[]
): EpitopeValidationResult {
  const targetKeySet = new Set<string>();
  for (const r of targetResidues) {
    const key = r.resKey || getResidueKey(r.resSeq, r.iCode);
    targetKeySet.add(key);
    targetKeySet.add(r.resSeq.toString());
  }

  const validEpitopeSet = new Set<string>();
  const invalidEpitopeList: string[] = [];
  const warnings: string[] = [];
  let validatedMultiEpitopes: MultiEpitopeEntity[] | undefined = undefined;

  if (multiEpitopes && multiEpitopes.length > 0) {
    validatedMultiEpitopes = [];
    for (const ep of multiEpitopes) {
      const resList = ep.residues && ep.residues.length > 0 ? ep.residues : parseResidueRange(ep.range);
      const validForEp: (number | string)[] = [];
      const invalidForEp: string[] = [];

      for (const r of resList) {
        const strKey = r.toString();
        if (targetKeySet.has(strKey)) {
          validForEp.push(r);
          validEpitopeSet.add(strKey);
        } else {
          invalidForEp.push(strKey);
          if (!invalidEpitopeList.includes(strKey)) {
            invalidEpitopeList.push(strKey);
          }
        }
      }

      if (invalidForEp.length > 0) {
        warnings.push(
          `에피톱 그룹 '${ep.name || ep.id}'의 지정된 잔기 [${invalidForEp.join(', ')}]는 타겟 체인에 존재하지 않아 분석에서 제외되었습니다.`
        );
      }

      validatedMultiEpitopes.push({
        ...ep,
        residues: validForEp,
      });
    }
  } else {
    for (const r of epitopeResidues) {
      const strKey = r.toString();
      if (targetKeySet.has(strKey)) {
        validEpitopeSet.add(strKey);
      } else {
        if (!invalidEpitopeList.includes(strKey)) {
          invalidEpitopeList.push(strKey);
        }
      }
    }

    if (invalidEpitopeList.length > 0) {
      warnings.push(
        `지정된 에피톱 잔기 [${invalidEpitopeList.join(', ')}]는 타겟 체인에 존재하지 않아 분석에서 제외되었습니다.`
      );
    }
  }

  let isFallbackTemporary = false;
  if (validEpitopeSet.size === 0) {
    isFallbackTemporary = true;
    for (const r of targetResidues) {
      if ((r.rsa || 0) >= 0.2) {
        const key = r.resKey || getResidueKey(r.resSeq, r.iCode);
        validEpitopeSet.add(key);
      }
    }

    if (invalidEpitopeList.length > 0) {
      warnings.push(
        `지정된 에피톱 잔기 [${invalidEpitopeList.join(', ')}]가 타겟 체인에 존재하지 않아, 표면 노출 잔기(RSA ≥ 0.2)를 임시 에피톱으로 적용하였습니다.`
      );
    }
  }

  return {
    validEpitopeSet,
    invalidEpitopeList,
    warnings,
    validatedMultiEpitopes,
    isFallbackTemporary,
  };
}

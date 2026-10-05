/**
 * Service module for resolving and fetching Target 3D Structures.
 * Handles RCSB PDB downloads, AlphaFold DB downloads, ESMFold structure predictions,
 * and direct PDB/mmCIF text parsing without silent synthetic helix fallbacks.
 */

import {
  parsePdb,
  parseMmcif,
  ParsedStructure,
} from './bioAlgorithms.ts';
import {
  fetchWithTimeout,
  predictStructureWithESMFold,
} from './esmFoldService.ts';
import {
  isValidPdbId,
  isValidUniprotId,
  validateAminoAcidSequence,
} from '../utils/validation.ts';

export interface TargetResolutionResult {
  success: boolean;
  structureText?: string;
  parsedStructure?: ParsedStructure;
  sourceType?: 'pdb' | 'uniprot' | 'file' | 'esmfold';
  identifier?: string;
  error?: string;
}

/**
 * Fetches target PDB or mmCIF structure from RCSB PDB for a 4-character PDB ID.
 */
export async function fetchTargetByPdbId(
  pdbId: string,
  timeoutMs = 15000
): Promise<{ success: boolean; structureText?: string; error?: string }> {
  const cleanId = (pdbId || '').trim().toUpperCase();
  if (!isValidPdbId(cleanId)) {
    return {
      success: false,
      error: `유효하지 않은 PDB ID 형식입니다: '${pdbId}'.`,
    };
  }

  try {
    const pdbUrl = `https://files.rcsb.org/download/${cleanId}.pdb`;
    const rcsbRes = await fetchWithTimeout(pdbUrl, {}, timeoutMs);
    if (rcsbRes.ok) {
      const text = await rcsbRes.text();
      return { success: true, structureText: text };
    }

    // Fallback to .cif
    const cifUrl = `https://files.rcsb.org/download/${cleanId}.cif`;
    const cifRes = await fetchWithTimeout(cifUrl, {}, timeoutMs);
    if (cifRes.ok) {
      const text = await cifRes.text();
      return { success: true, structureText: text };
    }

    return {
      success: false,
      error: `RCSB PDB에서 ${cleanId}를 다운로드할 수 없습니다. (HTTP 오류: ${rcsbRes.status} / ${cifRes.status})`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `RCSB PDB 조회 실패 (${cleanId}): ${err?.message || err}`,
    };
  }
}

/**
 * Fetches target 3D structure from AlphaFold DB for a UniProt Accession ID.
 */
export async function fetchTargetByUniprotId(
  uniprotId: string,
  timeoutMs = 15000
): Promise<{ success: boolean; structureText?: string; error?: string }> {
  const cleanId = (uniprotId || '').trim().toUpperCase();
  if (!isValidUniprotId(cleanId)) {
    return {
      success: false,
      error: `유효하지 않은 UniProt ID 형식입니다: '${uniprotId}'.`,
    };
  }

  try {
    const afMetaUrl = `https://alphafold.ebi.ac.uk/api/prediction/${cleanId}`;
    const metaRes = await fetchWithTimeout(afMetaUrl, {}, timeoutMs);
    if (!metaRes.ok) {
      return {
        success: false,
        error: `AlphaFold DB에서 해당 UniProt ID (${cleanId})를 찾을 수 없습니다. (HTTP ${metaRes.status})`,
      };
    }

    const metaData = await metaRes.json();
    const entry = Array.isArray(metaData) ? metaData[0] : metaData;
    const fileUrl = entry?.cifUrl || entry?.pdbUrl;
    if (!fileUrl) {
      return {
        success: false,
        error: `AlphaFold DB 결과에 UniProt ID '${cleanId}'의 구조 파일 다운로드 URL이 포함되어 있지 않습니다.`,
      };
    }

    const fileRes = await fetchWithTimeout(fileUrl, {}, timeoutMs);
    if (!fileRes.ok) {
      return {
        success: false,
        error: `AlphaFold DB 구조 파일 다운로드 실패 (${cleanId}): HTTP ${fileRes.status}`,
      };
    }

    const text = await fileRes.text();
    return { success: true, structureText: text };
  } catch (err: any) {
    return {
      success: false,
      error: `AlphaFold DB 조회 오류 (${cleanId}): ${err?.message || err}`,
    };
  }
}

/**
 * Resolves target input (PDB/mmCIF content, 4-char PDB ID, UniProt ID, or amino acid sequence).
 * Predicts 3D structure via ESMFold for sequence inputs.
 * Returns an explicit error response if structure retrieval or prediction fails,
 * avoiding silent synthetic alpha helix fallbacks.
 */
export async function resolveTargetStructure(
  targetInput: string,
  timeoutMs = 15000
): Promise<TargetResolutionResult> {
  const cleanTarget = (targetInput || '').trim();
  if (!cleanTarget) {
    return {
      success: false,
      error: '타겟 입력값이 비어 있습니다. PDB ID, UniProt ID, PDB 구조 텍스트 또는 아미노산 서열을 입력해 주세요.',
    };
  }

  // 1. Raw PDB or mmCIF structure content
  if (
    cleanTarget.startsWith('ATOM') ||
    cleanTarget.startsWith('HEADER') ||
    cleanTarget.includes('_atom_site.')
  ) {
    try {
      const parsed = cleanTarget.includes('_atom_site.')
        ? parseMmcif(cleanTarget)
        : parsePdb(cleanTarget);
      if (parsed.chains.length === 0 || parsed.allAtoms.length === 0) {
        return {
          success: false,
          error: '입력된 타겟 구조 텍스트에서 유효한 ATOM 원자 좌표를 파싱하지 못했습니다.',
        };
      }
      return {
        success: true,
        structureText: cleanTarget,
        parsedStructure: parsed,
        sourceType: 'file',
        identifier: 'Custom_Target_PDB',
      };
    } catch (parseErr: any) {
      return {
        success: false,
        error: `타겟 구조 파싱 오류: ${parseErr?.message || parseErr}`,
      };
    }
  }

  // 2. RCSB 4-character PDB ID
  if (isValidPdbId(cleanTarget)) {
    const pdbId = cleanTarget.toUpperCase();
    const pdbResult = await fetchTargetByPdbId(pdbId, timeoutMs);
    if (!pdbResult.success || !pdbResult.structureText) {
      return {
        success: false,
        error: pdbResult.error || `RCSB PDB에서 ${pdbId}를 가져올 수 없습니다.`,
      };
    }

    try {
      const parsed = pdbResult.structureText.includes('_atom_site.')
        ? parseMmcif(pdbResult.structureText)
        : parsePdb(pdbResult.structureText);
      return {
        success: true,
        structureText: pdbResult.structureText,
        parsedStructure: parsed,
        sourceType: 'pdb',
        identifier: pdbId,
      };
    } catch (parseErr: any) {
      return {
        success: false,
        error: `PDB ID '${pdbId}' 구조 파싱 오류: ${parseErr?.message || parseErr}`,
      };
    }
  }

  // 3. UniProt ID
  if (isValidUniprotId(cleanTarget)) {
    const uniprotId = cleanTarget.toUpperCase();
    const afResult = await fetchTargetByUniprotId(uniprotId, timeoutMs);
    if (!afResult.success || !afResult.structureText) {
      return {
        success: false,
        error: afResult.error || `AlphaFold DB에서 UniProt ${uniprotId}를 찾을 수 없습니다.`,
      };
    }

    try {
      const parsed = afResult.structureText.includes('_atom_site.')
        ? parseMmcif(afResult.structureText)
        : parsePdb(afResult.structureText);
      return {
        success: true,
        structureText: afResult.structureText,
        parsedStructure: parsed,
        sourceType: 'uniprot',
        identifier: uniprotId,
      };
    } catch (parseErr: any) {
      return {
        success: false,
        error: `UniProt ID '${uniprotId}' 구조 파싱 오류: ${parseErr?.message || parseErr}`,
      };
    }
  }

  // 4. Amino Acid Sequence
  const seqVal = validateAminoAcidSequence(cleanTarget, { minLen: 10, maxLen: 2000 });
  if (seqVal.isValid) {
    const seqOnly = seqVal.sequence;
    const esmResult = await predictStructureWithESMFold(seqOnly, timeoutMs);
    if (esmResult.success && esmResult.pdbText) {
      const parsed = esmResult.parsedStructure || (
        esmResult.pdbText.includes('_atom_site.')
          ? parseMmcif(esmResult.pdbText)
          : parsePdb(esmResult.pdbText)
      );
      return {
        success: true,
        structureText: esmResult.pdbText,
        parsedStructure: parsed,
        sourceType: 'esmfold',
        identifier: 'Target_Sequence',
      };
    }
    return {
      success: false,
      error: `타겟 서열의 ESMFold 구조 예측 실패: ${esmResult.error || '구조 예측 불가'}. PDB ID, UniProt ID 또는 3D PDB 구조 파일 내용을 직접 입력해 주세요.`,
    };
  }

  // 5. Unrecognized input
  return {
    success: false,
    error: `유효하지 않은 타겟 입력입니다: '${cleanTarget}'. PDB ID(4글자), UniProt ID, PDB 구조 텍스트, 또는 아미노산 서열을 입력해 주세요.`,
  };
}

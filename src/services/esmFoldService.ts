/**
 * Service module for ESMFold API structure prediction.
 * Predicts 3D PDB structure from amino acid sequences via ESM Metagenomic Atlas API.
 */

import { parseFastaInput, ParsedStructure, parsePdb, parseMmcif } from './bioAlgorithms.ts';
import { validateAminoAcidSequence } from '../utils/validation.ts';

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export interface ESMFoldResult {
  success: boolean;
  pdbText?: string;
  parsedStructure?: ParsedStructure;
  sequence?: string;
  error?: string;
}

/**
 * Calls ESMFold API (https://api.esmatlas.com/v1/predict/) to generate 3D PDB structure for an amino acid sequence.
 */
export async function predictStructureWithESMFold(
  inputSequenceOrFasta: string,
  timeoutMs = 15000
): Promise<ESMFoldResult> {
  let rawInput = (inputSequenceOrFasta || '').trim();
  if (!rawInput) {
    return { success: false, error: '서열 정보가 제공되지 않았습니다.' };
  }

  // Handle FASTA input
  if (rawInput.startsWith('>')) {
    const records = parseFastaInput(rawInput);
    if (records.length > 1) {
      return { success: false, error: 'FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.' };
    }
    rawInput = records[0]?.sequence || '';
  }

  // Sequence validation
  const seqVal = validateAminoAcidSequence(rawInput, { minLen: 5, maxLen: 600 });
  if (!seqVal.isValid) {
    return { success: false, error: seqVal.error };
  }
  const cleanSeq = seqVal.sequence;

  try {
    const esmUrl = 'https://api.esmatlas.com/v1/predict/';
    const esmRes = await fetchWithTimeout(
      esmUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: cleanSeq,
      },
      timeoutMs
    );

    if (!esmRes.ok) {
      return {
        success: false,
        sequence: cleanSeq,
        error: `ESMFold API HTTP 오류 (${esmRes.status}: ${esmRes.statusText})`,
      };
    }

    const pdbText = await esmRes.text();
    if (!pdbText.includes('ATOM  ') && !pdbText.includes('_atom_site.')) {
      return {
        success: false,
        sequence: cleanSeq,
        error: 'ESMFold API 응답에 유효한 PDB 원자 좌표가 포함되어 있지 않습니다.',
      };
    }

    const parsedStructure = pdbText.includes('_atom_site.')
      ? parseMmcif(pdbText)
      : parsePdb(pdbText);

    return {
      success: true,
      pdbText,
      parsedStructure,
      sequence: cleanSeq,
    };
  } catch (err: any) {
    return {
      success: false,
      sequence: cleanSeq,
      error: `ESMFold 서버 연동 실패: ${err?.message || err}`,
    };
  }
}

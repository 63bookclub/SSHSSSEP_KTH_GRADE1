import { fetchWithTimeout } from './structureLoader.ts';
import { isValidPdbId } from '../utils/validation.ts';

/**
 * Unified RCSB PDB/CIF downloader service.
 * Always tries downloading PDB format (.pdb) first, then falls back to mmCIF format (.cif).
 */
export async function fetchRcsbStructure(
  pdbId: string,
  timeoutMs = 12000
): Promise<string> {
  const cleanId = pdbId.trim().toUpperCase();
  if (!isValidPdbId(cleanId)) {
    throw new Error(`유효하지 않은 PDB ID 형식입니다: '${pdbId}'.`);
  }

  let structureText = '';

  // 1. Try downloading PDB format first
  try {
    const pdbUrl = `https://files.rcsb.org/download/${cleanId}.pdb`;
    const resp = await fetchWithTimeout(pdbUrl, {}, timeoutMs);
    if (resp.ok) {
      const txt = await resp.text();
      if (!txt.trim().startsWith('<')) {
        structureText = txt;
      }
    }
  } catch (e) {
    // Ignore error and fall back to CIF
  }

  // 2. If PDB format fails or is invalid, try downloading mmCIF format second
  if (!structureText) {
    try {
      const cifUrl = `https://files.rcsb.org/download/${cleanId}.cif`;
      const resp = await fetchWithTimeout(cifUrl, {}, timeoutMs);
      if (resp.ok) {
        const txt = await resp.text();
        if (!txt.trim().startsWith('<')) {
          structureText = txt;
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  if (!structureText) {
    throw new Error(`RCSB PDB에서 ${cleanId}를 다운로드할 수 없거나 HTML 오류 응답을 받았습니다.`);
  }

  return structureText;
}

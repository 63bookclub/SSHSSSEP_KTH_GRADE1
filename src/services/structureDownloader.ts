import { fetchWithTimeout } from './structureLoader.ts';
import { getEmbeddedStructure } from './presetStructures.ts';

export interface DownloadedStructureResult {
  pdbId: string;
  format: 'pdb' | 'cif';
  text: string;
}

/**
 * Downloads a structure from RCSB PDB using a unified, consistent format fallback order:
 * 1. PDB format (.pdb)
 * 2. mmCIF format (.cif)
 * 3. Local embedded fallback (if offline or download fails)
 */
export async function downloadRcsbStructure(
  pdbId: string,
  timeoutMs = 12000
): Promise<DownloadedStructureResult> {
  const cleanId = pdbId.trim().toUpperCase();
  if (!cleanId) {
    throw new Error('PDB ID가 입력되지 않았습니다.');
  }

  // 1. Try PDB format first
  try {
    const pdbUrl = `https://files.rcsb.org/download/${cleanId}.pdb`;
    const res = await fetchWithTimeout(pdbUrl, {}, timeoutMs);
    if (res.ok) {
      const txt = await res.text();
      if (txt.trim().length > 0 && !txt.trim().startsWith('<')) {
        return {
          pdbId: cleanId,
          format: 'pdb',
          text: txt,
        };
      }
    }
  } catch (_e) {
    // Ignore error, proceed to mmCIF
  }

  // 2. Try mmCIF format next
  try {
    const cifUrl = `https://files.rcsb.org/download/${cleanId}.cif`;
    const res = await fetchWithTimeout(cifUrl, {}, timeoutMs);
    if (res.ok) {
      const txt = await res.text();
      if (txt.trim().length > 0 && !txt.trim().startsWith('<')) {
        return {
          pdbId: cleanId,
          format: 'cif',
          text: txt,
        };
      }
    }
  } catch (_e) {
    // Ignore error, proceed to local embedded fallback
  }

  // 3. Fallback to local embedded structure if available (for offline mode or preset IDs)
  const embedded = getEmbeddedStructure(cleanId);
  if (embedded) {
    return {
      pdbId: cleanId,
      format: embedded.format,
      text: embedded.text,
    };
  }

  throw new Error(`RCSB PDB에서 ${cleanId}를 다운로드할 수 없거나 유효하지 않은 응답을 받았습니다.`);
}

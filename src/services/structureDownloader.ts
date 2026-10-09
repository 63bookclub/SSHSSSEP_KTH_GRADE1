import { getEmbeddedPdb } from '../data/presetStructures.ts';

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
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

/**
 * Downloads a structure file from RCSB PDB using a unified search order:
 * 1. Checks embedded offline PDB data
 * 2. Attempts downloading .pdb format
 * 3. Falls back to downloading .cif format
 */
export async function fetchRcsbStructure(pdbId: string, timeoutMs = 12000): Promise<string> {
  const cleanId = pdbId.trim().toUpperCase();

  // 1. First check embedded offline structures
  const embedded = getEmbeddedPdb(cleanId);
  if (embedded) {
    return embedded;
  }

  // 2. Try PDB format first
  try {
    const pdbUrl = `https://files.rcsb.org/download/${cleanId}.pdb`;
    const pdbRes = await fetchWithTimeout(pdbUrl, {}, timeoutMs);
    if (pdbRes.ok) {
      const txt = await pdbRes.text();
      if (!txt.trim().startsWith('<')) {
        return txt;
      }
    }
  } catch (_e) {
    // Fall back to CIF
  }

  // 3. Fallback to CIF format second
  try {
    const cifUrl = `https://files.rcsb.org/download/${cleanId}.cif`;
    const cifRes = await fetchWithTimeout(cifUrl, {}, timeoutMs);
    if (cifRes.ok) {
      const txt = await cifRes.text();
      if (!txt.trim().startsWith('<')) {
        return txt;
      }
    }
  } catch (_e) {
    // Both failed
  }

  throw new Error(`RCSB PDB에서 ${cleanId}를 다운로드할 수 없거나 유효하지 않은 응답을 받았습니다.`);
}

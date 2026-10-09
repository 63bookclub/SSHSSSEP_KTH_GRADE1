import { fetchWithTimeout } from './structureLoader.ts';
import { EMBEDDED_PDB_DATA } from '../data/pdbData.ts';

export interface StructureFetchResult {
  structureText: string;
  format: 'pdb' | 'cif';
  isEmbeddedFallback: boolean;
}

/**
 * Unified structure fetcher from RCSB PDB with consistent fallback order:
 * 1. PDB format (.pdb) via network
 * 2. CIF format (.cif) via network
 * 3. Local embedded real PDB dataset (.pdb) fallback (offline support)
 */
export async function fetchStructureFromRcsb(
  pdbId: string,
  timeoutMs = 12000
): Promise<StructureFetchResult> {
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
      if (txt && !txt.trim().startsWith('<')) {
        return {
          structureText: txt,
          format: 'pdb',
          isEmbeddedFallback: false,
        };
      }
    }
  } catch (_e) {
    // Fallthrough to CIF attempt
  }

  // 2. Try CIF format second
  try {
    const cifUrl = `https://files.rcsb.org/download/${cleanId}.cif`;
    const res = await fetchWithTimeout(cifUrl, {}, timeoutMs);
    if (res.ok) {
      const txt = await res.text();
      if (txt && !txt.trim().startsWith('<')) {
        return {
          structureText: txt,
          format: 'cif',
          isEmbeddedFallback: false,
        };
      }
    }
  } catch (_e) {
    // Fallthrough to embedded dataset check
  }

  // 3. Fallback to local embedded real PDB dataset if offline or download failed
  if (EMBEDDED_PDB_DATA[cleanId]) {
    return {
      structureText: EMBEDDED_PDB_DATA[cleanId],
      format: 'pdb',
      isEmbeddedFallback: true,
    };
  }

  throw new Error(
    `RCSB PDB에서 ${cleanId} 구조를 불러올 수 없습니다. 네트워크 연결 상태를 확인하거나 PDB 파일을 업로드해 주세요.`
  );
}

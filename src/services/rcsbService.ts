import { fetchWithTimeout } from './structureLoader.ts';
import { SAMPLE_STRUCTURES } from '../data/sampleStructures.ts';

export interface FetchRcsbResult {
  structureText: string;
  format: 'pdb' | 'cif';
  source: 'rcsb_pdb' | 'rcsb_cif' | 'embedded_sample';
}

/**
 * Unified RCSB PDB structure downloader.
 * Ensures consistent download order across all loaders (Target, Candidate, Complex Epitope):
 * 1. Attempt PDB format (.pdb) first
 * 2. Fall back to mmCIF format (.cif) if PDB fails
 * 3. Fall back to embedded real sample structure if network/RCSB fails (for offline support)
 */
export async function fetchRcsbStructure(
  pdbId: string,
  options: { timeoutMs?: number } = {}
): Promise<FetchRcsbResult> {
  const cleanId = pdbId.trim().toUpperCase();
  const timeoutMs = options.timeoutMs ?? 10000;

  let structureText = '';
  let format: 'pdb' | 'cif' = 'pdb';
  let source: 'rcsb_pdb' | 'rcsb_cif' | 'embedded_sample' = 'rcsb_pdb';

  // 1. Attempt PDB format (.pdb)
  try {
    const pdbUrl = `https://files.rcsb.org/download/${cleanId}.pdb`;
    const pdbRes = await fetchWithTimeout(pdbUrl, {}, timeoutMs);
    if (pdbRes.ok) {
      const txt = await pdbRes.text();
      if (!txt.trim().startsWith('<') && (txt.includes('ATOM') || txt.includes('HEADER'))) {
        structureText = txt;
        format = 'pdb';
        source = 'rcsb_pdb';
      }
    }
  } catch (err) {
    // Suppress error and try CIF next
  }

  // 2. Attempt CIF format (.cif) if PDB failed
  if (!structureText) {
    try {
      const cifUrl = `https://files.rcsb.org/download/${cleanId}.cif`;
      const cifRes = await fetchWithTimeout(cifUrl, {}, timeoutMs);
      if (cifRes.ok) {
        const txt = await cifRes.text();
        if (!txt.trim().startsWith('<') && txt.includes('_atom_site.')) {
          structureText = txt;
          format = 'cif';
          source = 'rcsb_cif';
        }
      }
    } catch (err) {
      // Suppress error and check offline sample
    }
  }

  // 3. Fallback to embedded real sample structure if RCSB network calls failed
  if (!structureText) {
    const samplePdb = SAMPLE_STRUCTURES[cleanId];
    if (samplePdb) {
      structureText = samplePdb;
      format = 'pdb';
      source = 'embedded_sample';
    }
  }

  if (!structureText) {
    throw new Error(
      `RCSB PDB에서 ${cleanId} 구조를 다운로드할 수 없거나 유효하지 않은 응답을 받았습니다.`
    );
  }

  return {
    structureText,
    format,
    source,
  };
}

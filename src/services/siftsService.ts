import { Residue, AA3_TO_1, getResidueKey } from './bioAlgorithms';

export interface ResidueMappingResult {
  mappedResidues: (number | string)[];
  mappingDetails: {
    complexResKey: number | string;
    targetResKey: number | string;
    resName: string;
    method: 'sifts' | 'alignment';
  }[];
  methodUsed: 'sifts' | 'sequence_alignment' | 'direct_match';
  log: string;
}

/**
 * Needleman-Wunsch pairwise alignment between complex antigen sequence
 * and target sequence to map complex residue positions to target residue keys.
 */
export function mapResiduesBySequenceAlignment(
  complexAgResidues: Residue[],
  targetResidues: Residue[],
  contactKeys: (number | string)[]
): ResidueMappingResult {
  const seqComplex = complexAgResidues.map(r => AA3_TO_1[r.resName] || 'X');
  const seqTarget = targetResidues.map(r => AA3_TO_1[r.resName] || 'X');

  const lenC = seqComplex.length;
  const lenT = seqTarget.length;

  if (lenC === 0 || lenT === 0) {
    return {
      mappedResidues: [],
      mappingDetails: [],
      methodUsed: 'sequence_alignment',
      log: 'Complex or target sequence is empty.',
    };
  }

  // Needleman-Wunsch alignment
  const dp: number[][] = Array(lenC + 1).fill(0).map(() => Array(lenT + 1).fill(0));
  const pointer: number[][] = Array(lenC + 1).fill(0).map(() => Array(lenT + 1).fill(0));

  const gapPenalty = -2.0;
  for (let i = 0; i <= lenC; i++) dp[i][0] = i * gapPenalty;
  for (let j = 0; j <= lenT; j++) dp[0][j] = j * gapPenalty;

  for (let i = 1; i <= lenC; i++) {
    for (let j = 1; j <= lenT; j++) {
      const matchScore = seqComplex[i - 1] === seqTarget[j - 1] ? 3.0 : -1.0;
      const scoreDiag = dp[i - 1][j - 1] + matchScore;
      const scoreUp = dp[i - 1][j] + gapPenalty;
      const scoreLeft = dp[i][j - 1] + gapPenalty;

      let maxVal = scoreDiag;
      let dir = 1; // diag
      if (scoreUp > maxVal) {
        maxVal = scoreUp;
        dir = 2; // up
      }
      if (scoreLeft > maxVal) {
        maxVal = scoreLeft;
        dir = 3; // left
      }
      dp[i][j] = maxVal;
      pointer[i][j] = dir;
    }
  }

  // Traceback
  let currI = lenC;
  let currJ = lenT;
  const complexToTargetMap = new Map<string, Residue>();

  while (currI > 0 && currJ > 0) {
    const dir = pointer[currI][currJ];
    if (dir === 1) { // diag match
      const cRes = complexAgResidues[currI - 1];
      const tRes = targetResidues[currJ - 1];
      const cKey = cRes.resKey || getResidueKey(cRes.resSeq, cRes.iCode);
      complexToTargetMap.set(cKey, tRes);
      currI--;
      currJ--;
    } else if (dir === 2) {
      currI--;
    } else {
      currJ--;
    }
  }

  const mappedResidues: (number | string)[] = [];
  const mappingDetails: ResidueMappingResult['mappingDetails'] = [];

  for (const cKey of contactKeys) {
    const keyStr = cKey.toString();
    const tRes = complexToTargetMap.get(keyStr);
    if (tRes) {
      const tKey = tRes.resKey || getResidueKey(tRes.resSeq, tRes.iCode);
      mappedResidues.push(tKey);
      mappingDetails.push({
        complexResKey: cKey,
        targetResKey: tKey,
        resName: tRes.resName,
        method: 'alignment',
      });
    }
  }

  return {
    mappedResidues,
    mappingDetails,
    methodUsed: 'sequence_alignment',
    log: `Mapped ${mappedResidues.length}/${contactKeys.length} complex contact residues to target structure via sequence alignment.`,
  };
}

/**
 * Fetch SIFTS residue mapping API for PDB ID from PDBe SIFTS API
 */
export async function fetchSiftsResidueMapping(pdbId: string): Promise<Record<string, any> | null> {
  try {
    const cleanPdb = pdbId.toLowerCase().trim();
    const url = `https://www.ebi.ac.uk/pdbe/api/v2/residue_mapping/pdb/${cleanPdb}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    return data[cleanPdb] || null;
  } catch (err) {
    return null;
  }
}

/**
 * Map complex antigen contact residues to target structure residues using SIFTS API or sequence alignment
 */
export async function mapComplexResiduesToTarget(
  complexAgResidues: Residue[],
  targetResidues: Residue[],
  contactKeys: (number | string)[],
  complexPdbId?: string,
  targetUniprotId?: string
): Promise<ResidueMappingResult> {
  // If target and complex have identical residue keys and sequence, direct match check
  const targetKeySet = new Set(targetResidues.map(r => (r.resKey || getResidueKey(r.resSeq, r.iCode)).toString()));
  const allContactsInTarget = contactKeys.every(k => targetKeySet.has(k.toString()));

  // Check if target sequence and complex antigen sequence match 100%
  const seqComplex = complexAgResidues.map(r => AA3_TO_1[r.resName] || 'X').join('');
  const seqTarget = targetResidues.map(r => AA3_TO_1[r.resName] || 'X').join('');

  if (seqComplex === seqTarget && allContactsInTarget) {
    return {
      mappedResidues: contactKeys,
      mappingDetails: contactKeys.map(k => ({
        complexResKey: k,
        targetResKey: k,
        resName: 'MATCH',
        method: 'sifts',
      })),
      methodUsed: 'direct_match',
      log: 'Complex and target antigen sequences are identical; direct residue mapping applied.',
    };
  }

  // Attempt SIFTS lookup if complexPdbId is available
  if (complexPdbId) {
    const siftsData = await fetchSiftsResidueMapping(complexPdbId);
    if (siftsData && siftsData.UniProt) {
      const uniprotKeys = Object.keys(siftsData.UniProt);
      if (uniprotKeys.length > 0) {
        const primaryUniProt = targetUniprotId && siftsData.UniProt[targetUniprotId]
          ? targetUniprotId
          : uniprotKeys[0];

        const mappings = siftsData.UniProt[primaryUniProt]?.mappings || [];
        const siftsPdbToUniMap = new Map<string, number>();

        for (const m of mappings) {
          const startPdb = m.start.author_residue_number;
          const endPdb = m.end.author_residue_number;
          const startUni = m.uniprot_start;
          const endUni = m.uniprot_end;
          if (startPdb !== null && endPdb !== null && startUni !== null && endUni !== null) {
            const count = Math.min(endPdb - startPdb, endUni - startUni);
            for (let i = 0; i <= count; i++) {
              siftsPdbToUniMap.set((startPdb + i).toString(), startUni + i);
            }
          }
        }

        if (siftsPdbToUniMap.size > 0) {
          const mapped: (number | string)[] = [];
          const details: ResidueMappingResult['mappingDetails'] = [];

          for (const cKey of contactKeys) {
            const uniResSeq = siftsPdbToUniMap.get(cKey.toString());
            if (uniResSeq !== undefined) {
              const tRes = targetResidues.find(r => r.resSeq === uniResSeq);
              if (tRes) {
                const tKey = tRes.resKey || getResidueKey(tRes.resSeq, tRes.iCode);
                mapped.push(tKey);
                details.push({
                  complexResKey: cKey,
                  targetResKey: tKey,
                  resName: tRes.resName,
                  method: 'sifts',
                });
              }
            }
          }

          if (mapped.length > 0) {
            return {
              mappedResidues: mapped,
              mappingDetails: details,
              methodUsed: 'sifts',
              log: `Mapped ${mapped.length}/${contactKeys.length} contact residues via SIFTS (${complexPdbId} -> UniProt ${primaryUniProt}).`,
            };
          }
        }
      }
    }
  }

  // Fallback to sequence alignment mapping
  return mapResiduesBySequenceAlignment(complexAgResidues, targetResidues, contactKeys);
}

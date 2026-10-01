import { ParsedStructure, Residue, AA3_TO_1, extractComplexContacts } from './bioAlgorithms';

/**
 * Result of mapping complex residues to target residues
 */
export interface MappedEpitopeResult {
  targetResidueSeqs: number[];
  mappedPairs: Array<{ complexResSeq: number; targetResSeq: number }>;
  mappingMethod: 'sifts' | 'sequence_alignment' | 'direct_fallback';
}

/**
 * Fetch SIFTS PDB to UniProt mapping from PDBe API
 */
export async function fetchSiftsMapping(pdbId: string): Promise<Record<string, Record<number, number>> | null> {
  if (!pdbId) return null;
  const cleanPdb = pdbId.trim().toLowerCase();
  const url = `https://www.ebi.ac.uk/pdbe/api/mappings/uniprot/${cleanPdb}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok) return null;
    const data = await resp.json();
    const entry = data[cleanPdb];
    if (!entry || !entry.UniProt) return null;

    // chainId -> (pdbResNum -> uniprotResNum)
    const chainMap: Record<string, Record<number, number>> = {};

    for (const uniAcc of Object.keys(entry.UniProt)) {
      const uniData = entry.UniProt[uniAcc];
      const mappings = uniData.mappings || [];
      for (const m of mappings) {
        const chain = m.chain_id || m.struct_asym_id;
        if (!chain) continue;

        if (!chainMap[chain]) chainMap[chain] = {};
        const pStart = m.pdb_start;
        const pEnd = m.pdb_end;
        const uStart = m.uniprot_start;
        const uEnd = m.uniprot_end;

        if (typeof pStart === 'number' && typeof pEnd === 'number' && typeof uStart === 'number' && typeof uEnd === 'number') {
          const count = pEnd - pStart;
          for (let i = 0; i <= count; i++) {
            chainMap[chain][pStart + i] = uStart + i;
          }
        }
      }
    }
    return Object.keys(chainMap).length > 0 ? chainMap : null;
  } catch (err) {
    return null;
  }
}

/**
 * Simple Needleman-Wunsch sequence alignment between complex antigen sequence and target sequence
 * to align residue positions accurately even when numbering differs.
 */
export function alignResidueSequences(
  complexResidues: Residue[],
  targetResidues: Residue[]
): Array<{ complexRes: Residue; targetRes: Residue }> {
  if (complexResidues.length === 0 || targetResidues.length === 0) {
    return [];
  }

  const seq1 = complexResidues.map(r => AA3_TO_1[r.resName] || 'X');
  const seq2 = targetResidues.map(r => AA3_TO_1[r.resName] || 'X');

  const n = seq1.length;
  const m = seq2.length;

  const MATCH = 2;
  const MISMATCH = -1;
  const GAP = -1;

  // Dynamic programming score matrix
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) score[i][0] = i * GAP;
  for (let j = 0; j <= m; j++) score[0][j] = j * GAP;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const matchScore = seq1[i - 1] === seq2[j - 1] ? MATCH : MISMATCH;
      score[i][j] = Math.max(
        score[i - 1][j - 1] + matchScore,
        score[i - 1][j] + GAP,
        score[i][j - 1] + GAP
      );
    }
  }

  // Traceback
  const matchedPairs: Array<{ complexRes: Residue; targetRes: Residue }> = [];
  let i = n;
  let j = m;

  while (i > 0 && j > 0) {
    const currentScore = score[i][j];
    const matchScore = seq1[i - 1] === seq2[j - 1] ? MATCH : MISMATCH;

    if (currentScore === score[i - 1][j - 1] + matchScore) {
      // Only record aligned residues if they actually match amino acids or reasonable substitution
      if (seq1[i - 1] === seq2[j - 1] || seq1[i - 1] === 'X' || seq2[j - 1] === 'X') {
        matchedPairs.push({
          complexRes: complexResidues[i - 1],
          targetRes: targetResidues[j - 1],
        });
      }
      i--;
      j--;
    } else if (currentScore === score[i - 1][j] + GAP) {
      i--;
    } else {
      j--;
    }
  }

  return matchedPairs.reverse();
}

/**
 * Maps epitope contact residues from complex PDB antigen chain to target structure residue numbers
 */
export async function mapComplexResiduesToTarget(
  complexStruct: ParsedStructure,
  complexAgChain: string,
  targetStruct: ParsedStructure,
  targetChain: string,
  complexPdbId?: string,
  antibodyChains: string[] = ['H', 'L'],
  cutoff = 4.5
): Promise<MappedEpitopeResult> {
  const complexAgResidues = complexStruct.residuesByChain[complexAgChain] || Object.values(complexStruct.residuesByChain)[0] || [];
  const targetResidues = targetStruct.residuesByChain[targetChain] || Object.values(targetStruct.residuesByChain)[0] || [];

  const rawContactSeqs = extractComplexContacts(complexStruct, complexAgChain, antibodyChains, cutoff);

  if (rawContactSeqs.length === 0 || targetResidues.length === 0) {
    return {
      targetResidueSeqs: rawContactSeqs,
      mappedPairs: rawContactSeqs.map(s => ({ complexResSeq: s, targetResSeq: s })),
      mappingMethod: 'direct_fallback',
    };
  }

  // 1. Try SIFTS mapping if complexPdbId provided
  if (complexPdbId) {
    const sifts = await fetchSiftsMapping(complexPdbId);
    if (sifts && sifts[complexAgChain]) {
      const cMap = sifts[complexAgChain];
      const mappedTargetSeqs: number[] = [];
      const pairs: Array<{ complexResSeq: number; targetResSeq: number }> = [];

      for (const cSeq of rawContactSeqs) {
        if (cMap[cSeq] !== undefined) {
          const targetSeq = cMap[cSeq];
          mappedTargetSeqs.push(targetSeq);
          pairs.push({ complexResSeq: cSeq, targetResSeq: targetSeq });
        }
      }

      if (mappedTargetSeqs.length > 0) {
        return {
          targetResidueSeqs: Array.from(new Set(mappedTargetSeqs)).sort((a, b) => a - b),
          mappedPairs: pairs,
          mappingMethod: 'sifts',
        };
      }
    }
  }

  // 2. Sequence Alignment Mapping (Needleman-Wunsch)
  const alignedPairs = alignResidueSequences(complexAgResidues, targetResidues);
  if (alignedPairs.length > 0) {
    const seqToTargetSeqMap = new Map<number, number>();
    for (const pair of alignedPairs) {
      seqToTargetSeqMap.set(pair.complexRes.resSeq, pair.targetRes.resSeq);
    }

    const mappedTargetSeqs: number[] = [];
    const pairs: Array<{ complexResSeq: number; targetResSeq: number }> = [];

    for (const cSeq of rawContactSeqs) {
      if (seqToTargetSeqMap.has(cSeq)) {
        const targetSeq = seqToTargetSeqMap.get(cSeq)!;
        mappedTargetSeqs.push(targetSeq);
        pairs.push({ complexResSeq: cSeq, targetResSeq: targetSeq });
      }
    }

    if (mappedTargetSeqs.length > 0) {
      return {
        targetResidueSeqs: Array.from(new Set(mappedTargetSeqs)).sort((a, b) => a - b),
        mappedPairs: pairs,
        mappingMethod: 'sequence_alignment',
      };
    }
  }

  // 3. Fallback: if direct numbering matches target range
  return {
    targetResidueSeqs: rawContactSeqs,
    mappedPairs: rawContactSeqs.map(s => ({ complexResSeq: s, targetResSeq: s })),
    mappingMethod: 'direct_fallback',
  };
}

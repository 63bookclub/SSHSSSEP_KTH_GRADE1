import { fetchWithTimeout } from '../utils/fetchTimeout.ts';
import { isValidPdbId, isValidUniprotId, validateAminoAcidSequence } from '../utils/validation.ts';
import { parsePdb, parseMmcif, calculateSASA, parseFastaInput, ParsedStructure } from './bioAlgorithms.ts';
import { predictStructureWithESMFold } from './esmFoldService.ts';
import { checkAtomCountLimit } from '../utils/limits.ts';

export interface TargetLoadResult {
  sourceType: 'uniprot' | 'pdb' | 'file';
  identifier: string;
  structure: ParsedStructure;
}

export interface CandidateLoadResult {
  sourceType: 'fasta' | 'sequence' | 'pdb';
  identifier: string;
  sequence?: string;
  structure: ParsedStructure;
  isExperimental: boolean;
  candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated';
  isSimulated: boolean;
}

/**
 * Loads and parses target structure from UniProt ID, PDB ID, or raw PDB/CIF text.
 */
export async function loadTargetStructure(input: {
  uniprot_id?: string;
  pdb_id?: string;
  raw_content?: string;
  filename?: string;
}): Promise<TargetLoadResult> {
  const { uniprot_id, pdb_id, raw_content, filename } = input;
  let structureText = '';
  let sourceType: 'uniprot' | 'pdb' | 'file' = 'file';
  let identifier = '';

  if (uniprot_id) {
    if (!isValidUniprotId(uniprot_id)) {
      throw new Error(`유효하지 않은 UniProt ID 형식입니다: '${uniprot_id}'.`);
    }
    sourceType = 'uniprot';
    identifier = uniprot_id.trim().toUpperCase();

    const afMetaUrl = `https://alphafold.ebi.ac.uk/api/prediction/${identifier}`;
    const metaRes = await fetchWithTimeout(afMetaUrl);
    if (!metaRes.ok) {
      throw new Error(`AlphaFold DB에서 해당 UniProt ID (${identifier})를 찾을 수 없습니다.`);
    }
    const metaData = await metaRes.json();
    const entry = Array.isArray(metaData) ? metaData[0] : metaData;
    const fileUrl = entry?.cifUrl || entry?.pdbUrl;
    if (!fileUrl) {
      throw new Error('AlphaFold DB 결과에 구조 파일 다운로드 URL이 포함되어 있지 않습니다.');
    }

    const fileRes = await fetchWithTimeout(fileUrl);
    if (!fileRes.ok) throw new Error('AlphaFold 구조 파일 다운로드 실패');
    const txt = await fileRes.text();
    if (txt.trim().startsWith('<')) throw new Error('AlphaFold 구조 응답이 유효한 PDB/CIF 형식이 아닙니다.');
    structureText = txt;
  } else if (pdb_id) {
    if (!isValidPdbId(pdb_id)) {
      throw new Error(`유효하지 않은 PDB ID 형식입니다: '${pdb_id}'.`);
    }
    sourceType = 'pdb';
    identifier = pdb_id.trim().toUpperCase();

    const pdbUrl = `https://files.rcsb.org/download/${identifier}.pdb`;
    const rcsbRes = await fetchWithTimeout(pdbUrl);
    if (rcsbRes.ok) {
      const txt = await rcsbRes.text();
      if (!txt.trim().startsWith('<')) {
        structureText = txt;
      }
    }
    if (!structureText) {
      // Fallback to .cif
      const cifUrl = `https://files.rcsb.org/download/${identifier}.cif`;
      const cifRes = await fetchWithTimeout(cifUrl);
      if (cifRes.ok) {
        const txt = await cifRes.text();
        if (!txt.trim().startsWith('<')) {
          structureText = txt;
        }
      }
    }
    if (!structureText) {
      throw new Error(`RCSB PDB에서 ${identifier}를 다운로드할 수 없거나 HTML 오류 응답을 받았습니다.`);
    }
  } else if (raw_content) {
    sourceType = 'file';
    identifier = filename || 'uploaded_structure';
    structureText = raw_content;
  } else {
    throw new Error('UniProt ID, PDB ID, 또는 구조 파일(raw_content) 중 하나를 제공해야 합니다.');
  }

  const structure = structureText.includes('_atom_site.')
    ? parseMmcif(structureText)
    : parsePdb(structureText);

  if (structure.chains.length === 0 || structure.allAtoms.length === 0) {
    throw new Error('유효한 단백질 원자(ATOM) 좌표를 파싱하지 못했습니다. 표준 PDB/mmCIF 파일인지 확인해 주세요.');
  }

  const atomLimitCheck = checkAtomCountLimit(structure.allAtoms.length);
  if (!atomLimitCheck.isWithinLimit) {
    throw new Error(atomLimitCheck.error);
  }

  // Calculate SASA for all chains in full assembly context
  const allAssemblyResidues = Object.values(structure.residuesByChain).flat();
  for (const chain of structure.chains) {
    const resList = structure.residuesByChain[chain] || [];
    if (resList.length > 0) {
      calculateSASA(resList, 1.4, 96, allAssemblyResidues);
    }
  }

  return {
    sourceType,
    identifier,
    structure,
  };
}

/**
 * Parses and loads flexible target input (string that could be raw PDB/CIF, PDB ID, or UniProt ID).
 */
export async function loadTargetFromInputString(targetInput: string): Promise<TargetLoadResult> {
  let cleanTarget = targetInput.trim();
  if (cleanTarget.startsWith('>')) {
    const records = parseFastaInput(cleanTarget);
    if (records.length > 1) {
      throw new Error('타겟 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.');
    }
    cleanTarget = records[0]?.sequence || '';
  }

  if (cleanTarget.startsWith('ATOM') || cleanTarget.startsWith('HEADER') || cleanTarget.includes('_atom_site.')) {
    return loadTargetStructure({ raw_content: cleanTarget, filename: 'Custom_Target_PDB' });
  } else if (isValidPdbId(cleanTarget)) {
    return loadTargetStructure({ pdb_id: cleanTarget });
  } else if (isValidUniprotId(cleanTarget)) {
    return loadTargetStructure({ uniprot_id: cleanTarget });
  } else {
    throw new Error('유효하지 않은 타겟 입력입니다. 타겟은 PDB/mmCIF 구조 파일, PDB ID 또는 UniProt ID만 지원됩니다.');
  }
}

/**
 * Loads candidate structure from sequence, FASTA, PDB ID, or raw PDB text.
 */
export async function loadCandidateStructure(input: {
  sequence?: string;
  fasta_text?: string;
  raw_pdb?: string;
  pdb_id?: string;
  filename?: string;
  is_experimental?: boolean;
}): Promise<CandidateLoadResult> {
  const { sequence, fasta_text, raw_pdb, pdb_id, filename, is_experimental } = input;
  let structureText = '';
  let parsedSeq = '';
  let isExperimental = !!is_experimental;
  let candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated' = isExperimental ? 'experimental' : 'esmfold';
  let isSimulated = false;
  let sourceType: 'fasta' | 'sequence' | 'pdb' = 'sequence';

  if (pdb_id || (raw_pdb && isValidPdbId(raw_pdb.trim()))) {
    const targetPdbId = (pdb_id || raw_pdb!).trim().toUpperCase();
    sourceType = 'pdb';
    isExperimental = true;
    candidateSource = 'experimental';
    isSimulated = false;

    const pdbUrl = `https://files.rcsb.org/download/${targetPdbId}.pdb`;
    const rcsbRes = await fetchWithTimeout(pdbUrl);
    if (rcsbRes.ok) {
      const txt = await rcsbRes.text();
      if (!txt.trim().startsWith('<')) {
        structureText = txt;
      }
    }
    if (!structureText) {
      const cifUrl = `https://files.rcsb.org/download/${targetPdbId}.cif`;
      const cifRes = await fetchWithTimeout(cifUrl);
      if (cifRes.ok) {
        const txt = await cifRes.text();
        if (!txt.trim().startsWith('<')) {
          structureText = txt;
        }
      }
    }
    if (!structureText) {
      throw new Error(`RCSB PDB에서 후보 PDB ID '${targetPdbId}'를 불러오지 못했습니다.`);
    }
  } else if (raw_pdb) {
    sourceType = 'pdb';
    structureText = raw_pdb;
    isExperimental = true;
    candidateSource = 'experimental';
    isSimulated = false;
  } else {
    let rawInput = (fasta_text || sequence || '').trim();
    if (!rawInput) {
      throw new Error('후보 물질의 서열(FASTA/단순 서열) 또는 3D 구조 파일(PDB)을 입력해야 합니다.');
    }

    const seqVal = validateAminoAcidSequence(rawInput, { minLen: 5, maxLen: 600 });
    if (!seqVal.isValid) {
      throw new Error(seqVal.error);
    }
    parsedSeq = seqVal.sequence;

    const esmResult = await predictStructureWithESMFold(rawInput);
    if (esmResult.success && esmResult.pdbText) {
      structureText = esmResult.pdbText;
      parsedSeq = esmResult.sequence || parsedSeq;
      candidateSource = 'esmfold';
      isSimulated = false;
    } else {
      throw new Error(
        `ESMFold 예측 실패: ${esmResult.error || '구조 예측에 실패했습니다.'} 외부에서 예측한 PDB(ColabFold, AlphaFold Server 등)를 직접 업로드해 주세요.`
      );
    }
  }

  const structure = structureText.includes('_atom_site.')
    ? parseMmcif(structureText)
    : parsePdb(structureText);

  if (structure.chains.length === 0) {
    throw new Error('후보 물질 구조 파싱에 실패했습니다. 유효한 PDB 좌표인지 확인해 주세요.');
  }

  const candAtomLimitCheck = checkAtomCountLimit(structure.allAtoms.length);
  if (!candAtomLimitCheck.isWithinLimit) {
    throw new Error(candAtomLimitCheck.error);
  }

  return {
    sourceType,
    identifier: filename || (parsedSeq ? `Seq-${parsedSeq.length}aa` : 'Candidate-PDB'),
    sequence: parsedSeq,
    structure,
    isExperimental,
    candidateSource,
    isSimulated,
  };
}

/**
 * Helper to parse candidate from flexible string input (PDB text, PDB ID, or Sequence).
 */
export async function loadCandidateFromInputString(
  candidateInput: string,
  index: number = 0
): Promise<CandidateLoadResult> {
  let cleanInput = candidateInput.trim();
  if (cleanInput.startsWith('>')) {
    const records = parseFastaInput(cleanInput);
    if (records.length > 1) {
      throw new Error('후보 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.');
    }
    cleanInput = records[0]?.sequence || '';
  }

  if (cleanInput.startsWith('ATOM') || cleanInput.startsWith('HEADER') || cleanInput.includes('_atom_site.')) {
    return loadCandidateStructure({
      raw_pdb: cleanInput,
      filename: `Candidate_PDB_${index + 1}`,
      is_experimental: true,
    });
  } else if (isValidPdbId(cleanInput)) {
    return loadCandidateStructure({
      pdb_id: cleanInput,
      filename: `Candidate_PDB_${cleanInput.toUpperCase()}`,
      is_experimental: true,
    });
  } else {
    return loadCandidateStructure({
      sequence: cleanInput,
      filename: `Candidate_Seq_${index + 1}`,
      is_experimental: false,
    });
  }
}

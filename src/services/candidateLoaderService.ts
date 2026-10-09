import {
  parsePdb,
  parseMmcif,
  calculateSASA,
  parseFastaInput,
  threadSequenceOnTemplate,
  ParsedStructure,
  Residue,
} from './bioAlgorithms.ts';
import { predictStructureWithESMFold } from './esmFoldService.ts';
import { isValidPdbId, validateAminoAcidSequence } from '../utils/validation.ts';
import { checkAtomCountLimit } from '../utils/limits.ts';
import { resolveCandidateChain } from './chainService.ts';
import { fetchWithTimeout } from './targetLoaderService.ts';

export interface LoadCandidateParams {
  sequence?: string;
  fasta_text?: string;
  raw_pdb?: string;
  candidate_input?: string;
  filename?: string;
  candidate_name?: string;
  is_experimental?: boolean;
  chain?: string;
  targetResiduesForThreading?: Residue[];
}

export interface LoadedCandidate {
  sourceType: 'fasta' | 'sequence' | 'pdb';
  identifier: string;
  sequence?: string;
  structure: ParsedStructure;
  isExperimental: boolean;
  candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated';
  isSimulated: boolean;
  chain: string;
  residuesCount: number;
}

export async function loadCandidateStructure(params: LoadCandidateParams): Promise<LoadedCandidate> {
  const {
    sequence,
    fasta_text,
    raw_pdb,
    candidate_input,
    filename,
    candidate_name,
    is_experimental,
    chain: reqChain,
    targetResiduesForThreading,
  } = params;

  let structureText = '';
  let parsedSeq = '';
  let isExperimental = !!is_experimental;
  let candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated' = isExperimental ? 'experimental' : 'esmfold';
  let isSimulated = false;
  let sourceType: 'fasta' | 'sequence' | 'pdb' = 'sequence';

  const rawInput = (candidate_input || fasta_text || sequence || raw_pdb || '').trim();
  if (!rawInput) {
    throw new Error('후보 물질의 서열(FASTA/단순 서열) 또는 3D 구조 파일(PDB)을 입력해야 합니다.');
  }

  let cleanInput = rawInput;
  if (cleanInput.startsWith('>')) {
    const records = parseFastaInput(cleanInput);
    if (records.length > 1) {
      throw new Error('후보 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.');
    }
    cleanInput = records[0]?.sequence || '';
    sourceType = 'fasta';
  }

  if (raw_pdb || cleanInput.startsWith('ATOM') || cleanInput.startsWith('HEADER') || cleanInput.includes('_atom_site.')) {
    sourceType = 'pdb';
    structureText = raw_pdb || cleanInput;
    isExperimental = true;
    candidateSource = 'experimental';
    isSimulated = false;
  } else if (isValidPdbId(cleanInput)) {
    const pId = cleanInput.toUpperCase();
    sourceType = 'pdb';
    isExperimental = true;
    candidateSource = 'experimental';
    isSimulated = false;

    try {
      const r = await fetchWithTimeout(`https://files.rcsb.org/download/${pId}.pdb`);
      if (!r.ok) {
        throw new Error(`PDB ${pId} 다운로드 실패 (${r.status})`);
      }
      const txt = await r.text();
      if (txt.trim().startsWith('<')) {
        throw new Error(`PDB ${pId} 응답이 HTML 오류 페이지입니다.`);
      }
      structureText = txt;
    } catch (err: any) {
      throw new Error(`후보 PDB '${pId}'를 불러오지 못했습니다: ${err.message || err}`);
    }
  } else {
    // Sequence input -> call ESMFold with fallback to template threading if available
    const seqVal = validateAminoAcidSequence(cleanInput, { minLen: 5, maxLen: 600 });
    if (!seqVal.isValid) {
      throw new Error(seqVal.error);
    }
    parsedSeq = seqVal.sequence;

    const esmResult = await predictStructureWithESMFold(parsedSeq);
    if (esmResult.success && esmResult.pdbText) {
      structureText = esmResult.pdbText;
      parsedSeq = esmResult.sequence || parsedSeq;
      candidateSource = 'esmfold';
      isSimulated = false;
    } else if (targetResiduesForThreading && targetResiduesForThreading.length > 0) {
      try {
        const threadedPdb = threadSequenceOnTemplate(parsedSeq, targetResiduesForThreading, 'A');
        structureText = threadedPdb;
        candidateSource = 'simulated';
        isSimulated = true;
      } catch (threadErr: any) {
        throw new Error(
          `ESMFold 예측 연동 실패 (${esmResult.error || '응답 없음'}) 및 템플릿 모사 실패 (${threadErr.message}). 유효한 3D PDB 파일이나 PDB ID를 업로드해 주세요.`
        );
      }
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

  let candChain = '';
  try {
    candChain = resolveCandidateChain(structure.chains, reqChain, filename || candidate_name);
  } catch (chainErr: any) {
    throw new Error(chainErr.message);
  }

  const resList = structure.residuesByChain[candChain] || Object.values(structure.residuesByChain)[0] || [];
  if (resList.length === 0) {
    throw new Error('후보 물질 구조에서 잔기 좌표를 생성하지 못했습니다.');
  }

  const allCandResidues = Object.values(structure.residuesByChain).flat();
  calculateSASA(resList, 1.4, 96, allCandResidues);

  const identifierName = candidate_name || filename || (parsedSeq ? `Seq-${parsedSeq.length}aa` : 'Candidate-PDB');

  return {
    sourceType,
    identifier: identifierName,
    sequence: parsedSeq,
    structure,
    isExperimental,
    candidateSource,
    isSimulated,
    chain: candChain,
    residuesCount: resList.length,
  };
}

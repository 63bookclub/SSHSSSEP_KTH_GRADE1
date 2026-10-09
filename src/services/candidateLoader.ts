import {
  parsePdb,
  parseMmcif,
  calculateSASA,
  threadSequenceOnTemplate,
  parseFastaInput,
  ParsedStructure,
  Residue,
} from './bioAlgorithms.ts';
import { predictStructureWithESMFold } from './esmFoldService.ts';
import { isValidPdbId, validateAminoAcidSequence } from '../utils/validation.ts';
import { checkAtomCountLimit } from '../utils/limits.ts';
import { fetchPdbStructure } from './structureLoader.ts';

export interface LoadCandidateInput {
  candidate_input?: string;
  sequence?: string;
  fasta_text?: string;
  raw_pdb?: string;
  filename?: string;
  is_experimental?: boolean;
  reqChain?: string;
  targetResiduesForFallback?: Residue[];
}

export interface LoadedCandidateResult {
  sourceType: 'fasta' | 'sequence' | 'pdb';
  identifier: string;
  sequence: string;
  structure: ParsedStructure;
  isExperimental: boolean;
  candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated';
  isSimulated: boolean;
  structureText: string;
}

export async function loadCandidateStructure(
  input: LoadCandidateInput
): Promise<LoadedCandidateResult> {
  const {
    candidate_input,
    sequence,
    fasta_text,
    raw_pdb,
    filename,
    is_experimental,
    targetResiduesForFallback,
  } = input;

  let structureText = '';
  let parsedSeq = '';
  let isExperimental = !!is_experimental;
  let candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated' = isExperimental ? 'experimental' : 'esmfold';
  let isSimulated = false;
  let sourceType: 'fasta' | 'sequence' | 'pdb' = 'sequence';
  let identifier = filename || 'Candidate';

  let rawInput = (candidate_input || fasta_text || sequence || raw_pdb || '').trim();
  if (!rawInput) {
    throw new Error('후보 물질의 서열(FASTA/단순 서열) 또는 3D 구조 파일(PDB)을 입력해야 합니다.');
  }

  if (rawInput.startsWith('>')) {
    const records = parseFastaInput(rawInput);
    if (records.length > 1) {
      throw new Error('후보 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.');
    }
    rawInput = records[0]?.sequence || '';
    sourceType = 'fasta';
  }

  if (raw_pdb || rawInput.startsWith('ATOM') || rawInput.startsWith('HEADER') || rawInput.includes('_atom_site.')) {
    sourceType = 'pdb';
    structureText = raw_pdb || rawInput;
    isExperimental = true;
    candidateSource = 'experimental';
    isSimulated = false;
    identifier = filename || 'Custom_Candidate_PDB';
  } else if (isValidPdbId(rawInput)) {
    const candId = rawInput.toUpperCase();
    sourceType = 'pdb';
    identifier = candId;
    try {
      structureText = await fetchPdbStructure(candId);
      if (!structureText) {
        throw new Error(`PDB ${candId} 다운로드 실패 또는 HTML 오류 페이지 응답입니다.`);
      }
      isExperimental = true;
      candidateSource = 'experimental';
      isSimulated = false;
    } catch (err: any) {
      throw new Error(`후보 PDB '${candId}'를 불러오지 못했습니다: ${err.message || err}`);
    }
  } else {
    // Input is sequence string
    const seqVal = validateAminoAcidSequence(rawInput, { minLen: 5, maxLen: 600 });
    if (!seqVal.isValid) {
      throw new Error(`후보 서열 오류: ${seqVal.error}`);
    }
    parsedSeq = seqVal.sequence;
    identifier = filename || (parsedSeq ? `Seq-${parsedSeq.length}aa` : 'Candidate_Sequence');

    // Try ESMFold first
    const esmResult = await predictStructureWithESMFold(rawInput);
    if (esmResult.success && esmResult.pdbText) {
      structureText = esmResult.pdbText;
      parsedSeq = esmResult.sequence || parsedSeq;
      candidateSource = 'esmfold';
      isSimulated = false;
      isExperimental = false;
    } else if (targetResiduesForFallback && targetResiduesForFallback.length > 0) {
      // Fallback: thread sequence on target template if compatible
      try {
        const threadedPdb = threadSequenceOnTemplate(parsedSeq, targetResiduesForFallback, 'A');
        structureText = threadedPdb;
        candidateSource = 'simulated';
        isSimulated = true;
        isExperimental = false;
      } catch (threadErr: any) {
        throw new Error(
          `ESMFold 예측 연동 실패 (${esmResult.error || '응답 없음'}) 및 템플릿 모사 실패 (${threadErr.message}). 유효한 3D PDB 파일이나 PDB ID를 업로드해 주세요.`
        );
      }
    } else {
      throw new Error(
        `ESMFold 예측 연동 실패: ${esmResult.error || '구조 예측에 실패했습니다.'} 외부에서 예측한 PDB(ColabFold, AlphaFold Server 등)를 직접 업로드해 주세요.`
      );
    }
  }

  const structure = structureText.includes('_atom_site.')
    ? parseMmcif(structureText)
    : parsePdb(structureText);

  if (structure.chains.length === 0 || structure.allAtoms.length === 0) {
    throw new Error('후보 물질 구조 파싱에 실패했습니다. 유효한 PDB 좌표인지 확인해 주세요.');
  }

  const candAtomLimitCheck = checkAtomCountLimit(structure.allAtoms.length);
  if (!candAtomLimitCheck.isWithinLimit) {
    throw new Error(candAtomLimitCheck.error);
  }

  return {
    sourceType,
    identifier,
    sequence: parsedSeq,
    structure,
    isExperimental,
    candidateSource,
    isSimulated,
    structureText,
  };
}

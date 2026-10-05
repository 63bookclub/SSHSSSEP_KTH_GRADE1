import {
  parsePdb,
  parseMmcif,
  parseFastaInput,
  ParsedStructure,
} from './bioAlgorithms.ts';
import {
  isValidPdbId,
  isValidUniprotId,
  validateAminoAcidSequence,
} from '../utils/validation.ts';
import { predictStructureWithESMFold, fetchWithTimeout } from './esmFoldService.ts';

export interface ResolvedTarget {
  structureText: string;
  sourceType: 'uniprot' | 'pdb' | 'file';
  identifier: string;
  structure: ParsedStructure;
}

export interface ResolveTargetOptions {
  uniprot_id?: string;
  pdb_id?: string;
  raw_content?: string;
  filename?: string;
  target_input?: string;
}

/**
 * Resolves target protein structure from UniProt ID, PDB ID, raw structure content, or amino acid sequence.
 * Throws clear descriptive errors on fetch/prediction failures rather than silently falling back to synthetic helices.
 */
export async function resolveTargetStructure(
  options: ResolveTargetOptions
): Promise<ResolvedTarget> {
  const { uniprot_id, pdb_id, raw_content, filename, target_input } = options;

  let structureText = '';
  let sourceType: 'uniprot' | 'pdb' | 'file' = 'file';
  let identifier = '';

  if (uniprot_id) {
    const trimmed = uniprot_id.trim();
    if (!isValidUniprotId(trimmed)) {
      throw new Error(`유효하지 않은 UniProt ID 형식입니다: '${uniprot_id}'.`);
    }
    sourceType = 'uniprot';
    identifier = trimmed.toUpperCase();

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
    if (!fileRes.ok) {
      throw new Error('AlphaFold 구조 파일 다운로드 실패');
    }
    structureText = await fileRes.text();
  } else if (pdb_id) {
    const trimmed = pdb_id.trim();
    if (!isValidPdbId(trimmed)) {
      throw new Error(`유효하지 않은 PDB ID 형식입니다: '${pdb_id}'.`);
    }
    sourceType = 'pdb';
    identifier = trimmed.toUpperCase();

    const pdbUrl = `https://files.rcsb.org/download/${identifier}.pdb`;
    const rcsbRes = await fetchWithTimeout(pdbUrl);
    if (rcsbRes.ok) {
      structureText = await rcsbRes.text();
    } else {
      const cifUrl = `https://files.rcsb.org/download/${identifier}.cif`;
      const cifRes = await fetchWithTimeout(cifUrl);
      if (cifRes.ok) {
        structureText = await cifRes.text();
      } else {
        throw new Error(`RCSB PDB에서 ${identifier}를 다운로드할 수 없습니다.`);
      }
    }
  } else if (raw_content) {
    sourceType = 'file';
    identifier = filename || 'uploaded_structure';
    structureText = raw_content;
  } else if (target_input) {
    let cleanTarget = target_input.trim();
    if (!cleanTarget) {
      throw new Error('타겟(Target) 입력값이 비어 있습니다.');
    }

    if (cleanTarget.startsWith('>')) {
      const records = parseFastaInput(cleanTarget);
      if (records.length > 1) {
        throw new Error('타겟 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.');
      }
      cleanTarget = records[0]?.sequence || '';
    }

    if (
      cleanTarget.startsWith('ATOM') ||
      cleanTarget.startsWith('HEADER') ||
      cleanTarget.includes('_atom_site.')
    ) {
      sourceType = 'file';
      identifier = filename || 'Custom_Target_PDB';
      structureText = cleanTarget;
    } else if (isValidPdbId(cleanTarget)) {
      identifier = cleanTarget.toUpperCase();
      sourceType = 'pdb';
      const pdbRes = await fetchWithTimeout(`https://files.rcsb.org/download/${identifier}.pdb`);
      if (pdbRes.ok) {
        structureText = await pdbRes.text();
      } else {
        const cifRes = await fetchWithTimeout(`https://files.rcsb.org/download/${identifier}.cif`);
        if (cifRes.ok) {
          structureText = await cifRes.text();
        } else {
          throw new Error(`RCSB PDB에서 ${identifier}를 가져올 수 없습니다.`);
        }
      }
    } else if (isValidUniprotId(cleanTarget)) {
      identifier = cleanTarget.toUpperCase();
      sourceType = 'uniprot';
      const afRes = await fetchWithTimeout(`https://alphafold.ebi.ac.uk/api/prediction/${identifier}`);
      if (!afRes.ok) {
        throw new Error(`AlphaFold DB에서 UniProt ${identifier}를 찾을 수 없습니다.`);
      }
      const meta = await afRes.json();
      const entry = Array.isArray(meta) ? meta[0] : meta;
      const fileUrl = entry?.cifUrl || entry?.pdbUrl;
      if (!fileUrl) {
        throw new Error('AlphaFold 3D 구조 URL을 찾을 수 없습니다.');
      }
      const structRes = await fetchWithTimeout(fileUrl);
      if (!structRes.ok) {
        throw new Error('AlphaFold 구조 파일 다운로드 실패');
      }
      structureText = await structRes.text();
    } else {
      // Treat as sequence input: predict 3D structure using ESMFold
      const seqVal = validateAminoAcidSequence(cleanTarget, { minLen: 10, maxLen: 2000 });
      if (!seqVal.isValid) {
        throw new Error(`타겟 서열 오류: ${seqVal.error}`);
      }
      const esmResult = await predictStructureWithESMFold(cleanTarget);
      if (esmResult.success && esmResult.pdbText) {
        structureText = esmResult.pdbText;
        sourceType = 'file';
        identifier = 'Target_Sequence_ESMFold';
      } else {
        throw new Error(`ESMFold 타겟 구조 예측 실패: ${esmResult.error || '구조를 예측할 수 없습니다.'}`);
      }
    }
  } else {
    throw new Error('UniProt ID, PDB ID, 구조 파일(raw_content), 또는 타겟 입력(target_input) 중 하나를 제공해야 합니다.');
  }

  const structure = structureText.includes('_atom_site.')
    ? parseMmcif(structureText)
    : parsePdb(structureText);

  if (structure.chains.length === 0 || structure.allAtoms.length === 0) {
    throw new Error('유효한 단백질 원자(ATOM) 좌표를 파싱하지 못했습니다. 표준 PDB/mmCIF 파일인지 확인해 주세요.');
  }

  return {
    structureText,
    sourceType,
    identifier,
    structure,
  };
}

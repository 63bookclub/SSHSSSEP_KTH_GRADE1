/**
 * Service module for resolving target protein 3D structures.
 * Supports UniProt ID (AlphaFold DB), RCSB PDB ID, raw structure text (PDB/mmCIF),
 * and amino acid sequence input (predicted via ESMFold).
 *
 * Explicitly rejects synthetic alpha helix fallback when target retrieval or prediction fails.
 */

import { parsePdb, parseMmcif, parseFastaInput, ParsedStructure } from './bioAlgorithms.ts';
import { isValidPdbId, isValidUniprotId, validateAminoAcidSequence } from '../utils/validation.ts';
import { predictStructureWithESMFold, fetchWithTimeout } from './esmFoldService.ts';

export interface ResolveTargetOptions {
  uniprotId?: string;
  pdbId?: string;
  rawContent?: string;
  filename?: string;
  inputString?: string;
}

export interface ResolvedTarget {
  structureText: string;
  parsedStructure: ParsedStructure;
  sourceType: 'uniprot' | 'pdb' | 'file';
  identifier: string;
}

export async function resolveTargetStructure(options: ResolveTargetOptions): Promise<ResolvedTarget> {
  let structureText = '';
  let sourceType: 'uniprot' | 'pdb' | 'file' = 'file';
  let identifier = '';

  const { uniprotId, pdbId, rawContent, filename, inputString } = options;

  if (uniprotId) {
    const cleanId = uniprotId.trim().toUpperCase();
    if (!isValidUniprotId(cleanId)) {
      throw new Error(`유효하지 않은 UniProt ID 형식입니다: '${uniprotId}'.`);
    }
    sourceType = 'uniprot';
    identifier = cleanId;

    const afMetaUrl = `https://alphafold.ebi.ac.uk/api/prediction/${identifier}`;
    const metaRes = await fetchWithTimeout(afMetaUrl);
    if (!metaRes.ok) {
      throw new Error(`AlphaFold DB에서 해당 UniProt ID (${identifier})를 찾을 수 없습니다. (HTTP ${metaRes.status})`);
    }
    const metaData = await metaRes.json();
    const entry = Array.isArray(metaData) ? metaData[0] : metaData;
    const fileUrl = entry?.cifUrl || entry?.pdbUrl;
    if (!fileUrl) {
      throw new Error('AlphaFold DB 결과에 구조 파일 다운로드 URL이 포함되어 있지 않습니다.');
    }

    const fileRes = await fetchWithTimeout(fileUrl);
    if (!fileRes.ok) {
      throw new Error(`AlphaFold 구조 파일 다운로드 실패 (HTTP ${fileRes.status})`);
    }
    structureText = await fileRes.text();
  } else if (pdbId) {
    const cleanId = pdbId.trim().toUpperCase();
    if (!isValidPdbId(cleanId)) {
      throw new Error(`유효하지 않은 PDB ID 형식입니다: '${pdbId}'.`);
    }
    sourceType = 'pdb';
    identifier = cleanId;

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
  } else if (rawContent && rawContent.trim()) {
    sourceType = 'file';
    identifier = filename || 'uploaded_structure';
    structureText = rawContent;
  } else if (inputString && inputString.trim()) {
    let cleanInput = inputString.trim();

    // Parse FASTA header if present
    if (cleanInput.startsWith('>')) {
      const records = parseFastaInput(cleanInput);
      if (records.length > 1) {
        throw new Error('타겟 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.');
      }
      cleanInput = records[0]?.sequence || '';
    }

    if (
      cleanInput.startsWith('ATOM') ||
      cleanInput.startsWith('HEADER') ||
      cleanInput.includes('_atom_site.')
    ) {
      sourceType = 'file';
      identifier = filename || 'Custom_Target_PDB';
      structureText = cleanInput;
    } else if (isValidPdbId(cleanInput)) {
      sourceType = 'pdb';
      identifier = cleanInput.toUpperCase();
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
    } else if (isValidUniprotId(cleanInput)) {
      sourceType = 'uniprot';
      identifier = cleanInput.toUpperCase();
      const afRes = await fetchWithTimeout(`https://alphafold.ebi.ac.uk/api/prediction/${identifier}`);
      if (!afRes.ok) {
        throw new Error(`AlphaFold DB에서 UniProt ID (${identifier})를 찾을 수 없습니다.`);
      }
      const meta = await afRes.json();
      const entry = Array.isArray(meta) ? meta[0] : meta;
      const fileUrl = entry?.cifUrl || entry?.pdbUrl;
      if (!fileUrl) {
        throw new Error('AlphaFold DB 결과에 구조 파일 다운로드 URL이 포함되어 있지 않습니다.');
      }
      const structRes = await fetchWithTimeout(fileUrl);
      if (!structRes.ok) {
        throw new Error(`AlphaFold 구조 파일 다운로드 실패 (HTTP ${structRes.status})`);
      }
      structureText = await structRes.text();
    } else {
      // Treat as amino acid sequence -> Predict using ESMFold
      const seqVal = validateAminoAcidSequence(cleanInput, { minLen: 10, maxLen: 2000 });
      if (!seqVal.isValid) {
        throw new Error(`타겟 서열 오류: ${seqVal.error}`);
      }
      identifier = 'Target_Sequence';
      sourceType = 'file';

      const esmResult = await predictStructureWithESMFold(seqVal.sequence);
      if (esmResult.success && esmResult.pdbText) {
        structureText = esmResult.pdbText;
      } else {
        throw new Error(`ESMFold 구조 예측 실패: ${esmResult.error || '구조를 예측할 수 없습니다.'}`);
      }
    }
  } else {
    throw new Error('UniProt ID, PDB ID, 구조 파일, 또는 타겟 서열 중 하나를 입력해야 합니다.');
  }

  const parsedStructure = structureText.includes('_atom_site.')
    ? parseMmcif(structureText)
    : parsePdb(structureText);

  if (parsedStructure.chains.length === 0 || parsedStructure.allAtoms.length === 0) {
    throw new Error('유효한 단백질 원자(ATOM) 좌표를 파싱하지 못했습니다. 표준 PDB/mmCIF 파일인지 확인해 주세요.');
  }

  return {
    structureText,
    parsedStructure,
    sourceType,
    identifier,
  };
}

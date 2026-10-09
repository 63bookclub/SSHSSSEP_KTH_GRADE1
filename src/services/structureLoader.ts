import { parsePdb, parseMmcif, calculateSASA, ParsedStructure } from './bioAlgorithms.ts';
import { isValidPdbId, isValidUniprotId } from '../utils/validation.ts';
import { checkAtomCountLimit } from '../utils/limits.ts';
import { downloadRcsbStructure } from './structureDownloader.ts';

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

export interface LoadTargetInput {
  uniprot_id?: string;
  pdb_id?: string;
  raw_content?: string;
  filename?: string;
}

export interface LoadedTargetResult {
  sourceType: 'uniprot' | 'pdb' | 'file';
  identifier: string;
  structure: ParsedStructure;
  structureText: string;
}

export async function loadTargetStructure(input: LoadTargetInput): Promise<LoadedTargetResult> {
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
    try {
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
    } catch (afErr: any) {
      throw new Error(`AlphaFold DB 조회 오류: ${afErr?.message || '구조를 불러올 수 없습니다.'}. PDB ID를 입력하거나 구조 파일을 업로드해 보세요.`);
    }
  } else if (pdb_id) {
    if (!isValidPdbId(pdb_id)) {
      throw new Error(`유효하지 않은 PDB ID 형식입니다: '${pdb_id}'.`);
    }
    sourceType = 'pdb';
    identifier = pdb_id.trim().toUpperCase();
    try {
      const downloaded = await downloadRcsbStructure(identifier);
      structureText = downloaded.text;
    } catch (rcsbErr: any) {
      throw new Error(`RCSB PDB 조회 실패: ${rcsbErr?.message || '해당 PDB ID를 찾지 못했습니다.'}. 네트워크 상태를 확인하거나 PDB 파일을 직접 업로드해 주세요.`);
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
    structureText,
  };
}

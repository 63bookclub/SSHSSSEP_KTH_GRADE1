import { parsePdb, parseMmcif, calculateSASA, parseFastaInput, ParsedStructure } from './bioAlgorithms.ts';
import { isValidPdbId, isValidUniprotId } from '../utils/validation.ts';
import { checkAtomCountLimit } from '../utils/limits.ts';

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

export interface LoadTargetParams {
  uniprot_id?: string;
  pdb_id?: string;
  raw_content?: string;
  target_input?: string;
  filename?: string;
}

export interface LoadedTarget {
  sourceType: 'uniprot' | 'pdb' | 'file';
  identifier: string;
  structure: ParsedStructure;
  chains: string[];
  chainResidueCounts: Record<string, number>;
  totalAtoms: number;
}

export async function loadTargetStructure(params: LoadTargetParams): Promise<LoadedTarget> {
  const { uniprot_id, pdb_id, raw_content, target_input, filename } = params;

  let structureText = '';
  let sourceType: 'uniprot' | 'pdb' | 'file' = 'file';
  let identifier = '';

  const cleanInput = (target_input || raw_content || '').trim();

  if (uniprot_id || (cleanInput && isValidUniprotId(cleanInput))) {
    const uId = (uniprot_id || cleanInput).trim().toUpperCase();
    if (!isValidUniprotId(uId)) {
      throw new Error(`유효하지 않은 UniProt ID 형식입니다: '${uId}'.`);
    }
    sourceType = 'uniprot';
    identifier = uId;

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
  } else if (pdb_id || (cleanInput && isValidPdbId(cleanInput))) {
    const pId = (pdb_id || cleanInput).trim().toUpperCase();
    if (!isValidPdbId(pId)) {
      throw new Error(`유효하지 않은 PDB ID 형식입니다: '${pId}'.`);
    }
    sourceType = 'pdb';
    identifier = pId;

    try {
      const pdbUrl = `https://files.rcsb.org/download/${identifier}.pdb`;
      const rcsbRes = await fetchWithTimeout(pdbUrl);
      if (rcsbRes.ok) {
        const txt = await rcsbRes.text();
        if (!txt.trim().startsWith('<')) {
          structureText = txt;
        }
      }
      if (!structureText) {
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
    } catch (rcsbErr: any) {
      throw new Error(`RCSB PDB 조회 실패: ${rcsbErr?.message || '해당 PDB ID를 찾지 못했습니다.'}. 네트워크 상태를 확인하거나 PDB 파일을 직접 업로드해 주세요.`);
    }
  } else if (cleanInput) {
    let textToParse = cleanInput;
    if (textToParse.startsWith('>')) {
      const records = parseFastaInput(textToParse);
      if (records.length > 1) {
        throw new Error('타겟 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.');
      }
      textToParse = records[0]?.sequence || '';
    }

    if (textToParse.startsWith('ATOM') || textToParse.startsWith('HEADER') || textToParse.includes('_atom_site.')) {
      sourceType = 'file';
      identifier = filename || 'uploaded_structure';
      structureText = textToParse;
    } else {
      throw new Error('유효하지 않은 타겟 입력입니다. 타겟은 PDB/mmCIF 구조 파일, PDB ID 또는 UniProt ID만 지원됩니다.');
    }
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

  const chainResidueCounts: Record<string, number> = {};
  for (const c of structure.chains) {
    chainResidueCounts[c] = (structure.residuesByChain[c] || []).length;
  }

  return {
    sourceType,
    identifier,
    structure,
    chains: structure.chains,
    chainResidueCounts,
    totalAtoms: structure.allAtoms.length,
  };
}

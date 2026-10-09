/**
 * PDB and mmCIF structure parsing, FASTA parsing, and basic residue/atom types.
 */

export interface Atom {
  serial: number;
  name: string;
  resName: string;
  chain: string;
  resSeq: number;
  iCode?: string;
  altLoc?: string;
  x: number;
  y: number;
  z: number;
  occupancy: number;
  tempFactor: number; // Often pLDDT in AlphaFold/ESMFold models
  element: string;
}

export interface Residue {
  resSeq: number;
  iCode?: string;
  resKey: string; // Composite key, e.g. "100" or "100A"
  resName: string;
  chain: string;
  caAtom: Atom | null;
  atoms: Atom[];
  sasa?: number;
  rsa?: number;
}

export function getResidueKey(resSeq: number, iCode?: string): string {
  const code = (iCode || '').trim();
  return code ? `${resSeq}${code}` : `${resSeq}`;
}

export interface ParsedStructure {
  title: string;
  chains: string[];
  residuesByChain: Record<string, Residue[]>;
  allAtoms: Atom[];
  rawPdb: string;
}

export interface FastaRecord {
  header: string;
  sequence: string;
}

/**
 * Parses FASTA formatted text or single sequence string into structured FASTA records.
 */
export function parseFastaInput(fastaText: string): FastaRecord[] {
  const lines = fastaText.split(/\r?\n/);
  const records: FastaRecord[] = [];
  let currentHeader = '';
  let currentSeqBuffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('>')) {
      if (currentHeader || currentSeqBuffer.length > 0) {
        records.push({
          header: currentHeader || 'sequence',
          sequence: currentSeqBuffer.join('').replace(/[\s\r\n\t]/g, '').toUpperCase(),
        });
      }
      currentHeader = trimmed.substring(1).trim();
      currentSeqBuffer = [];
    } else {
      currentSeqBuffer.push(trimmed);
    }
  }

  if (currentHeader || currentSeqBuffer.length > 0) {
    records.push({
      header: currentHeader || 'sequence',
      sequence: currentSeqBuffer.join('').replace(/[\s\r\n\t]/g, '').toUpperCase(),
    });
  }

  return records;
}

// 1-letter to 3-letter mapping
export const AA3_TO_1: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
};

export const AA1_TO_3: Record<string, string> = Object.fromEntries(
  Object.entries(AA3_TO_1).map(([k, v]) => [v, k])
);

export function parsePdb(pdbText: string): ParsedStructure {
  const lines = pdbText.split('\n');
  const allAtoms: Atom[] = [];
  const residuesByChain: Record<string, Record<string, Residue>> = {};
  const chainsSet = new Set<string>();

  for (const line of lines) {
    const record = line.substring(0, 6).trim();
    if (record === 'ATOM' || record === 'HETATM') {
      const resName = line.substring(17, 20).trim().toUpperCase();
      if (record === 'HETATM' && (resName === 'HOH' || resName === 'WAT' || resName === 'DOD')) {
        continue;
      }

      const altLoc = line.length >= 17 ? line.substring(16, 17).trim() : '';
      if (altLoc && altLoc !== 'A' && altLoc !== '1') {
        continue;
      }

      const serial = parseInt(line.substring(6, 11).trim(), 10) || 0;
      const name = line.substring(12, 16).trim();
      const chain = line.substring(21, 22).trim() || 'A';
      const resSeq = parseInt(line.substring(22, 26).trim(), 10);
      if (isNaN(resSeq)) continue;

      const iCode = line.length >= 27 ? line.substring(26, 27).trim() : '';
      const resKey = getResidueKey(resSeq, iCode);

      let x = parseFloat(line.substring(30, 38).trim());
      let y = parseFloat(line.substring(38, 46).trim());
      let z = parseFloat(line.substring(46, 54).trim());
      let occupancy = parseFloat(line.substring(54, 60).trim());
      let tempFactor = parseFloat(line.substring(60, 66).trim());

      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        const tokens = line.trim().split(/\s+/);
        if (tokens.length >= 7) {
          x = parseFloat(tokens[6]);
          y = parseFloat(tokens[7]);
          z = parseFloat(tokens[8]);
          occupancy = tokens.length >= 10 ? parseFloat(tokens[9]) : 1.0;
          tempFactor = tokens.length >= 11 ? parseFloat(tokens[10]) : 0.0;
        }
      } else {
        if (isNaN(occupancy)) occupancy = 1.0;
        if (isNaN(tempFactor) || tempFactor < 10.0) {
          const tokens = line.trim().split(/\s+/);
          if (tokens.length >= 11) {
            const tokenTF = parseFloat(tokens[10]);
            if (!isNaN(tokenTF) && tokenTF > 0) {
              tempFactor = tokenTF;
            }
          }
          if (isNaN(tempFactor)) tempFactor = 0.0;
        }
      }

      const element = line.substring(76, 78).trim().toUpperCase() || name.substring(0, 1);

      if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

      const atom: Atom = {
        serial,
        name,
        resName,
        chain,
        resSeq,
        iCode: iCode || undefined,
        altLoc: altLoc || undefined,
        x,
        y,
        z,
        occupancy,
        tempFactor,
        element,
      };
      allAtoms.push(atom);
      chainsSet.add(chain);

      if (!residuesByChain[chain]) {
        residuesByChain[chain] = {};
      }
      if (!residuesByChain[chain][resKey]) {
        residuesByChain[chain][resKey] = {
          resSeq,
          iCode: iCode || undefined,
          resKey,
          resName,
          chain,
          caAtom: null,
          atoms: [],
        };
      }
      residuesByChain[chain][resKey].atoms.push(atom);
      if (name === 'CA') {
        residuesByChain[chain][resKey].caAtom = atom;
      }
    }
  }

  const structuredChains: Record<string, Residue[]> = {};
  for (const chain of Object.keys(residuesByChain)) {
    const list = Object.values(residuesByChain[chain]).sort((a, b) => {
      if (a.resSeq !== b.resSeq) return a.resSeq - b.resSeq;
      return (a.iCode || '').localeCompare(b.iCode || '');
    });
    structuredChains[chain] = list;
  }

  return {
    title: 'Structure',
    chains: Array.from(chainsSet).sort(),
    residuesByChain: structuredChains,
    allAtoms,
    rawPdb: pdbText,
  };
}

export function parseMmcif(cifText: string): ParsedStructure {
  if (cifText.includes('ATOM  ') && cifText.includes('TER')) {
    return parsePdb(cifText);
  }

  const lines = cifText.split('\n');
  let inAtomSite = false;
  let colMap: Record<string, number> = {};
  let colIdx = 0;
  const allAtoms: Atom[] = [];
  const residuesByChain: Record<string, Record<string, Residue>> = {};
  const chainsSet = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('loop_')) {
      inAtomSite = false;
      colMap = {};
      colIdx = 0;
      continue;
    }
    if (line.startsWith('_atom_site.')) {
      inAtomSite = true;
      const tag = line.replace('_atom_site.', '').trim();
      colMap[tag] = colIdx++;
      continue;
    }

    if (inAtomSite) {
      if (line.startsWith('#') || line.startsWith('loop_') || line.startsWith('_')) {
        inAtomSite = false;
        continue;
      }
      if (!line) continue;

      const tokens = line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      if (tokens.length < 10) continue;

      const groupPDB = tokens[colMap['group_PDB'] ?? 0] || 'ATOM';
      if (groupPDB !== 'ATOM' && groupPDB !== 'HETATM') continue;

      const resName = (tokens[colMap['auth_comp_id'] ?? colMap['label_comp_id'] ?? 5] || 'UNK').replace(/['"]/g, '');
      if (groupPDB === 'HETATM' && (resName === 'HOH' || resName === 'WAT')) continue;

      const altLocToken = (tokens[colMap['label_alt_id'] ?? colMap['auth_alt_id'] ?? -1] || '').replace(/['"]/g, '').trim();
      const altLoc = (altLocToken === '.' || altLocToken === '?') ? '' : altLocToken;
      if (altLoc && altLoc !== 'A' && altLoc !== '1') {
        continue;
      }

      const chain = (tokens[colMap['auth_asym_id'] ?? colMap['label_asym_id'] ?? 6] || 'A').replace(/['"]/g, '');
      const resSeqStr = tokens[colMap['auth_seq_id'] ?? colMap['label_seq_id'] ?? 8];
      const resSeq = parseInt(resSeqStr, 10);
      if (isNaN(resSeq)) continue;

      const rawICode = (tokens[colMap['pdbx_PDB_ins_code'] ?? colMap['label_ins_code'] ?? colMap['auth_ins_code'] ?? -1] || '').replace(/['"]/g, '').trim();
      const iCode = (rawICode === '.' || rawICode === '?') ? '' : rawICode;
      const resKey = getResidueKey(resSeq, iCode);

      const x = parseFloat(tokens[colMap['Cartn_x'] ?? 10]);
      const y = parseFloat(tokens[colMap['Cartn_y'] ?? 11]);
      const z = parseFloat(tokens[colMap['Cartn_z'] ?? 12]);
      const occ = parseFloat(tokens[colMap['occupancy'] ?? 13]) || 1.0;
      const bFactor = parseFloat(tokens[colMap['B_iso_or_equiv'] ?? 14]) || 0.0;
      const name = (tokens[colMap['auth_atom_id'] ?? colMap['label_atom_id'] ?? 3] || '').replace(/['"]/g, '');
      const element = (tokens[colMap['type_symbol'] ?? 2] || name.substring(0, 1)).replace(/['"]/g, '');

      if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

      const atom: Atom = {
        serial: allAtoms.length + 1,
        name,
        resName,
        chain,
        resSeq,
        iCode: iCode || undefined,
        altLoc: altLoc || undefined,
        x,
        y,
        z,
        occupancy: occ,
        tempFactor: bFactor,
        element,
      };
      allAtoms.push(atom);
      chainsSet.add(chain);

      if (!residuesByChain[chain]) residuesByChain[chain] = {};
      if (!residuesByChain[chain][resKey]) {
        residuesByChain[chain][resKey] = {
          resSeq,
          iCode: iCode || undefined,
          resKey,
          resName,
          chain,
          caAtom: null,
          atoms: [],
        };
      }
      residuesByChain[chain][resKey].atoms.push(atom);
      if (name === 'CA') {
        residuesByChain[chain][resKey].caAtom = atom;
      }
    }
  }

  if (allAtoms.length === 0) {
    return parsePdb(cifText);
  }

  const structuredChains: Record<string, Residue[]> = {};
  for (const chain of Object.keys(residuesByChain)) {
    structuredChains[chain] = Object.values(residuesByChain[chain]).sort((a, b) => {
      if (a.resSeq !== b.resSeq) return a.resSeq - b.resSeq;
      return (a.iCode || '').localeCompare(b.iCode || '');
    });
  }

  const pdbLines: string[] = [];
  for (const at of allAtoms) {
    const sStr = at.serial.toString().padStart(5);
    const nStr = (at.name.length < 4 ? ' ' + at.name : at.name).padEnd(4);
    const rStr = at.resName.padEnd(3);
    const cStr = at.chain.substring(0, 1);
    const seqStr = at.resSeq.toString().padStart(4);
    const iCodeChar = (at.iCode || ' ').substring(0, 1);
    const xStr = at.x.toFixed(3).padStart(8);
    const yStr = at.y.toFixed(3).padStart(8);
    const zStr = at.z.toFixed(3).padStart(8);
    const occStr = at.occupancy.toFixed(2).padStart(6);
    const bStr = at.tempFactor.toFixed(2).padStart(6);
    const elemStr = (at.element || at.name[0]).padStart(2);
    pdbLines.push(`ATOM  ${sStr} ${nStr} ${rStr} ${cStr}${seqStr}${iCodeChar}   ${xStr}${yStr}${zStr}${occStr}${bStr}          ${elemStr}`);
  }
  pdbLines.push('TER');
  pdbLines.push('END');

  return {
    title: 'Structure mmCIF',
    chains: Array.from(chainsSet).sort(),
    residuesByChain: structuredChains,
    allAtoms,
    rawPdb: pdbLines.join('\n'),
  };
}

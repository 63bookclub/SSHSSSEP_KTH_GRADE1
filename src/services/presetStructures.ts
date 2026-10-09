import fs from 'fs';
import path from 'path';

export interface EmbeddedStructure {
  pdbId: string;
  format: 'pdb' | 'cif';
  text: string;
}

const EMBEDDED_STRUCTURES: Record<string, EmbeddedStructure> = {};

/**
 * Loads real PDB file from public/pdb directory if available (Node/Bun runtime).
 */
export function getRealStructurePdb(pdbId: string): string {
  const cleanId = pdbId.toUpperCase().trim();
  if (EMBEDDED_STRUCTURES[cleanId]) {
    return EMBEDDED_STRUCTURES[cleanId].text;
  }

  try {
    const filePath = path.join(process.cwd(), 'public', 'pdb', `${cleanId}.pdb`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      EMBEDDED_STRUCTURES[cleanId] = {
        pdbId: cleanId,
        format: 'pdb',
        text: content,
      };
      return content;
    }
  } catch (_e) {
    // Ignore fs errors in browser environments
  }

  return '';
}

export function registerEmbeddedStructure(pdbId: string, text: string, format: 'pdb' | 'cif' = 'pdb'): void {
  EMBEDDED_STRUCTURES[pdbId.toUpperCase()] = {
    pdbId: pdbId.toUpperCase(),
    format,
    text,
  };
}

export function getEmbeddedStructure(pdbId: string): EmbeddedStructure | undefined {
  const cleanId = pdbId.toUpperCase().trim();
  if (EMBEDDED_STRUCTURES[cleanId]) {
    return EMBEDDED_STRUCTURES[cleanId];
  }
  const realText = getRealStructurePdb(cleanId);
  if (realText) {
    return {
      pdbId: cleanId,
      format: 'pdb',
      text: realText,
    };
  }
  return undefined;
}

/**
 * Modifies atom coordinates of a real PDB structure for validation tests
 * (applying deterministic translation, coordinate noise, or residue truncation).
 */
export function transformRealPdb(
  pdbText: string,
  options: {
    chain?: string;
    translation?: [number, number, number];
    noise?: number;
    maxResidues?: number;
  } = {}
): string {
  const { chain, translation = [0, 0, 0], noise = 0, maxResidues } = options;
  const lines = pdbText.split('\n');
  const outputLines: string[] = [];

  let residueCount = 0;
  let lastResSeq = -1;

  for (const line of lines) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const lineChain = line.substring(21, 22).trim();
      if (chain && lineChain !== chain && lineChain !== '') {
        continue;
      }

      const resSeqStr = line.substring(22, 26).trim();
      const resSeq = parseInt(resSeqStr, 10);

      if (!isNaN(resSeq) && resSeq !== lastResSeq) {
        residueCount++;
        lastResSeq = resSeq;
      }

      if (maxResidues !== undefined && residueCount > maxResidues) {
        continue;
      }

      const origX = parseFloat(line.substring(30, 38));
      const origY = parseFloat(line.substring(38, 46));
      const origZ = parseFloat(line.substring(46, 54));

      if (isNaN(origX) || isNaN(origY) || isNaN(origZ)) {
        outputLines.push(line);
        continue;
      }

      let nx = 0;
      let ny = 0;
      let nz = 0;
      if (noise > 0) {
        const atomSerial = parseInt(line.substring(6, 11).trim(), 10) || 1;
        nx = Math.sin(atomSerial * 0.7) * noise;
        ny = Math.cos(atomSerial * 0.7) * noise;
        nz = Math.sin(atomSerial * 1.3) * noise;
      }

      const newX = (origX + translation[0] + nx).toFixed(3).padStart(8);
      const newY = (origY + translation[1] + ny).toFixed(3).padStart(8);
      const newZ = (origZ + translation[2] + nz).toFixed(3).padStart(8);

      const modifiedLine =
        line.substring(0, 30) +
        newX +
        newY +
        newZ +
        line.substring(54);

      outputLines.push(modifiedLine);
    } else if (line.startsWith('TER') || line.startsWith('END')) {
      outputLines.push(line);
    }
  }

  return outputLines.join('\n');
}

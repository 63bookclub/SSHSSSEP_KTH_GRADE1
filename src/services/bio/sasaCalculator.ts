import { Atom, Residue } from './pdbParser.ts';

// Standard maximum empirical SASA values for 20 amino acids (Tien et al. 2013)
export const MAX_SASA: Record<string, number> = {
  ALA: 121.0,
  ARG: 265.0,
  ASN: 187.0,
  ASP: 187.0,
  CYS: 148.0,
  GLN: 214.0,
  GLU: 214.0,
  GLY: 97.0,
  HIS: 216.0,
  ILE: 195.0,
  LEU: 191.0,
  LYS: 230.0,
  MET: 203.0,
  PHE: 228.0,
  PRO: 154.0,
  SER: 143.0,
  THR: 163.0,
  TRP: 264.0,
  TYR: 255.0,
  VAL: 165.0,
};

// Van der Waals radii (Angstroms)
const VDW_RADII: Record<string, number> = {
  H: 1.20,
  C: 1.70,
  N: 1.55,
  O: 1.52,
  P: 1.80,
  S: 1.80,
  FE: 1.80,
  ZN: 1.39,
  DEFAULT: 1.70,
};

/**
 * Numerical Shrake-Rupley SASA algorithm
 * Approximates solvent accessible surface using spherical test points.
 * `contextResidues` can be passed (e.g. all residues in a multi-chain assembly)
 * so neighboring chains block solvent accessibility while computing SASA for `residues`.
 */
export function calculateSASA(
  residues: Residue[],
  probeRadius = 1.4,
  numPoints = 96,
  contextResidues?: Residue[]
): void {
  // Generate points on unit sphere using golden spiral
  const spherePoints: [number, number, number][] = [];
  const inc = Math.PI * (3 - Math.sqrt(5));
  const off = 2 / numPoints;
  for (let k = 0; k < numPoints; k++) {
    const y = k * off - 1 + off / 2;
    const r = Math.sqrt(1 - y * y);
    const phi = k * inc;
    spherePoints.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }

  // Pre-initialize target residue SASA
  for (const res of residues) {
    res.sasa = 0;
  }

  // Collect target atoms (atoms whose SASA will be calculated and accumulated)
  const targetAtoms: (Atom & { rExp: number; residue: Residue })[] = [];
  for (const res of residues) {
    for (const at of res.atoms) {
      const vdw = VDW_RADII[at.element] || VDW_RADII.DEFAULT;
      targetAtoms.push({
        ...at,
        rExp: vdw + probeRadius,
        residue: res,
      });
    }
  }

  // Collect all context atoms (atoms used to determine burial)
  const allContext = contextResidues || residues;
  const contextAtoms: (Atom & { rExp: number })[] = [];
  for (const res of allContext) {
    for (const at of res.atoms) {
      const vdw = VDW_RADII[at.element] || VDW_RADII.DEFAULT;
      contextAtoms.push({
        ...at,
        rExp: vdw + probeRadius,
      });
    }
  }

  // Calculate SASA per target atom
  const constFactor = (4 * Math.PI) / numPoints;
  for (let i = 0; i < targetAtoms.length; i++) {
    const a1 = targetAtoms[i];
    let accessiblePoints = 0;

    // Find candidate neighbor atoms from contextAtoms
    const neighbors: typeof contextAtoms = [];
    for (let j = 0; j < contextAtoms.length; j++) {
      const a2 = contextAtoms[j];
      if (
        a1.chain === a2.chain &&
        a1.resSeq === a2.resSeq &&
        a1.name === a2.name &&
        a1.serial === a2.serial
      ) {
        continue;
      }
      const dx = a1.x - a2.x;
      const dy = a1.y - a2.y;
      const dz = a1.z - a2.z;
      const maxDist = a1.rExp + a2.rExp;
      if (dx * dx + dy * dy + dz * dz < maxDist * maxDist) {
        neighbors.push(a2);
      }
    }

    // Test each point on the expanded sphere
    for (const [px, py, pz] of spherePoints) {
      const testX = a1.x + a1.rExp * px;
      const testY = a1.y + a1.rExp * py;
      const testZ = a1.z + a1.rExp * pz;

      let isBuried = false;
      for (const a2 of neighbors) {
        const dx = testX - a2.x;
        const dy = testY - a2.y;
        const dz = testZ - a2.z;
        if (dx * dx + dy * dy + dz * dz < a2.rExp * a2.rExp) {
          isBuried = true;
          break;
        }
      }

      if (!isBuried) {
        accessiblePoints++;
      }
    }

    const atomArea = constFactor * (a1.rExp * a1.rExp) * accessiblePoints;
    if (a1.residue.sasa !== undefined) {
      a1.residue.sasa += atomArea;
    }
  }

  // Calculate Relative Solvent Accessibility (RSA)
  for (const res of residues) {
    const maxVal = MAX_SASA[res.resName] || 180.0;
    res.rsa = Math.min(1.0, Math.max(0.0, (res.sasa || 0) / maxVal));
  }
}

import { Atom, Residue, ParsedStructure } from "./bioParsers.ts";
export interface AlignedPair {
  targetResSeq: number;
  targetResKey: string;
  targetResName: string;
  candResSeq: number;
  candResKey: string;
  candResName: string;
  distance: number;
  targetCa: Atom;
  candCa: Atom;
  plddt: number;
}

export interface AlignmentResult {
  tmScoreTargetNorm: number;
  tmScoreCandNorm: number;
  sGlobal: number;
  rmsd: number;
  alignedLength: number;
  coverage: number;
  rotationMatrix: number[][]; // 3x3
  translationVector: number[]; // 3
  alignedPairs: AlignedPair[];
  targetResidues: Residue[];
  candResidues: Residue[];
}

// 3x3 Matrix multiplication and SVD for Kabsch
function matMult3x3(a: number[][], b: number[][]): number[][] {
  const result = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      result[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
    }
  }
  return result;
}

function transpose3x3(m: number[][]): number[][] {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

function det3x3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/**
 * Jacobi eigenvalue algorithm for symmetric 3x3 matrix
 */
function jacobi3x3(A: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  const a = A.map(row => [...row]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let iter = 0; iter < 50; iter++) {
    let maxOff = 0;
    let p = 0;
    let q = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        if (Math.abs(a[i][j]) > maxOff) {
          maxOff = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
      }
    }
    if (maxOff < 1e-9) break;

    const diff = a[q][q] - a[p][p];
    let t: number;
    if (Math.abs(a[p][q]) < Math.abs(diff) * 1e-15) {
      t = a[p][q] / diff;
    } else {
      const phi = diff / (2 * a[p][q]);
      t = 1 / (Math.abs(phi) + Math.sqrt(phi * phi + 1));
      if (phi < 0) t = -t;
    }
    const c = 1 / Math.sqrt(t * t + 1);
    const s = t * c;
    const tau = s / (1 + c);

    const apq = a[p][q];
    a[p][q] = 0;
    a[p][p] -= t * apq;
    a[q][q] += t * apq;

    for (let j = 0; j < p; j++) {
      const g = a[j][p];
      const h = a[j][q];
      a[j][p] = g - s * (h + g * tau);
      a[j][q] = h + s * (g - h * tau);
    }
    for (let j = p + 1; j < q; j++) {
      const g = a[p][j];
      const h = a[j][q];
      a[p][j] = g - s * (h + g * tau);
      a[j][q] = h + s * (g - h * tau);
    }
    for (let j = q + 1; j < 3; j++) {
      const g = a[p][j];
      const h = a[q][j];
      a[p][j] = g - s * (h + g * tau);
      a[q][j] = h + s * (g - h * tau);
    }

    for (let j = 0; j < 3; j++) {
      const g = v[j][p];
      const h = v[j][q];
      v[j][p] = g - s * (h + g * tau);
      v[j][q] = h + s * (g - h * tau);
    }
  }

  return {
    eigenvalues: [a[0][0], a[1][1], a[2][2]],
    eigenvectors: v,
  };
}

/**
 * Kabsch algorithm to find optimal rotation and translation
 * between Candidate coordinates and Target coordinates
 */
export function computeKabsch(
  candCoords: [number, number, number][],
  targetCoords: [number, number, number][]
): { R: number[][]; t: number[] } {
  const n = candCoords.length;
  if (n === 0) {
    return {
      R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      t: [0, 0, 0],
    };
  }

  // 1. Calculate centroids
  let cX = 0, cY = 0, cZ = 0;
  let tX = 0, tY = 0, tZ = 0;
  for (let i = 0; i < n; i++) {
    cX += candCoords[i][0];
    cY += candCoords[i][1];
    cZ += candCoords[i][2];
    tX += targetCoords[i][0];
    tY += targetCoords[i][1];
    tZ += targetCoords[i][2];
  }
  const candCentroid = [cX / n, cY / n, cZ / n];
  const targetCentroid = [tX / n, tY / n, tZ / n];

  // 2. Compute covariance matrix H = (P - cP)^T * (Q - cQ)
  const H = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < n; i++) {
    const px = candCoords[i][0] - candCentroid[0];
    const py = candCoords[i][1] - candCentroid[1];
    const pz = candCoords[i][2] - candCentroid[2];

    const qx = targetCoords[i][0] - targetCentroid[0];
    const qy = targetCoords[i][1] - targetCentroid[1];
    const qz = targetCoords[i][2] - targetCentroid[2];

    H[0][0] += px * qx;
    H[0][1] += px * qy;
    H[0][2] += px * qz;
    H[1][0] += py * qx;
    H[1][1] += py * qy;
    H[1][2] += py * qz;
    H[2][0] += pz * qx;
    H[2][1] += pz * qy;
    H[2][2] += pz * qz;
  }

  // 3. SVD of H = U * S * V^T using H^T * H
  const HtH = matMult3x3(transpose3x3(H), H);
  const { eigenvectors: V } = jacobi3x3(HtH);

  // Compute U = H * V * S^(-1)
  const U = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let j = 0; j < 3; j++) {
    const colV = [V[0][j], V[1][j], V[2][j]];
    const Hv = [
      H[0][0] * colV[0] + H[0][1] * colV[1] + H[0][2] * colV[2],
      H[1][0] * colV[0] + H[1][1] * colV[1] + H[1][2] * colV[2],
      H[2][0] * colV[0] + H[2][1] * colV[1] + H[2][2] * colV[2],
    ];
    const norm = Math.sqrt(Hv[0] * Hv[0] + Hv[1] * Hv[1] + Hv[2] * Hv[2]);
    if (norm > 1e-8) {
      U[0][j] = Hv[0] / norm;
      U[1][j] = Hv[1] / norm;
      U[2][j] = Hv[2] / norm;
    }
  }

  // R = V * U^T
  let R = matMult3x3(V, transpose3x3(U));

  // Ensure right-handed coordinate system (det(R) > 0)
  if (det3x3(R) < 0) {
    V[0][2] = -V[0][2];
    V[1][2] = -V[1][2];
    V[2][2] = -V[2][2];
    R = matMult3x3(V, transpose3x3(U));
  }

  // Translation: t = targetCentroid - R * candCentroid
  const rotatedCandCentroid = [
    R[0][0] * candCentroid[0] + R[0][1] * candCentroid[1] + R[0][2] * candCentroid[2],
    R[1][0] * candCentroid[0] + R[1][1] * candCentroid[1] + R[1][2] * candCentroid[2],
    R[2][0] * candCentroid[0] + R[2][1] * candCentroid[1] + R[2][2] * candCentroid[2],
  ];

  const t = [
    targetCentroid[0] - rotatedCandCentroid[0],
    targetCentroid[1] - rotatedCandCentroid[1],
    targetCentroid[2] - rotatedCandCentroid[2],
  ];

  return { R, t };
}

/**
 * Dynamic programming structure alignment (TM-align core DP logic)
 */
export function alignStructures(
  targetResidues: Residue[],
  candResidues: Residue[]
): AlignmentResult {
  const targetCa = targetResidues.filter(r => r.caAtom !== null);
  const candCa = candResidues.filter(r => r.caAtom !== null);

  const L_target = targetCa.length;
  const L_cand = candCa.length;

  if (L_target === 0 || L_cand === 0) {
    throw new Error('Both structures must have at least one C-alpha atom');
  }

  // TM-score d0 scale (Zhang & Skolnick standard formula)
  const d0_target = Math.max(0.5, L_target > 15 ? 1.24 * Math.cbrt(L_target - 15) - 1.8 : 0.5);
  const d0_cand = Math.max(0.5, L_cand > 15 ? 1.24 * Math.cbrt(L_cand - 15) - 1.8 : 0.5);

  // Structural dynamic programming alignment function using spatial distance score
  const alignByDistanceScore = (
    R: number[][],
    t: number[]
  ): { pairs: [number, number][]; scoreSum: number } => {
    const dp: number[][] = Array(L_target + 1)
      .fill(0)
      .map(() => Array(L_cand + 1).fill(0));
    const pointer: number[][] = Array(L_target + 1)
      .fill(0)
      .map(() => Array(L_cand + 1).fill(0)); // 1: diag, 2: up, 3: left

    const gapPenalty = 0.0; // TM-align score matrix uses non-negative scores without gap penalties

    for (let i = 1; i <= L_target; i++) {
      const tc = targetCa[i - 1].caAtom!;
      for (let j = 1; j <= L_cand; j++) {
        const cc = candCa[j - 1].caAtom!;
        const rotX = R[0][0] * cc.x + R[0][1] * cc.y + R[0][2] * cc.z + t[0];
        const rotY = R[1][0] * cc.x + R[1][1] * cc.y + R[1][2] * cc.z + t[1];
        const rotZ = R[2][0] * cc.x + R[2][1] * cc.y + R[2][2] * cc.z + t[2];
        const dist = Math.sqrt((rotX - tc.x) ** 2 + (rotY - tc.y) ** 2 + (rotZ - tc.z) ** 2);

        const matchScore = 1 / (1 + (dist / d0_target) ** 2);
        const scoreDiag = dp[i - 1][j - 1] + matchScore;
        const scoreUp = dp[i - 1][j] - gapPenalty;
        const scoreLeft = dp[i][j - 1] - gapPenalty;

        let maxVal = scoreDiag;
        let dir = 1;
        if (scoreUp > maxVal) {
          maxVal = scoreUp;
          dir = 2;
        }
        if (scoreLeft > maxVal) {
          maxVal = scoreLeft;
          dir = 3;
        }
        dp[i][j] = Math.max(0, maxVal);
        pointer[i][j] = dir;
      }
    }

    // Traceback
    let currI = L_target;
    let currJ = L_cand;
    const pairs: [number, number][] = [];
    while (currI > 0 && currJ > 0) {
      if (pointer[currI][currJ] === 1) {
        pairs.push([currI - 1, currJ - 1]);
        currI--;
        currJ--;
      } else if (pointer[currI][currJ] === 2) {
        currI--;
      } else {
        currJ--;
      }
    }
    pairs.reverse();

    let scoreSum = 0;
    for (const [ti, ci] of pairs) {
      const tc = targetCa[ti].caAtom!;
      const cc = candCa[ci].caAtom!;
      const rotX = R[0][0] * cc.x + R[0][1] * cc.y + R[0][2] * cc.z + t[0];
      const rotY = R[1][0] * cc.x + R[1][1] * cc.y + R[1][2] * cc.z + t[1];
      const rotZ = R[2][0] * cc.x + R[2][1] * cc.y + R[2][2] * cc.z + t[2];
      const dist = Math.sqrt((rotX - tc.x) ** 2 + (rotY - tc.y) ** 2 + (rotZ - tc.z) ** 2);
      scoreSum += 1 / (1 + (dist / d0_target) ** 2);
    }

    return { pairs, scoreSum };
  };

  // Find best initial superposition seeds via gapless diagonal sliding
  let bestSeedR = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let bestSeedT = [0, 0, 0];
  let bestSeedScore = -1;
  let bestInitialPairs: [number, number][] = [];

  const minOverlap = Math.min(5, Math.min(L_target, L_cand));
  for (let shift = -(L_cand - minOverlap); shift <= L_target - minOverlap; shift++) {
    const diagPairs: [number, number][] = [];
    for (let ci = 0; ci < L_cand; ci++) {
      const ti = ci + shift;
      if (ti >= 0 && ti < L_target) {
        diagPairs.push([ti, ci]);
      }
    }

    if (diagPairs.length < minOverlap) continue;

    const candPts: [number, number, number][] = diagPairs.map(([, ci]) => [
      candCa[ci].caAtom!.x,
      candCa[ci].caAtom!.y,
      candCa[ci].caAtom!.z,
    ]);
    const targetPts: [number, number, number][] = diagPairs.map(([ti]) => [
      targetCa[ti].caAtom!.x,
      targetCa[ti].caAtom!.y,
      targetCa[ti].caAtom!.z,
    ]);

    const { R, t } = computeKabsch(candPts, targetPts);
    let tmSum = 0;
    for (const [ti, ci] of diagPairs) {
      const tc = targetCa[ti].caAtom!;
      const cc = candCa[ci].caAtom!;
      const rotX = R[0][0] * cc.x + R[0][1] * cc.y + R[0][2] * cc.z + t[0];
      const rotY = R[1][0] * cc.x + R[1][1] * cc.y + R[1][2] * cc.z + t[1];
      const rotZ = R[2][0] * cc.x + R[2][1] * cc.y + R[2][2] * cc.z + t[2];
      const dist = Math.sqrt((rotX - tc.x) ** 2 + (rotY - tc.y) ** 2 + (rotZ - tc.z) ** 2);
      tmSum += 1 / (1 + (dist / d0_target) ** 2);
    }

    if (tmSum > bestSeedScore) {
      bestSeedScore = tmSum;
      bestSeedR = R;
      bestSeedT = t;
      bestInitialPairs = diagPairs;
    }
  }

  // Iterative TM-align DP refinement loop
  let bestR = bestSeedR;
  let bestT = bestSeedT;
  let currentPairs = bestInitialPairs;
  let maxScoreSum = bestSeedScore;

  for (let iter = 0; iter < 10; iter++) {
    const { pairs, scoreSum } = alignByDistanceScore(bestR, bestT);

    if (pairs.length < 3) break;

    const candPts: [number, number, number][] = pairs.map(([, ci]) => [
      candCa[ci].caAtom!.x,
      candCa[ci].caAtom!.y,
      candCa[ci].caAtom!.z,
    ]);
    const targetPts: [number, number, number][] = pairs.map(([ti]) => [
      targetCa[ti].caAtom!.x,
      targetCa[ti].caAtom!.y,
      targetCa[ti].caAtom!.z,
    ]);

    const { R, t } = computeKabsch(candPts, targetPts);
    bestR = R;
    bestT = t;
    currentPairs = pairs;

    if (scoreSum > maxScoreSum) {
      maxScoreSum = scoreSum;
    }
  }

  // Compute final aligned pairs and structural metrics
  const finalAlignment = alignByDistanceScore(bestR, bestT);
  const rawPairs = finalAlignment.pairs;

  const alignedPairs: AlignedPair[] = [];
  let sumTmTarget = 0;
  let sumTmCand = 0;
  let sumSqDist = 0;

  for (const [ti, ci] of rawPairs) {
    const tRes = targetCa[ti];
    const cRes = candCa[ci];
    const tc = tRes.caAtom!;
    const cc = cRes.caAtom!;

    const rotX = bestR[0][0] * cc.x + bestR[0][1] * cc.y + bestR[0][2] * cc.z + bestT[0];
    const rotY = bestR[1][0] * cc.x + bestR[1][1] * cc.y + bestR[1][2] * cc.z + bestT[1];
    const rotZ = bestR[2][0] * cc.x + bestR[2][1] * cc.y + bestR[2][2] * cc.z + bestT[2];

    const dist = Math.sqrt((rotX - tc.x) ** 2 + (rotY - tc.y) ** 2 + (rotZ - tc.z) ** 2);

    sumTmTarget += 1 / (1 + (dist / d0_target) ** 2);
    sumTmCand += 1 / (1 + (dist / d0_cand) ** 2);
    sumSqDist += dist * dist;

    alignedPairs.push({
      targetResSeq: tRes.resSeq,
      targetResKey: tRes.resKey || getResidueKey(tRes.resSeq, tRes.iCode),
      targetResName: tRes.resName,
      candResSeq: cRes.resSeq,
      candResKey: cRes.resKey || getResidueKey(cRes.resSeq, cRes.iCode),
      candResName: cRes.resName,
      distance: dist,
      targetCa: tc,
      candCa: {
        ...cc,
        x: rotX,
        y: rotY,
        z: rotZ,
      },
      plddt: cc.tempFactor,
    });
  }

  const tmScoreTargetNorm = Math.min(1.0, Math.max(0.0, sumTmTarget / L_target));
  const tmScoreCandNorm = Math.min(1.0, Math.max(0.0, sumTmCand / L_cand));

  // Determine mode: candidate length < 70% target length -> fragment
  const isFragment = L_cand < 0.7 * L_target;
  const sGlobal = isFragment ? tmScoreCandNorm : tmScoreTargetNorm;
  const rmsd = alignedPairs.length > 0 ? Math.sqrt(sumSqDist / alignedPairs.length) : 0;
  const coverage = alignedPairs.length / L_target;

  return {
    tmScoreTargetNorm: Math.round(tmScoreTargetNorm * 10000) / 10000,
    tmScoreCandNorm: Math.round(tmScoreCandNorm * 10000) / 10000,
    sGlobal: Math.round(sGlobal * 10000) / 10000,
    rmsd: Math.round(rmsd * 100) / 100,
    alignedLength: alignedPairs.length,
    coverage: Math.round(coverage * 1000) / 1000,
    rotationMatrix: bestR,
    translationVector: bestT,
    alignedPairs,
    targetResidues,
    candResidues,
  };
}

/**
 * Transform all candidate atoms with rotation and translation matrix
 * and output superimposed PDB text
 */
export function generateSuperimposedPdb(
  candStructure: ParsedStructure,
  candChain: string,
  R: number[][],
  t: number[]
): string {
  const lines: string[] = [];
  lines.push('REMARK 200 SSBD_SUPERIMPOSED CANDIDATE STRUCTURE');
  lines.push(`REMARK 200 ROTATION MATRIX:`);
  lines.push(`REMARK 200   ${R[0].map(v => v.toFixed(6)).join('  ')}`);
  lines.push(`REMARK 200   ${R[1].map(v => v.toFixed(6)).join('  ')}`);
  lines.push(`REMARK 200   ${R[2].map(v => v.toFixed(6)).join('  ')}`);
  lines.push(`REMARK 200 TRANSLATION VECTOR: ${t.map(v => v.toFixed(4)).join('  ')}`);

  let serial = 1;
  const residues = candStructure.residuesByChain[candChain] || [];
  for (const res of residues) {
    for (const at of res.atoms) {
      const rx = R[0][0] * at.x + R[0][1] * at.y + R[0][2] * at.z + t[0];
      const ry = R[1][0] * at.x + R[1][1] * at.y + R[1][2] * at.z + t[1];
      const rz = R[2][0] * at.x + R[2][1] * at.y + R[2][2] * at.z + t[2];

      const namePadded = (at.name.length < 4 ? ' ' + at.name : at.name).padEnd(4);
      const resNamePadded = at.resName.padEnd(3);
      const serialStr = serial.toString().padStart(5);
      const resSeqStr = at.resSeq.toString().padStart(4);
      const cStr = candChain.substring(0, 1);
      const xStr = rx.toFixed(3).padStart(8);
      const yStr = ry.toFixed(3).padStart(8);
      const zStr = rz.toFixed(3).padStart(8);
      const occStr = (at.occupancy ?? 1.0).toFixed(2).padStart(6);
      const bStr = (at.tempFactor ?? 80.0).toFixed(2).padStart(6);
      const elemStr = (at.element || at.name[0]).padStart(2);

      const pdbLine = `ATOM  ${serialStr} ${namePadded} ${resNamePadded} ${cStr}${resSeqStr}    ${xStr}${yStr}${zStr}${occStr}${bStr}          ${elemStr}`;
      lines.push(pdbLine);
      serial++;
    }
  }
  lines.push('TER');
  lines.push('END');

  return lines.join('\n');
}

/**
 * Extract contact residues between antigen and antibody chains in complex
 * (distance <= cutoff, default 4.5 Angstrom)
 */
export function extractComplexContacts(
  structure: ParsedStructure,
  antigenChain: string,
  antibodyChains: string[],
  cutoff = 4.5
): (number | string)[] {
  const agResidues = structure.residuesByChain[antigenChain] || [];
  const abAtoms: Atom[] = [];

  for (const abChain of antibodyChains) {
    const list = structure.residuesByChain[abChain] || [];
    for (const r of list) {
      abAtoms.push(...r.atoms);
    }
  }

  if (agResidues.length === 0 || abAtoms.length === 0) {
    return [];
  }

  const contactResKeys = new Set<string>();
  const cutoffSq = cutoff * cutoff;

  for (const agRes of agResidues) {
    let isContact = false;
    for (const agAtom of agRes.atoms) {
      for (const abAtom of abAtoms) {
        const dx = agAtom.x - abAtom.x;
        const dy = agAtom.y - abAtom.y;
        const dz = agAtom.z - abAtom.z;
        if (dx * dx + dy * dy + dz * dz <= cutoffSq) {
          contactResKeys.add(agRes.resKey || getResidueKey(agRes.resSeq, agRes.iCode));
          isContact = true;
          break;
        }
      }
      if (isContact) break;
    }
  }

  return agResidues
    .filter(r => contactResKeys.has(r.resKey || getResidueKey(r.resSeq, r.iCode)))
    .map(r => r.resKey || getResidueKey(r.resSeq, r.iCode));
}

/**
 * Parse manual residue ranges such as "330-520, 614, 484, 100A"
 */
export function parseResidueRange(input: string): (number | string)[] {
  const result: (number | string)[] = [];
  const resultSet = new Set<string>();
  const parts = input.split(/[,;\s]+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const [low, high] = start <= end ? [start, end] : [end, start];
        for (let r = low; r <= high; r++) {
          if (!resultSet.has(r.toString())) {
            resultSet.add(r.toString());
            result.push(r);
          }
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num.toString() === trimmed) {
        if (!resultSet.has(num.toString())) {
          resultSet.add(num.toString());
          result.push(num);
        }
      } else {
        if (!resultSet.has(trimmed)) {
          resultSet.add(trimmed);
          result.push(trimmed);
        }
      }
    }
  }
  return result;
}

/**
 * Score calculation according to Section 6:
 * S_global: TM-score (0~1)
 * S_epi: mean(1 / (1 + (d_i / 3.0)^2)) for epitope residues (0~1)
 * S_exp: 1 - mean(|RSA_cand - RSA_target|) for epitope residues (0~1)
 * S_conf: fraction of epitope residues with pLDDT >= 70 (0~1)
 * final_score: round(100 * (w[0]*S_global + w[1]*S_epi + w[2]*S_exp + w[3]*S_conf), 2)
 */
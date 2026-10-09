/**
 * Utility functions to apply coordinate transformations on PDB text for validation experiments
 * using real 3D biological structure data.
 */

export function applyNoiseToPdb(pdbText: string, noiseSigma: number): string {
  if (noiseSigma <= 0) return pdbText;

  const lines = pdbText.split('\n');
  const resultLines: string[] = [];
  let index = 0;

  for (const line of lines) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const xStr = line.substring(30, 38);
      const yStr = line.substring(38, 46);
      const zStr = line.substring(46, 54);

      let x = parseFloat(xStr);
      let y = parseFloat(yStr);
      let z = parseFloat(zStr);

      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        // Deterministic noise based on atom index and noiseSigma
        const nx = Math.sin(index * 1.7 + 0.5) * noiseSigma;
        const ny = Math.cos(index * 2.3 + 1.1) * noiseSigma;
        const nz = Math.sin(index * 3.1 + 2.7) * noiseSigma;

        x += nx;
        y += ny;
        z += nz;

        const newXStr = x.toFixed(3).padStart(8);
        const newYStr = y.toFixed(3).padStart(8);
        const newZStr = z.toFixed(3).padStart(8);

        const newLine = line.substring(0, 30) + newXStr + newYStr + newZStr + line.substring(54);
        resultLines.push(newLine);
        index++;
        continue;
      }
    }
    resultLines.push(line);
  }

  return resultLines.join('\n');
}

export function applyRigidTransformToPdb(
  pdbText: string,
  translation: [number, number, number],
  angleDegrees = 45
): string {
  const lines = pdbText.split('\n');
  const resultLines: string[] = [];

  const rad = (angleDegrees * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  for (const line of lines) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const xStr = line.substring(30, 38);
      const yStr = line.substring(38, 46);
      const zStr = line.substring(46, 54);

      let x = parseFloat(xStr);
      let y = parseFloat(yStr);
      let z = parseFloat(zStr);

      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        // Rotate around Z axis
        const rx = x * cosA - y * sinA;
        const ry = x * sinA + y * cosA;
        const rz = z;

        // Apply translation
        const tx = rx + translation[0];
        const ty = ry + translation[1];
        const tz = rz + translation[2];

        const newXStr = tx.toFixed(3).padStart(8);
        const newYStr = ty.toFixed(3).padStart(8);
        const newZStr = tz.toFixed(3).padStart(8);

        const newLine = line.substring(0, 30) + newXStr + newYStr + newZStr + line.substring(54);
        resultLines.push(newLine);
        continue;
      }
    }
    resultLines.push(line);
  }

  return resultLines.join('\n');
}

export function truncatePdbResidues(pdbText: string, maxResidues: number): string {
  const lines = pdbText.split('\n');
  const resultLines: string[] = [];
  const seenResidues = new Set<string>();

  for (const line of lines) {
    if (line.startsWith('ATOM') || line.startsWith('HETATM')) {
      const chain = line.length > 21 ? line[21] : 'A';
      const resSeqStr = line.length >= 26 ? line.substring(22, 26).trim() : '1';
      const key = `${chain}:${resSeqStr}`;

      if (!seenResidues.has(key)) {
        if (seenResidues.size >= maxResidues) {
          continue; // Skip atoms beyond maxResidues limit
        }
        seenResidues.add(key);
      }
      resultLines.push(line);
    } else if (line.startsWith('TER') || line.startsWith('END')) {
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}

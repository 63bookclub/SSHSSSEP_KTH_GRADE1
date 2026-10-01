import { parentPort, workerData } from 'worker_threads';
import {
  alignStructures,
  evaluateAntigenicMimicry,
  generateSuperimposedPdb,
} from './bioAlgorithms.ts';

if (parentPort && workerData) {
  try {
    const {
      targetResidues,
      candResidues,
      epitopeResidues,
      isExperimentalCandidate,
      customWeights,
      epitopeMethod,
      targetChain,
      candidateStructure,
      candidateChain,
    } = workerData;

    const alignment = alignStructures(targetResidues, candResidues);
    const evaluation = evaluateAntigenicMimicry(
      alignment,
      epitopeResidues,
      isExperimentalCandidate,
      customWeights,
      epitopeMethod,
      targetChain
    );

    const alignedPdb = generateSuperimposedPdb(
      candidateStructure,
      candidateChain,
      alignment.rotationMatrix,
      alignment.translationVector
    );

    parentPort.postMessage({
      success: true,
      result: evaluation,
      alignedPdb,
    });
  } catch (err: any) {
    parentPort.postMessage({
      success: false,
      error: err?.message || 'worker computation error',
    });
  }
}

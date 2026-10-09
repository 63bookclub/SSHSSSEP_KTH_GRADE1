import {
  ParsedStructure,
  EvaluationResult,
  MultiEpitopeEntity,
  calculateSASA,
  alignStructures,
  evaluateAntigenicMimicry,
  generateSuperimposedPdb,
  parseResidueRange,
} from './bioAlgorithms.ts';
import { resolveTargetChain, resolveCandidateChain } from './chainService.ts';
import { resolveEpitopeInput } from './epitopeService.ts';
import { validateAndNormalizeWeights } from '../utils/validation.ts';

export interface EvaluationPipelineOptions {
  targetStructure: ParsedStructure;
  candidateStructure: ParsedStructure;
  targetChainReq?: string;
  candidateChainReq?: string;
  epitopeRangeReq?: string;
  multiEpitopesReq?: MultiEpitopeEntity[];
  weightsReq?: number[];
  isExperimentalCandidate?: boolean;
  candidateSource?: 'experimental' | 'alphafold' | 'esmfold' | 'simulated';
  isSimulatedCandidate?: boolean;
  filenameHint?: string;
}

export interface EvaluationPipelineResult {
  targetChain: string;
  candidateChain: string;
  epitopeResidues: (number | string)[];
  isTemporaryEpitope: boolean;
  epitopeMethod: string;
  normWeights: [number, number, number, number];
  alignment: any;
  evaluation: EvaluationResult;
  alignedPdb: string;
}

/**
 * Shared evaluation pipeline that encapsulates chain resolution, epitope determination,
 * SASA calculation, structure alignment, scoring, and PDB superimposition.
 */
export async function runEvaluationPipeline(
  options: EvaluationPipelineOptions
): Promise<EvaluationPipelineResult> {
  const {
    targetStructure,
    candidateStructure,
    targetChainReq,
    candidateChainReq,
    epitopeRangeReq,
    multiEpitopesReq,
    weightsReq,
    isExperimentalCandidate = false,
    candidateSource = 'esmfold',
    isSimulatedCandidate = false,
    filenameHint,
  } = options;

  // 1. Resolve Chains
  const targetChain = resolveTargetChain(targetStructure.chains, targetChainReq);
  const candidateChain = resolveCandidateChain(candidateStructure.chains, candidateChainReq, filenameHint);

  // 2. Resolve Epitope
  let epitopeResidues: (number | string)[] = [];
  let isTemporaryEpitope = false;
  let epitopeMethod = 'manual';
  let multiEpitopes: MultiEpitopeEntity[] | undefined = undefined;

  if (multiEpitopesReq && Array.isArray(multiEpitopesReq) && multiEpitopesReq.length > 0) {
    multiEpitopes = multiEpitopesReq;
    multiEpitopesReq.forEach(ep => {
      const resList = ep.residues && ep.residues.length > 0 ? ep.residues : parseResidueRange(ep.range);
      epitopeResidues.push(...resList);
    });
    epitopeResidues = Array.from(new Set(epitopeResidues)).sort((a, b) =>
      String(a).localeCompare(String(b), undefined, { numeric: true })
    );
  } else if (epitopeRangeReq && epitopeRangeReq.trim().length > 0) {
    const epRes = await resolveEpitopeInput({
      targetStructure,
      targetChain,
      method: 'manual',
      manualRange: epitopeRangeReq,
      allowTemporaryFallback: false,
    });
    epitopeResidues = epRes.residues;
    isTemporaryEpitope = epRes.isTemporary;
    epitopeMethod = epRes.method;
  } else {
    const epRes = await resolveEpitopeInput({
      targetStructure,
      targetChain,
      method: 'temporary_rsa',
    });
    epitopeResidues = epRes.residues;
    isTemporaryEpitope = epRes.isTemporary;
    epitopeMethod = epRes.method;
  }

  // 3. Ensure SASA calculation for target and candidate chains
  const targetResList = targetStructure.residuesByChain[targetChain] || [];
  const allTargetResidues = Object.values(targetStructure.residuesByChain).flat();
  if (targetResList.length > 0) {
    calculateSASA(targetResList, 1.4, 96, allTargetResidues);
  }

  const candResList = candidateStructure.residuesByChain[candidateChain] || [];
  const allCandResidues = Object.values(candidateStructure.residuesByChain).flat();
  if (candResList.length > 0) {
    calculateSASA(candResList, 1.4, 96, allCandResidues);
  }

  // 4. Validate & Normalize Weights
  const weightVal = validateAndNormalizeWeights(weightsReq);
  const normWeights = weightVal.normalizedWeights;

  // 5. Align Structures
  const alignment = alignStructures(
    targetResList,
    candResList
  );

  // 6. Evaluate Antigenic Mimicry
  const evaluation = evaluateAntigenicMimicry(
    alignment,
    epitopeResidues,
    isExperimentalCandidate,
    normWeights,
    epitopeMethod as any,
    targetChain,
    multiEpitopes
  );

  // 7. Generate Superimposed PDB
  const alignedPdb = generateSuperimposedPdb(
    candidateStructure,
    candidateChain,
    alignment.rotationMatrix,
    alignment.translationVector
  );

  return {
    targetChain,
    candidateChain,
    epitopeResidues,
    isTemporaryEpitope,
    epitopeMethod,
    normWeights,
    alignment,
    evaluation,
    alignedPdb,
  };
}

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import {
  alignStructures,
  generateSuperimposedPdb,
  parseResidueRange,
  evaluateAntigenicMimicry,
  ParsedStructure,
  EvaluationResult,
  MultiEpitopeEntity,
} from './src/services/bioAlgorithms.ts';
import { resolveEpitopeInput } from './src/services/epitopeService.ts';
import { PRESET_BENCHMARKS } from './src/services/presets.ts';
import { generateAiInsight, AiInsightRequest } from './src/services/aiServerService.ts';
import {
  validateAndNormalizeWeights,
} from './src/utils/validation.ts';
import { resolveTargetChain, resolveCandidateChain } from './src/services/chainService.ts';
import {
  MAX_BODY_PAYLOAD_SIZE,
  checkBatchCandidatesLimit,
} from './src/utils/limits.ts';
import { handleApiError } from './src/utils/errorHandler.ts';
import { loadTargetStructure } from './src/services/targetLoaderService.ts';
import { loadCandidateStructure } from './src/services/candidateLoaderService.ts';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false,
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS 정책에 의해 허용되지 않은 출처입니다.'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: MAX_BODY_PAYLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY_PAYLOAD_SIZE }));

// In-memory persistent stores for sessions/jobs
interface StoredTarget {
  id: string;
  sourceType: 'uniprot' | 'pdb' | 'file';
  identifier: string;
  structure: ParsedStructure;
  chains: string[];
  chainResidueCounts: Record<string, number>;
  createdAtMs: number;
}

interface StoredCandidate {
  id: string;
  sourceType: 'fasta' | 'sequence' | 'pdb';
  identifier: string;
  sequence?: string;
  structure: ParsedStructure;
  isExperimental: boolean;
  candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated';
  isSimulated: boolean;
  chain: string;
  createdAtMs: number;
}

interface StoredEpitope {
  id: string;
  targetId: string;
  method: 'manual' | 'complex' | 'prediction_csv' | 'temporary_rsa_fallback';
  residues: (number | string)[];
  isTemporary: boolean;
  createdAtMs: number;
}

interface StoredJob {
  id: string;
  targetId: string;
  candidateId: string;
  epitopeId: string;
  targetChain: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  error?: string;
  result?: EvaluationResult;
  alignedPdb?: string;
  createdAt: string;
  createdAtMs: number;
}

const targetsStore = new Map<string, StoredTarget>();
const candidatesStore = new Map<string, StoredCandidate>();
const epitopesStore = new Map<string, StoredEpitope>();
const jobsStore = new Map<string, StoredJob>();

// TTL and Memory Cleanup configuration (TTL = 1 hour)
const STORE_TTL_MS = 60 * 60 * 1000;

export function cleanupExpiredStores(now = Date.now(), ttlMs = STORE_TTL_MS) {
  let deletedCount = 0;
  for (const [id, item] of targetsStore.entries()) {
    if (now - item.createdAtMs > ttlMs) {
      targetsStore.delete(id);
      deletedCount++;
    }
  }
  for (const [id, item] of candidatesStore.entries()) {
    if (now - item.createdAtMs > ttlMs) {
      candidatesStore.delete(id);
      deletedCount++;
    }
  }
  for (const [id, item] of epitopesStore.entries()) {
    if (now - item.createdAtMs > ttlMs) {
      epitopesStore.delete(id);
      deletedCount++;
    }
  }
  for (const [id, item] of jobsStore.entries()) {
    if (now - item.createdAtMs > ttlMs) {
      jobsStore.delete(id);
      deletedCount++;
    }
  }
  return deletedCount;
}

// Periodically run store cleanup every 5 minutes
const cleanupInterval = setInterval(() => {
  cleanupExpiredStores();
}, 5 * 60 * 1000);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

// -------------------------------------------------------------
// REST API v1 Endpoints
// -------------------------------------------------------------

// 1. Presets endpoint
app.get('/api/v1/presets', (_req, res) => {
  res.json({ presets: PRESET_BENCHMARKS });
});

// 2. POST /api/v1/targets
app.post('/api/v1/targets', async (req, res) => {
  try {
    const loadedTarget = await loadTargetStructure(req.body);
    const targetId = 'tgt_' + crypto.randomUUID();

    targetsStore.set(targetId, {
      id: targetId,
      sourceType: loadedTarget.sourceType,
      identifier: loadedTarget.identifier,
      structure: loadedTarget.structure,
      chains: loadedTarget.chains,
      chainResidueCounts: loadedTarget.chainResidueCounts,
      createdAtMs: Date.now(),
    });

    res.json({
      target_id: targetId,
      source_type: loadedTarget.sourceType,
      identifier: loadedTarget.identifier,
      chains: loadedTarget.chains,
      chain_residue_counts: loadedTarget.chainResidueCounts,
      total_atoms: loadedTarget.totalAtoms,
      sample_pdb: loadedTarget.structure.rawPdb,
    });
  } catch (err: any) {
    handleApiError(res, err, '타겟 구조 처리 중 오류가 발생했습니다.', 400);
  }
});

// 3. POST /api/v1/epitopes
app.post('/api/v1/epitopes', async (req, res) => {
  try {
    const {
      target_id,
      target_chain: reqTargetChain,
      method = 'manual',
      manual_range,
      complex_pdb_id,
      antigen_chain,
      antibody_chains,
      prediction_csv_text,
      threshold = 0.5,
      combination_mode = 'union',
      additional_ranges,
      allow_temporary_fallback = false,
    } = req.body;

    const target = targetsStore.get(target_id);
    if (!target) {
      return res.status(404).json({ error: '지정된 target_id를 찾을 수 없습니다.' });
    }

    let targetChain = '';
    try {
      targetChain = resolveTargetChain(target.chains, reqTargetChain);
    } catch (chainErr: any) {
      return res.status(400).json({ error: chainErr.message });
    }

    const epitopeResult = await resolveEpitopeInput({
      targetStructure: target.structure,
      targetChain: targetChain,
      method,
      manualRange: manual_range,
      complexPdbId: complex_pdb_id,
      antigenChain: antigen_chain,
      antibodyChains: antibody_chains,
      predictionCsvText: prediction_csv_text,
      threshold: typeof threshold === 'number' ? threshold : parseFloat(threshold) || 0.5,
      combinationMode: combination_mode,
      additionalRanges: additional_ranges,
      allowTemporaryFallback: !!allow_temporary_fallback,
      targetIdentifier: target.identifier,
    });

    const epitopeId = 'epi_' + crypto.randomUUID();
    epitopesStore.set(epitopeId, {
      id: epitopeId,
      targetId: target_id,
      method: epitopeResult.method,
      residues: epitopeResult.residues,
      isTemporary: epitopeResult.isTemporary,
      createdAtMs: Date.now(),
    });

    res.json({
      epitope_id: epitopeId,
      method: epitopeResult.method,
      is_temporary: epitopeResult.isTemporary,
      residues_count: epitopeResult.residues.length,
      residues: epitopeResult.residues,
      note: epitopeResult.note,
    });
  } catch (err: any) {
    handleApiError(res, err, '에피톱 처리 중 오류가 발생했습니다.', 400);
  }
});

// 4. POST /api/v1/candidates
app.post('/api/v1/candidates', async (req, res) => {
  try {
    const loadedCandidate = await loadCandidateStructure(req.body);
    const candidateId = 'cand_' + crypto.randomUUID();

    candidatesStore.set(candidateId, {
      id: candidateId,
      sourceType: loadedCandidate.sourceType,
      identifier: loadedCandidate.identifier,
      sequence: loadedCandidate.sequence,
      structure: loadedCandidate.structure,
      isExperimental: loadedCandidate.isExperimental,
      candidateSource: loadedCandidate.candidateSource,
      isSimulated: loadedCandidate.isSimulated,
      chain: loadedCandidate.chain,
      createdAtMs: Date.now(),
    });

    res.json({
      candidate_id: candidateId,
      source_type: loadedCandidate.sourceType,
      is_experimental: loadedCandidate.isExperimental,
      candidate_source: loadedCandidate.candidateSource,
      is_simulated: loadedCandidate.isSimulated,
      chain: loadedCandidate.chain,
      residues_count: loadedCandidate.residuesCount,
      sample_pdb: loadedCandidate.structure.rawPdb,
    });
  } catch (err: any) {
    handleApiError(res, err, '후보 물질 처리 중 오류가 발생했습니다.', 400);
  }
});

// 5. POST /api/v1/jobs
app.post('/api/v1/jobs', async (req, res) => {
  try {
    const { target_id, candidate_id, epitope_id, target_chain: reqTargetChain, candidate_chain: reqCandChain, weights } = req.body;

    const target = targetsStore.get(target_id);
    const candidate = candidatesStore.get(candidate_id);
    const epitope = epitopesStore.get(epitope_id);

    if (!target) return res.status(404).json({ error: '타겟 구조를 찾을 수 없습니다.' });
    if (!candidate) return res.status(404).json({ error: '후보 구조를 찾을 수 없습니다.' });
    if (!epitope) return res.status(404).json({ error: '에피톱 정보를 찾을 수 없습니다.' });

    let target_chain = '';
    try {
      target_chain = resolveTargetChain(target.chains, reqTargetChain);
    } catch (chainErr: any) {
      return res.status(400).json({ error: chainErr.message });
    }

    let candChain = '';
    try {
      candChain = resolveCandidateChain(candidate.structure.chains, reqCandChain || candidate.chain);
    } catch (chainErr: any) {
      return res.status(400).json({ error: chainErr.message });
    }

    const weightValidation = validateAndNormalizeWeights(weights);
    if (!weightValidation.isValid) {
      return res.status(400).json({ error: weightValidation.error });
    }
    const customWeights = weightValidation.normalizedWeights;

    const jobId = 'job_' + crypto.randomUUID();

    const targetResidues = target.structure.residuesByChain[target_chain] || Object.values(target.structure.residuesByChain)[0] || [];
    const candResidues = candidate.structure.residuesByChain[candChain] || Object.values(candidate.structure.residuesByChain)[0] || [];

    if (targetResidues.length === 0) {
      return res.status(400).json({ error: `타겟 체인 ${target_chain}에 잔기가 없습니다.` });
    }
    if (candResidues.length === 0) {
      return res.status(400).json({ error: `후보 물질에 잔기가 없습니다.` });
    }

    const jobRecord: StoredJob = {
      id: jobId,
      targetId: target_id,
      candidateId: candidate_id,
      epitopeId: epitope_id,
      targetChain: target_chain,
      status: 'queued',
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
    };
    jobsStore.set(jobId, jobRecord);

    const { Worker } = await import('worker_threads');
    const path = await import('path');
    const workerPath = path.join(process.cwd(), 'src/services/jobWorker.ts');

    const worker = new Worker(
      `
      require('tsx/cjs');
      require(${JSON.stringify(workerPath)});
      `,
      {
        eval: true,
        workerData: {
          targetResidues,
          candResidues,
          epitopeResidues: epitope.residues,
          isExperimentalCandidate: candidate.isExperimental,
          candidateSource: candidate.candidateSource,
          isSimulated: candidate.isSimulated,
          customWeights,
          epitopeMethod: epitope.method,
          targetChain: target_chain,
          candidateStructure: candidate.structure,
          candidateChain: candChain,
        },
      }
    );

    jobRecord.status = 'running';

    worker.on('message', (msg) => {
      if (msg.success) {
        jobRecord.status = 'done';
        jobRecord.result = msg.result;
        jobRecord.alignedPdb = msg.alignedPdb;
      } else {
        jobRecord.status = 'failed';
        jobRecord.error = msg.error || 'Worker thread computation failed.';
      }
      worker.terminate();
    });

    worker.on('error', (err) => {
      jobRecord.status = 'failed';
      jobRecord.error = err.message || 'Worker thread encountered an error.';
      worker.terminate();
    });

    res.json({
      job_id: jobId,
      status: 'queued',
    });
  } catch (err: any) {
    handleApiError(res, err, '작업 생성 및 실행 중 오류가 발생했습니다.', 500);
  }
});

// 6. GET /api/v1/jobs/:job_id
app.get('/api/v1/jobs/:job_id', (req, res) => {
  const { job_id } = req.params;
  const job = jobsStore.get(job_id);
  if (!job) {
    return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
  }

  if (job.status === 'failed') {
    return res.json({
      status: 'failed',
      error: job.error || '분석 중 실패가 발생했습니다.',
    });
  }

  if (job.status !== 'done' || !job.result) {
    return res.json({
      status: job.status,
      message: '분석이 진행 중입니다...',
    });
  }

  const align = (job.result.alignment || {}) as any;
  const auto = (job.result.autoSettings || {}) as any;
  const sub = (job.result.subScores || {}) as any;
  const candidate = candidatesStore.get(job.candidateId);

  const respData = {
    status: 'done',
    data: {
      auto_settings: {
        mode: auto.mode || 'full',
        epitope_source: auto.epitope_source || auto.epitopeSource || 'manual',
        target_chain: auto.target_chain || auto.targetChain || 'A',
        is_temporary_epitope: auto.is_temporary_epitope ?? auto.isTemporaryEpitope ?? false,
        is_experimental_candidate: auto.is_experimental_candidate ?? auto.isExperimentalCandidate ?? false,
        candidate_source: auto.candidate_source || auto.candidateSource || candidate?.candidateSource || 'experimental',
        is_simulated: auto.is_simulated ?? auto.isSimulated ?? candidate?.isSimulated ?? false,
      },
      alignment: {
        tm_score_target_norm: align.tm_score_target_norm ?? align.tmScoreTargetNorm ?? 0,
        tm_score_candidate_norm: align.tm_score_candidate_norm ?? align.tmScoreCandidateNorm ?? 0,
        rmsd: align.rmsd ?? 0,
        aligned_length: align.aligned_length ?? align.alignedLength ?? 0,
        coverage: align.coverage ?? 0,
      },
      sub_scores: {
        s_global: sub.s_global ?? sub.sGlobal ?? 0,
        s_epi: sub.s_epi ?? sub.sEpi ?? 0,
        s_exp: sub.s_exp ?? sub.sExp ?? 0,
        s_conf: sub.s_conf ?? sub.sConf ?? 0,
      },
      weights: job.result.weights,
      final_fitness_score: job.result.finalFitnessScore ?? 0,
      evaluation_rationale: job.result.evaluationRationale || '',
      residues: job.result.residues || [],
      reproducibility: job.result.reproducibility || {},
      aligned_pdb_download_url: `/api/v1/downloads/${job_id}/aligned.pdb`,
      aligned_candidate_pdb: job.alignedPdb || '',
      target_pdb: targetsStore.get(job.targetId)?.structure.rawPdb || '',
    },
  };

  res.json(respData);
});

// 7. POST /api/v1/quick-analyze
app.post('/api/v1/quick-analyze', async (req, res) => {
  try {
    const {
      target_input,
      candidate_input,
      target_chain: reqTargetChain,
      candidate_chain: reqCandidateChain,
      epitope_range,
      weights,
    } = req.body;

    if (!target_input || typeof target_input !== 'string' || !target_input.trim()) {
      return res.status(400).json({ error: '타겟(Target) 입력값이 필요합니다. (PDB ID, UniProt ID, 또는 서열)' });
    }
    if (!candidate_input || typeof candidate_input !== 'string' || !candidate_input.trim()) {
      return res.status(400).json({ error: '후보 물질(Candidate) 입력값이 필요합니다. (아미노산 서열 또는 PDB ID)' });
    }

    // 1. Resolve Target via targetLoaderService
    const loadedTarget = await loadTargetStructure({ target_input });
    const targetChain = resolveTargetChain(loadedTarget.chains, reqTargetChain);
    const targetResidues = loadedTarget.structure.residuesByChain[targetChain] || [];

    if (targetResidues.length === 0) {
      return res.status(400).json({ error: `타겟 체인 ${targetChain}에 분석 가능한 잔기가 없습니다.` });
    }

    const targetId = 'tgt_' + crypto.randomUUID();
    targetsStore.set(targetId, {
      id: targetId,
      sourceType: loadedTarget.sourceType,
      identifier: loadedTarget.identifier,
      structure: loadedTarget.structure,
      chains: loadedTarget.chains,
      chainResidueCounts: { [targetChain]: targetResidues.length },
      createdAtMs: Date.now(),
    });

    // 2. Resolve Epitope
    let epitopeResult;
    if (epitope_range && typeof epitope_range === 'string' && epitope_range.trim().length > 0) {
      epitopeResult = await resolveEpitopeInput({
        targetStructure: loadedTarget.structure,
        targetChain,
        method: 'manual',
        manualRange: epitope_range,
        allowTemporaryFallback: false,
      });
    } else {
      epitopeResult = await resolveEpitopeInput({
        targetStructure: loadedTarget.structure,
        targetChain,
        method: 'temporary_rsa',
      });
    }

    const epitopeResidueSeqs = epitopeResult.residues;
    const epitopeMethod = epitopeResult.method;

    const epitopeId = 'epi_' + crypto.randomUUID();
    epitopesStore.set(epitopeId, {
      id: epitopeId,
      targetId,
      method: epitopeMethod,
      residues: epitopeResidueSeqs,
      isTemporary: epitopeResult.isTemporary,
      createdAtMs: Date.now(),
    });

    // 3. Resolve Candidate via candidateLoaderService
    const loadedCandidate = await loadCandidateStructure({
      candidate_input,
      chain: reqCandidateChain,
      targetResiduesForThreading: targetResidues,
    });

    const candidateId = 'cand_' + crypto.randomUUID();
    candidatesStore.set(candidateId, {
      id: candidateId,
      identifier: loadedCandidate.identifier,
      sourceType: loadedCandidate.sourceType,
      sequence: loadedCandidate.sequence,
      structure: loadedCandidate.structure,
      isExperimental: loadedCandidate.isExperimental,
      candidateSource: loadedCandidate.candidateSource,
      isSimulated: loadedCandidate.isSimulated,
      chain: loadedCandidate.chain,
      createdAtMs: Date.now(),
    });

    const candResidues = loadedCandidate.structure.residuesByChain[loadedCandidate.chain] || [];

    // 4. Alignment & Antigenic Mimicry Evaluation
    const weightValidation = validateAndNormalizeWeights(weights);
    if (!weightValidation.isValid) {
      return res.status(400).json({ error: weightValidation.error });
    }
    const customWeights = weightValidation.normalizedWeights;

    const multiEpitopesList: MultiEpitopeEntity[] | undefined = Array.isArray(req.body.multi_epitopes)
      ? req.body.multi_epitopes
      : undefined;

    const alignment = alignStructures(targetResidues, candResidues);
    const evaluation = evaluateAntigenicMimicry(
      alignment,
      epitopeResidueSeqs,
      loadedCandidate.isExperimental,
      customWeights,
      epitopeMethod,
      targetChain,
      multiEpitopesList
    );

    const alignedPdb = generateSuperimposedPdb(
      loadedCandidate.structure,
      loadedCandidate.chain,
      alignment.rotationMatrix,
      alignment.translationVector
    );

    const jobId = 'job_' + crypto.randomUUID();
    const jobRecord: StoredJob = {
      id: jobId,
      targetId,
      candidateId,
      epitopeId,
      targetChain,
      status: 'done',
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
      result: evaluation,
      alignedPdb,
    };
    jobsStore.set(jobId, jobRecord);

    const sub = evaluation.subScores || {};
    const respData = {
      job_id: jobId,
      status: 'done',
      data: {
        auto_settings: {
          mode: evaluation.autoSettings.mode,
          epitope_source: evaluation.autoSettings.epitopeSource,
          target_chain: targetChain,
          is_temporary_epitope: epitopeMethod === 'temporary_rsa_fallback',
          is_experimental_candidate: loadedCandidate.isExperimental,
          candidate_source: loadedCandidate.candidateSource,
          is_simulated: loadedCandidate.isSimulated,
        },
        alignment: {
          tm_score_target_norm: evaluation.alignment.tmScoreTargetNorm,
          tm_score_candidate_norm: evaluation.alignment.tmScoreCandidateNorm,
          rmsd: evaluation.alignment.rmsd,
          aligned_length: evaluation.alignment.alignedLength,
          coverage: evaluation.alignment.coverage,
        },
        sub_scores: {
          s_global: sub.s_global ?? 0,
          s_epi: sub.s_epi ?? 0,
          s_exp: sub.s_exp ?? 0,
          s_conf: sub.s_conf ?? 0,
        },
        weights: evaluation.weights,
        final_fitness_score: evaluation.finalFitnessScore ?? 0,
        evaluation_rationale: evaluation.evaluationRationale || '',
        epitope_breakdown: evaluation.epitopeBreakdown,
        residues: evaluation.residues || [],
        reproducibility: evaluation.reproducibility || {},
        aligned_pdb_download_url: `/api/v1/downloads/${jobId}/aligned.pdb`,
        aligned_candidate_pdb: alignedPdb,
        target_pdb: loadedTarget.structure.rawPdb,
      },
    };

    res.json(respData);
  } catch (err: any) {
    handleApiError(res, err, '빠른 분석 처리 중 서버 오류가 발생했습니다.', 400);
  }
});

// 8. POST /api/v1/batch-analyze (Multi-Candidate Batch Screening & Leaderboard)
app.post('/api/v1/batch-analyze', async (req, res) => {
  try {
    const {
      target_input,
      target_chain: reqTargetChain,
      epitope_range,
      multi_epitopes,
      candidates,
      weights,
    } = req.body;

    if (!target_input || typeof target_input !== 'string') {
      return res.status(400).json({ error: '타겟 구조 입력(PDB/UniProt/구조 내용)이 필요합니다.' });
    }

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: '최소 1개 이상의 후보 물질(Candidate Entity)이 필요합니다.' });
    }

    const batchCandCheck = checkBatchCandidatesLimit(candidates.length);
    if (!batchCandCheck.isWithinLimit) {
      return res.status(400).json({ error: batchCandCheck.error });
    }

    // 1. Resolve Target via targetLoaderService
    const loadedTarget = await loadTargetStructure({ target_input });
    const targetChain = resolveTargetChain(loadedTarget.chains, reqTargetChain);
    const targetResidues = loadedTarget.structure.residuesByChain[targetChain] || Object.values(loadedTarget.structure.residuesByChain)[0] || [];

    const targetId = 'tgt_' + crypto.randomUUID();
    targetsStore.set(targetId, {
      id: targetId,
      identifier: loadedTarget.identifier,
      sourceType: loadedTarget.sourceType,
      structure: loadedTarget.structure,
      chains: loadedTarget.chains,
      chainResidueCounts: loadedTarget.chainResidueCounts,
      createdAtMs: Date.now(),
    });

    // 2. Resolve Epitope residues
    const multiEpitopesList: MultiEpitopeEntity[] | undefined = Array.isArray(multi_epitopes) && multi_epitopes.length > 0
      ? multi_epitopes
      : undefined;

    let epitopeResidueSeqs: (number | string)[] = [];
    let epitopeMethod: 'manual' | 'temporary_rsa_fallback' = 'manual';

    if (multiEpitopesList && multiEpitopesList.length > 0) {
      multiEpitopesList.forEach(ep => {
        const resList = ep.residues && ep.residues.length > 0 ? ep.residues : parseResidueRange(ep.range);
        epitopeResidueSeqs.push(...resList);
      });
      epitopeResidueSeqs = Array.from(new Set(epitopeResidueSeqs)).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    } else if (epitope_range && typeof epitope_range === 'string' && epitope_range.trim().length > 0) {
      const epRes = await resolveEpitopeInput({
        targetStructure: loadedTarget.structure,
        targetChain,
        method: 'manual',
        manualRange: epitope_range,
        allowTemporaryFallback: false,
      });
      epitopeResidueSeqs = epRes.residues;
      epitopeMethod = epRes.method as any;
    } else {
      const epRes = await resolveEpitopeInput({
        targetStructure: loadedTarget.structure,
        targetChain,
        method: 'temporary_rsa',
      });
      epitopeResidueSeqs = epRes.residues;
      epitopeMethod = 'temporary_rsa_fallback';
    }

    const weightValidation = validateAndNormalizeWeights(weights);
    if (!weightValidation.isValid) {
      return res.status(400).json({ error: weightValidation.error });
    }
    const customWeights = weightValidation.normalizedWeights;

    // 3. Evaluate each Candidate Entity via candidateLoaderService
    const results = [];

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const candId = cand.id || `cand_${i + 1}`;
      const candName = cand.name || `Candidate ${i + 1}`;

      try {
        const loadedCand = await loadCandidateStructure({
          candidate_input: cand.input,
          candidate_name: candName,
          chain: cand.chain,
          targetResiduesForThreading: targetResidues,
        });

        const candResidues = loadedCand.structure.residuesByChain[loadedCand.chain] || Object.values(loadedCand.structure.residuesByChain)[0] || [];

        const alignment = alignStructures(targetResidues, candResidues);
        const evaluation = evaluateAntigenicMimicry(
          alignment,
          epitopeResidueSeqs,
          loadedCand.isExperimental,
          customWeights,
          epitopeMethod,
          targetChain,
          multiEpitopesList
        );

        const alignedPdb = generateSuperimposedPdb(
          loadedCand.structure,
          loadedCand.chain,
          alignment.rotationMatrix,
          alignment.translationVector
        );

        const jobId = 'job_' + crypto.randomUUID();
        const jobRecord: StoredJob = {
          id: jobId,
          targetId,
          candidateId: candId,
          epitopeId: 'epi_batch',
          targetChain,
          status: 'done',
          createdAt: new Date().toISOString(),
          createdAtMs: Date.now(),
          result: evaluation,
          alignedPdb,
        };
        jobsStore.set(jobId, jobRecord);

        const sub = evaluation.subScores || {};
        results.push({
          candidate_id: candId,
          candidate_name: candName,
          job_id: jobId,
          status: 'done',
          data: {
            auto_settings: {
              mode: evaluation.autoSettings.mode,
              epitope_source: evaluation.autoSettings.epitopeSource,
              target_chain: targetChain,
              is_temporary_epitope: epitopeMethod === 'temporary_rsa_fallback',
              is_experimental_candidate: loadedCand.isExperimental,
              candidate_source: loadedCand.candidateSource,
              is_simulated: loadedCand.isSimulated,
            },
            alignment: {
              tm_score_target_norm: evaluation.alignment.tmScoreTargetNorm,
              tm_score_candidate_norm: evaluation.alignment.tmScoreCandidateNorm,
              rmsd: evaluation.alignment.rmsd,
              aligned_length: evaluation.alignment.alignedLength,
              coverage: evaluation.alignment.coverage,
            },
            sub_scores: {
              s_global: sub.s_global ?? 0,
              s_epi: sub.s_epi ?? 0,
              s_exp: sub.s_exp ?? 0,
              s_conf: sub.s_conf ?? 0,
            },
            weights: evaluation.weights,
            final_fitness_score: evaluation.finalFitnessScore ?? 0,
            evaluation_rationale: evaluation.evaluationRationale || '',
            epitope_breakdown: evaluation.epitopeBreakdown,
            residues: evaluation.residues || [],
            reproducibility: evaluation.reproducibility || {},
            aligned_pdb_download_url: `/api/v1/downloads/${jobId}/aligned.pdb`,
            aligned_candidate_pdb: alignedPdb,
            target_pdb: loadedTarget.structure.rawPdb,
          },
        });
      } catch (candErr: any) {
        results.push({
          candidate_id: candId,
          candidate_name: candName,
          status: 'failed',
          error: candErr.message || '후보 물질 분석 실패',
        });
      }
    }

    results.sort((a: any, b: any) => {
      const scoreA = a.data?.final_fitness_score ?? -1;
      const scoreB = b.data?.final_fitness_score ?? -1;
      return scoreB - scoreA;
    });

    res.json({
      target_pdb: loadedTarget.structure.rawPdb,
      chains: loadedTarget.chains,
      chain_residue_counts: loadedTarget.chainResidueCounts,
      epitopes: multiEpitopesList || [],
      results,
    });
  } catch (err: any) {
    handleApiError(res, err, '다중 후보 물질 배치 분석 중 서버 오류가 발생했습니다.', 500);
  }
});

// 9. GET /api/v1/downloads/:job_id/aligned.pdb
app.get('/api/v1/downloads/:job_id/aligned.pdb', (req, res) => {
  const { job_id } = req.params;
  const job = jobsStore.get(job_id);
  if (!job || !job.alignedPdb) {
    return res.status(404).send('정렬된 PDB 파일을 찾을 수 없습니다.');
  }

  res.setHeader('Content-Type', 'chemical/x-pdb');
  res.setHeader('Content-Disposition', `attachment; filename="aligned_${job_id}.pdb"`);
  res.send(job.alignedPdb);
});

// 10. POST /api/v1/ai-insights
app.post('/api/v1/ai-insights', async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id || typeof job_id !== 'string') {
      return res.status(400).json({ error: 'job_id가 누락되었거나 유효하지 않습니다.' });
    }

    const job = jobsStore.get(job_id);
    if (!job || !job.result) {
      return res.status(404).json({ error: '해당 job_id의 저장된 분석 결과를 찾을 수 없습니다.' });
    }

    const evalRes = job.result;
    const sub = (evalRes.subScores || {}) as any;
    const align = (evalRes.alignment || {}) as any;
    const auto = (evalRes.autoSettings || {}) as any;
    const candidate = candidatesStore.get(job.candidateId);
    const isExperimental = auto.isExperimentalCandidate ?? candidate?.isExperimental ?? false;

    const finalScore = evalRes.finalFitnessScore ?? 0;
    let grade = '낮음 (Low)';
    if (finalScore >= 75.0) grade = '높음 (High)';
    else if (finalScore >= 50.0) grade = '중간 (Moderate)';

    if (auto.isTemporaryEpitope) {
      grade += ' (임시 에피톱)';
    } else if (auto.isSimulated || candidate?.isSimulated) {
      grade += ' (모사 구조)';
    }

    const validatedData: AiInsightRequest = {
      job_id,
      finalScore,
      grade,
      subScores: {
        s_global: sub.s_global ?? sub.sGlobal ?? 0,
        s_epi: sub.s_epi ?? sub.sEpi ?? 0,
        s_exp: sub.s_exp ?? sub.sExp ?? 0,
        s_conf: isExperimental ? null : (sub.s_conf ?? sub.sConf ?? 0),
      },
      alignment: {
        tm_score_target_norm: align.tm_score_target_norm ?? align.tmScoreTargetNorm ?? 0,
        tm_score_candidate_norm: align.tm_score_candidate_norm ?? align.tmScoreCandidateNorm ?? 0,
        rmsd: align.rmsd ?? 0,
        aligned_length: align.aligned_length ?? align.alignedLength ?? 0,
        coverage: align.coverage ?? 0,
      },
      autoSettings: {
        mode: auto.mode || 'full',
        target_chain: job.targetChain || auto.target_chain || auto.targetChain || 'A',
        epitope_source: auto.epitope_source || auto.epitopeSource || 'manual',
      },
    };

    const insightText = await generateAiInsight(validatedData);
    res.json({ insight: insightText });
  } catch (err: any) {
    handleApiError(res, err, 'AI 리포트 생성 중 오류가 발생했습니다.', 500);
  }
});

// Serve public assets (including local 3Dmol-min.js)
app.use(express.static('public'));

// Vite middleware mounting in development
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, () => {
    console.log(`2026 SSEP_TEAM SSBD(씁뜩) Server running on port ${PORT}`);
  });
}

startServer();

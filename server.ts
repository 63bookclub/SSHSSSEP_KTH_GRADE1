import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import {
  parsePdb,
  parseMmcif,
  calculateSASA,
  ParsedStructure,
  EvaluationResult,
  MultiEpitopeEntity,
  evaluateAntigenicMimicry,
  alignStructures,
  generateSuperimposedPdb,
} from './src/services/bioAlgorithms.ts';
import { mapComplexResiduesToTarget } from './src/services/siftsService.ts';
import { resolveEpitopeInput } from './src/services/epitopeService.ts';
import { PRESET_BENCHMARKS } from './src/services/presets.ts';
import { generateAiInsight, AiInsightRequest } from './src/services/aiServerService.ts';
import {
  validateAndNormalizeWeights,
} from './src/utils/validation.ts';
import { resolveTargetChain, resolveCandidateChain } from './src/services/chainService.ts';
import {
  loadTargetStructure,
  loadTargetFromInputString,
  loadCandidateStructure,
  loadCandidateFromInputString,
} from './src/services/structureLoader.ts';
import { runEvaluationPipeline } from './src/services/evaluationPipeline.ts';
import {
  MAX_BODY_PAYLOAD_SIZE,
  checkBatchCandidatesLimit,
} from './src/utils/limits.ts';
import { handleApiError } from './src/utils/errorHandler.ts';

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

// Helper to fetch from external API with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 12000): Promise<Response> {
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

// -------------------------------------------------------------
// REST API v1 Endpoints (as defined in Section 8)
// -------------------------------------------------------------

// 1. Presets endpoint
app.get('/api/v1/presets', (_req, res) => {
  res.json({ presets: PRESET_BENCHMARKS });
});

// 2. POST /api/v1/targets
app.post('/api/v1/targets', async (req, res) => {
  try {
    const loaded = await loadTargetStructure(req.body);

    const targetId = 'tgt_' + crypto.randomUUID();
    const chainResidueCounts: Record<string, number> = {};
    for (const c of loaded.structure.chains) {
      chainResidueCounts[c] = (loaded.structure.residuesByChain[c] || []).length;
    }

    targetsStore.set(targetId, {
      id: targetId,
      sourceType: loaded.sourceType,
      identifier: loaded.identifier,
      structure: loaded.structure,
      chains: loaded.structure.chains,
      chainResidueCounts,
      createdAtMs: Date.now(),
    });

    res.json({
      target_id: targetId,
      source_type: loaded.sourceType,
      identifier: loaded.identifier,
      chains: loaded.structure.chains,
      chain_residue_counts: chainResidueCounts,
      total_atoms: loaded.structure.allAtoms.length,
      sample_pdb: loaded.structure.rawPdb,
    });
  } catch (err: any) {
    handleApiError(res, err, '타겟 구조 처리 중 오류가 발생했습니다.', 500);
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
      combination_mode = 'union', // 'single' | 'union' | 'intersect'
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
    const { filename, chain: reqChain } = req.body;
    const loaded = await loadCandidateStructure(req.body);

    let candChain = '';
    try {
      candChain = resolveCandidateChain(loaded.structure.chains, reqChain, filename);
    } catch (chainErr: any) {
      return res.status(400).json({ error: chainErr.message });
    }
    const resList = loaded.structure.residuesByChain[candChain] || [];
    const allCandResidues = Object.values(loaded.structure.residuesByChain).flat();
    if (resList.length > 0) {
      calculateSASA(resList, 1.4, 96, allCandResidues);
    }

    const candidateId = 'cand_' + crypto.randomUUID();
    candidatesStore.set(candidateId, {
      id: candidateId,
      sourceType: loaded.sourceType,
      identifier: loaded.identifier,
      sequence: loaded.sequence,
      structure: loaded.structure,
      isExperimental: loaded.isExperimental,
      candidateSource: loaded.candidateSource,
      isSimulated: loaded.isSimulated,
      chain: candChain,
      createdAtMs: Date.now(),
    });

    res.json({
      candidate_id: candidateId,
      source_type: loaded.sourceType,
      is_experimental: loaded.isExperimental,
      candidate_source: loaded.candidateSource,
      is_simulated: loaded.isSimulated,
      chain: candChain,
      residues_count: resList.length,
      sample_pdb: loaded.structure.rawPdb,
    });
  } catch (err: any) {
    handleApiError(res, err, '후보 물질 처리 중 오류가 발생했습니다.', 500);
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

    // Create queued job record
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

    // Offload CPU-heavy DP alignment & scoring to worker_threads
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

  // Format exactly adhering to Section 8.3
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

// 8. POST /api/v1/quick-analyze (Ultra-simple 2-input entrypoint)
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

    const loadedTarget = await loadTargetFromInputString(target_input);
    const loadedCandidate = await loadCandidateFromInputString(candidate_input);

    const pipelineResult = await runEvaluationPipeline({
      targetStructure: loadedTarget.structure,
      candidateStructure: loadedCandidate.structure,
      targetChainReq: reqTargetChain,
      candidateChainReq: reqCandidateChain,
      epitopeRangeReq: epitope_range,
      multiEpitopesReq: req.body.multi_epitopes,
      weightsReq: weights,
      isExperimentalCandidate: loadedCandidate.isExperimental,
      candidateSource: loadedCandidate.candidateSource,
      isSimulatedCandidate: loadedCandidate.isSimulated,
    });

    const targetId = 'tgt_' + crypto.randomUUID();
    targetsStore.set(targetId, {
      id: targetId,
      sourceType: loadedTarget.sourceType,
      identifier: loadedTarget.identifier,
      structure: loadedTarget.structure,
      chains: loadedTarget.structure.chains,
      chainResidueCounts: { [pipelineResult.targetChain]: (loadedTarget.structure.residuesByChain[pipelineResult.targetChain] || []).length },
      createdAtMs: Date.now(),
    });

    const epitopeId = 'epi_' + crypto.randomUUID();
    epitopesStore.set(epitopeId, {
      id: epitopeId,
      targetId,
      method: pipelineResult.epitopeMethod as any,
      residues: pipelineResult.epitopeResidues,
      isTemporary: pipelineResult.isTemporaryEpitope,
      createdAtMs: Date.now(),
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
      chain: pipelineResult.candidateChain,
      createdAtMs: Date.now(),
    });

    const { evaluation, alignedPdb, targetChain, candidateChain, epitopeResidues, normWeights, isTemporaryEpitope, epitopeMethod } = pipelineResult;

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
          is_temporary_epitope: isTemporaryEpitope,
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
    handleApiError(res, err, '빠른 분석 처리 중 서버 오류가 발생했습니다.', 500);
  }
});

// 6.5 POST /api/v1/batch-analyze (Multi-Candidate Batch Screening & Leaderboard)
app.post('/api/v1/batch-analyze', async (req, res) => {
  try {
    const {
      target_input,
      target_chain: reqTargetChain,
      epitope_range,
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

    const loadedTarget = await loadTargetFromInputString(target_input);

    const chainResidueCounts: Record<string, number> = {};
    for (const c of loadedTarget.structure.chains) {
      chainResidueCounts[c] = (loadedTarget.structure.residuesByChain[c] || []).length;
    }

    const targetId = 'tgt_' + crypto.randomUUID();
    targetsStore.set(targetId, {
      id: targetId,
      identifier: loadedTarget.identifier,
      sourceType: loadedTarget.sourceType,
      structure: loadedTarget.structure,
      chains: loadedTarget.structure.chains,
      chainResidueCounts,
      createdAtMs: Date.now(),
    });

    const results = [];
    let commonTargetChain = '';
    let commonEpitopeResCount = 0;
    let commonIsTempEpitope = false;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const candId = cand.id || `cand_${i + 1}`;
      const candName = cand.name || `Candidate ${i + 1}`;

      try {
        const loadedCand = await loadCandidateFromInputString(cand.input || '', i);
        const pipelineResult = await runEvaluationPipeline({
          targetStructure: loadedTarget.structure,
          candidateStructure: loadedCand.structure,
          targetChainReq: reqTargetChain,
          candidateChainReq: cand.chain,
          epitopeRangeReq: epitope_range,
          multiEpitopesReq: req.body.multi_epitopes,
          weightsReq: weights,
          isExperimentalCandidate: loadedCand.isExperimental,
          candidateSource: loadedCand.candidateSource,
          isSimulatedCandidate: loadedCand.isSimulated,
          filenameHint: candName,
        });

        commonTargetChain = pipelineResult.targetChain;
        commonEpitopeResCount = pipelineResult.epitopeResidues.length;
        commonIsTempEpitope = pipelineResult.isTemporaryEpitope;

        const jobId = 'job_' + crypto.randomUUID();
        const { evaluation, alignedPdb } = pipelineResult;
        const jobRecord: StoredJob = {
          id: jobId,
          targetId,
          candidateId: candId,
          epitopeId: 'epi_batch',
          targetChain: pipelineResult.targetChain,
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
              target_chain: pipelineResult.targetChain,
              is_temporary_epitope: pipelineResult.isTemporaryEpitope,
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

    // Sort results by final_fitness_score descending
    results.sort((a: any, b: any) => {
      const scoreA = a.data?.final_fitness_score ?? -1;
      const scoreB = b.data?.final_fitness_score ?? -1;
      return scoreB - scoreA;
    });

    res.json({
      target_pdb: loadedTarget.structure.rawPdb,
      chains: loadedTarget.structure.chains,
      chain_residue_counts: chainResidueCounts,
      epitopes: req.body.multi_epitopes || [],
      results,
    });
  } catch (err: any) {
    handleApiError(res, err, '다중 후보 물질 배치 분석 중 서버 오류가 발생했습니다.', 500);
  }
});

// 7. GET /api/v1/downloads/:job_id/aligned.pdb
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

// 8. POST /api/v1/ai-insights
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

    // Calculate dynamic grade from server-stored final score
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

import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  parsePdb,
  parseMmcif,
  calculateSASA,
  alignStructures,
  generateSuperimposedPdb,
  extractComplexContacts,
  parseResidueRange,
  evaluateAntigenicMimicry,
  threadSequenceOnTemplate,
  parseFastaInput,
  ParsedStructure,
  EvaluationResult,
  MultiEpitopeEntity,
  Residue,
  getResidueKey,
} from './src/services/bioAlgorithms.ts';
import { mapComplexResiduesToTarget } from './src/services/siftsService.ts';
import { resolveEpitopeInput } from './src/services/epitopeService.ts';
import { predictStructureWithESMFold } from './src/services/esmFoldService.ts';
import { PRESET_BENCHMARKS, generateAlphaHelixPdb } from './src/services/presets.ts';
import { generateAiInsight, AiInsightRequest } from './src/services/aiServerService.ts';
import {
  isValidPdbId,
  isValidUniprotId,
  validateAminoAcidSequence,
  validateAndNormalizeWeights,
} from './src/utils/validation.ts';
import { resolveTargetChain, resolveCandidateChain } from './src/services/chainService.ts';
import {
  MAX_BODY_PAYLOAD_SIZE,
  MAX_BATCH_CANDIDATES,
  MAX_STRUCTURE_ATOMS,
  checkAtomCountLimit,
  checkBatchCandidatesLimit,
} from './src/utils/limits.ts';
import { handleApiError } from './src/utils/errorHandler.ts';
import { securityHeadersMiddleware, corsMiddleware } from './src/utils/security.ts';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(securityHeadersMiddleware);
app.use(corsMiddleware);
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
    const { uniprot_id, pdb_id, raw_content, filename } = req.body;
    let structureText = '';
    let sourceType: 'uniprot' | 'pdb' | 'file' = 'file';
    let identifier = '';

    if (uniprot_id) {
      if (!isValidUniprotId(uniprot_id)) {
        return res.status(400).json({ error: `유효하지 않은 UniProt ID 형식입니다: '${uniprot_id}'.` });
      }
      sourceType = 'uniprot';
      identifier = uniprot_id.trim().toUpperCase();
      // Fetch prediction metadata from AlphaFold DB
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
        return res.status(400).json({
          error: `AlphaFold DB 조회 오류: ${afErr?.message || '구조를 불러올 수 없습니다.'}. PDB ID를 입력하거나 구조 파일을 업로드해 보세요.`,
        });
      }
    } else if (pdb_id) {
      if (!isValidPdbId(pdb_id)) {
        return res.status(400).json({ error: `유효하지 않은 PDB ID 형식입니다: '${pdb_id}'.` });
      }
      sourceType = 'pdb';
      identifier = pdb_id.trim().toUpperCase();
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
          // Fallback to .cif
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
        return res.status(400).json({
          error: `RCSB PDB 조회 실패: ${rcsbErr?.message || '해당 PDB ID를 찾지 못했습니다.'}. 네트워크 상태를 확인하거나 PDB 파일을 직접 업로드해 주세요.`,
        });
      }
    } else if (raw_content) {
      sourceType = 'file';
      identifier = filename || 'uploaded_structure';
      structureText = raw_content;
    } else {
      return res.status(400).json({ error: 'UniProt ID, PDB ID, 또는 구조 파일(raw_content) 중 하나를 제공해야 합니다.' });
    }

    // Parse structure (PDB or mmCIF)
    const structure = structureText.includes('_atom_site.')
      ? parseMmcif(structureText)
      : parsePdb(structureText);

    if (structure.chains.length === 0 || structure.allAtoms.length === 0) {
      return res.status(400).json({ error: '유효한 단백질 원자(ATOM) 좌표를 파싱하지 못했습니다. 표준 PDB/mmCIF 파일인지 확인해 주세요.' });
    }

    const atomLimitCheck = checkAtomCountLimit(structure.allAtoms.length);
    if (!atomLimitCheck.isWithinLimit) {
      return res.status(400).json({ error: atomLimitCheck.error });
    }

    // Calculate SASA for all chains in full assembly context
    const allAssemblyResidues = Object.values(structure.residuesByChain).flat();
    for (const chain of structure.chains) {
      const resList = structure.residuesByChain[chain] || [];
      if (resList.length > 0) {
        calculateSASA(resList, 1.4, 96, allAssemblyResidues);
      }
    }

    const targetId = 'tgt_' + crypto.randomUUID();
    const chainResidueCounts: Record<string, number> = {};
    for (const c of structure.chains) {
      chainResidueCounts[c] = (structure.residuesByChain[c] || []).length;
    }

    targetsStore.set(targetId, {
      id: targetId,
      sourceType,
      identifier,
      structure,
      chains: structure.chains,
      chainResidueCounts,
      createdAtMs: Date.now(),
    });

    res.json({
      target_id: targetId,
      source_type: sourceType,
      identifier,
      chains: structure.chains,
      chain_residue_counts: chainResidueCounts,
      total_atoms: structure.allAtoms.length,
      sample_pdb: structure.rawPdb,
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
    const { sequence, fasta_text, raw_pdb, filename, is_experimental, chain: reqChain } = req.body;
    let structureText = '';
    let parsedSeq = '';
    let isExperimental = !!is_experimental;
    let candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated' = isExperimental ? 'experimental' : 'esmfold';
    let isSimulated = false;
    let sourceType: 'fasta' | 'sequence' | 'pdb' = 'sequence';

    if (raw_pdb) {
      sourceType = 'pdb';
      structureText = raw_pdb;
      isExperimental = true;
      candidateSource = 'experimental';
      isSimulated = false;
    } else {
      // Sequence or FASTA input
      let rawInput = (fasta_text || sequence || '').trim();
      if (!rawInput) {
        return res.status(400).json({ error: '후보 물질의 서열(FASTA/단순 서열) 또는 3D 구조 파일(PDB)을 입력해야 합니다.' });
      }

      // Common sequence validation
      const seqVal = validateAminoAcidSequence(rawInput, { minLen: 5, maxLen: 600 });
      if (!seqVal.isValid) {
        return res.status(400).json({ error: seqVal.error });
      }
      parsedSeq = seqVal.sequence;

      // Use modular ESMFold service
      const esmResult = await predictStructureWithESMFold(rawInput);
      if (esmResult.success && esmResult.pdbText) {
        structureText = esmResult.pdbText;
        parsedSeq = esmResult.sequence || parsedSeq;
        candidateSource = 'esmfold';
        isSimulated = false;
      } else {
        return res.status(400).json({
          error: `ESMFold 예측 실패: ${esmResult.error || '구조 예측에 실패했습니다.'} 외부에서 예측한 PDB(ColabFold, AlphaFold Server 등)를 직접 업로드해 주세요.`,
        });
      }
    }

    const structure = structureText.includes('_atom_site.')
      ? parseMmcif(structureText)
      : parsePdb(structureText);

    if (structure.chains.length === 0) {
      return res.status(400).json({ error: '후보 물질 구조 파싱에 실패했습니다. 유효한 PDB 좌표인지 확인해 주세요.' });
    }

    const candAtomLimitCheck = checkAtomCountLimit(structure.allAtoms.length);
    if (!candAtomLimitCheck.isWithinLimit) {
      return res.status(400).json({ error: candAtomLimitCheck.error });
    }

    let candChain = '';
    try {
      candChain = resolveCandidateChain(structure.chains, reqChain, filename);
    } catch (chainErr: any) {
      return res.status(400).json({ error: chainErr.message });
    }
    const resList = structure.residuesByChain[candChain] || [];
    const allCandResidues = Object.values(structure.residuesByChain).flat();
    if (resList.length > 0) {
      calculateSASA(resList, 1.4, 96, allCandResidues);
    }

    const candidateId = 'cand_' + crypto.randomUUID();
    candidatesStore.set(candidateId, {
      id: candidateId,
      sourceType,
      identifier: filename || (parsedSeq ? `Seq-${parsedSeq.length}aa` : 'Candidate-PDB'),
      sequence: parsedSeq,
      structure,
      isExperimental,
      candidateSource,
      isSimulated,
      chain: candChain,
      createdAtMs: Date.now(),
    });

    res.json({
      candidate_id: candidateId,
      source_type: sourceType,
      is_experimental: isExperimental,
      candidate_source: candidateSource,
      is_simulated: isSimulated,
      chain: candChain,
      residues_count: resList.length,
      sample_pdb: structure.rawPdb,
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

    // --- 1. Resolve Target Structure ---
    let cleanTarget = target_input.trim();
    if (cleanTarget.startsWith('>')) {
      const records = parseFastaInput(cleanTarget);
      if (records.length > 1) {
        return res.status(400).json({
          error: '타겟 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.',
        });
      }
      cleanTarget = records[0]?.sequence || '';
    }

    let targetPdbText = '';
    let targetSourceType: 'pdb' | 'uniprot' | 'file' = 'pdb';
    let targetIdentifier = '';

    if (cleanTarget.startsWith('ATOM') || cleanTarget.startsWith('HEADER') || cleanTarget.includes('_atom_site.')) {
      targetPdbText = cleanTarget;
      targetSourceType = 'file';
      targetIdentifier = 'Custom_Target_PDB';
    } else if (isValidPdbId(cleanTarget)) {
      // PDB ID
      targetIdentifier = cleanTarget.toUpperCase();
      targetSourceType = 'pdb';
      try {
        const pdbRes = await fetchWithTimeout(`https://files.rcsb.org/download/${targetIdentifier}.pdb`);
        if (pdbRes.ok) {
          const txt = await pdbRes.text();
          if (!txt.trim().startsWith('<')) targetPdbText = txt;
        }
        if (!targetPdbText) {
          const cifRes = await fetchWithTimeout(`https://files.rcsb.org/download/${targetIdentifier}.cif`);
          if (cifRes.ok) {
            const txt = await cifRes.text();
            if (!txt.trim().startsWith('<')) targetPdbText = txt;
          }
        }
        if (!targetPdbText) throw new Error(`PDB ${targetIdentifier}를 찾을 수 없거나 유효하지 않은 응답을 받았습니다.`);
      } catch (err: any) {
        return res.status(400).json({ error: `RCSB PDB에서 ${targetIdentifier}를 가져올 수 없습니다: ${err.message || err}` });
      }
    } else if (isValidUniprotId(cleanTarget)) {
      // UniProt ID
      targetIdentifier = cleanTarget.toUpperCase();
      targetSourceType = 'uniprot';
      try {
        const afRes = await fetchWithTimeout(`https://alphafold.ebi.ac.uk/api/prediction/${targetIdentifier}`);
        if (!afRes.ok) return res.status(400).json({ error: `AlphaFold DB에서 UniProt ${targetIdentifier}를 찾을 수 없습니다.` });
        const meta = await afRes.json();
        const entry = Array.isArray(meta) ? meta[0] : meta;
        const pdbUrl = entry?.pdbUrl || entry?.cifUrl;
        if (!pdbUrl) return res.status(400).json({ error: 'AlphaFold 3D 구조 URL을 찾을 수 없습니다.' });
        const structRes = await fetchWithTimeout(pdbUrl);
        if (!structRes.ok) return res.status(400).json({ error: 'AlphaFold 구조 파일 다운로드에 실패했습니다.' });
        const txt = await structRes.text();
        if (txt.trim().startsWith('<')) return res.status(400).json({ error: 'AlphaFold 구조 파일이 HTML 오류 페이지입니다.' });
        targetPdbText = txt;
      } catch (afErr: any) {
        return res.status(400).json({ error: `AlphaFold DB 조회 실패 (${targetIdentifier}): ${afErr.message || afErr}` });
      }
    } else {
      return res.status(400).json({ error: '유효하지 않은 타겟 입력입니다. 타겟은 PDB/mmCIF 구조 파일, PDB ID 또는 UniProt ID만 지원됩니다.' });
    }

    const targetStructure = targetPdbText.includes('_atom_site.')
      ? parseMmcif(targetPdbText)
      : parsePdb(targetPdbText);

    if (targetStructure.chains.length === 0 || targetStructure.allAtoms.length === 0) {
      return res.status(400).json({ error: '유효한 타겟 단백질 원자(ATOM) 좌표를 파싱하지 못했습니다.' });
    }

    const targetAtomCheck = checkAtomCountLimit(targetStructure.allAtoms.length);
    if (!targetAtomCheck.isWithinLimit) {
      return res.status(400).json({ error: targetAtomCheck.error });
    }

    // Calculate SASA on target (in full assembly context across all chains)
    const allTargetAssemblyResidues = Object.values(targetStructure.residuesByChain).flat();
    for (const chain of targetStructure.chains) {
      const resList = targetStructure.residuesByChain[chain] || [];
      if (resList.length > 0) calculateSASA(resList, 1.4, 96, allTargetAssemblyResidues);
    }

    let targetChain = '';
    try {
      targetChain = resolveTargetChain(targetStructure.chains, reqTargetChain);
    } catch (chainErr: any) {
      return res.status(400).json({ error: chainErr.message });
    }

    const targetResidues = targetStructure.residuesByChain[targetChain] || [];
    if (targetResidues.length === 0) {
      return res.status(400).json({ error: `타겟 체인 ${targetChain}에 분석 가능한 잔기가 없습니다.` });
    }

    // Save target
    const targetId = 'tgt_' + crypto.randomUUID();
    targetsStore.set(targetId, {
      id: targetId,
      sourceType: targetSourceType,
      identifier: targetIdentifier,
      structure: targetStructure,
      chains: targetStructure.chains,
      chainResidueCounts: { [targetChain]: targetResidues.length },
      createdAtMs: Date.now(),
    });

    // --- 2. Resolve Epitope ---
    let epitopeResult;
    if (epitope_range && typeof epitope_range === 'string' && epitope_range.trim().length > 0) {
      epitopeResult = await resolveEpitopeInput({
        targetStructure,
        targetChain,
        method: 'manual',
        manualRange: epitope_range,
        allowTemporaryFallback: false,
      });
    } else {
      epitopeResult = await resolveEpitopeInput({
        targetStructure,
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

    // --- 3. Resolve Candidate Structure ---
    let cleanCandidate = candidate_input.trim();
    if (cleanCandidate.startsWith('>')) {
      const records = parseFastaInput(cleanCandidate);
      if (records.length > 1) {
        return res.status(400).json({
          error: '후보 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.',
        });
      }
      cleanCandidate = records[0]?.sequence || '';
    }

    let candStructure: ParsedStructure;
    let isCandExperimental = false;
    let candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated' = 'experimental';
    let isSimulated = false;
    let candChain = reqCandidateChain?.trim() || 'A';

    if (cleanCandidate.startsWith('ATOM') || cleanCandidate.startsWith('HEADER') || cleanCandidate.includes('_atom_site.')) {
      candStructure = cleanCandidate.includes('_atom_site.') ? parseMmcif(cleanCandidate) : parsePdb(cleanCandidate);
      isCandExperimental = true;
      candidateSource = 'experimental';
      isSimulated = false;
    } else if (isValidPdbId(cleanCandidate)) {
      const candId = cleanCandidate.toUpperCase();
      try {
        const r = await fetchWithTimeout(`https://files.rcsb.org/download/${candId}.pdb`);
        if (!r.ok) {
          throw new Error(`PDB ${candId} 다운로드 실패 (${r.status})`);
        }
        const txt = await r.text();
        if (txt.trim().startsWith('<')) {
          throw new Error(`PDB ${candId} 응답이 HTML 오류 페이지입니다.`);
        }
        candStructure = parsePdb(txt);
        isCandExperimental = true;
        candidateSource = 'experimental';
        isSimulated = false;
      } catch (err: any) {
        return res.status(400).json({
          error: `후보 PDB '${candId}'를 불러오지 못했습니다: ${err.message || err}`,
        });
      }
    } else {
      // Candidate is amino acid sequence: call ESMFold
      const seqVal = validateAminoAcidSequence(cleanCandidate, { minLen: 5, maxLen: 600 });
      if (!seqVal.isValid) {
        return res.status(400).json({ error: `후보 서열 오류: ${seqVal.error}` });
      }
      const esmResult = await predictStructureWithESMFold(cleanCandidate);
      if (esmResult.success && esmResult.parsedStructure) {
        candStructure = esmResult.parsedStructure;
        isCandExperimental = false;
        candidateSource = 'esmfold';
        isSimulated = false;
      } else {
        // Fallback: thread sequence on target template if compatible
        try {
          const threadedPdb = threadSequenceOnTemplate(seqVal.sequence, targetResidues, 'A');
          candStructure = parsePdb(threadedPdb);
          isCandExperimental = false;
          candidateSource = 'simulated';
          isSimulated = true;
        } catch (threadErr: any) {
          return res.status(400).json({
            error: `ESMFold 예측 연동 실패 (${esmResult.error || '응답 없음'}) 및 템플릿 모사 실패 (${threadErr.message}). 유효한 3D PDB 파일이나 PDB ID를 업로드해 주세요.`,
          });
        }
      }
    }

    try {
      candChain = resolveCandidateChain(candStructure.chains, reqCandidateChain);
    } catch (chainErr: any) {
      return res.status(400).json({ error: chainErr.message });
    }

    const candAtomCheck = checkAtomCountLimit(candStructure.allAtoms.length);
    if (!candAtomCheck.isWithinLimit) {
      return res.status(400).json({ error: candAtomCheck.error });
    }

    const candResidues = candStructure.residuesByChain[candChain] || Object.values(candStructure.residuesByChain)[0] || [];
    if (candResidues.length === 0) {
      return res.status(400).json({ error: '후보 물질 구조에서 잔기 좌표를 생성하지 못했습니다.' });
    }
    const allCandAssemblyResidues = Object.values(candStructure.residuesByChain).flat();
    calculateSASA(candResidues, 1.4, 96, allCandAssemblyResidues);

    const candidateId = 'cand_' + crypto.randomUUID();
    candidatesStore.set(candidateId, {
      id: candidateId,
      identifier: isCandExperimental ? 'Custom_Candidate_PDB' : 'Candidate_Sequence',
      sourceType: isCandExperimental ? 'pdb' : 'sequence',
      sequence: cleanCandidate.replace(/[^A-Za-z]/g, '').toUpperCase(),
      structure: candStructure,
      isExperimental: isCandExperimental,
      candidateSource,
      isSimulated,
      chain: candChain,
      createdAtMs: Date.now(),
    });

    // --- 4. Alignment & Antigenic Mimicry Evaluation ---
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
      isCandExperimental,
      customWeights,
      epitopeMethod,
      targetChain,
      multiEpitopesList
    );

    const alignedPdb = generateSuperimposedPdb(
      candStructure,
      candChain,
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
          is_experimental_candidate: isCandExperimental,
          candidate_source: candidateSource,
          is_simulated: isSimulated,
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
        target_pdb: targetStructure.rawPdb,
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

    // 1. Resolve Target
    let cleanTarget = target_input.trim();
    let targetStructure: ParsedStructure;
    let targetSourceType: 'pdb' | 'uniprot' | 'file' = 'pdb';
    let targetIdentifier = '';

    if (cleanTarget.startsWith('ATOM') || cleanTarget.startsWith('HEADER') || cleanTarget.includes('_atom_site.')) {
      targetStructure = cleanTarget.includes('_atom_site.') ? parseMmcif(cleanTarget) : parsePdb(cleanTarget);
      targetSourceType = 'file';
      targetIdentifier = 'Batch_Target_File';
    } else if (isValidPdbId(cleanTarget)) {
      const pdbId = cleanTarget.toUpperCase();
      targetIdentifier = pdbId;
      targetSourceType = 'pdb';
      try {
        const r = await fetchWithTimeout(`https://files.rcsb.org/download/${pdbId}.pdb`);
        let txt = '';
        if (r.ok) {
          const temp = await r.text();
          if (!temp.trim().startsWith('<')) txt = temp;
        }
        if (!txt) {
          const cifRes = await fetchWithTimeout(`https://files.rcsb.org/download/${pdbId}.cif`);
          if (cifRes.ok) {
            const temp = await cifRes.text();
            if (!temp.trim().startsWith('<')) txt = temp;
          }
        }
        if (!txt) {
          return res.status(400).json({ error: `RCSB PDB에서 타겟 구조 '${pdbId}'를 찾을 수 없거나 HTML 오류 응답을 받았습니다.` });
        }
        targetStructure = txt.includes('_atom_site.') ? parseMmcif(txt) : parsePdb(txt);
      } catch (err: any) {
        return res.status(400).json({ error: `RCSB PDB 타겟 조회 실패 (${pdbId}): ${err.message || err}` });
      }
    } else if (isValidUniprotId(cleanTarget)) {
      const uniprotId = cleanTarget.toUpperCase();
      targetIdentifier = uniprotId;
      targetSourceType = 'uniprot';
      try {
        const afRes = await fetchWithTimeout(`https://alphafold.ebi.ac.uk/api/prediction/${uniprotId}`);
        if (!afRes.ok) {
          return res.status(400).json({ error: `AlphaFold DB에서 해당 UniProt ID (${uniprotId})를 찾을 수 없습니다.` });
        }
        const metaData = await afRes.json();
        const entry = Array.isArray(metaData) ? metaData[0] : metaData;
        const fileUrl = entry?.cifUrl || entry?.pdbUrl;
        if (!fileUrl) {
          return res.status(400).json({ error: 'AlphaFold DB 결과에 구조 파일 URL이 포함되어 있지 않습니다.' });
        }

        const fileRes = await fetchWithTimeout(fileUrl);
        if (!fileRes.ok) {
          return res.status(400).json({ error: 'AlphaFold 구조 파일 다운로드 실패' });
        }
        const txt = await fileRes.text();
        if (txt.trim().startsWith('<')) {
          return res.status(400).json({ error: 'AlphaFold 구조 파일 응답이 HTML 오류 페이지입니다.' });
        }
        targetStructure = txt.includes('_atom_site.') ? parseMmcif(txt) : parsePdb(txt);
      } catch (err: any) {
        return res.status(400).json({ error: `AlphaFold DB 타겟 조회 실패 (${uniprotId}): ${err.message || err}` });
      }
    } else {
      return res.status(400).json({ error: '유효하지 않은 타겟 입력입니다. 타겟은 PDB/mmCIF 구조 파일, PDB ID 또는 UniProt ID만 지원됩니다.' });
    }

    const targetAtomCheck = checkAtomCountLimit(targetStructure.allAtoms.length);
    if (!targetAtomCheck.isWithinLimit) {
      return res.status(400).json({ error: targetAtomCheck.error });
    }

    let targetChain = '';
    try {
      targetChain = resolveTargetChain(targetStructure.chains, reqTargetChain);
    } catch (chainErr: any) {
      return res.status(400).json({ error: chainErr.message });
    }
    const targetResidues = targetStructure.residuesByChain[targetChain] || Object.values(targetStructure.residuesByChain)[0] || [];
    const allTargetBatchResidues = Object.values(targetStructure.residuesByChain).flat();
    calculateSASA(targetResidues, 1.4, 96, allTargetBatchResidues);

    const chainResidueCounts: Record<string, number> = {};
    for (const c of targetStructure.chains) {
      chainResidueCounts[c] = (targetStructure.residuesByChain[c] || []).length;
    }

    const targetId = 'tgt_' + crypto.randomUUID();
    targetsStore.set(targetId, {
      id: targetId,
      identifier: 'Batch_Target',
      sourceType: 'pdb',
      structure: targetStructure,
      chains: targetStructure.chains,
      chainResidueCounts,
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
        targetStructure,
        targetChain,
        method: 'manual',
        manualRange: epitope_range,
        allowTemporaryFallback: false,
      });
      epitopeResidueSeqs = epRes.residues;
      epitopeMethod = epRes.method as any;
    } else {
      const epRes = await resolveEpitopeInput({
        targetStructure,
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

    // 3. Evaluate each Candidate Entity
    const results = [];

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const candId = cand.id || `cand_${i + 1}`;
      const candName = cand.name || `Candidate ${i + 1}`;

      try {
        let cleanCand = (cand.input || '').trim();
        if (cleanCand.startsWith('>')) {
          const records = parseFastaInput(cleanCand);
          if (records.length > 1) {
            throw new Error(`후보 '${candName}' FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.`);
          }
          cleanCand = records[0]?.sequence || '';
        }

        let candStructure: ParsedStructure;
        let isCandExperimental = false;
        let candidateSource: 'experimental' | 'alphafold' | 'esmfold' | 'simulated' = 'experimental';
        let isSimulated = false;
        let candChain = cand.chain?.trim() || 'A';

        if (cleanCand.startsWith('ATOM') || cleanCand.startsWith('HEADER') || cleanCand.includes('_atom_site.')) {
          candStructure = cleanCand.includes('_atom_site.') ? parseMmcif(cleanCand) : parsePdb(cleanCand);
          isCandExperimental = true;
          candidateSource = 'experimental';
          isSimulated = false;
        } else if (isValidPdbId(cleanCand)) {
          const pId = cleanCand.toUpperCase();
          try {
            const r = await fetchWithTimeout(`https://files.rcsb.org/download/${pId}.pdb`);
            if (!r.ok) {
              throw new Error(`PDB ${pId} 다운로드 실패 (${r.status})`);
            }
            const txt = await r.text();
            if (txt.trim().startsWith('<')) {
              throw new Error(`PDB ${pId} 응답이 HTML 오류 페이지입니다.`);
            }
            candStructure = parsePdb(txt);
            isCandExperimental = true;
            candidateSource = 'experimental';
            isSimulated = false;
          } catch (err: any) {
            throw new Error(`후보 '${candName}' PDB '${pId}'를 불러오지 못했습니다: ${err.message || err}`);
          }
        } else {
          // Candidate is amino acid sequence: call ESMFold
          const seqVal = validateAminoAcidSequence(cleanCand, { minLen: 5, maxLen: 600 });
          if (!seqVal.isValid) {
            throw new Error(`후보 '${candName}' 서열 오류: ${seqVal.error}`);
          }
          const esmResult = await predictStructureWithESMFold(cleanCand);
          if (esmResult.success && esmResult.parsedStructure) {
            candStructure = esmResult.parsedStructure;
            isCandExperimental = false;
            candidateSource = 'esmfold';
            isSimulated = false;
          } else {
            // Fallback: thread sequence on target template
            try {
              const threadedPdb = threadSequenceOnTemplate(seqVal.sequence, targetResidues, 'A');
              candStructure = parsePdb(threadedPdb);
              isCandExperimental = false;
              candidateSource = 'simulated';
              isSimulated = true;
            } catch (threadErr: any) {
              throw new Error(`후보 '${candName}' ESMFold 예측 연동 실패 (${esmResult.error || '응답 없음'}) 및 템플릿 모사 실패 (${threadErr.message}).`);
            }
          }
        }

        const candAtomCheck = checkAtomCountLimit(candStructure.allAtoms.length);
        if (!candAtomCheck.isWithinLimit) {
          throw new Error(candAtomCheck.error);
        }

        try {
          candChain = resolveCandidateChain(candStructure.chains, cand.chain, candName);
        } catch (chainErr: any) {
          throw new Error(chainErr.message);
        }

        const candResidues = candStructure.residuesByChain[candChain] || Object.values(candStructure.residuesByChain)[0] || [];
        if (candResidues.length === 0) {
          throw new Error(`후보 '${candName}'에서 잔기 구조를 생성할 수 없습니다.`);
        }
        const allCandBatchResidues = Object.values(candStructure.residuesByChain).flat();
        calculateSASA(candResidues, 1.4, 96, allCandBatchResidues);

        const alignment = alignStructures(targetResidues, candResidues);
        const evaluation = evaluateAntigenicMimicry(
          alignment,
          epitopeResidueSeqs,
          isCandExperimental,
          customWeights,
          epitopeMethod,
          targetChain,
          multiEpitopesList
        );

        const alignedPdb = generateSuperimposedPdb(
          candStructure,
          candChain,
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
              is_experimental_candidate: isCandExperimental,
                candidate_source: candidateSource,
                is_simulated: isSimulated,
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
            target_pdb: targetStructure.rawPdb,
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
      target_pdb: targetStructure.rawPdb,
      chains: targetStructure.chains,
      chain_residue_counts: chainResidueCounts,
      epitopes: multiEpitopesList || [],
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

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
import { predictStructureWithESMFold } from './src/services/esmFoldService.ts';
import { PRESET_BENCHMARKS, generateAlphaHelixPdb } from './src/services/presets.ts';
import { generateAiInsight, AiInsightRequest } from './src/services/aiServerService.ts';
import {
  isValidPdbId,
  isValidUniprotId,
  validateAminoAcidSequence,
  validateAndNormalizeWeights,
} from './src/utils/validation.ts';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

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
        structureText = await fileRes.text();
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
          structureText = await rcsbRes.text();
        } else {
          // Fallback to .cif
          const cifUrl = `https://files.rcsb.org/download/${identifier}.cif`;
          const cifRes = await fetchWithTimeout(cifUrl);
          if (cifRes.ok) {
            structureText = await cifRes.text();
          } else {
            throw new Error(`RCSB PDB에서 ${identifier}를 다운로드할 수 없습니다.`);
          }
        }
      } catch (rcsbErr: any) {
        // If known preset, load preset backbone
        const preset = PRESET_BENCHMARKS.find(p => p.target.identifier === identifier);
        if (preset) {
          structureText = generateAlphaHelixPdb(
            preset.candidate.sequence,
            preset.target.chain,
            1,
            [0, 0, 0],
            92.0
          );
        } else {
          return res.status(400).json({
            error: `RCSB PDB 조회 실패: ${rcsbErr?.message || '해당 PDB ID를 찾지 못했습니다.'}. 네트워크 상태를 확인하거나 PDB 파일을 직접 업로드해 주세요.`,
          });
        }
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

    // Calculate SASA for all chains in full assembly context
    const allAssemblyResidues = Object.values(structure.residuesByChain).flat();
    for (const chain of structure.chains) {
      const resList = structure.residuesByChain[chain] || [];
      if (resList.length > 0) {
        calculateSASA(resList, 1.4, 96, allAssemblyResidues);
      }
    }

    const targetId = 'tgt_' + Math.random().toString(36).substring(2, 10);
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
    res.status(500).json({ error: err.message || '타겟 구조 처리 중 서버 오류가 발생했습니다.' });
  }
});

// 3. POST /api/v1/epitopes
app.post('/api/v1/epitopes', async (req, res) => {
  try {
    const {
      target_id,
      target_chain = 'A',
      method = 'manual',
      manual_range,
      complex_pdb_id,
      antigen_chain,
      antibody_chains,
      prediction_csv_text,
      threshold = 0.5,
      combination_mode = 'union', // 'single' | 'union' | 'intersect'
      additional_ranges,
    } = req.body;

    const target = targetsStore.get(target_id);
    if (!target) {
      return res.status(404).json({ error: '지정된 target_id를 찾을 수 없습니다.' });
    }

    let resolvedResidues: (number | string)[] = [];
    let isTemporary = false;

    if (method === 'manual') {
      if (manual_range && manual_range.trim()) {
        resolvedResidues = parseResidueRange(manual_range);
      }
    } else if (method === 'complex') {
      if (!complex_pdb_id) {
        return res.status(400).json({ error: '복합체 PDB ID를 입력해야 합니다.' });
      }
      try {
        const url = `https://files.rcsb.org/download/${complex_pdb_id.toUpperCase()}.cif`;
        const resp = await fetchWithTimeout(url);
        let complexText = '';
        if (resp.ok) {
          complexText = await resp.text();
        } else {
          const fb = await fetchWithTimeout(`https://files.rcsb.org/download/${complex_pdb_id.toUpperCase()}.pdb`);
          complexText = await fb.text();
        }
        const complexStruct = complexText.includes('_atom_site.')
          ? parseMmcif(complexText)
          : parsePdb(complexText);

        const abChains = (antibody_chains || 'H,L')
          .split(/[,;\s]+/)
          .map((c: string) => c.trim())
          .filter(Boolean);
        const agChain = antigen_chain || target_chain;

        const rawContacts = extractComplexContacts(complexStruct, agChain, abChains, 4.5);
        const complexAgResidues = complexStruct.residuesByChain[agChain] || [];
        const targetResidues = target.structure.residuesByChain[target_chain] || [];

        const mappingResult = await mapComplexResiduesToTarget(
          complexAgResidues,
          targetResidues,
          rawContacts,
          complex_pdb_id,
          target.identifier
        );

        resolvedResidues = mappingResult.mappedResidues;
      } catch (cErr: any) {
        // Fallback to manual range or known contact residue ranges
        if (manual_range) {
          resolvedResidues = parseResidueRange(manual_range);
        } else {
          return res.status(400).json({
            error: `복합체 PDB (${complex_pdb_id}) 다운로드/파싱 실패: ${cErr.message}. 직접 잔기 번호를 입력하거나 다른 PDB ID를 시도해 주세요.`,
          });
        }
      }
    } else if (method === 'prediction_csv') {
      if (!prediction_csv_text) {
        return res.status(400).json({ error: '예측 도구 결과 CSV 또는 텍스트 데이터를 제공해야 합니다.' });
      }
      const lines = prediction_csv_text.split('\n');
      const filtered: number[] = [];
      for (const line of lines) {
        const parts = line.split(/[,;\t\s]+/);
        if (parts.length >= 2) {
          const resNum = parseInt(parts[0], 10);
          const score = parseFloat(parts[1]);
          if (!isNaN(resNum) && !isNaN(score) && score >= threshold) {
            filtered.push(resNum);
          }
        }
      }
      resolvedResidues = Array.from(new Set(filtered)).sort((a, b) => a - b);
    }

    // Apply combination mode if additional ranges are given
    if (additional_ranges && combination_mode !== 'single') {
      const extra = parseResidueRange(additional_ranges);
      if (combination_mode === 'union') {
        const merged = new Set([...resolvedResidues, ...extra]);
        resolvedResidues = Array.from(merged).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
      } else if (combination_mode === 'intersect') {
        const extraSet = new Set(extra);
        resolvedResidues = resolvedResidues.filter(r => extraSet.has(r));
      }
    }

    // Fallback: If no epitope residues found or specified, automatically use surface exposed residues (RSA >= 0.2)
    if (resolvedResidues.length === 0) {
      isTemporary = true;
      const targetResList = target.structure.residuesByChain[target_chain] || [];
      resolvedResidues = targetResList
        .filter(r => (r.rsa ?? 0) >= 0.2)
        .map(r => r.resSeq);
    }

    const epitopeId = 'epi_' + Math.random().toString(36).substring(2, 10);
    epitopesStore.set(epitopeId, {
      id: epitopeId,
      targetId: target_id,
      method: isTemporary ? 'temporary_rsa_fallback' : method,
      residues: resolvedResidues,
      isTemporary,
      createdAtMs: Date.now(),
    });

    res.json({
      epitope_id: epitopeId,
      method: isTemporary ? 'temporary_rsa_fallback' : method,
      is_temporary: isTemporary,
      residues_count: resolvedResidues.length,
      residues: resolvedResidues,
      note: isTemporary ? '임시 에피톱 사용 (표면 노출 잔기 RSA ≥ 0.2)' : '사용자 정의 에피톱',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '에피톱 처리 중 오류가 발생했습니다.' });
  }
});

// 4. POST /api/v1/candidates
app.post('/api/v1/candidates', async (req, res) => {
  try {
    const { sequence, fasta_text, raw_pdb, filename, is_experimental } = req.body;
    let structureText = '';
    let parsedSeq = '';
    let isExperimental = !!is_experimental;
    let sourceType: 'fasta' | 'sequence' | 'pdb' = 'sequence';

    if (raw_pdb) {
      sourceType = 'pdb';
      structureText = raw_pdb;
      isExperimental = true;
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

    const candChain = structure.chains[0];
    const resList = structure.residuesByChain[candChain] || [];
    const allCandResidues = Object.values(structure.residuesByChain).flat();
    if (resList.length > 0) {
      calculateSASA(resList, 1.4, 96, allCandResidues);
    }

    const candidateId = 'cand_' + Math.random().toString(36).substring(2, 10);
    candidatesStore.set(candidateId, {
      id: candidateId,
      sourceType,
      identifier: filename || (parsedSeq ? `Seq-${parsedSeq.length}aa` : 'Candidate-PDB'),
      sequence: parsedSeq,
      structure,
      isExperimental,
      chain: candChain,
      createdAtMs: Date.now(),
    });

    res.json({
      candidate_id: candidateId,
      source_type: sourceType,
      is_experimental: isExperimental,
      chain: candChain,
      residues_count: resList.length,
      sample_pdb: structure.rawPdb,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '후보 물질 처리 중 오류가 발생했습니다.' });
  }
});

// 5. POST /api/v1/jobs
app.post('/api/v1/jobs', async (req, res) => {
  try {
    const { target_id, candidate_id, epitope_id, target_chain = 'A', weights } = req.body;

    const target = targetsStore.get(target_id);
    const candidate = candidatesStore.get(candidate_id);
    const epitope = epitopesStore.get(epitope_id);

    if (!target) return res.status(404).json({ error: '타겟 구조를 찾을 수 없습니다.' });
    if (!candidate) return res.status(404).json({ error: '후보 구조를 찾을 수 없습니다.' });
    if (!epitope) return res.status(404).json({ error: '에피톱 정보를 찾을 수 없습니다.' });

    const weightValidation = validateAndNormalizeWeights(weights);
    if (!weightValidation.isValid) {
      return res.status(400).json({ error: weightValidation.error });
    }
    const customWeights = weightValidation.normalizedWeights;

    const jobId = 'job_' + Math.random().toString(36).substring(2, 10);

    const targetResidues = target.structure.residuesByChain[target_chain] || Object.values(target.structure.residuesByChain)[0] || [];
    const candResidues = candidate.structure.residuesByChain[candidate.chain] || Object.values(candidate.structure.residuesByChain)[0] || [];

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
          customWeights,
          epitopeMethod: epitope.method,
          targetChain: target_chain,
          candidateStructure: candidate.structure,
          candidateChain: candidate.chain,
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
    res.status(500).json({ error: err.message || '작업 생성 및 실행 중 오류가 발생했습니다.' });
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

  const respData = {
    status: 'done',
    data: {
      auto_settings: {
        mode: auto.mode || 'full',
        epitope_source: auto.epitope_source || auto.epitopeSource || 'manual',
        target_chain: auto.target_chain || auto.targetChain || 'A',
        is_temporary_epitope: auto.is_temporary_epitope ?? auto.isTemporaryEpitope ?? false,
        is_experimental_candidate: auto.is_experimental_candidate ?? auto.isExperimentalCandidate ?? false,
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
          targetPdbText = await pdbRes.text();
        } else {
          const cifRes = await fetchWithTimeout(`https://files.rcsb.org/download/${targetIdentifier}.cif`);
          if (cifRes.ok) targetPdbText = await cifRes.text();
          else throw new Error(`PDB ${targetIdentifier}를 찾을 수 없습니다.`);
        }
      } catch (err: any) {
        return res.status(400).json({ error: `RCSB PDB에서 ${targetIdentifier}를 가져올 수 없습니다. (${err.message})` });
      }
    } else if (isValidUniprotId(cleanTarget)) {
      // UniProt ID
      targetIdentifier = cleanTarget.toUpperCase();
      targetSourceType = 'uniprot';
      const afRes = await fetchWithTimeout(`https://alphafold.ebi.ac.uk/api/prediction/${targetIdentifier}`);
      if (!afRes.ok) return res.status(404).json({ error: `AlphaFold DB에서 UniProt ${targetIdentifier}를 찾을 수 없습니다.` });
      const meta = await afRes.json();
      const pdbUrl = meta[0]?.pdbUrl || meta[0]?.cifUrl;
      if (!pdbUrl) return res.status(404).json({ error: 'AlphaFold 3D 구조 URL을 찾을 수 없습니다.' });
      const structRes = await fetchWithTimeout(pdbUrl);
      targetPdbText = await structRes.text();
    } else {
      // Sequence
      const seqVal = validateAminoAcidSequence(cleanTarget, { minLen: 10, maxLen: 2000 });
      if (!seqVal.isValid) {
        return res.status(400).json({ error: `타겟 서열 오류: ${seqVal.error}` });
      }
      const seqOnly = seqVal.sequence;
      targetIdentifier = 'Target_Sequence';
      targetSourceType = 'file';

      const esmResult = await predictStructureWithESMFold(seqOnly);
      if (esmResult.success && esmResult.pdbText) {
        targetPdbText = esmResult.pdbText;
      } else {
        return res.status(400).json({
          error: `타겟 서열 3D 구조 예측 실패: ${esmResult.error || '구조를 예측할 수 없습니다.'}. PDB ID, UniProt ID, 또는 PDB 파일 텍스트를 입력해 보세요.`,
        });
      }
    }

    const targetStructure = targetPdbText.includes('_atom_site.')
      ? parseMmcif(targetPdbText)
      : parsePdb(targetPdbText);

    if (targetStructure.chains.length === 0 || targetStructure.allAtoms.length === 0) {
      return res.status(400).json({ error: '유효한 타겟 단백질 원자(ATOM) 좌표를 파싱하지 못했습니다.' });
    }

    // Calculate SASA on target (in full assembly context across all chains)
    const allTargetAssemblyResidues = Object.values(targetStructure.residuesByChain).flat();
    for (const chain of targetStructure.chains) {
      const resList = targetStructure.residuesByChain[chain] || [];
      if (resList.length > 0) calculateSASA(resList, 1.4, 96, allTargetAssemblyResidues);
    }

    // Determine target chain
    let targetChain = reqTargetChain?.trim() || '';
    if (!targetChain || !targetStructure.chains.includes(targetChain)) {
      // Default to 'E' if present (e.g. 6M0J Spike RBD), else 'A', else first chain
      if (targetStructure.chains.includes('E')) targetChain = 'E';
      else if (targetStructure.chains.includes('A')) targetChain = 'A';
      else targetChain = targetStructure.chains[0];
    }

    const targetResidues = targetStructure.residuesByChain[targetChain] || [];
    if (targetResidues.length === 0) {
      return res.status(400).json({ error: `타겟 체인 ${targetChain}에 분석 가능한 잔기가 없습니다.` });
    }

    // Save target
    const targetId = 'tgt_' + Math.random().toString(36).substring(2, 10);
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
    let epitopeResidueSeqs: (number | string)[] = [];
    let epitopeMethod: 'manual' | 'temporary_rsa_fallback' = 'temporary_rsa_fallback';
    let epitopeDescription = '';

    if (epitope_range && typeof epitope_range === 'string' && epitope_range.includes('-')) {
      const parts = epitope_range.split('-').map(s => parseInt(s.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const [start, end] = parts[0] <= parts[1] ? [parts[0], parts[1]] : [parts[1], parts[0]];
        epitopeResidueSeqs = targetResidues
          .filter(r => r.resSeq >= start && r.resSeq <= end)
          .map(r => r.resSeq);
        epitopeMethod = 'manual';
        epitopeDescription = `지정 잔기 범위 (${start}-${end}, ${epitopeResidueSeqs.length}개)`;
      }
    }

    if (epitopeResidueSeqs.length === 0) {
      // Auto-fallback: surface exposed residues with RSA >= 0.20
      epitopeResidueSeqs = targetResidues
        .filter(r => (r.rsa ?? 0) >= 0.20)
        .map(r => r.resSeq);
      if (epitopeResidueSeqs.length === 0) {
        epitopeResidueSeqs = targetResidues.map(r => r.resSeq);
      }
      epitopeMethod = 'temporary_rsa_fallback';
      epitopeDescription = `표면 노출도 기반 자동 탐색 (RSA ≥ 0.20, ${epitopeResidueSeqs.length}개 잔기)`;
    }

    const epitopeId = 'epi_' + Math.random().toString(36).substring(2, 10);
    epitopesStore.set(epitopeId, {
      id: epitopeId,
      targetId,
      method: epitopeMethod,
      residues: epitopeResidueSeqs,
      isTemporary: epitopeMethod === 'temporary_rsa_fallback',
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
    let candChain = reqCandidateChain?.trim() || 'A';

    if (cleanCandidate.startsWith('ATOM') || cleanCandidate.startsWith('HEADER') || cleanCandidate.includes('_atom_site.')) {
      candStructure = cleanCandidate.includes('_atom_site.') ? parseMmcif(cleanCandidate) : parsePdb(cleanCandidate);
      isCandExperimental = true;
      candChain = candStructure.chains[0] || 'A';
    } else if (isValidPdbId(cleanCandidate)) {
      const candId = cleanCandidate.toUpperCase();
      try {
        const r = await fetchWithTimeout(`https://files.rcsb.org/download/${candId}.pdb`);
        if (!r.ok) {
          throw new Error(`PDB ${candId} 다운로드 실패 (${r.status})`);
        }
        const txt = await r.text();
        candStructure = parsePdb(txt);
        isCandExperimental = true;
        candChain = candStructure.chains[0] || 'A';
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
        candChain = candStructure.chains[0] || 'A';
      } else {
        // Fallback: thread sequence on target template if compatible
        try {
          const threadedPdb = threadSequenceOnTemplate(seqVal.sequence, targetResidues, 'A');
          candStructure = parsePdb(threadedPdb);
          isCandExperimental = false;
          candChain = candStructure.chains[0] || 'A';
        } catch (threadErr: any) {
          return res.status(400).json({
            error: `ESMFold 예측 연동 실패 (${esmResult.error || '응답 없음'}) 및 템플릿 모사 실패 (${threadErr.message}). 유효한 3D PDB 파일이나 PDB ID를 업로드해 주세요.`,
          });
        }
      }
    }

    const candResidues = candStructure.residuesByChain[candChain] || Object.values(candStructure.residuesByChain)[0] || [];
    if (candResidues.length === 0) {
      return res.status(400).json({ error: '후보 물질 구조에서 잔기 좌표를 생성하지 못했습니다.' });
    }
    const allCandAssemblyResidues = Object.values(candStructure.residuesByChain).flat();
    calculateSASA(candResidues, 1.4, 96, allCandAssemblyResidues);

    const candidateId = 'cand_' + Math.random().toString(36).substring(2, 10);
    candidatesStore.set(candidateId, {
      id: candidateId,
      identifier: isCandExperimental ? 'Custom_Candidate_PDB' : 'Candidate_Sequence',
      sourceType: isCandExperimental ? 'pdb' : 'sequence',
      sequence: cleanCandidate.replace(/[^A-Za-z]/g, '').toUpperCase(),
      structure: candStructure,
      isExperimental: isCandExperimental,
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

    const jobId = 'job_' + Math.random().toString(36).substring(2, 10);
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
    console.error('Quick analyze error:', err);
    res.status(500).json({ error: err.message || '빠른 분석 처리 중 서버 오류가 발생했습니다.' });
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

    // 1. Resolve Target
    let cleanTarget = target_input.trim();
    let targetStructure: ParsedStructure;
    let targetPdbText = '';
    let targetSourceType: 'pdb' | 'uniprot' | 'file' = 'pdb';
    let targetIdentifier = '';

    if (cleanTarget.startsWith('>') && cleanTarget.includes('\n')) {
      const records = parseFastaInput(cleanTarget);
      if (records.length > 1) {
        return res.status(400).json({
          error: '타겟 FASTA 입력에 여러 서열 레코드가 포함되어 있습니다. 단일 서열만 입력해 주세요.',
        });
      }
      cleanTarget = records[0]?.sequence || cleanTarget;
    }

    if (cleanTarget.startsWith('ATOM') || cleanTarget.startsWith('HEADER') || cleanTarget.includes('_atom_site.')) {
      targetPdbText = cleanTarget;
      targetSourceType = 'file';
      targetIdentifier = 'Batch_Target_PDB';
    } else if (isValidPdbId(cleanTarget)) {
      targetIdentifier = cleanTarget.toUpperCase();
      targetSourceType = 'pdb';
      try {
        const r = await fetchWithTimeout(`https://files.rcsb.org/download/${targetIdentifier}.pdb`);
        if (r.ok) {
          targetPdbText = await r.text();
        } else {
          const cifRes = await fetchWithTimeout(`https://files.rcsb.org/download/${targetIdentifier}.cif`);
          if (cifRes.ok) {
            targetPdbText = await cifRes.text();
          } else {
            return res.status(400).json({ error: `RCSB PDB에서 Target ID '${targetIdentifier}'를 찾을 수 없습니다.` });
          }
        }
      } catch (err: any) {
        return res.status(400).json({ error: `RCSB PDB에서 Target ID '${targetIdentifier}'를 가져오지 못했습니다. (${err?.message || err})` });
      }
    } else if (isValidUniprotId(cleanTarget)) {
      targetIdentifier = cleanTarget.toUpperCase();
      targetSourceType = 'uniprot';
      try {
        const afRes = await fetchWithTimeout(`https://alphafold.ebi.ac.uk/api/prediction/${targetIdentifier}`);
        if (!afRes.ok) {
          return res.status(404).json({ error: `AlphaFold DB에서 Target UniProt '${targetIdentifier}'를 찾을 수 없습니다.` });
        }
        const meta = await afRes.json();
        const pdbUrl = meta[0]?.pdbUrl || meta[0]?.cifUrl;
        if (!pdbUrl) {
          return res.status(404).json({ error: `AlphaFold DB에 Target '${targetIdentifier}'의 3D 구조 URL이 없습니다.` });
        }
        const structRes = await fetchWithTimeout(pdbUrl);
        if (!structRes.ok) {
          return res.status(400).json({ error: `AlphaFold DB에서 Target '${targetIdentifier}' 구조 다운로드에 실패했습니다.` });
        }
        targetPdbText = await structRes.text();
      } catch (err: any) {
        return res.status(400).json({ error: `AlphaFold DB 조회 실패 (${targetIdentifier}): ${err?.message || err}` });
      }
    } else {
      // Try parsing as sequence
      const seqVal = validateAminoAcidSequence(cleanTarget, { minLen: 10, maxLen: 2000 });
      if (!seqVal.isValid) {
        return res.status(400).json({
          error: `유효하지 않거나 지원하지 않는 Target 입력입니다: '${cleanTarget}'. (PDB ID, UniProt ID, PDB 텍스트 또는 아미노산 서열을 입력해 주세요)`,
        });
      }
      const seqOnly = seqVal.sequence;
      targetIdentifier = 'Batch_Target_Sequence';
      targetSourceType = 'file';

      const esmResult = await predictStructureWithESMFold(seqOnly);
      if (esmResult.success && esmResult.pdbText) {
        targetPdbText = esmResult.pdbText;
      } else {
        return res.status(400).json({
          error: `Target 서열 3D 구조 예측 실패: ${esmResult.error || '구조를 예측할 수 없습니다.'}. PDB ID, UniProt ID, 또는 PDB 파일 텍스트를 입력해 보세요.`,
        });
      }
    }

    targetStructure = targetPdbText.includes('_atom_site.')
      ? parseMmcif(targetPdbText)
      : parsePdb(targetPdbText);

    if (targetStructure.chains.length === 0 || targetStructure.allAtoms.length === 0) {
      return res.status(400).json({ error: '유효한 타겟 단백질 원자(ATOM) 좌표를 파싱하지 못했습니다.' });
    }

    const targetChain = reqTargetChain?.trim() || targetStructure.chains[0] || 'A';
    const targetResidues = targetStructure.residuesByChain[targetChain] || Object.values(targetStructure.residuesByChain)[0] || [];
    const allTargetBatchResidues = Object.values(targetStructure.residuesByChain).flat();
    calculateSASA(targetResidues, 1.4, 96, allTargetBatchResidues);

    const chainResidueCounts: Record<string, number> = {};
    for (const c of targetStructure.chains) {
      chainResidueCounts[c] = (targetStructure.residuesByChain[c] || []).length;
    }

    const targetId = 'tgt_' + Math.random().toString(36).substring(2, 10);
    targetsStore.set(targetId, {
      id: targetId,
      identifier: targetIdentifier || 'Batch_Target',
      sourceType: targetSourceType,
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
    } else if (epitope_range && typeof epitope_range === 'string') {
      epitopeResidueSeqs = parseResidueRange(epitope_range);
    }

    if (epitopeResidueSeqs.length === 0) {
      epitopeResidueSeqs = targetResidues
        .filter(r => (r.rsa ?? 0) >= 0.20)
        .map(r => r.resKey || getResidueKey(r.resSeq, r.iCode));
      if (epitopeResidueSeqs.length === 0) {
        epitopeResidueSeqs = targetResidues.map(r => r.resKey || getResidueKey(r.resSeq, r.iCode));
      }
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
        let candChain = cand.chain?.trim() || 'A';

        if (cleanCand.startsWith('ATOM') || cleanCand.startsWith('HEADER') || cleanCand.includes('_atom_site.')) {
          candStructure = cleanCand.includes('_atom_site.') ? parseMmcif(cleanCand) : parsePdb(cleanCand);
          isCandExperimental = true;
          candChain = candStructure.chains[0] || 'A';
        } else if (isValidPdbId(cleanCand)) {
          const pId = cleanCand.toUpperCase();
          try {
            const r = await fetchWithTimeout(`https://files.rcsb.org/download/${pId}.pdb`);
            if (!r.ok) {
              throw new Error(`PDB ${pId} 다운로드 실패 (${r.status})`);
            }
            const txt = await r.text();
            candStructure = parsePdb(txt);
            isCandExperimental = true;
            candChain = candStructure.chains[0] || 'A';
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
            candChain = candStructure.chains[0] || 'A';
          } else {
            // Fallback: thread sequence on target template
            try {
              const threadedPdb = threadSequenceOnTemplate(seqVal.sequence, targetResidues, 'A');
              candStructure = parsePdb(threadedPdb);
              isCandExperimental = false;
              candChain = candStructure.chains[0] || 'A';
            } catch (threadErr: any) {
              throw new Error(`후보 '${candName}' ESMFold 예측 연동 실패 (${esmResult.error || '응답 없음'}) 및 템플릿 모사 실패 (${threadErr.message}).`);
            }
          }
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

        const jobId = 'job_' + Math.random().toString(36).substring(2, 10);
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
    console.error('Batch analyze error:', err);
    res.status(500).json({ error: err.message || '다중 후보 물질 배치 분석 중 서버 오류가 발생했습니다.' });
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
    const data: AiInsightRequest = req.body;
    const insightText = await generateAiInsight(data);
    res.json({ insight: insightText });
  } catch (err: any) {
    console.error('AI Insight endpoint error:', err);
    res.status(500).json({ error: err.message || 'AI 리포트 생성 중 오류가 발생했습니다.' });
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

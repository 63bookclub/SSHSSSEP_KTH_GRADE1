/**
 * Client API services for 2026 SSEP_TEAM SSBD(씁뜩)
 */

export interface TargetSubmission {
  uniprot_id?: string;
  pdb_id?: string;
  raw_content?: string;
  filename?: string;
}

export interface TargetResponse {
  target_id: string;
  source_type: 'uniprot' | 'pdb' | 'file';
  identifier: string;
  chains: string[];
  chain_residue_counts: Record<string, number>;
  total_atoms: number;
  sample_pdb?: string;
}

export interface EpitopeSubmission {
  target_id: string;
  target_chain: string;
  method: 'manual' | 'complex' | 'prediction_csv';
  manual_range?: string;
  complex_pdb_id?: string;
  antigen_chain?: string;
  antibody_chains?: string;
  prediction_csv_text?: string;
  threshold?: number;
  combination_mode?: 'single' | 'union' | 'intersect';
  additional_ranges?: string;
}

export interface EpitopeResponse {
  epitope_id: string;
  method: string;
  is_temporary: boolean;
  residues_count: number;
  residues: number[];
  note: string;
}

export interface CandidateSubmission {
  target_id?: string;
  target_chain?: string;
  sequence?: string;
  fasta_text?: string;
  raw_pdb?: string;
  filename?: string;
  is_experimental?: boolean;
}

export interface CandidateResponse {
  candidate_id: string;
  source_type: 'fasta' | 'sequence' | 'pdb';
  is_experimental: boolean;
  chain: string;
  residues_count: number;
  sample_pdb?: string;
}

export interface JobSubmission {
  target_id: string;
  candidate_id: string;
  epitope_id: string;
  target_chain: string;
  weights?: [number, number, number, number];
}

export interface JobResultData {
  status: 'done' | 'running' | 'failed' | 'queued';
  data?: {
    auto_settings: {
      mode: 'full' | 'fragment';
      epitope_source: string;
      target_chain: string;
      is_temporary_epitope?: boolean;
      is_experimental_candidate?: boolean;
    };
    alignment: {
      tm_score_target_norm: number;
      tm_score_candidate_norm: number;
      rmsd: number;
      aligned_length: number;
      coverage: number;
    };
    sub_scores: {
      s_global: number;
      s_epi: number;
      s_exp: number;
      s_conf: number;
    };
    weights?: [number, number, number, number];
    final_fitness_score: number;
    evaluation_rationale: string;
    residues: {
      res_id: number;
      cand_res_id?: number;
      res_name?: string;
      in_epitope: boolean;
      distance: number;
      rsa_target: number;
      rsa_candidate: number;
      plddt: number;
      similarity?: number;
    }[];
    reproducibility: {
      tool_versions: Record<string, string>;
      parameters: Record<string, any>;
      timestamp: string;
    };
    aligned_pdb_download_url: string;
    target_pdb?: string;
    aligned_candidate_pdb?: string;
  };
  error?: string;
}

export async function submitTarget(data: TargetSubmission): Promise<TargetResponse> {
  const res = await fetch('/api/v1/targets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '타겟 등록 실패');
  }
  return res.json();
}

export async function submitEpitope(data: EpitopeSubmission): Promise<EpitopeResponse> {
  const res = await fetch('/api/v1/epitopes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '에피톱 설정 실패');
  }
  return res.json();
}

export async function submitCandidate(data: CandidateSubmission): Promise<CandidateResponse> {
  const res = await fetch('/api/v1/candidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '후보 물질 등록 실패');
  }
  return res.json();
}

export async function submitJob(data: JobSubmission): Promise<{ job_id: string; status: string }> {
  const res = await fetch('/api/v1/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '작업 생성 실패');
  }
  return res.json();
}

export async function getJobResult(jobId: string, pollIntervalMs = 500, maxAttempts = 120): Promise<JobResultData> {
  let attempts = 0;
  while (attempts < maxAttempts) {
    const res = await fetch(`/api/v1/jobs/${jobId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '결과 조회 실패');
    }
    const data: JobResultData = await res.json();
    if (data.status === 'done' || data.status === 'failed') {
      return data;
    }
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error('작업 처리 시간이 초과되었습니다.');
}

export interface MultiEpitopeEntity {
  id: string;
  name: string;
  range: string;
  weight: number;
  color?: string;
  residues?: number[];
  sEpi?: number;
  rmsd?: number;
}

export interface CandidateEntity {
  id: string;
  name: string;
  type: 'pdb_id' | 'file' | 'sequence';
  input: string;
  chain?: string;
  is_experimental?: boolean;
}

export interface BatchAnalyzeParams {
  target_input: string;
  target_chain?: string;
  epitope_range?: string;
  multi_epitopes?: MultiEpitopeEntity[];
  candidates: CandidateEntity[];
  weights?: [number, number, number, number];
}

export interface BatchCandidateResult {
  candidate_id: string;
  candidate_name: string;
  job_id?: string;
  status: 'done' | 'failed';
  error?: string;
  data?: NonNullable<JobResultData['data']> & {
    epitope_breakdown?: {
      id: string;
      name: string;
      range: string;
      residuesCount: number;
      sEpi: number;
      rmsd: number;
      color: string;
    }[];
  };
}

export interface BatchAnalyzeResponse {
  target_pdb: string;
  chains: string[];
  chain_residue_counts: Record<string, number>;
  epitopes: MultiEpitopeEntity[];
  results: BatchCandidateResult[];
}

export async function batchAnalyze(params: BatchAnalyzeParams): Promise<BatchAnalyzeResponse> {
  const res = await fetch('/api/v1/batch-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '다중 후보 배치 분석 요청 실패');
  }
  return res.json();
}

export async function quickAnalyze(params: {
  target_input: string;
  candidate_input: string;
  target_chain?: string;
  candidate_chain?: string;
  epitope_range?: string;
  multi_epitopes?: MultiEpitopeEntity[];
  weights?: [number, number, number, number];
}): Promise<JobResultData> {
  const res = await fetch('/api/v1/quick-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || '빠른 분석 요청 실패');
  }
  return res.json();
}

export async function fetchAiInsight(data: any): Promise<{ insight: string }> {
  const res = await fetch('/api/v1/ai-insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'AI 심층 리포트 생성 실패');
  }
  return res.json();
}

import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Play,
  FileSpreadsheet,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Trophy,
  Dna,
  Target,
  ChevronRight,
  Upload,
  RotateCcw,
} from 'lucide-react';
import {
  CandidateEntity,
  MultiEpitopeEntity,
  BatchAnalyzeResponse,
  batchAnalyze,
  JobResultData,
} from '../services/api.ts';
import { PRESET_BENCHMARKS } from '../services/presets.ts';
import { getFitnessScoreGrade, SCORING_GRADE_THRESHOLDS } from '../services/bioAlgorithms.ts';

interface BatchScreeningViewProps {
  onInspectCandidate: (jobResult: JobResultData, targetPdb?: string, candidatePdb?: string) => void;
}

interface BatchPreset {
  id: string;
  title: string;
  tag: string;
  targetInput: string;
  targetChain: string;
  epitopes: MultiEpitopeEntity[];
  candidates: CandidateEntity[];
}

const BATCH_PRESETS: BatchPreset[] = [
  {
    id: 'covid-4variants',
    title: '코로나-19 주요 변이주 & 인공단백질 (4종)',
    tag: 'WT · Delta · Omicron · De Novo',
    targetInput: '6M0J',
    targetChain: 'E',
    epitopes: [
      {
        id: 'epi_1',
        name: '에피톱 1: RBM 수용체 결합 모티프',
        range: '437-508',
        weight: 1.0,
        color: '#e11d48',
      },
      {
        id: 'epi_2',
        name: '에피톱 2: 코어 결합 루프',
        range: '365-390',
        weight: 0.8,
        color: '#f59e0b',
      },
    ],
    candidates: [
      {
        id: 'cand_1',
        name: '후보 1: 야생형 (WT) Spike RBD',
        type: 'sequence',
        input: PRESET_BENCHMARKS[0]?.candidate.sequence || '',
      },
      {
        id: 'cand_2',
        name: '후보 2: 델타 변이 (Delta L452R/T478K)',
        type: 'sequence',
        input: PRESET_BENCHMARKS[1]?.candidate.sequence || '',
      },
      {
        id: 'cand_3',
        name: '후보 3: 오미크론 BA.1 변이 모방체',
        type: 'sequence',
        input: PRESET_BENCHMARKS[2]?.candidate.sequence || '',
      },
      {
        id: 'cand_4',
        name: '후보 4: 인공 설계 미니단백질 (De Novo)',
        type: 'sequence',
        input: PRESET_BENCHMARKS[3]?.candidate.sequence || '',
      },
    ],
  },
  {
    id: 'delta-vs-omicron',
    title: '델타 vs 오미크론 변이 비교 (2종)',
    tag: '우려 변이주(VOC) 모방도 대조',
    targetInput: '6M0J',
    targetChain: 'E',
    epitopes: [
      {
        id: 'epi_1',
        name: 'RBM 수용체 결합 부위',
        range: '437-508',
        weight: 1.0,
        color: '#e11d48',
      },
    ],
    candidates: [
      {
        id: 'cand_1',
        name: '델타 변이체 (Delta RBD)',
        type: 'sequence',
        input: PRESET_BENCHMARKS[1]?.candidate.sequence || '',
      },
      {
        id: 'cand_2',
        name: '오미크론 변이체 (Omicron BA.1)',
        type: 'sequence',
        input: PRESET_BENCHMARKS[2]?.candidate.sequence || '',
      },
    ],
  },
  {
    id: 'denovo-miniprotein',
    title: '인공 미니단백질 설계 후보군 (2종)',
    tag: 'De Novo 바인더 vs 야생형 RBD',
    targetInput: '6M0J',
    targetChain: 'E',
    epitopes: [
      {
        id: 'epi_1',
        name: 'ACE2 결합 접촉 에피톱',
        range: '437-508',
        weight: 1.0,
        color: '#e11d48',
      },
    ],
    candidates: [
      {
        id: 'cand_1',
        name: '대조군: 야생형 Spike RBD',
        type: 'sequence',
        input: PRESET_BENCHMARKS[0]?.candidate.sequence || '',
      },
      {
        id: 'cand_2',
        name: '설계체: De Novo Miniprotein (LCB1)',
        type: 'sequence',
        input: PRESET_BENCHMARKS[3]?.candidate.sequence || '',
      },
    ],
  },
];

export const BatchScreeningView: React.FC<BatchScreeningViewProps> = ({ onInspectCandidate }) => {
  // Target inputs
  const [targetInput, setTargetInput] = useState<string>('');
  const [targetChain, setTargetChain] = useState<string>('E');

  // Multi-epitopes & Candidates
  const [epitopes, setEpitopes] = useState<MultiEpitopeEntity[]>([
    {
      id: 'epi_1',
      name: '에피톱 1: 중화 결합 부위',
      range: '',
      weight: 1.0,
      color: '#e11d48',
    },
  ]);

  const [candidates, setCandidates] = useState<CandidateEntity[]>([
    {
      id: 'cand_1',
      name: '후보 1: 백신 후보 물질 A',
      type: 'sequence',
      input: '',
    },
    {
      id: 'cand_2',
      name: '후보 2: 백신 후보 물질 B',
      type: 'sequence',
      input: '',
    },
  ]);

  const [weights, setWeights] = useState<[number, number, number, number]>([0.25, 0.40, 0.20, 0.15]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchResponse, setBatchResponse] = useState<BatchAnalyzeResponse | null>(null);

  // Apply a preset example with 1-click
  const handleApplyPreset = (preset: BatchPreset) => {
    setTargetInput(preset.targetInput);
    setTargetChain(preset.targetChain);
    setEpitopes(JSON.parse(JSON.stringify(preset.epitopes)));
    setCandidates(JSON.parse(JSON.stringify(preset.candidates)));
    setError(null);
  };

  // Reset all fields to clean slate for direct manual input
  const handleResetClean = () => {
    setTargetInput('');
    setTargetChain('E');
    setEpitopes([
      {
        id: `epi_${Date.now()}`,
        name: '에피톱 1: 중화 결합 부위',
        range: '',
        weight: 1.0,
        color: '#e11d48',
      },
    ]);
    setCandidates([
      {
        id: `cand_${Date.now()}_1`,
        name: '후보 1: 백신 후보 물질 A',
        type: 'sequence',
        input: '',
      },
      {
        id: `cand_${Date.now()}_2`,
        name: '후보 2: 백신 후보 물질 B',
        type: 'sequence',
        input: '',
      },
    ]);
    setError(null);
  };

  // File upload for target
  const handleTargetFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setTargetInput(text);
      }
    };
    reader.readAsText(file);
  };

  // File upload for a specific candidate
  const handleCandidateFileUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        handleUpdateCandidate(id, 'input', text);
      }
    };
    reader.readAsText(file);
  };

  // Add new epitope entity
  const handleAddEpitope = () => {
    const nextIdx = epitopes.length + 1;
    const colors = ['#e11d48', '#f59e0b', '#10b981', '#8b5cf6', '#06b6d4', '#ec4899'];
    const newEp: MultiEpitopeEntity = {
      id: `epi_${Date.now()}`,
      name: `에피톱 ${nextIdx}: 추가 항원 결정기`,
      range: '',
      weight: 1.0,
      color: colors[(nextIdx - 1) % colors.length],
    };
    setEpitopes([...epitopes, newEp]);
  };

  const handleRemoveEpitope = (id: string) => {
    if (epitopes.length <= 1) return;
    setEpitopes(epitopes.filter((e) => e.id !== id));
  };

  const handleUpdateEpitope = (id: string, field: keyof MultiEpitopeEntity, val: any) => {
    setEpitopes(
      epitopes.map((e) => (e.id === id ? { ...e, [field]: val } : e))
    );
  };

  // Add new candidate entity
  const handleAddCandidate = () => {
    const nextIdx = candidates.length + 1;
    const newCand: CandidateEntity = {
      id: `cand_${Date.now()}`,
      name: `후보 ${nextIdx}: 신규 백신 후보 물질`,
      type: 'sequence',
      input: '',
    };
    setCandidates([...candidates, newCand]);
  };

  const handleRemoveCandidate = (id: string) => {
    if (candidates.length <= 1) return;
    setCandidates(candidates.filter((c) => c.id !== id));
  };

  const handleUpdateCandidate = (id: string, field: keyof CandidateEntity, val: any) => {
    setCandidates(
      candidates.map((c) => (c.id === id ? { ...c, [field]: val } : c))
    );
  };

  // Run Batch Screening with validation
  const handleRunBatch = async () => {
    setError(null);
    if (!targetInput.trim()) {
      setError('타겟(Target) 단백질 입력값을 입력해 주세요. (PDB ID 또는 서열)');
      return;
    }

    const validCandidates = candidates.filter((c) => c.input && c.input.trim().length > 0);
    if (validCandidates.length === 0) {
      setError('최소 1개 이상의 후보 물질에 아미노산 서열 또는 PDB를 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await batchAnalyze({
        target_input: targetInput.trim(),
        target_chain: targetChain.trim() || undefined,
        multi_epitopes: epitopes,
        candidates: validCandidates,
        weights,
      });
      setBatchResponse(res);
    } catch (err: any) {
      setError(err.message || '다중 후보 물질 배치 분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Export Leaderboard CSV
  const handleExportCsv = () => {
    if (!batchResponse || !batchResponse.results) return;

    const headers = [
      'Rank',
      'Candidate_Name',
      'Candidate_ID',
      'Status',
      'Fitness_Score',
      'Grade',
      'S_global',
      'S_epi_composite',
      'S_exp',
      'S_conf',
      'TM_score_target',
      'Epitope_RMSD_Angstrom',
      'Aligned_Length',
    ];

    const rows = batchResponse.results.map((r, idx) => {
      const d = r.data;
      if (!d) {
        return [idx + 1, r.candidate_name, r.candidate_id, r.status, 'FAILED', '', '', '', '', '', '', '', ''];
      }
      const score = d.final_fitness_score ?? 0;
      const grade = score >= SCORING_GRADE_THRESHOLDS.HIGH ? 'HIGH' : score >= SCORING_GRADE_THRESHOLDS.MODERATE ? 'MODERATE' : 'LOW';

      return [
        idx + 1,
        `"${r.candidate_name}"`,
        r.candidate_id,
        r.status,
        score.toFixed(2),
        grade,
        (d.sub_scores.s_global ?? 0).toFixed(4),
        (d.sub_scores.s_epi ?? 0).toFixed(4),
        (d.sub_scores.s_exp ?? 0).toFixed(4),
        (d.sub_scores.s_conf ?? 0).toFixed(4),
        (d.alignment.tm_score_target_norm ?? 0).toFixed(4),
        (d.alignment.rmsd ?? 0).toFixed(2),
        d.alignment.aligned_length,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SSBD_Leaderboard_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Configuration */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/40">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <span>다중 엔티티 일괄 스크리닝 (Multi-Entity Batch Screening & Leaderboard)</span>
              </h2>
              <p className="text-xs text-slate-400">
                사용자가 타겟 단백질과 여러 백신 후보 물질을 직접 입력하여 항원 모방도를 비교하고 리더보드로 랭킹을 산출합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleResetClean}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
              title="모든 입력 필드를 비우고 처음부터 직접 입력"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>새로 입력 (비우기)</span>
            </button>

            <button
              onClick={handleRunBatch}
              disabled={loading}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-lg ${
                loading
                  ? 'bg-cyan-900 text-cyan-300 cursor-wait'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-900/30'
              }`}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-white" />}
              <span>{loading ? '일괄 스크리닝 진행 중...' : `일괄 스크리닝 실행 (${candidates.filter(c => c.input?.trim()).length}개 후보)`}</span>
            </button>
          </div>
        </div>

        {/* 2. Top Example Selector Bar (초간편 모드 스타일 예시 버튼) */}
        <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              <span>추천 스크리닝 예시 1-클릭 불러오기:</span>
            </span>
            <span className="text-[10px] text-slate-400">클릭 즉시 타겟과 후보군이 채워지며 자유롭게 수정할 수 있습니다</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {BATCH_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="text-left p-2.5 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-cyan-500/50 transition group flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                    {preset.title}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {preset.tag}
                  </div>
                </div>
                <div className="text-[10px] text-cyan-400 flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/60 font-mono">
                  <span>타겟: {preset.targetInput} ({preset.targetChain}체인, {preset.candidates.length}종)</span>
                  <span>적용 →</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 3. Target & Chain Entity Config */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <span>타겟 구조 엔티티 (Target PDB ID 또는 서열)</span>
              </label>
              <label className="cursor-pointer text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1">
                <Upload className="w-3 h-3" />
                <span>PDB/CIF 파일 업로드</span>
                <input
                  type="file"
                  accept=".pdb,.cif,.ent,.txt"
                  onChange={handleTargetFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            <input
              type="text"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="예: 6M0J, P0DTC2 또는 PDB 텍스트"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
              <span>타겟 분석 체인 엔티티 (Target Chain)</span>
            </label>
            <input
              type="text"
              value={targetChain}
              onChange={(e) => setTargetChain(e.target.value.toUpperCase())}
              placeholder="체인 ID (예: E, A, B)"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* 4. Multi-Epitope Entities Manager */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-white">에피톱 영역 설정 (선택 사항: 미입력 시 표면 노출 잔기 자동 분석)</h3>
            </div>
            <button
              type="button"
              onClick={handleAddEpitope}
              className="flex items-center space-x-1 text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>에피톱 추가</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {epitopes.map((ep, idx) => (
              <div
                key={ep.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-2.5"
              >
                <div className="w-3.5 h-3.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: ep.color || '#e11d48' }} />
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={ep.name}
                    onChange={(e) => handleUpdateEpitope(ep.id, 'name', e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-slate-200 border-b border-slate-800 pb-1 focus:outline-none focus:border-cyan-500"
                    placeholder="에피톱 명칭"
                  />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">잔기 범위:</span>
                      <input
                        type="text"
                        value={ep.range}
                        onChange={(e) => handleUpdateEpitope(ep.id, 'range', e.target.value)}
                        placeholder="예: 437-508"
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">상대 가중치:</span>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="5.0"
                        value={ep.weight}
                        onChange={(e) => handleUpdateEpitope(ep.id, 'weight', parseFloat(e.target.value) || 1.0)}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 font-mono focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {epitopes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveEpitope(ep.id)}
                    className="text-slate-500 hover:text-rose-400 p-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 5. Multi-Candidate Entities Manager */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Dna className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-bold text-white">비교할 백신 후보 물질 목록 (Candidate Entities: {candidates.length}개)</h3>
            </div>
            <button
              type="button"
              onClick={handleAddCandidate}
              className="flex items-center space-x-1 text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>후보 물질 추가</span>
            </button>
          </div>

          <div className="space-y-3">
            {candidates.map((cand, idx) => (
              <div
                key={cand.id}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2.5 text-xs hover:border-slate-700 transition"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
                    <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[10px]">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      value={cand.name}
                      onChange={(e) => handleUpdateCandidate(cand.id, 'name', e.target.value)}
                      placeholder={`후보 ${idx + 1} 명칭`}
                      className="bg-transparent font-bold text-slate-200 focus:outline-none focus:border-b focus:border-cyan-500 w-full"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="cursor-pointer text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center space-x-1 px-2 py-1 rounded bg-slate-900 border border-slate-800">
                      <Upload className="w-3 h-3" />
                      <span>파일(PDB/FASTA) 불러오기</span>
                      <input
                        type="file"
                        accept=".pdb,.fasta,.fa,.txt"
                        onChange={(e) => handleCandidateFileUpload(cand.id, e)}
                        className="hidden"
                      />
                    </label>

                    {candidates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCandidate(cand.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition"
                        title="후보 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="w-full">
                  <textarea
                    rows={2}
                    value={cand.input}
                    onChange={(e) => handleUpdateCandidate(cand.id, 'input', e.target.value)}
                    placeholder="아미노산 서열(FASTA/단일문자), PDB ID, 또는 PDB 구조 텍스트를 입력하거나 우측 파일 불러오기 클릭"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 font-mono text-xs focus:outline-none focus:border-cyan-500 resize-y"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Batch Screening Results Leaderboard Table */}
      {batchResponse && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2.5">
              <Trophy className="w-5 h-5 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>후보 물질 항원성 모방도 순위 리더보드 (Screening Leaderboard)</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-mono">
                    총 {batchResponse.results.length}개 후보 분석 완료
                  </span>
                </h3>
                <span className="text-xs text-slate-400">
                  종합 모방 적합도(Final Fitness Score) 및 에피톱별 국소 보존성 정량 비교
                </span>
              </div>
            </div>

            <button
              onClick={handleExportCsv}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>리더보드 CSV 다운로드</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider bg-slate-950/60">
                  <th className="py-2.5 px-3 text-center w-12">순위</th>
                  <th className="py-2.5 px-3">후보 물질 엔티티명</th>
                  <th className="py-2.5 px-3 text-right">종합 모방도</th>
                  <th className="py-2.5 px-3 text-center">판정 등급</th>
                  <th className="py-2.5 px-3 text-right">골격 유사도 (S_global)</th>
                  <th className="py-2.5 px-3 text-right">에피톱 모방도 (S_epi)</th>
                  <th className="py-2.5 px-3 text-right">Cα RMSD (Å)</th>
                  <th className="py-2.5 px-3 text-right">표면 일치 (S_exp)</th>
                  <th className="py-2.5 px-3 text-center">3D 정밀 분석</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {batchResponse.results.map((item, idx) => {
                  const d = item.data;
                  if (!d) {
                    return (
                      <tr key={item.candidate_id} className="bg-rose-950/20">
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                        <td className="py-3 px-3 font-bold text-slate-200">{item.candidate_name}</td>
                        <td colSpan={6} className="py-3 px-3 text-rose-400 text-xs">{item.error || '분석 실패'}</td>
                        <td className="py-3 px-3 text-center">-</td>
                      </tr>
                    );
                  }

                  const score = d.final_fitness_score ?? 0;
                  const gInfo = getFitnessScoreGrade(score);
                  const gradeBg = `${gInfo.badgeBg} bg-opacity-60`;
                  const gradeText = gInfo.level;

                  const isRank1 = idx === 0;

                  return (
                    <tr
                      key={item.candidate_id}
                      className={`hover:bg-slate-800/40 transition ${isRank1 ? 'bg-cyan-950/20' : ''}`}
                    >
                      <td className="py-3 px-3 text-center font-bold font-mono">
                        {isRank1 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50">
                            1
                          </span>
                        ) : (
                          <span className="text-slate-400">{idx + 1}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{item.candidate_name}</div>
                        {d.epitope_breakdown && d.epitope_breakdown.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {d.epitope_breakdown.map((ep) => (
                              <span
                                key={ep.id}
                                className="text-[10px] px-1.5 py-0.5 rounded font-mono border"
                                style={{
                                  backgroundColor: `${ep.color}15`,
                                  borderColor: `${ep.color}40`,
                                  color: ep.color,
                                }}
                              >
                                {ep.name}: {(ep.sEpi * 100).toFixed(0)}% ({ep.rmsd.toFixed(2)}Å)
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-sm text-cyan-300">
                        {score.toFixed(2)}점
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${gradeBg}`}>
                          {gradeText}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">
                        {((d.sub_scores.s_global ?? 0) * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">
                        {((d.sub_scores.s_epi ?? 0) * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">
                        {(d.alignment.rmsd ?? 0).toFixed(2)} Å
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">
                        {((d.sub_scores.s_exp ?? 0) * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => {
                            const jobResultObj: JobResultData = {
                              status: 'done',
                              data: d,
                            };
                            onInspectCandidate(jobResultObj, d.target_pdb, d.aligned_candidate_pdb);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/50 text-xs font-bold transition flex items-center space-x-1 mx-auto"
                        >
                          <span>3D 뷰 및 AI 리포트</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

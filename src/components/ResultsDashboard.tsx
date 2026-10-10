import React, { useState } from 'react';
import {
  ShieldAlert,
  Sliders,
  Download,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  TrendingUp,
  Search,
  Printer,
  FileText,
  Bot,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { JobResultData, fetchAiInsight } from '../services/api.ts';
import { StructureViewer } from './StructureViewer.tsx';
import { TermTooltip } from './GlossaryModal.tsx';
import { printReport, downloadPdfReport, downloadHtmlReport } from '../utils/reportExporter.ts';
import { AiInsightView } from '../utils/aiTagParser.tsx';

interface ResultsDashboardProps {
  jobResult: JobResultData;
  targetPdb?: string;
  candidatePdb?: string;
  onWeightsChange?: (newWeights: [number, number, number, number]) => void;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  jobResult,
  targetPdb,
  candidatePdb,
  onWeightsChange,
}) => {
  const result = jobResult.data;
  if (!result) return null;

  // Local weights state for dynamic exploration
  const initialWeights: [number, number, number, number] = result.weights || [0.25, 0.40, 0.20, 0.15];
  const [weights, setWeights] = useState<[number, number, number, number]>(initialWeights);
  const [showWeightsPanel, setShowWeightsPanel] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'epitope' | 'high_dist' | 'low_plddt'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // AI Insight states
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>('');
  const [copiedAi, setCopiedAi] = useState<boolean>(false);

  // Dynamic score recalculation based on slider weights
  const isExperimental = result.auto_settings.is_experimental_candidate;
  const [wGlobal = 0.25, wEpi = 0.40, wExp = 0.20, wConf = 0.15] = weights || [];
  const rawW = [wGlobal, wEpi, wExp, wConf];
  let normW: number[];
  if (isExperimental) {
    const sumW = (rawW[0] || 0) + (rawW[1] || 0) + (rawW[2] || 0);
    normW = sumW > 0
      ? [(rawW[0] || 0) / sumW, (rawW[1] || 0) / sumW, (rawW[2] || 0) / sumW, 0]
      : [1 / 3, 1 / 3, 1 / 3, 0];
  } else {
    const sumW = (rawW[0] || 0) + (rawW[1] || 0) + (rawW[2] || 0) + (rawW[3] || 0) || 1.0;
    normW = [(rawW[0] || 0) / sumW, (rawW[1] || 0) / sumW, (rawW[2] || 0) / sumW, (rawW[3] || 0) / sumW];
  }

  const sGlobal = result.sub_scores?.s_global ?? 0;
  const sEpi = result.sub_scores?.s_epi ?? 0;
  const sExp = result.sub_scores?.s_exp ?? 0;
  const sConfRaw = result.sub_scores?.s_conf;
  const sConf = sConfRaw === null || sConfRaw === undefined ? null : sConfRaw;

  const dynamicScore = Math.round(
    100 * (normW[0] * sGlobal + normW[1] * sEpi + normW[2] * sExp + (isExperimental ? 0 : normW[3] * (sConf ?? 0))) * 100
  ) / 100;

  const isSimulatedStructure =
    result.auto_settings.is_simulated ||
    result.auto_settings.candidate_source === 'simulated';

  // Score grade
  let gradeBadge = { label: '낮음 (Low)', bg: 'bg-rose-950 text-rose-300 border-rose-800' };
  if (dynamicScore >= 75.0) {
    gradeBadge = { label: '높음 (High)', bg: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
  } else if (dynamicScore >= 50.0) {
    gradeBadge = { label: '중간 (Moderate)', bg: 'bg-amber-950 text-amber-300 border-amber-800' };
  }

  if (result.auto_settings.is_temporary_epitope) {
    gradeBadge.label += ' (임시 에피톱)';
  } else if (isSimulatedStructure) {
    gradeBadge.label += ' (모사 구조)';
  }

  // Generate AI Insight handler
  const handleGenerateAi = async () => {
    setIsAiLoading(true);
    setAiError('');
    try {
      const jobId = jobResult.job_id;
      if (!jobId) {
        throw new Error('job_id가 없습니다.');
      }
      const res = await fetchAiInsight({
        job_id: jobId,
      });
      setAiInsight(res.insight);
    } catch (err: any) {
      setAiError(err.message || 'AI 리포트 생성에 실패했습니다.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCopyAi = () => {
    if (!aiInsight) return;
    navigator.clipboard.writeText(aiInsight);
    setCopiedAi(true);
    setTimeout(() => setCopiedAi(false), 2000);
  };

  // Export and print handlers (passing aiInsight)
  const handlePrint = () => {
    printReport(result, dynamicScore, normW, aiInsight);
  };

  const handleDownloadPdf = () => {
    downloadPdfReport(result, dynamicScore, normW, aiInsight);
  };

  const handleDownloadHtml = () => {
    downloadHtmlReport(result, dynamicScore, normW, aiInsight);
  };

  // Sensitivity analysis table calculations: ±20% variations
  const sensitivityRows = [
    {
      name: '기준 가중치 (Baseline)',
      w: normW,
      score: dynamicScore,
      diff: '0.00',
    },
    {
      name: 'S_epi 강조 (+20% 에피톱 모방)',
      w: [normW[0] * 0.9, normW[1] * 1.2, normW[2] * 0.9, normW[3] * 0.9],
      score: Math.round(100 * ((normW[0] * 0.9) * sGlobal + (normW[1] * 1.2) * sEpi + (normW[2] * 0.9) * sExp + (isExperimental ? 0 : (normW[3] * 0.9) * (sConf ?? 0))) / (normW[0]*0.9 + normW[1]*1.2 + normW[2]*0.9 + (isExperimental ? 0 : normW[3]*0.9)) * 100) / 100,
      diff: '',
    },
    {
      name: 'S_global 강조 (+20% 전체 골격)',
      w: [normW[0] * 1.2, normW[1] * 0.9, normW[2] * 0.9, normW[3] * 0.9],
      score: Math.round(100 * ((normW[0] * 1.2) * sGlobal + (normW[1] * 0.9) * sEpi + (normW[2] * 0.9) * sExp + (isExperimental ? 0 : (normW[3] * 0.9) * (sConf ?? 0))) / (normW[0]*1.2 + normW[1]*0.9 + normW[2]*0.9 + (isExperimental ? 0 : normW[3]*0.9)) * 100) / 100,
      diff: '',
    },
    {
      name: 'S_exp 강조 (+20% 노출도)',
      w: [normW[0] * 0.9, normW[1] * 0.9, normW[2] * 1.2, normW[3] * 0.9],
      score: Math.round(100 * ((normW[0] * 0.9) * sGlobal + (normW[1] * 0.9) * sEpi + (normW[2] * 1.2) * sExp + (isExperimental ? 0 : (normW[3] * 0.9) * (sConf ?? 0))) / (normW[0]*0.9 + normW[1]*0.9 + normW[2]*1.2 + (isExperimental ? 0 : normW[3]*0.9)) * 100) / 100,
      diff: '',
    },
  ].map((row, idx) => {
    if (idx === 0) return row;
    const diffVal = (row.score ?? 0) - (dynamicScore ?? 0);
    return {
      ...row,
      diff: (diffVal >= 0 ? '+' : '') + diffVal.toFixed(2),
    };
  });

  // Residue list filtering
  const allResidues = result.residues || [];
  const filteredResidues = allResidues.filter((r) => {
    if (filterMode === 'epitope' && !r.in_epitope) return false;
    if (filterMode === 'high_dist' && (r.distance < 2.5 || r.distance < 0)) return false;
    if (filterMode === 'low_plddt' && r.plddt >= 70.0) return false;
    if (searchQuery) {
      const q = searchQuery.trim().toLowerCase();
      const matchId = r.res_id.toString().includes(q);
      const matchName = (r.res_name || '').toLowerCase().includes(q);
      if (!matchId && !matchName) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredResidues.length / pageSize) || 1;
  const pagedResidues = filteredResidues.slice((page - 1) * pageSize, page * pageSize);

  // CSV export handler
  const handleExportCsv = () => {
    const headers = [
      'Residue_ID',
      'Amino_Acid',
      'In_Epitope',
      'Distance_Angstrom',
      'RSA_Target',
      'RSA_Candidate',
      'RSA_Diff',
      'pLDDT',
      'Local_Similarity_Score',
    ];
    const rows = allResidues.map((r) => [
      r.res_id,
      r.res_name || '',
      r.in_epitope ? 'YES' : 'NO',
      (r.distance ?? -1) >= 0 ? (r.distance ?? 0).toFixed(3) : 'UNALIGNED',
      (r.rsa_target ?? 0).toFixed(3),
      (r.rsa_candidate ?? 0).toFixed(3),
      Math.abs((r.rsa_candidate ?? 0) - (r.rsa_target ?? 0)).toFixed(3),
      (r.plddt ?? 0).toFixed(1),
      (r.similarity ?? 0).toFixed(4),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SSBD_Residues_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStructureSourceInfo = (autoSettings: any) => {
    const src = autoSettings.candidate_source;
    if (src === 'simulated' || autoSettings.is_simulated) {
      return {
        sourceBadge: '모사(대체)',
        trustGrade: '신뢰 등급: 낮음 (Low - 템플릿 대체)',
        badgeClass: 'bg-rose-950/80 text-rose-300 border-rose-800',
      };
    }
    if (src === 'alphafold') {
      return {
        sourceBadge: 'AlphaFold DB',
        trustGrade: '신뢰 등급: pLDDT 기반 (Moderate/High - DB)',
        badgeClass: 'bg-sky-950/80 text-sky-300 border-sky-800',
      };
    }
    if (src === 'experimental' || autoSettings.is_experimental_candidate) {
      return {
        sourceBadge: '실험',
        trustGrade: '신뢰 등급: 높음 (High - PDB 결정학/NMR)',
        badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
      };
    }
    return {
      sourceBadge: 'ESMFold 예측',
      trustGrade: '신뢰 등급: pLDDT 기반 (Moderate - AI 예측)',
      badgeClass: 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
    };
  };

  const sourceInfo = getStructureSourceInfo(result.auto_settings);

  return (
    <div className="space-y-6">
      {/* 0. Prominent Simulated Structure Warning Banner if applicable */}
      {isSimulatedStructure && (
        <div className="p-4 rounded-2xl bg-rose-950/80 border-2 border-rose-500 shadow-2xl text-rose-100 flex items-start space-x-3.5 animate-pulse">
          <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <strong className="text-rose-200 font-extrabold text-sm block mb-1">
              ⚠️ 경고: 모사 구조 기반, 연구용 사용 불가 (Simulated Model - Not For Research Use)
            </strong>
            본 분석 결과는 ESMFold API 응답 부재 시 서열 템플릿 모사(Sequence Threading)로 생성된 대체 구조에 기반합니다. 실제 단백질 3D 좌표 예측이 아니므로 점수를 신뢰할 수 없으며, 학술 논문 및 공식 연구 결과물로 사용할 수 없습니다.
          </div>
        </div>
      )}

      {/* 1. Mandatory Top Disclaimer Banner */}
      <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/50 shadow-lg text-amber-200 flex items-start space-x-3.5">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <strong className="text-amber-300 font-bold block mb-0.5">
            면책 조항 (Disclaimer): "이 결과는 구조 비교이며 백신의 효과나 안전성을 의미하지 않습니다."
          </strong>
          본 시스템은 <em>in silico</em> 구조 중첩 및 에피톱 국소 모방도를 수학적으로 비교하는 분석 도구입니다. 논문 및 보고서 작성 시 <strong>"효과 검증"</strong>이 아닌 <strong>"구조 모방도 기반 항원성 보존 예측(Antigenic Mimicry Prediction)"</strong>으로 기술해야 합니다.
        </div>
      </div>

      {/* 2. "이렇게 정했어요" Auto-settings Box */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
            <Info className="w-4 h-4 text-cyan-400" />
            <span>이렇게 정했어요 (분석 파이프라인 자동 판정 요약)</span>
          </span>
          <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-mono">
            {result.reproducibility?.inputHash && (
              <span className="bg-slate-800 text-cyan-400 px-1.5 py-0.5 rounded text-[10px]">
                Hash: {result.reproducibility.inputHash}
              </span>
            )}
            <span>{result.reproducibility?.timestamp?.substring(0, 19).replace('T', ' ')}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-400 text-[10px] block">분석 모드 (Mode)</span>
            <span className="font-bold text-cyan-300">
              {result.auto_settings.mode === 'fragment' ? '단편 (Fragment: 후보 길이 정규화)' : '전체 (Full: 타겟 길이 정규화)'}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-400 text-[10px] block">에피톱 소스 (Epitope Source)</span>
            <span className="font-bold text-rose-300">
              {result.auto_settings.is_temporary_epitope ? '임시 에피톱 사용 (RSA ≥ 0.2)' : result.auto_settings.epitope_source}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-400 text-[10px] block">타겟 분석 체인</span>
            <span className="font-bold text-slate-200">체인 {result.auto_settings.target_chain}</span>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
            <span className="text-slate-400 text-[10px] block">구조 출처 &amp; 신뢰 등급</span>
            <span className={`font-bold block ${sourceInfo.badgeClass.split(' ')[1]}`}>
              구조 출처: {sourceInfo.sourceBadge}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              {sourceInfo.trustGrade}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Main Fitness Score Card & Sub-score Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Overall Fitness Score */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 border border-cyan-500/30 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-400">종합 항원 구조 적합도 점수</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${gradeBadge.bg}`}>
                {gradeBadge.label}
              </span>
            </div>

            <div className="flex items-baseline space-x-2 my-2">
              <span className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-indigo-200 font-mono tracking-tight">
                {dynamicScore.toFixed(1)}
              </span>
              <span className="text-sm font-semibold text-slate-400">/ 100점</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 my-2.5">
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${sourceInfo.badgeClass}`}>
                구조 출처: {sourceInfo.sourceBadge}
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-semibold border bg-slate-950 text-slate-300 border-slate-800">
                {sourceInfo.trustGrade}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              TM-score(전체 골격)와 에피톱 국소 3D 일치도(S_epi), 표면 노출도(S_exp), 예측 신뢰도(S_conf)의 가중 선형 결합 지표입니다.
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>정렬 Cα 원자간 <TermTooltip termKey="rmsd">RMSD</TermTooltip>:</span>
              <span className="font-mono font-bold text-amber-300">{(result.alignment?.rmsd ?? 0).toFixed(2)} Å</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>정렬 길이 / 커버리지:</span>
              <span className="font-mono font-bold text-slate-200">
                {result.alignment?.aligned_length ?? 0} 잔기 ({Math.round((result.alignment?.coverage ?? 0) * 100)}%)
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>타겟 기준 TM-score:</span>
              <span className="font-mono font-bold text-cyan-300">
                {(result.alignment?.tm_score_target_norm ?? (result.alignment as any)?.tmScoreTargetNorm ?? 0).toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: 4 Sub-Scores Cards */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* S_global */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-cyan-300 flex items-center space-x-1">
                  <TermTooltip termKey="tm_score">S_global (전체 골격)</TermTooltip>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">가중치 {Math.round(normW[0] * 100)}%</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white my-1">
                {sGlobal.toFixed(3)}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                단백질 3D 전체 접힘(Fold) 유사도. 0.5 이상이면 동일한 전역 골격 위상(Topology)입니다.
              </p>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, sGlobal * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* S_epi */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-rose-300 flex items-center space-x-1">
                  <TermTooltip termKey="s_epi">S_epi (에피톱 모방도)</TermTooltip>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">가중치 {Math.round(normW[1] * 100)}%</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white my-1">
                {sEpi.toFixed(3)}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                중화 에피톱 잔기들의 3D 위치 일치도 (1 / (1 + (d/3Å)²)). 거리가 0에 가까울수록 1에 수렴합니다.
              </p>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-rose-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, sEpi * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* S_exp */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-emerald-300 flex items-center space-x-1">
                  <TermTooltip termKey="sasa_rsa">S_exp (노출도 일치율)</TermTooltip>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">가중치 {Math.round(normW[2] * 100)}%</span>
              </div>
              <div className="text-2xl font-bold font-mono text-white my-1">
                {sExp.toFixed(3)}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                1 - mean(|RSA_후보 - RSA_타겟|). 에피톱이 내부에 묻히지 않고 항체가 결합 가능한 표면에 노출된 정도입니다.
              </p>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, sExp * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* S_conf */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-amber-300 flex items-center space-x-1">
                  <TermTooltip termKey="plddt">S_conf (예측 신뢰도)</TermTooltip>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {isExperimental ? '가중치 0% (N/A)' : `가중치 ${Math.round(normW[3] * 100)}%`}
                </span>
              </div>
              <div className="text-2xl font-bold font-mono text-white my-1">
                {sConf !== null ? sConf.toFixed(3) : '해당 없음'}
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                {isExperimental
                  ? '실험 결정 구조 후보이므로 S_conf는 해당 없으며, 가중치가 타 지표(S_global, S_epi, S_exp)로 재분배되었습니다.'
                  : '에피톱 잔기 중 pLDDT ≥ 70 이상인 비율입니다.'}
              </p>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-amber-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${sConf !== null ? Math.min(100, sConf * 100) : 0}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* 3.5 Multi-Epitope Entity Breakdown (if multi-epitopes evaluated) */}
      {(result as any).epitope_breakdown && (result as any).epitope_breakdown.length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-rose-500/30 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-rose-400" />
              <h3 className="text-xs font-bold text-white">
                다중 에피톱 엔티티별 국소 모방도 상세 분석 (Multi-Epitope Entity Breakdown: {(result as any).epitope_breakdown.length}개)
              </h3>
            </div>
            <span className="text-[10px] text-rose-300 bg-rose-950/60 border border-rose-800 px-2 py-0.5 rounded font-mono">
              다원적 에피톱 가중 합성 (Poly-Epitopic Evaluation)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {(result as any).epitope_breakdown.map((ep: any) => (
              <div
                key={ep.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                style={{ borderLeftColor: ep.color || '#e11d48', borderLeftWidth: '3px' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 truncate">{ep.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                    {ep.range} ({ep.residuesCount}잔기)
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-[11px] text-slate-400">국소 모방도 (S_epi):</span>
                  <span className="font-mono font-bold text-sm text-cyan-300">
                    {(ep.sEpi * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-[11px] text-slate-400">Cα 중첩 RMSD:</span>
                  <span className="font-mono text-amber-300 font-bold">{ep.rmsd.toFixed(2)} Å</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Interactive Weights Slider & Sensitivity Analysis */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <button
          onClick={() => setShowWeightsPanel(!showWeightsPanel)}
          className="w-full px-5 py-3.5 bg-slate-950/70 hover:bg-slate-950 flex items-center justify-between text-xs font-bold text-slate-200 transition"
        >
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>가중치 탐색 및 논문용 민감도 분석 (Sensitivity Analysis)</span>
            <span className="text-[10px] text-slate-500 font-normal">
              (현재 가중치: {Math.round(normW[0]*100)}%, {Math.round(normW[1]*100)}%, {Math.round(normW[2]*100)}%, {Math.round(normW[3]*100)}%)
            </span>
          </div>
          {showWeightsPanel ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showWeightsPanel && (
          <div className="p-5 border-t border-slate-800 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-cyan-300 font-semibold">w_global (전체 골격)</span>
                  <span className="font-mono text-slate-400">{(wGlobal ?? 0.25).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.80"
                  step="0.05"
                  value={wGlobal}
                  onChange={(e) => setWeights([parseFloat(e.target.value), wEpi, wExp, wConf])}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-rose-300 font-semibold">w_epi (에피톱 모방)</span>
                  <span className="font-mono text-slate-400">{(wEpi ?? 0.40).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.80"
                  step="0.05"
                  value={wEpi}
                  onChange={(e) => setWeights([wGlobal, parseFloat(e.target.value), wExp, wConf])}
                  className="w-full accent-rose-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-emerald-300 font-semibold">w_exp (노출도 일치)</span>
                  <span className="font-mono text-slate-400">{(wExp ?? 0.20).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.80"
                  step="0.05"
                  value={wExp}
                  onChange={(e) => setWeights([wGlobal, wEpi, parseFloat(e.target.value), wConf])}
                  className="w-full accent-emerald-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-amber-300 font-semibold">w_conf (예측 신뢰도)</span>
                  <span className="font-mono text-slate-400">{(wConf ?? 0.15).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.80"
                  step="0.05"
                  value={wConf}
                  onChange={(e) => setWeights([wGlobal, wEpi, wExp, parseFloat(e.target.value)])}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>
            </div>

            {/* Sensitivity Table for Research Paper */}
            <div className="pt-4 border-t border-slate-800">
              <span className="text-xs font-semibold text-slate-300 mb-2 block">
                가중치 섭동(±20%)에 따른 점수 안정성 검증표 (소논문 보고서 삽입용):
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">가중치 시나리오</th>
                      <th className="py-2 px-2 text-right">w_global</th>
                      <th className="py-2 px-2 text-right">w_epi</th>
                      <th className="py-2 px-2 text-right">w_exp</th>
                      <th className="py-2 px-2 text-right">w_conf</th>
                      <th className="py-2 px-2 text-right">재산출 점수</th>
                      <th className="py-2 px-3 text-right">기준 편차 (ΔScore)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-[11px]">
                    {sensitivityRows.map((s, idx) => (
                      <tr key={idx} className={idx === 0 ? 'bg-cyan-950/20 font-bold text-cyan-200' : 'text-slate-300'}>
                        <td className="py-2 px-3 font-sans">{s.name}</td>
                        <td className="py-2 px-2 text-right">{(s.w[0] * 100).toFixed(0)}%</td>
                        <td className="py-2 px-2 text-right">{(s.w[1] * 100).toFixed(0)}%</td>
                        <td className="py-2 px-2 text-right">{(s.w[2] * 100).toFixed(0)}%</td>
                        <td className="py-2 px-2 text-right">{(s.w[3] * 100).toFixed(0)}%</td>
                        <td className="py-2 px-2 text-right text-white font-bold">{(s.score ?? 0).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-amber-300 font-semibold">{s.diff || '0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. 3D Superposition Viewer */}
      <StructureViewer
        targetPdb={targetPdb}
        candidatePdb={candidatePdb}
        targetChain={result.auto_settings.target_chain}
        candidateChain="A"
        epitopeResidues={allResidues.filter((r) => r.in_epitope).map((r) => r.res_id)}
        multiEpitopes={(result as any).epitope_breakdown}
        residueDeviations={allResidues.map((r) => ({
          res_id: r.res_id,
          cand_res_id: r.cand_res_id,
          distance: r.distance,
          in_epitope: r.in_epitope,
          epitope_id: (r as any).epitope_id,
        }))}
        height="540px"
        title="타겟(파란색 카툰) 및 후보(노란색 카툰) 3D 정렬 화면 (3Dmol.js)"
      />

      {/* 6. Deterministic Scientific Rationale Box */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-cyan-500/30 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white">결정적 규칙 기반 정밀 평가 소견 (Deterministic Evaluation Rationale)</h3>
          </div>
          <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded font-mono">
            결정론적 템플릿 알고리즘 (재현성 100% 보장)
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans whitespace-pre-wrap space-y-2">
          {result.evaluation_rationale}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
          <span>인용 제안: TM-score 근사 구현 (Kabsch Cα Alignment), Shrake-Rupley Numerical SASA Integration.</span>
          <span className="font-mono">엔진: SSBD-Engine v1.0.0</span>
        </div>
      </div>

      {/* 6.5 AI Deep Insights Card (Powered by Groq LLaMA 3.3) */}
      <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-purple-950/30 border border-indigo-500/40 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/50">
              <Bot className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-indigo-200 flex items-center space-x-1.5">
                <span>AI 심층 항원성 해석 및 백신 전망 리포트</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">Groq LLaMA 3.3 Versatile</span>
              </h3>
              <p className="text-[10px] text-slate-400">지표별 생물학적 의미, 결합 포켓 정밀도, 항원성 보존 및 백신 효과 전망 심층 해설</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {aiInsight && (
              <button
                onClick={handleCopyAi}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition"
                title="AI 리포트 복사"
              >
                {copiedAi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedAi ? '복사됨' : '복사'}</span>
              </button>
            )}

            <button
              onClick={handleGenerateAi}
              disabled={isAiLoading}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-md ${
                isAiLoading
                  ? 'bg-indigo-900 text-indigo-300 cursor-wait'
                  : aiInsight
                  ? 'bg-indigo-700 hover:bg-indigo-600 text-white'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white animate-pulse'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAiLoading ? 'animate-spin' : ''}`} />
              <span>{isAiLoading ? 'AI 정밀 리포트 분석 중...' : aiInsight ? 'AI 리포트 재작성' : 'AI 심층 리포트 생성'}</span>
            </button>
          </div>
        </div>

        {isAiLoading && (
          <div className="p-6 rounded-xl bg-slate-950/80 border border-indigo-500/30 flex flex-col items-center justify-center space-y-2 text-indigo-300 text-xs">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <span>Groq LLaMA 3.3 고속 추론 엔진이 백신 항원성 구조 지표를 심층 분석하고 있습니다...</span>
          </div>
        )}

        {aiError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {aiError}
          </div>
        )}

        {aiInsight && !isAiLoading && (
          <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-500/30">
            <AiInsightView rawText={aiInsight} />
          </div>
        )}

        {!aiInsight && !isAiLoading && !aiError && (
          <div className="p-4 rounded-xl bg-slate-950/40 border border-dashed border-indigo-500/30 text-center text-xs text-slate-400">
            [AI 심층 리포트 생성] 버튼을 클릭하면 전체 골격 유사도(TM-score), 에피톱 3D Cα 편차, 용매 노출도(RSA) 지표의 생물학적 의미와 백신 교차 반응성 전망에 대한 정밀 해석 리포트가 생성됩니다. (생성된 AI 리포트는 PDF 및 인쇄 리포트에도 자동으로 포함됩니다)
          </div>
        )}
      </div>

      {/* 7. Residue-Level Table with CSV Export */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-white flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
              <span>잔기별 상세 지표 데이터 (Residue-Level Metrics: {filteredResidues.length}개)</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Cα 거리, 타겟/후보 상대 SASA, pLDDT 신뢰도 및 국소 일치도
            </span>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Search box */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="잔기 번호 검색..."
                className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono w-32 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                onClick={() => { setFilterMode('all'); setPage(1); }}
                className={`px-2.5 py-1 rounded ${filterMode === 'all' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400'}`}
              >
                전체
              </button>
              <button
                onClick={() => { setFilterMode('epitope'); setPage(1); }}
                className={`px-2.5 py-1 rounded ${filterMode === 'epitope' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400'}`}
              >
                에피톱만
              </button>
              <button
                onClick={() => { setFilterMode('high_dist'); setPage(1); }}
                className={`px-2.5 py-1 rounded ${filterMode === 'high_dist' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400'}`}
              >
                거리 &gt; 2.5Å
              </button>
            </div>

            {/* CSV export */}
            <button
              onClick={handleExportCsv}
              className="flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg transition shadow-md"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV 내보내기</span>
            </button>
          </div>
        </div>

        {/* Table content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-2.5 px-3">잔기 번호</th>
                <th className="py-2.5 px-2">아미노산</th>
                <th className="py-2.5 px-2">에피톱 여부</th>
                <th className="py-2.5 px-2 text-right">Cα 거리 (Å)</th>
                <th className="py-2.5 px-2 text-right">RSA (타겟)</th>
                <th className="py-2.5 px-2 text-right">RSA (후보)</th>
                <th className="py-2.5 px-2 text-right">|ΔRSA|</th>
                <th className="py-2.5 px-2 text-right">pLDDT</th>
                <th className="py-2.5 px-3 text-right">국소 유사도</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-[11px]">
              {pagedResidues.map((res) => {
                const isUnaligned = res.distance < 0;
                const rsaDiff = Math.abs(res.rsa_candidate - res.rsa_target);
                return (
                  <tr
                    key={res.res_id}
                    className={`hover:bg-slate-800/40 transition ${
                      res.in_epitope ? 'bg-rose-950/20' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-bold text-slate-200">#{res.res_id}</td>
                    <td className="py-2 px-2 text-slate-300 font-sans">{res.res_name || 'AA'}</td>
                    <td className="py-2 px-2">
                      {res.in_epitope ? (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-sans font-semibold">
                          에피톱
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[10px] font-sans">비에피톱</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-bold">
                      {isUnaligned ? (
                        <span className="text-slate-500">미정렬</span>
                      ) : (
                        <span
                          className={
                            res.distance <= 1.5
                              ? 'text-cyan-400'
                              : res.distance <= 3.0
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }
                        >
                          {(res.distance ?? 0).toFixed(2)} Å
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">{(res.rsa_target ?? 0).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right text-slate-300">{(res.rsa_candidate ?? 0).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right font-medium text-amber-300">{(rsaDiff ?? 0).toFixed(2)}</td>
                    <td className="py-2 px-2 text-right">
                      <span className={(res.plddt ?? 0) >= 70 ? 'text-emerald-400' : 'text-rose-400'}>
                        {(res.plddt ?? 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-cyan-300">
                      {(res.similarity ?? 0).toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="px-4 py-2.5 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            페이지 {page} / {totalPages} (총 {filteredResidues.length}개 잔기)
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200"
            >
              다음
            </button>
          </div>
        </div>
      </div>

      {/* 8. Download and Export Bar */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2 text-slate-300 font-medium">
          <Download className="w-4 h-4 text-cyan-400" />
          <span>분석 결과 리포트 및 구조 좌표 내보내기:</span>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {result.aligned_pdb_download_url && (
            <a
              href={result.aligned_pdb_download_url}
              download="aligned_candidate.pdb"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition shadow-sm"
              title="Kabsch 알고리즘으로 회전/이동된 후보 물질 3D PDB 파일 다운로드"
            >
              <Download className="w-3.5 h-3.5" />
              <span>정렬된 PDB (aligned.pdb)</span>
            </a>
          )}

          <button
            onClick={handleDownloadPdf}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-sm"
            title="분석 결과 요약 및 잔기 데이터를 PDF 문서 파일(.pdf)로 즉시 다운로드"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF 보고서 저장 (.pdf)</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition"
            title="브라우저 인쇄 대화상자를 열어 PDF로 저장하거나 프린터로 출력"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-400" />
            <span>인쇄 미리보기 / 출력</span>
          </button>

          <button
            onClick={handleDownloadHtml}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition"
            title="언제든 오프라인에서 열어볼 수 있는 단독 웹 리포트(.html) 다운로드"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>HTML 리포트 저장</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition"
            title="전체 잔기별 거리, 노출도, pLDDT 표를 엑셀/CSV로 다운로드"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV 데이터 다운로드</span>
          </button>
        </div>
      </div>
    </div>
  );
};

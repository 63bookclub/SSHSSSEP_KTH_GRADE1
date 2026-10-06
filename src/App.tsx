import React, { useState, useEffect } from 'react';
import {
  Header,
} from './components/Header.tsx';
import { TargetStep } from './components/TargetStep.tsx';
import { EpitopeStep } from './components/EpitopeStep.tsx';
import { CandidateStep } from './components/CandidateStep.tsx';
import { ResultsDashboard } from './components/ResultsDashboard.tsx';
import { ValidationLab } from './components/ValidationLab.tsx';
import { GlossaryModal } from './components/GlossaryModal.tsx';
import { QuickAnalyzeView } from './components/QuickAnalyzeView.tsx';
import { BatchScreeningView } from './components/BatchScreeningView.tsx';
import {
  submitTarget,
  submitEpitope,
  submitCandidate,
  submitJob,
  getJobResult,
  quickAnalyze,
  TargetResponse,
  EpitopeResponse,
  CandidateResponse,
  JobResultData,
} from './services/api.ts';
import { PRESET_BENCHMARKS } from './services/presets.ts';
import {
  Layers,
  Dna,
  ArrowRight,
  Play,
  RefreshCw,
  AlertCircle,
  Sparkles,
  History,
  Trash2,
} from 'lucide-react';

interface SavedHistoryItem {
  id: string;
  timestamp: string;
  score: number;
  mode: string;
  jobResult: JobResultData;
  targetPdb?: string;
  candidatePdb?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'workflow' | 'validation'>('workflow');
  const [entryMode, setEntryMode] = useState<'quick' | 'batch' | 'wizard'>('quick');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Workflow state
  const [targetData, setTargetData] = useState<TargetResponse | null>(null);
  const [selectedChain, setSelectedChain] = useState<string>('');
  const [epitopeData, setEpitopeData] = useState<EpitopeResponse | null>(null);
  const [candidateData, setCandidateData] = useState<CandidateResponse | null>(null);
  const [jobResult, setJobResult] = useState<JobResultData | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false);

  // Analysis History in LocalStorage
  const [historyItems, setHistoryItems] = useState<SavedHistoryItem[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ssbd_analysis_history');
      if (saved) {
        setHistoryItems(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load history from localStorage', e);
    }
  }, []);

  const saveToHistory = (result: JobResultData, targetPdb?: string, candidatePdb?: string) => {
    try {
      const newItem: SavedHistoryItem = {
        id: result.job_id || result.job_id || Date.now().toString(),
        timestamp: result.data?.reproducibility?.timestamp || new Date().toISOString(),
        score: result.data?.final_fitness_score ?? 0,
        mode: result.data?.auto_settings?.mode || 'full',
        jobResult: result,
        targetPdb: targetPdb || result.data?.target_pdb,
        candidatePdb: candidatePdb || result.data?.aligned_candidate_pdb,
      };

      setHistoryItems((prev) => {
        const filtered = prev.filter((item) => item.id !== newItem.id);
        const updated = [newItem, ...filtered].slice(0, 20); // Keep last 20 analyses
        localStorage.setItem('ssbd_analysis_history', JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.error('Failed to save history to localStorage', e);
    }
  };

  const clearHistory = () => {
    localStorage.removeItem('ssbd_analysis_history');
    setHistoryItems([]);
  };

  const loadFromHistory = (item: SavedHistoryItem) => {
    setJobResult(item.jobResult);
    if (item.targetPdb) {
      setTargetData((prev) => prev ? { ...prev, sample_pdb: item.targetPdb } : null);
    }
    if (item.candidatePdb) {
      setCandidateData((prev) => prev ? { ...prev, sample_pdb: item.candidatePdb } : null);
    }
    setCurrentStep(4);
    setShowHistoryModal(false);
  };

  // Handler to inspect a specific candidate from batch screening
  const handleInspectBatchCandidate = (
    result: JobResultData,
    targetPdb?: string,
    candidatePdb?: string
  ) => {
    setJobResult(result);
    setTargetData((prev) => (prev ? { ...prev, sample_pdb: targetPdb } : null));
    setCandidateData((prev) => (prev ? { ...prev, sample_pdb: candidatePdb } : null));
    setEntryMode('quick');
  };

  // Quick Analyze Handler
  const handleQuickAnalyze = async (params: {
    target_input: string;
    candidate_input: string;
    target_chain?: string;
    candidate_chain?: string;
    epitope_range?: string;
    weights?: [number, number, number, number];
  }) => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await quickAnalyze(params);
      setJobResult(res);
      saveToHistory(res);
      setCurrentStep(4);
    } catch (err: any) {
      setAnalysisError(err.message || '분석 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleResetToNew = () => {
    setJobResult(null);
    setTargetData(null);
    setSelectedChain('');
    setEpitopeData(null);
    setCandidateData(null);
    setCurrentStep(1);
    setAnalysisError(null);
  };

  const loadPreset = async (presetId: string) => {
    const preset = PRESET_BENCHMARKS.find((p) => p.id === presetId);
    if (!preset) return;

    setAnalyzing(true);
    setAnalysisError(null);
    try {
      // 1. Submit target
      const tRes = await submitTarget({
        pdb_id: preset.target.identifier,
      });
      setTargetData(tRes);
      setSelectedChain(preset.target.chain);

      // 2. Submit epitope
      const eRes = await submitEpitope({
        target_id: tRes.target_id,
        target_chain: preset.target.chain,
        method: preset.epitope.method,
        manual_range: preset.epitope.manualRange,
        complex_pdb_id: preset.epitope.complexPdbId,
        antigen_chain: preset.epitope.antigenChain,
        antibody_chains: preset.epitope.antibodyChains,
      });
      setEpitopeData(eRes);

      // 3. Submit candidate
      const cRes = await submitCandidate({
        sequence: preset.candidate.sequence,
        filename: preset.candidate.name,
      });
      setCandidateData(cRes);

      // 4. Run Job
      const job = await submitJob({
        target_id: tRes.target_id,
        candidate_id: cRes.candidate_id,
        epitope_id: eRes.epitope_id,
        target_chain: preset.target.chain,
      });

      const res = await getJobResult(job.job_id);
      setJobResult(res);
      saveToHistory(res);
      setCurrentStep(4);
      setActiveTab('workflow');
    } catch (err: any) {
      console.error('Failed to load preset:', err);
      setAnalysisError(err.message || '예제 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!targetData || !epitopeData || !candidateData) {
      setAnalysisError('타겟, 에피톱, 후보 물질 정보를 모두 설정해야 분석을 실행할 수 있습니다.');
      return;
    }

    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const job = await submitJob({
        target_id: targetData.target_id,
        candidate_id: candidateData.candidate_id,
        epitope_id: epitopeData.epitope_id,
        target_chain: selectedChain,
      });

      const res = await getJobResult(job.job_id);
      if (res.status === 'failed') {
        throw new Error(res.error || '분석 작업이 실패했습니다.');
      }
      setJobResult(res);
      saveToHistory(res);
      setCurrentStep(4);
    } catch (err: any) {
      setAnalysisError(err.message || '구조 정렬 및 점수 산출 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Global Header */}
      <Header
        onOpenGlossary={() => setIsGlossaryOpen(true)}
        onOpenValidationLab={() => {
          setActiveTab('validation');
        }}
        onSelectPreset={(id) => loadPreset(id)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'validation' ? (
          <ValidationLab
            onLoadPreset={(id) => {
              loadPreset(id);
            }}
          />
        ) : (
          <div className="space-y-6">
            {/* Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
              <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs shadow-inner">
                <button
                  onClick={() => setEntryMode('quick')}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                    entryMode === 'quick'
                      ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>초간편 2-입력 모드</span>
                </button>
                <button
                  onClick={() => setEntryMode('batch')}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                    entryMode === 'batch'
                      ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>다중 엔티티 일괄 스크리닝</span>
                </button>
                <button
                  onClick={() => setEntryMode('wizard')}
                  className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                    entryMode === 'wizard'
                      ? 'bg-gradient-to-r from-cyan-500 to-indigo-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Dna className="w-3.5 h-3.5" />
                  <span>단계별 마법사 모드</span>
                </button>
              </div>

              <div className="flex items-center space-x-2 self-start sm:self-auto">
                <button
                  onClick={() => setShowHistoryModal(true)}
                  className="text-xs px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition flex items-center space-x-1.5 shadow-sm relative"
                >
                  <History className="w-3.5 h-3.5 text-cyan-400" />
                  <span>분석 이력 ({historyItems.length})</span>
                </button>

                {jobResult && (
                  <button
                    onClick={handleResetToNew}
                    className="text-xs px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition flex items-center space-x-1.5 shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>새로운 단백질 분석하기</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Mode View */}
            {entryMode === 'quick' && !jobResult && (
              <QuickAnalyzeView
                onAnalyze={handleQuickAnalyze}
                loading={analyzing}
                onSwitchToWizard={() => setEntryMode('wizard')}
              />
            )}

            {/* Batch Screening Mode View */}
            {entryMode === 'batch' && !jobResult && (
              <BatchScreeningView onInspectCandidate={handleInspectBatchCandidate} />
            )}

            {/* Quick / Inspected Result */}
            {(entryMode === 'quick' || entryMode === 'batch') && jobResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  <span className="text-xs font-bold text-cyan-300">
                    선택한 후보 물질 정밀 분석 결과 화면 (3D 구조 중첩 및 AI 리포트)
                  </span>
                  <button
                    onClick={() => {
                      setJobResult(null);
                      setEntryMode('batch');
                    }}
                    className="text-xs px-3 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 rounded-lg border border-cyan-500/40 transition font-semibold"
                  >
                    ← 리더보드 목록으로 돌아가기
                  </button>
                </div>
                <ResultsDashboard
                  jobResult={jobResult}
                  targetPdb={jobResult.data?.target_pdb || targetData?.sample_pdb}
                  candidatePdb={jobResult.data?.aligned_candidate_pdb || candidateData?.sample_pdb}
                />
              </div>
            )}

            {/* Wizard Mode View */}
            {entryMode === 'wizard' && (
              <>
            {/* Stepper Navigation */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg backdrop-blur-sm">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {/* Step 1 */}
                <button
                  onClick={() => setCurrentStep(1)}
                  className={`flex items-center space-x-2.5 p-2.5 rounded-xl text-left transition ${
                    currentStep === 1
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-white'
                      : targetData
                      ? 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/50'
                      : 'text-slate-500'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      currentStep === 1
                        ? 'bg-cyan-500 text-slate-950'
                        : targetData
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {targetData ? '✓' : '1'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-medium">1단계</span>
                    <span className="text-xs font-bold truncate block">타겟 구조 및 체인</span>
                  </div>
                </button>

                {/* Step 2 */}
                <button
                  onClick={() => setCurrentStep(2)}
                  className={`flex items-center space-x-2.5 p-2.5 rounded-xl text-left transition ${
                    currentStep === 2
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-white'
                      : epitopeData
                      ? 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/50'
                      : 'text-slate-500'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      currentStep === 2
                        ? 'bg-cyan-500 text-slate-950'
                        : epitopeData
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {epitopeData ? '✓' : '2'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-medium">2단계</span>
                    <span className="text-xs font-bold truncate block">에피톱 정의</span>
                  </div>
                </button>

                {/* Step 3 */}
                <button
                  onClick={() => setCurrentStep(3)}
                  className={`flex items-center space-x-2.5 p-2.5 rounded-xl text-left transition ${
                    currentStep === 3
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-white'
                      : candidateData
                      ? 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/50'
                      : 'text-slate-500'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      currentStep === 3
                        ? 'bg-cyan-500 text-slate-950'
                        : candidateData
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {candidateData ? '✓' : '3'}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-medium">3단계</span>
                    <span className="text-xs font-bold truncate block">백신 후보 물질</span>
                  </div>
                </button>

                {/* Step 4 */}
                <button
                  onClick={() => jobResult && setCurrentStep(4)}
                  disabled={!jobResult}
                  className={`flex items-center space-x-2.5 p-2.5 rounded-xl text-left transition ${
                    currentStep === 4
                      ? 'bg-cyan-500/20 border border-cyan-500/50 text-white'
                      : jobResult
                      ? 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/50'
                      : 'text-slate-600 opacity-60'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      currentStep === 4
                        ? 'bg-cyan-500 text-slate-950'
                        : jobResult
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    4
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block font-medium">4단계</span>
                    <span className="text-xs font-bold truncate block">구조 겹침 및 평가 결과</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Step Content */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <TargetStep
                  onTargetReady={(tgt, chain) => {
                    setTargetData(tgt);
                    setSelectedChain(chain);
                  }}
                  currentTarget={targetData || undefined}
                  currentChain={selectedChain}
                />
                {targetData && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-bold text-xs shadow-lg transition"
                    >
                      <span>다음: 2단계 에피톱 정의</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && targetData && (
              <div className="space-y-4">
                <EpitopeStep
                  targetData={targetData}
                  selectedChain={selectedChain}
                  onEpitopeReady={(epi) => setEpitopeData(epi)}
                  currentEpitope={epitopeData || undefined}
                />
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    이전 단계
                  </button>
                  {epitopeData && (
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-bold text-xs shadow-lg transition"
                    >
                      <span>다음: 3단계 백신 후보 물질 입력</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <CandidateStep
                  onCandidateReady={(cand) => setCandidateData(cand)}
                  currentCandidate={candidateData || undefined}
                  targetId={targetData?.target_id}
                  targetChain={selectedChain}
                />
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    이전 단계
                  </button>

                  <button
                    onClick={handleRunAnalysis}
                    disabled={analyzing || !candidateData}
                    className="flex items-center space-x-2 px-7 py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-rose-500 hover:opacity-95 text-slate-950 font-bold text-sm shadow-xl transition disabled:opacity-40"
                  >
                    {analyzing ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    ) : (
                      <Play className="w-4 h-4 fill-current text-slate-950" />
                    )}
                    <span>{analyzing ? 'TM-score 근사 정렬 및 3D 계산 중...' : '3D 구조 정렬 및 모방도 분석 실행'}</span>
                  </button>
                </div>
              </div>
            )}

            {currentStep === 4 && jobResult && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                  >
                    ← 입력 수정 및 재분석
                  </button>

                  <button
                    onClick={handleRunAnalysis}
                    disabled={analyzing}
                    className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold transition shadow-md"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
                    <span>재계산 실행</span>
                  </button>
                </div>

                <ResultsDashboard
                  jobResult={jobResult}
                  targetPdb={jobResult.data?.target_pdb || targetData?.sample_pdb}
                  candidatePdb={jobResult.data?.aligned_candidate_pdb || candidateData?.sample_pdb}
                />
              </div>
            )}
            </>
            )}

            {analysisError && (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start space-x-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                <div>
                  <strong className="block font-semibold">분석 오류 발생:</strong>
                  <span>{analysisError}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950/80 py-5 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-2">
          <span>2026 SSEP_TEAM SSBD(씁뜩) · 개발 명세서 준수 시스템</span>
          <span>TM-score 근사 구현 Algorithm & Shrake-Rupley SASA Numerical Integration</span>
          <button
            onClick={() => setIsGlossaryOpen(true)}
            className="text-cyan-400 hover:underline"
          >
            용어 해설 및 논문 작성 가이드
          </button>
        </div>
      </footer>

      {/* Glossary Modal */}
      <GlossaryModal isOpen={isGlossaryOpen} onClose={() => setIsGlossaryOpen(false)} />

      {/* LocalStorage Analysis History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">최근 분석 이력 (Saved History)</h3>
                <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                  {historyItems.length}개 저장됨
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {historyItems.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40 transition flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>전체 삭제</span>
                  </button>
                )}
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {historyItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  저장된 분석 이력이 없습니다. 새로운 분석을 실행하면 자동으로 브라우저에 저장됩니다.
                </div>
              ) : (
                historyItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => loadFromHistory(item)}
                    className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/50 cursor-pointer transition flex items-center justify-between group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs text-cyan-300 font-bold">
                          Job ID: {item.id.substring(0, 12)}...
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                          {item.mode === 'fragment' ? '단편' : '전체'}
                        </span>
                        {item.jobResult.data?.reproducibility?.inputHash && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 font-mono border border-slate-800">
                            #{item.jobResult.data.reproducibility.inputHash}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        분석 시각: {item.timestamp ? item.timestamp.substring(0, 19).replace('T', ' ') : 'N/A'}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">항원성 적합도</span>
                        <span className="text-sm font-black text-cyan-400">
                          {item.score.toFixed(1)}점
                        </span>
                      </div>
                      <span className="text-xs text-cyan-400 group-hover:translate-x-1 transition font-bold">
                        열기 →
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

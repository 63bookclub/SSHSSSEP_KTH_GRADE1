import React, { useState } from 'react';
import {
  GripVertical,
  Play,
  Sparkles,
  Upload,
  RotateCcw,
  Sliders,
  ChevronDown,
  ChevronUp,
  FileText,
  AlertCircle,
  HelpCircle,
  Dna,
} from 'lucide-react';
import { PRESET_BENCHMARKS } from '../services/presets';

interface QuickAnalyzeViewProps {
  onAnalyze: (params: {
    target_input: string;
    candidate_input: string;
    target_chain?: string;
    candidate_chain?: string;
    epitope_range?: string;
    weights?: [number, number, number, number];
  }) => Promise<void>;
  loading: boolean;
  onSwitchToWizard?: () => void;
}

export const QuickAnalyzeView: React.FC<QuickAnalyzeViewProps> = ({
  onAnalyze,
  loading,
  onSwitchToWizard,
}) => {
  // Target state
  const [targetInput, setTargetInput] = useState<string>('');
  const [targetChain, setTargetChain] = useState<string>('');

  // Candidate state
  const [candidateInput, setCandidateInput] = useState<string>('');
  const [candidateCopies, setCandidateCopies] = useState<string>('1');

  // Collapsible advanced parameters
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [epitopeRange, setEpitopeRange] = useState<string>('');
  const [wGlobal, setWGlobal] = useState<number>(0.25);
  const [wEpi, setWEpi] = useState<number>(0.40);
  const [wExp, setWExp] = useState<number>(0.20);
  const [wConf, setWConf] = useState<number>(0.15);

  const [inputError, setInputError] = useState<string | null>(null);

  const handleApplyPreset = (idx: number) => {
    const p = PRESET_BENCHMARKS[idx];
    if (!p) return;
    setTargetInput(p.target.identifier);
    setTargetChain(p.target.chain);
    setCandidateInput(p.candidate.sequence);
    setCandidateCopies('1');
    if (p.epitope.manualRange) {
      setEpitopeRange(p.epitope.manualRange);
    }
    setInputError(null);
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setter(text);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInputError(null);

    if (!targetInput.trim()) {
      setInputError('타겟(Target) 단백질 입력값을 입력해 주세요. (PDB ID 또는 서열)');
      return;
    }
    if (!candidateInput.trim()) {
      setInputError('후보 물질(Candidate) 서열 또는 PDB ID를 입력해 주세요.');
      return;
    }

    const weights: [number, number, number, number] = [wGlobal, wEpi, wExp, wConf];

    onAnalyze({
      target_input: targetInput.trim(),
      candidate_input: candidateInput.trim(),
      target_chain: targetChain.trim() || undefined,
      candidate_chain: 'A',
      epitope_range: epitopeRange.trim() || undefined,
      weights,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header Intro Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-800 gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Dna className="w-5 h-5 text-cyan-400" />
            <span>초간편 2-입력 단백질 모방도 분석기 (Quick Input Mode)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            타겟 병원체와 백신 후보 물질을 붙여넣으면 즉시 3D 구조 정렬 및 에피톱 모방도 점수를 산출합니다.
          </p>
        </div>

        {onSwitchToWizard && (
          <button
            type="button"
            onClick={onSwitchToWizard}
            className="self-start md:self-auto text-xs px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition flex items-center space-x-1"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>단계별 마법사 모드로 전환</span>
          </button>
        )}
      </div>

      {/* Preset Benchmarks */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span>공식 벤치마크 프리셋 1-클릭 불러오기:</span>
          </span>
          <span className="text-[10px] text-slate-500">클릭 즉시 타겟/후보 서열이 채워집니다</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PRESET_BENCHMARKS.map((preset, idx) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleApplyPreset(idx)}
              className="text-left p-2.5 rounded-lg bg-slate-950/80 hover:bg-slate-800/90 border border-slate-800 hover:border-cyan-500/50 transition group"
            >
              <div className="text-xs font-bold text-white group-hover:text-cyan-300 truncate">
                {preset.title.split('(')[0]}
              </div>
              <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                <span>타겟: {preset.target.identifier} ({preset.target.chain}체인)</span>
                <span className="font-mono text-cyan-400">적용 →</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Row 1: Target Entity Card (AlphaFold Server style) */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition shadow-lg">
          <div className="flex items-start gap-2.5">
            {/* Grip handle */}
            <div className="text-slate-600 mt-2.5 cursor-grab">
              <GripVertical className="w-4 h-4" />
            </div>

            {/* Entity Type Selector */}
            <div className="w-36 shrink-0">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Entity type
              </label>
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-sky-300 flex items-center justify-between">
                <span>Target (타겟)</span>
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              </div>
            </div>

            {/* Chain Selector */}
            <div className="w-20 shrink-0">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Chain
              </label>
              <input
                type="text"
                value={targetChain}
                onChange={(e) => setTargetChain(e.target.value.toUpperCase())}
                placeholder="E"
                maxLength={4}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-center text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Input Textarea / Box */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono text-slate-400">
                  &gt;Paste sequence, fasta, or PDB ID (e.g. 6M0J, P0DTC2)
                </label>
                <div className="flex items-center space-x-2">
                  <label className="cursor-pointer text-[10px] text-cyan-400 hover:underline flex items-center space-x-1">
                    <Upload className="w-3 h-3" />
                    <span>PDB 파일 업로드</span>
                    <input
                      type="file"
                      accept=".pdb,.cif,.txt"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, setTargetInput)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setTargetInput('')}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    지우기
                  </button>
                </div>
              </div>

              <textarea
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder="예: 6M0J 또는 P0DTC2 또는 아미노산 서열(FASTA)"
                rows={2}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 resize-none transition"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Candidate Entity Card (AlphaFold Server style) */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition shadow-lg">
          <div className="flex items-start gap-2.5">
            {/* Grip handle */}
            <div className="text-slate-600 mt-2.5 cursor-grab">
              <GripVertical className="w-4 h-4" />
            </div>

            {/* Entity Type Selector */}
            <div className="w-36 shrink-0">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Entity type
              </label>
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-amber-300 flex items-center justify-between">
                <span>Candidate (후보)</span>
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              </div>
            </div>

            {/* Copies */}
            <div className="w-20 shrink-0">
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                Copies
              </label>
              <input
                type="text"
                value={candidateCopies}
                onChange={(e) => setCandidateCopies(e.target.value)}
                placeholder="1"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-center text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Input Textarea / Box */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono text-slate-400">
                  &gt;Paste sequence or fasta
                </label>
                <div className="flex items-center space-x-2">
                  <label className="cursor-pointer text-[10px] text-amber-400 hover:underline flex items-center space-x-1">
                    <Upload className="w-3 h-3" />
                    <span>PDB 파일 업로드</span>
                    <input
                      type="file"
                      accept=".pdb,.cif,.txt"
                      className="hidden"
                      onChange={(e) => handleFileUpload(e, setCandidateInput)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setCandidateInput('')}
                    className="text-[10px] text-slate-500 hover:text-slate-300"
                  >
                    지우기
                  </button>
                </div>
              </div>

              <textarea
                value={candidateInput}
                onChange={(e) => setCandidateInput(e.target.value)}
                placeholder="후보 단백질 아미노산 서열(1문자 코드) 또는 PDB 파일 내용..."
                rows={3}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 resize-none transition"
              />
            </div>
          </div>
        </div>

        {/* Collapsible Advanced Parameters */}
        <div className="border border-slate-800/80 rounded-xl bg-slate-950/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
          >
            <div className="flex items-center space-x-2">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>세부 파라미터 (에피톱 범위 직접 지정, 4개 하위 점수 가중치 조정)</span>
            </div>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="p-4 border-t border-slate-800/80 space-y-4 bg-slate-900/40">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Manual epitope range */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                    <span>에피톱 잔기 범위 (Epitope Range):</span>
                  </label>
                  <input
                    type="text"
                    value={epitopeRange}
                    onChange={(e) => setEpitopeRange(e.target.value)}
                    placeholder="예: 400-505 (비워두면 RSA ≥ 0.20 자동 탐색)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    ※ 미입력 시 Shrake-Rupley 알고리즘으로 용매 노출된 잔기(RSA ≥ 0.20)가 자동 지정됩니다.
                  </span>
                </div>

                {/* Score weights */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">
                    항원 모방도 종합 점수 가중치 (합계: {(wGlobal + wEpi + wExp + wConf).toFixed(2)})
                  </label>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-cyan-400 block font-mono">w_global</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={wGlobal}
                        onChange={(e) => setWGlobal(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-transparent font-bold text-white text-xs mt-0.5 focus:outline-none"
                      />
                    </div>

                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-rose-400 block font-mono">w_epi</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={wEpi}
                        onChange={(e) => setWEpi(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-transparent font-bold text-white text-xs mt-0.5 focus:outline-none"
                      />
                    </div>

                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-emerald-400 block font-mono">w_exp</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={wExp}
                        onChange={(e) => setWExp(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-transparent font-bold text-white text-xs mt-0.5 focus:outline-none"
                      />
                    </div>

                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                      <span className="text-[10px] text-purple-400 block font-mono">w_conf</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        value={wConf}
                        onChange={(e) => setWConf(parseFloat(e.target.value) || 0)}
                        className="w-full text-center bg-transparent font-bold text-white text-xs mt-0.5 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {inputError && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{inputError}</span>
          </div>
        )}

        {/* Submit Execution Button */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            <span>알고리즘: TM-score 근사 구현 (Cα 좌표 중첩 및 3Dmol.js 3D 겹침 시각화)</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-500 to-rose-500 hover:opacity-95 text-slate-950 font-bold text-sm shadow-xl transition disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                <span>3D 구조 정렬 및 모방도 계산 중...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-slate-950" />
                <span>3D 항원 모방도 분석 실행</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

import React, { useState } from 'react';
import { Target, Layers, FileText, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Filter } from 'lucide-react';
import { submitEpitope, EpitopeResponse, TargetResponse } from '../services/api.ts';

interface EpitopeStepProps {
  targetData: TargetResponse;
  selectedChain: string;
  onEpitopeReady: (epitopeData: EpitopeResponse) => void;
  currentEpitope?: EpitopeResponse;
}

export const EpitopeStep: React.FC<EpitopeStepProps> = ({
  targetData,
  selectedChain,
  onEpitopeReady,
  currentEpitope,
}) => {
  const [method, setMethod] = useState<'manual' | 'complex' | 'prediction_csv'>('manual');
  const [manualRange, setManualRange] = useState('');
  const [complexPdbId, setComplexPdbId] = useState('');
  const [antibodyChains, setAntibodyChains] = useState('');
  const [antigenChain, setAntigenChain] = useState(selectedChain || 'A');

  const [csvText, setCsvText] = useState('');
  const [threshold, setThreshold] = useState(0.5);

  const [combinationMode, setCombinationMode] = useState<'single' | 'union' | 'intersect'>('single');
  const [additionalRange, setAdditionalRange] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [epitopeResult, setEpitopeResult] = useState<EpitopeResponse | null>(currentEpitope || null);

  const handleApplyEpitope = async (allowEmpty = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload: any = {
        target_id: targetData.target_id,
        target_chain: selectedChain,
        method,
        combination_mode: combinationMode,
        additional_ranges: additionalRange,
      };

      if (method === 'manual') {
        payload.manual_range = allowEmpty ? '' : manualRange;
      } else if (method === 'complex') {
        payload.complex_pdb_id = complexPdbId.trim().toUpperCase();
        payload.antibody_chains = antibodyChains;
        payload.antigen_chain = antigenChain || selectedChain;
        payload.manual_range = manualRange;
      } else if (method === 'prediction_csv') {
        payload.prediction_csv_text = csvText;
        payload.threshold = threshold;
      }

      const res = await submitEpitope(payload);
      setEpitopeResult(res);
      onEpitopeReady(res);
    } catch (err: any) {
      setError(err.message || '에피톱 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSampleCsv = () => {
    // Provide a sample DiscoTope / BepiPred CSV
    const sample = `Residue_ID,Score
417,0.72
440,0.68
446,0.59
477,0.81
478,0.79
484,0.92
493,0.85
496,0.64
498,0.77
501,0.89
505,0.73`;
    setCsvText(sample);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        {/* Step Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-xs font-bold">2</span>
              <span>에피톱 정의 (Epitope Definition)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              타겟 항원에서 중화항체가 결합하는 핵심 표면 잔기를 3가지 방식 중 하나로 정의합니다.
            </p>
          </div>

          {/* Method Selector Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => { setMethod('manual'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                method === 'manual' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              직접 입력
            </button>
            <button
              onClick={() => { setMethod('complex'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                method === 'complex' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              복합체 4.5Å 자동추출
            </button>
            <button
              onClick={() => { setMethod('prediction_csv'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                method === 'prediction_csv' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              예측 도구 결과 업로드
            </button>
          </div>
        </div>

        {/* Input Forms */}
        <div className="space-y-4">
          {method === 'manual' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                잔기 번호 및 범위 입력 (타겟 체인 기준)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualRange}
                  onChange={(e) => setManualRange(e.target.value)}
                  placeholder="예: 330-520, 614 또는 400-505"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-rose-300 font-mono text-sm focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={() => handleApplyEpitope(false)}
                  disabled={loading}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                  <span>에피톱 확정</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                콤마(,)나 하이픈(-)을 사용하여 단일 잔기 또는 범위를 자유롭게 지정할 수 있습니다.
              </p>
            </div>
          )}

          {method === 'complex' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs text-slate-300">
                <span className="font-semibold text-cyan-300">복합체 구조 자동 접촉 분석:</span> 항체-항원 복합체 PDB에서 항체 체인과 4.5 Å 이내에 위치하는 모든 항원 잔기를 추출합니다.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    복합체 PDB ID
                  </label>
                  <input
                    type="text"
                    value={complexPdbId}
                    onChange={(e) => setComplexPdbId(e.target.value.toUpperCase())}
                    placeholder="예: 7K8M"
                    maxLength={4}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    항체 체인 (중쇄, 경쇄)
                  </label>
                  <input
                    type="text"
                    value={antibodyChains}
                    onChange={(e) => setAntibodyChains(e.target.value)}
                    placeholder="예: H,L"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    항원 체인
                  </label>
                  <input
                    type="text"
                    value={antigenChain}
                    onChange={(e) => setAntigenChain(e.target.value)}
                    placeholder="예: A"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sky-300 font-mono text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => handleApplyEpitope(false)}
                  disabled={loading}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                  <span>4.5 Å 접촉 에피톱 추출</span>
                </button>
              </div>
            </div>
          )}

          {method === 'prediction_csv' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  BepiPred / DiscoTope 잔기별 점수 (CSV/TSV)
                </label>
                <button
                  onClick={handleSampleCsv}
                  className="text-xs text-cyan-400 hover:underline flex items-center space-x-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>예시 데이터 채우기</span>
                </button>
              </div>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Residue_ID,Score 형태 입력 (예: 417,0.75)"
                rows={4}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <Filter className="w-4 h-4 text-cyan-400" />
                  <span>임계값(Threshold):</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={threshold}
                    onChange={(e) => setThreshold(parseFloat(e.target.value) || 0.5)}
                    className="w-16 px-2 py-1 bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-xs rounded"
                  />
                  <span>이상 잔기만 추출</span>
                </div>
                <button
                  onClick={() => handleApplyEpitope(false)}
                  disabled={loading || !csvText.trim()}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                  <span>임계값 필터링 및 적용</span>
                </button>
              </div>
            </div>
          )}

          {/* Combination Mode (Union / Intersect) */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400 font-semibold">복수 에피톱 결합 방식:</span>
              <select
                value={combinationMode}
                onChange={(e: any) => setCombinationMode(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-cyan-300 text-xs px-2.5 py-1.5 rounded-lg"
              >
                <option value="single">단일 방법 (Single)</option>
                <option value="union">합집합 (Union: 추가 잔기 포함)</option>
                <option value="intersect">교집합 (Intersection: 공통 잔기만)</option>
              </select>
            </div>

            {combinationMode !== 'single' && (
              <input
                type="text"
                value={additionalRange}
                onChange={(e) => setAdditionalRange(e.target.value)}
                placeholder="추가 결합할 잔기 번호 (예: 484, 501)"
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 text-amber-300 font-mono text-xs rounded-lg w-64"
              />
            )}

            {/* Fallback to surface button */}
            <button
              onClick={() => handleApplyEpitope(true)}
              className="text-xs text-slate-400 hover:text-cyan-300 underline"
              title="에피톱을 모를 때 표면 노출 잔기(RSA ≥ 0.2)를 임시 에피톱으로 자동 사용"
            >
              입력 없이 표면 노출 잔기(RSA ≥ 0.2)로 자동 설정
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Resolved Epitope Summary */}
        {epitopeResult && (
          <div className="mt-5 pt-4 border-t border-slate-800">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">
                    최종 에피톱 확정: {epitopeResult.residues_count}개 잔기
                  </span>
                  {epitopeResult.is_temporary && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800/80 text-[10px] font-bold">
                      임시 에피톱 사용
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1 max-h-20 overflow-y-auto pr-1">
                  {epitopeResult.residues.slice(0, 45).map((r) => (
                    <span
                      key={r}
                      className="px-1.5 py-0.5 rounded bg-rose-950/60 border border-rose-800/50 text-rose-300 text-[10px] font-mono"
                    >
                      {r}
                    </span>
                  ))}
                  {epitopeResult.residues.length > 45 && (
                    <span className="text-[10px] text-slate-500 self-center">
                      외 {epitopeResult.residues.length - 45}개...
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-400">
                <div>방법: <span className="font-semibold text-cyan-300">{epitopeResult.method}</span></div>
                <div className="text-emerald-400 font-semibold">{epitopeResult.note}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

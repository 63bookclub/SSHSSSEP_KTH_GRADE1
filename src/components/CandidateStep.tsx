import React, { useState } from 'react';
import { Upload, Dna, FileCode, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Beaker } from 'lucide-react';
import { submitCandidate, CandidateResponse } from '../services/api.ts';
import { PRESET_BENCHMARKS } from '../services/presets.ts';

interface CandidateStepProps {
  onCandidateReady: (candidateData: CandidateResponse) => void;
  currentCandidate?: CandidateResponse;
  targetId?: string;
  targetChain?: string;
}

export const CandidateStep: React.FC<CandidateStepProps> = ({
  onCandidateReady,
  currentCandidate,
  targetId,
  targetChain,
}) => {
  const [inputType, setInputType] = useState<'sequence' | 'file'>('sequence');
  const [sequenceText, setSequenceText] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candResult, setCandResult] = useState<CandidateResponse | null>(currentCandidate || null);

  const cleanSequence = sequenceText
    .replace(/^>.*$/m, '')
    .replace(/[\s\r\n\t]/g, '')
    .toUpperCase();

  const seqLength = cleanSequence.length;
  const isValidAAs = /^[ACDEFGHIKLMNPQRSTVWY]*$/.test(cleanSequence);
  const isOverLimit = seqLength > 600;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('파일 크기가 10MB를 초과합니다.');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      setFileContent(content);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleProcessCandidate = async () => {
    setLoading(true);
    setError(null);
    try {
      let payload: any = {};
      if (inputType === 'sequence') {
        if (!cleanSequence) throw new Error('아미노산 서열을 입력해 주세요.');
        if (isOverLimit) {
          throw new Error(`서열 길이(${seqLength} aa)가 상한(600 aa)을 초과했습니다. 더 긴 서열은 구조 파일(PDB)을 직접 업로드해 주세요.`);
        }
        if (!isValidAAs) {
          throw new Error('유효하지 않은 문자가 포함되어 있습니다. 20종 표준 아미노산(ACDEFGHIKLMNPQRSTVWY)만 허용됩니다.');
        }
        payload = {
          sequence: cleanSequence,
          target_id: targetId,
          target_chain: targetChain,
        };
      } else {
        if (!fileContent) throw new Error('PDB 구조 파일을 업로드해 주세요.');
        payload = { raw_pdb: fileContent, filename: fileName, is_experimental: true };
      }

      const res = await submitCandidate(payload);
      setCandResult(res);
      onCandidateReady(res);
    } catch (err: any) {
      setError(err.message || '후보 물질 구조 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillPreset = (presetIndex: number) => {
    const preset = PRESET_BENCHMARKS[presetIndex];
    if (preset) {
      setInputType('sequence');
      setSequenceText(preset.candidate.sequence);
      setError(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        {/* Step Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-xs font-bold">3</span>
              <span>백신 후보 물질 입력 (Vaccine Candidate)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              타겟 항원의 에피톱을 모방하도록 설계된 단백질 서열(600 aa 이하) 또는 3D 구조 파일(PDB)을 제공합니다.
            </p>
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => { setInputType('sequence'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                inputType === 'sequence' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              FASTA / 단백질 서열 (≤600 aa)
            </button>
            <button
              onClick={() => { setInputType('file'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                inputType === 'file' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              후보 3D 구조 파일 (PDB)
            </button>
          </div>
        </div>

        {/* Input area */}
        <div className="space-y-4">
          {inputType === 'sequence' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300">
                  단일 FASTA 레코드 또는 단순 아미노산 서열
                </label>
                {/* Presets fast button */}
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-500">예제 서열:</span>
                  <button
                    onClick={() => handleFillPreset(0)}
                    className="text-cyan-400 hover:underline"
                  >
                    스파이크 WT
                  </button>
                  <span>·</span>
                  <button
                    onClick={() => handleFillPreset(1)}
                    className="text-amber-400 hover:underline"
                  >
                    오미크론 BA.1
                  </button>
                  <span>·</span>
                  <button
                    onClick={() => handleFillPreset(2)}
                    className="text-emerald-400 hover:underline"
                  >
                    미니-HA 스템
                  </button>
                </div>
              </div>

              <textarea
                value={sequenceText}
                onChange={(e) => setSequenceText(e.target.value)}
                placeholder=">후보_단백질&#10;TNLCPFGEVFNATRFASVYAWNRKRISNC..."
                rows={5}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-amber-200 font-mono text-xs tracking-wider focus:outline-none focus:border-cyan-500 leading-relaxed"
              />

              {/* Sequence Status Bar */}
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400">
                <div className="flex items-center space-x-3">
                  <span className="font-mono">
                    길이:{' '}
                    <strong className={isOverLimit ? 'text-rose-400' : 'text-cyan-300'}>
                      {seqLength}
                    </strong>{' '}
                    / 600 aa
                  </span>
                  <span>
                    아미노산 적합성:{' '}
                    {isValidAAs && cleanSequence ? (
                      <span className="text-emerald-400 font-semibold">20종 표준 아미노산 통과</span>
                    ) : cleanSequence ? (
                      <span className="text-rose-400 font-semibold">비표준 아미노산 문자 발견</span>
                    ) : (
                      <span className="text-slate-500">입력 대기</span>
                    )}
                  </span>
                </div>

                <button
                  onClick={handleProcessCandidate}
                  disabled={loading || !cleanSequence || isOverLimit || !isValidAAs}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Dna className="w-4 h-4" />}
                  <span>{loading ? '3D 구조 예측 및 모델링 중...' : '후보 구조 예측 및 등록'}</span>
                </button>
              </div>

              {isOverLimit && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    서열이 600 aa를 초과하여 공개 예측 서버에서 처리가 제한됩니다. 상단 '후보 3D 구조 파일 (PDB)' 탭에서 이미 예측된 PDB 파일을 직접 업로드해 주세요.
                  </span>
                </div>
              )}
            </div>
          )}

          {inputType === 'file' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300">
                실험 결정 구조 또는 기예측된 후보 구조 파일 (PDB 포맷)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-cyan-500 cursor-pointer text-xs text-slate-300 transition">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>{fileName ? fileName : '후보 PDB 파일 선택 (.pdb)'}</span>
                  <input
                    type="file"
                    accept=".pdb,.cif,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                {fileContent && (
                  <button
                    onClick={handleProcessCandidate}
                    disabled={loading}
                    className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{loading ? '파싱 중...' : '후보 구조 적용'}</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                ※ 실험 구조(X-ray, Cryo-EM) 업로드 시 신뢰도 점수(S_conf)는 최고점인 1.0(100%)으로 자동 산정됩니다.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Confirmation Summary */}
        {candResult && (
          <div className="mt-5 pt-4 border-t border-slate-800">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">후보 구조 준비 완료</span>
                <span className="text-[11px] text-slate-400">
                  ({candResult.residues_count} 잔기, 체인 {candResult.chain})
                </span>
                {candResult.is_experimental ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                    실험 구조 (S_conf=1.0)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] font-bold">
                    예측 모델 (pLDDT 계산)
                  </span>
                )}
              </div>

              <span className="text-[11px] text-slate-400 font-mono">
                Candidate ID: {candResult.candidate_id}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

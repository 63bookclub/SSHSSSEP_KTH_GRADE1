import React, { useState } from 'react';
import { Upload, Database, Layers, CheckCircle2, AlertCircle, RefreshCw, Eye } from 'lucide-react';
import { submitTarget, TargetResponse } from '../services/api.ts';
import { StructureViewer } from './StructureViewer.tsx';

interface TargetStepProps {
  onTargetReady: (targetData: TargetResponse, selectedChain: string) => void;
  currentTarget?: TargetResponse;
  currentChain?: string;
}

export const TargetStep: React.FC<TargetStepProps> = ({
  onTargetReady,
  currentTarget,
  currentChain = 'A',
}) => {
  const [inputType, setInputType] = useState<'pdb' | 'uniprot' | 'file'>('pdb');
  const [pdbId, setPdbId] = useState('');
  const [uniprotId, setUniprotId] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [selectedChain, setSelectedChain] = useState<string>(currentChain);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetInfo, setTargetInfo] = useState<TargetResponse | null>(currentTarget || null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('파일 용량이 10MB를 초과합니다.');
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

  const handleFetchTarget = async () => {
    setLoading(true);
    setError(null);
    try {
      let payload: any = {};
      if (inputType === 'pdb') {
        if (!pdbId.trim()) throw new Error('PDB ID를 입력해 주세요 (예: 6M0J, 1RUZ, 5C69).');
        payload = { pdb_id: pdbId.trim().toUpperCase() };
      } else if (inputType === 'uniprot') {
        if (!uniprotId.trim()) throw new Error('UniProt ID를 입력해 주세요 (예: P0DTC2).');
        payload = { uniprot_id: uniprotId.trim().toUpperCase() };
      } else {
        if (!fileContent) throw new Error('PDB 또는 mmCIF 구조 파일을 업로드해 주세요.');
        payload = { raw_content: fileContent, filename: fileName };
      }

      const res = await submitTarget(payload);
      setTargetInfo(res);
      // Auto-select first available chain
      const firstChain = res.chains[0] || 'A';
      setSelectedChain(firstChain);
      onTargetReady(res, firstChain);
    } catch (err: any) {
      setError(err.message || '타겟 구조를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleChainChange = (chain: string) => {
    setSelectedChain(chain);
    if (targetInfo) {
      onTargetReady(targetInfo, chain);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input Selection Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center text-xs font-bold">1</span>
              <span>병원체 타겟 구조 설정 (Target Structure)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              비교 기준이 될 병원체 단백질을 지정합니다. (실험 구조 PDB 또는 AlphaFold DB UniProt ID)
            </p>
          </div>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => { setInputType('pdb'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                inputType === 'pdb' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RCSB PDB ID
            </button>
            <button
              onClick={() => { setInputType('uniprot'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                inputType === 'uniprot' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              UniProt ID (AlphaFold DB)
            </button>
            <button
              onClick={() => { setInputType('file'); setError(null); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                inputType === 'file' ? 'bg-cyan-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              구조 파일 업로드
            </button>
          </div>
        </div>

        {/* Input Controls */}
        <div className="space-y-4">
          {inputType === 'pdb' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                PDB ID 입력 (권장: 다량체 또는 prefusion 상태 실험 구조)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pdbId}
                  onChange={(e) => setPdbId(e.target.value.toUpperCase())}
                  placeholder="예: 6M0J, 6VXX, 1RUZ, 5C69"
                  maxLength={4}
                  className="w-48 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-sm uppercase tracking-wider focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleFetchTarget}
                  disabled={loading}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  <span>{loading ? '구조 다운로드 중...' : '타겟 구조 가져오기'}</span>
                </button>
              </div>
              <div className="text-[11px] text-slate-500 flex gap-2">
                <span>추천 PDB:</span>
                <button onClick={() => setPdbId('6M0J')} className="text-cyan-400 hover:underline">6M0J (코로나 RBD)</button>
                <span>·</span>
                <button onClick={() => setPdbId('1RUZ')} className="text-cyan-400 hover:underline">1RUZ (인플루엔자 HA)</button>
                <span>·</span>
                <button onClick={() => setPdbId('5C69')} className="text-cyan-400 hover:underline">5C69 (RSV F단백질)</button>
              </div>
            </div>
          )}

          {inputType === 'uniprot' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                UniProt ID 입력 (AlphaFold DB 실시간 API 연동)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={uniprotId}
                  onChange={(e) => setUniprotId(e.target.value.toUpperCase())}
                  placeholder="예: P0DTC2, P03437"
                  className="w-56 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 font-mono text-sm uppercase tracking-wider focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleFetchTarget}
                  disabled={loading}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  <span>{loading ? 'AlphaFold DB 조회 중...' : '예측 구조 가져오기'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                ※ AlphaFold DB API를 통해 모델 버전을 동적으로 조회하여 다운로드합니다. (단량체 모델 권장)
              </p>
            </div>
          )}

          {inputType === 'file' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                구조 파일 직접 업로드 (PDB 또는 mmCIF 포맷, 최대 10MB)
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-cyan-500 cursor-pointer text-xs text-slate-300 transition">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>{fileName ? fileName : '파일 선택 (.pdb / .cif)'}</span>
                  <input
                    type="file"
                    accept=".pdb,.cif,.mmcif,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                {fileContent && (
                  <button
                    onClick={handleFetchTarget}
                    disabled={loading}
                    className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-lg transition disabled:opacity-50"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{loading ? '파싱 중...' : '업로드 파일 적용'}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Chain Selection & Confirmation */}
        {targetInfo && (
          <div className="mt-6 pt-5 border-t border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">타겟 구조 파싱 완료: {targetInfo.identifier}</span>
                <span className="text-[11px] text-slate-400">({targetInfo.total_atoms.toLocaleString()} 원자)</span>
              </div>

              {/* Chain Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-300 flex items-center space-x-1">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>분석 대상 체인(Chain) 선택:</span>
                </span>
                <div className="flex gap-1.5">
                  {targetInfo.chains.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleChainChange(c)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center space-x-1 ${
                        selectedChain === c
                          ? 'bg-cyan-500 text-slate-950 shadow-md ring-2 ring-cyan-400/50'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      <span>체인 {c}</span>
                      <span className="text-[10px] opacity-75">
                        ({targetInfo.chain_residue_counts[c] || 0} aa)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3D Preview */}
            <div className="rounded-xl overflow-hidden border border-slate-800">
              <StructureViewer
                targetPdb={targetInfo.sample_pdb}
                targetChain={selectedChain}
                height="320px"
                title={`타겟 3D 미리보기: ${targetInfo.identifier} (체인 ${selectedChain})`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

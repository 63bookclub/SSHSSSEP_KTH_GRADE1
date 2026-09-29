import React, { useState } from 'react';
import { HelpCircle, X, BookOpen, ExternalLink, ShieldCheck } from 'lucide-react';

export interface TermDefinition {
  term: string;
  en: string;
  summary: string;
  detail: string;
  benchmark: string;
  formula?: string;
}

export const GLOSSARY_TERMS: Record<string, TermDefinition> = {
  epitope: {
    term: '에피톱',
    en: 'Epitope (Antigenic Determinant)',
    summary: '항체(Antibody)나 B/T세포 수용체가 특이적으로 결합하는 항원 단백질 표면의 특정 아미노산 집합 부위',
    detail: '백신의 궁극적 목표는 병원체에 결합하는 중화항체를 생성하는 것이므로, 후보 물질이 이 에피톱의 3차원 형태를 실제 바이러스와 동일하게 유지하고 있는지가 핵심 평가 기준입니다.',
    benchmark: '결합 거리 4.5Å 이내 접촉 잔기 또는 실험 규명 부위',
  },
  tm_score: {
    term: 'TM-score',
    en: 'Template Modeling Score',
    summary: '두 단백질 3D 구조의 전반적인 접힘(Fold) 유사도를 0부터 1까지의 척도로 나타내는 척도',
    detail: '단백질 길이에 민감한 기존 RMSD의 한계를 극복하기 위해 Zhang & Skolnick(2004)이 고안했습니다. 0.5 이상이면 동일한 전역 접힘(same global fold)으로 분류되며, 1.0은 완벽히 동일한 구조입니다.',
    formula: 'TM-score = (1 / L) × Σ [ 1 / (1 + (d_i / d_0)² ) ]',
    benchmark: '0.5 초과: 동일 접힘, 0.7 초과: 매우 높은 상동성, 0.2 이하: 무관한 단백질',
  },
  rmsd: {
    term: 'RMSD',
    en: 'Root Mean Square Deviation',
    summary: '두 구조를 최적으로 겹쳤을 때, 대응되는 Cα(알파 탄소) 원자 위치 간의 평균 제곱근 거리(단위: Å)',
    detail: '값이 0에 가까울수록 원자들의 공간적 위치가 정확히 일치함을 뜻합니다. 단, 국소적인 루프 하나의 큰 변위가 전체 RMSD를 왜곡할 수 있으므로 TM-score 및 S_epi와 함께 교차 검증해야 합니다.',
    formula: 'RMSD = √ [ (1 / N) × Σ d_i² ]',
    benchmark: '2.0Å 이하: 매우 정밀한 겹침, 4.0Å 초과: 구조적 편차 큼',
  },
  sasa_rsa: {
    term: 'SASA / RSA',
    en: 'Solvent Accessible Surface Area / Relative Solvent Accessibility',
    summary: '단백질 표면 잔기가 물(용매) 분자 및 외부 항체에 얼마나 노출되어 있는지를 나타내는 수치',
    detail: 'Shrake-Rupley 수치적 구체 탐색 알고리즘을 통해 계산되며, RSA(상대 노출도) = 실제 SASA / 이론상 최대 SASA입니다. 에피톱이 내부에 파묻히지 않고 표면에 드러나야 항체 유도가 가능합니다.',
    formula: 'S_exp = 1 - mean(|RSA_후보 - RSA_타겟|)',
    benchmark: 'RSA ≥ 0.2: 표면 노출(Surface Exposed), RSA < 0.05: 내부 코어(Buried)',
  },
  plddt: {
    term: 'pLDDT',
    en: 'Predicted Local Distance Difference Test',
    summary: 'AlphaFold2 및 ESMFold 등 인공지능 구조 예측 모델이 산출하는 잔기별 3D 좌표 신뢰도 (0~100)',
    detail: '90 이상은 결정 구조 수준의 극도로 높은 신뢰도, 70~90은 척추(Backbone)가 정확히 예측된 신뢰 구간, 70 미만은 무질서(IDR) 또는 신뢰도가 낮은 루프 영역을 의미합니다. PDB 파일의 B-factor 컬럼에 저장됩니다.',
    benchmark: '≥ 90: 매우 신뢰(Very High), 70~90: 신뢰(Confident), < 50: 매우 낮음(IDR)',
  },
  s_epi: {
    term: 'S_epi (에피톱 모방도)',
    en: 'Epitope Conformational Similarity Score',
    summary: '타겟 항원의 실제 중화 에피톱 잔기들의 3D 위치가 후보 물질에서 얼마나 보존되었는지를 정량화한 핵심 지표',
    detail: '정렬 후 에피톱 각 잔기의 Cα간 거리 d_i에 대해 로렌츠 형태의 역제곱 감쇠 함수를 적용하여 평균을 냅니다. 거리가 3Å 이내로 매우 가까울수록 1에 가까워집니다.',
    formula: 'S_epi = (1 / M) × Σ [ 1 / (1 + (d_i / 3.0Å)² ) ]',
    benchmark: '0.80 이상: 우수한 에피톱 보존, 0.50 미만: 유의미한 구조 변형',
  },
};

export const TermTooltip: React.FC<{ termKey: keyof typeof GLOSSARY_TERMS; children: React.ReactNode }> = ({
  termKey,
  children,
}) => {
  const [show, setShow] = useState(false);
  const data = GLOSSARY_TERMS[termKey];
  if (!data) return <>{children}</>;

  return (
    <span
      className="relative inline-block cursor-help border-b border-dotted border-cyan-400/70"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-slate-900 border border-cyan-500/40 rounded-lg shadow-xl text-left text-xs pointer-events-none">
          <div className="flex items-center space-x-1.5 text-cyan-300 font-semibold mb-1">
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>{data.term} ({data.en})</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed mb-1.5">{data.summary}</p>
          <div className="text-[10px] text-emerald-400 font-mono bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
            기준: {data.benchmark}
          </div>
        </div>
      )}
    </span>
  );
};

export const GlossaryModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-5">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">생명정보학 구조 평가 핵심 용어집</h2>
              <p className="text-xs text-slate-400">소논문·탐구보고서 작성 시 인용 및 서술을 돕는 학술 가이드</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(GLOSSARY_TERMS).map(([key, item]) => (
            <div
              key={key}
              className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/40 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="font-bold text-cyan-300 text-sm">{item.term}</h3>
                  <span className="text-[10px] text-slate-400 font-mono">{item.en}</span>
                </div>
                <p className="text-xs text-slate-300 font-medium leading-relaxed mb-2">{item.summary}</p>
                <p className="text-[11px] text-slate-400 leading-relaxed mb-3">{item.detail}</p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                {item.formula && (
                  <div className="text-[10px] font-mono text-cyan-200 bg-cyan-950/40 px-2 py-1 rounded border border-cyan-900/40">
                    {item.formula}
                  </div>
                )}
                <div className="text-[10px] text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded border border-emerald-900/40">
                  <span className="font-semibold text-emerald-300">판정 기준:</span> {item.benchmark}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 text-xs text-slate-300 flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-cyan-300">논문 서술 팁:</span> 본 시스템의 결과는 "백신의 임상적 효능 검증"이 아니라{' '}
            <strong className="text-white">"in silico 3D 구조 모방도 기반 항원성 보존 예측(Antigenic Mimicry Prediction)"</strong>으로 서술해야 연구 윤리 및 과학적 엄밀성에 부합합니다.
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};

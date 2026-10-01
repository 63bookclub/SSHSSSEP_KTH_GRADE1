import React from 'react';
import { Dna, BookOpen, Beaker } from 'lucide-react';

interface HeaderProps {
  onOpenGlossary: () => void;
  onOpenValidationLab?: () => void;
  onSelectPreset?: (presetId: string) => void;
  activeTab: 'workflow' | 'validation';
  setActiveTab: (tab: 'workflow' | 'validation') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenGlossary,
  onOpenValidationLab,
  activeTab,
  setActiveTab,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        {/* Brand and titles */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-rose-600 p-0.5 shadow-lg shadow-cyan-900/30">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Dna className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center space-x-2 flex-wrap">
                <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                  2026 SSEP_TEAM SSBD(씁뜩)
                </span>
              </h1>
            </div>
            <p className="text-[11px] text-slate-400">
              병원체-백신 후보 물질 3D 항원 구조 모방도 비교 · 소논문 및 과학 탐구 활동 지원 시스템
            </p>
          </div>
        </div>

        {/* Action bar and navigations */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Main Tab Toggle: Workflow vs Validation Lab */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('workflow')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                activeTab === 'workflow'
                  ? 'bg-cyan-600 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Dna className="w-3.5 h-3.5" />
              <span>항원 비교 분석기</span>
            </button>
            <button
              onClick={() => setActiveTab('validation')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 ${
                activeTab === 'validation'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Beaker className="w-3.5 h-3.5" />
              <span>검증 실험실 (명세서 11장)</span>
            </button>
          </div>

          {/* Glossary button */}
          <button
            onClick={onOpenGlossary}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-slate-300 font-medium transition"
          >
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>용어 해설집</span>
          </button>
        </div>
      </div>
    </header>
  );
};

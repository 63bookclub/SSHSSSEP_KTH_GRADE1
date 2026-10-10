import React, { useEffect, useRef, useState } from 'react';
import { RotateCw, ZoomIn, ZoomOut, Layers, Eye, EyeOff, Sparkles, RefreshCcw } from 'lucide-react';
import * as $3Dmol from '3dmol';

interface ResidueDev {
  res_id: number | string;
  cand_res_id?: number | string;
  distance: number;
  in_epitope: boolean;
}

interface StructureViewerProps {
  targetPdb?: string;
  candidatePdb?: string;
  targetChain?: string;
  candidateChain?: string;
  epitopeResidues?: (number | string)[];
  multiEpitopes?: { id: string; name: string; range: string; color: string }[];
  residueDeviations?: ResidueDev[];
  height?: string;
  title?: string;
}


const parseRangeList = (rangeStr?: string): (number | string)[] => {
  if (!rangeStr) return [];
  const result: (number | string)[] = [];
  const parts = rangeStr.split(/[,;\s]+/);
  for (const p of parts) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const splitted = trimmed.split('-');
      const s = parseInt(splitted[0], 10);
      const e = parseInt(splitted[1], 10);
      if (!isNaN(s) && !isNaN(e)) {
        const start = Math.min(s, e);
        const end = Math.max(s, e);
        for (let i = start; i <= end; i++) {
          result.push(i);
        }
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num.toString() === trimmed) {
        result.push(num);
      } else {
        result.push(trimmed);
      }
    }
  }
  return result;
};

export const StructureViewer: React.FC<StructureViewerProps> = ({
  targetPdb,
  candidatePdb,
  targetChain = 'A',
  candidateChain = 'A',
  epitopeResidues = [],
  multiEpitopes,
  residueDeviations = [],
  height = '500px',
  title,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);

  const [isSpinning, setIsSpinning] = useState(false);
  const [showTarget, setShowTarget] = useState(true);
  const [showCandidate, setShowCandidate] = useState(true);
  const [showEpitopeSticks, setShowEpitopeSticks] = useState(true);
  const [showSurface, setShowSurface] = useState(false);
  const [colorByDeviation, setColorByDeviation] = useState(false);
  const [renderMode, setRenderMode] = useState<'cartoon' | 'stick' | 'sphere'>('cartoon');
  const [isolateTargetChain, setIsolateTargetChain] = useState(false);
  const [zoomFocus, setZoomFocus] = useState<'default' | 'target' | 'epitope'>('default');
  const [libReady, setLibReady] = useState(false);

  useEffect(() => {
    setLibReady(true);
  }, []);

  const updateStyles = () => {
    try {
      const viewer = viewerRef.current;
      if (!viewer) return;

      // Clean wipe of all surfaces & styles for a pure state transition
      viewer.removeAllSurfaces();

      const m0 = viewer.getModel(0);
      const m1 = viewer.getModel(1);

      if (m0) {
        m0.setStyle({}, {});
      }
      if (m1) {
        m1.setStyle({}, {});
      }

      // Model 0: Target Structure (Sky Blue translucent)
      if (m0 && targetPdb) {
        if (showTarget) {
          const targetStyle: any = {};
          if (renderMode === 'cartoon') {
            targetStyle.cartoon = { color: '#38bdf8', opacity: 0.75 };
          } else if (renderMode === 'stick') {
            targetStyle.stick = { color: '#38bdf8', radius: 0.25, opacity: 0.8 };
          } else {
            targetStyle.sphere = { color: '#38bdf8', scale: 0.35, opacity: 0.8 };
          }

          if (isolateTargetChain && targetChain) {
            // Isolate: hide other chains completely, display only targetChain
            m0.setStyle({}, {});
            m0.setStyle({ chain: targetChain }, targetStyle);
          } else if (targetChain) {
            // Highlight target chain and dim other bystander chains (e.g. receptor/ACE2)
            m0.setStyle({}, { cartoon: { color: '#334155', opacity: 0.25 } });
            m0.setStyle({ chain: targetChain }, targetStyle);
          } else {
            m0.setStyle({}, targetStyle);
          }

          // Epitope highlight sticks on target
          if (showEpitopeSticks) {
            if (multiEpitopes && multiEpitopes.length > 0) {
              multiEpitopes.forEach((ep) => {
                const epResFromRange = parseRangeList(ep.range);
                const epResFromDev = residueDeviations
                  .filter((d) => (d as any).epitope_id === ep.id || epResFromRange.includes(d.res_id))
                  .map((d) => d.res_id);
                const targetResiList = epResFromDev.length > 0 ? epResFromDev : epResFromRange;
                if (targetResiList.length > 0) {
                  const sel: any = { model: m0, resi: targetResiList };
                  if (targetChain) sel.chain = targetChain;
                  viewer.addStyle(sel, {
                    stick: { color: ep.color || '#f43f5e', radius: 0.38, opacity: 1.0 },
                  });
                }
              });
            } else if (epitopeResidues.length > 0) {
              const sel: any = { model: m0, resi: epitopeResidues };
              if (targetChain) sel.chain = targetChain;
              viewer.addStyle(sel, {
                stick: { color: '#f43f5e', radius: 0.35, opacity: 1.0 },
              });
            }
          }
        }
      }

      // Model 1: Candidate Structure (Amber/Gold or Deviation colormap)
      if (m1 && candidatePdb) {
        if (showCandidate) {
          if (colorByDeviation && residueDeviations.length > 0) {
            m1.setStyle({}, { cartoon: { color: '#64748b', opacity: 0.5 } });
            for (const dev of residueDeviations) {
              let col = '#3b82f6';
              if (dev.distance < 0) col = '#64748b';
              else if (dev.distance <= 1.2) col = '#2563eb';
              else if (dev.distance <= 2.2) col = '#06b6d4';
              else if (dev.distance <= 3.5) col = '#eab308';
              else if (dev.distance <= 5.0) col = '#f97316';
              else col = '#ef4444';

              const candResi = dev.cand_res_id ?? dev.res_id;
              m1.setStyle(
                { resi: candResi },
                { cartoon: { color: col, opacity: 0.95 } }
              );
            }
          } else {
            const candStyle: any = {};
            if (renderMode === 'cartoon') {
              candStyle.cartoon = { color: '#fbbf24', opacity: 0.95 };
            } else if (renderMode === 'stick') {
              candStyle.stick = { color: '#fbbf24', radius: 0.25, opacity: 0.9 };
            } else {
              candStyle.sphere = { color: '#fbbf24', scale: 0.35, opacity: 0.9 };
            }
            m1.setStyle({}, candStyle);
          }

          // Epitope highlight sticks on candidate
          if (showEpitopeSticks) {
            if (multiEpitopes && multiEpitopes.length > 0) {
              multiEpitopes.forEach((ep) => {
                const epResFromRange = parseRangeList(ep.range);
                const epResFromDev = residueDeviations
                  .filter((d) => (d as any).epitope_id === ep.id || epResFromRange.includes(d.res_id))
                  .map((d) => d.cand_res_id ?? d.res_id);
                const candResiList = epResFromDev.length > 0 ? epResFromDev : epResFromRange;
                if (candResiList.length > 0) {
                  viewer.addStyle(
                    { model: m1, resi: candResiList },
                    { stick: { color: ep.color || '#c084fc', radius: 0.32, opacity: 1.0 } }
                  );
                }
              });
            } else if (epitopeResidues.length > 0) {
              const candEpiResi = residueDeviations
                .filter((d) => d.in_epitope)
                .map((d) => d.cand_res_id ?? d.res_id);
              const candResiList = candEpiResi.length > 0 ? candEpiResi : epitopeResidues;
              viewer.addStyle(
                { model: m1, resi: candResiList },
                { stick: { color: '#c084fc', radius: 0.30, opacity: 1.0 } }
              );
            }
          }
        }
      }

      // Molecular surface if requested
      if (showSurface && m0 && targetPdb && showTarget) {
        try {
          const surfaceSel: any = { model: 0 };
          if (isolateTargetChain && targetChain) {
            surfaceSel.chain = targetChain;
          }
          viewer.addSurface(
            ($3Dmol as any).SurfaceType.MS,
            {
              opacity: 0.35,
              color: '#38bdf8',
            },
            surfaceSel
          );
        } catch (e) {
          console.warn('Surface rendering error:', e);
        }
      }

      viewer.render();
    } catch (err) {
      console.warn('3Dmol updateStyles error:', err);
    }
  };

  useEffect(() => {
    if (!libReady || !containerRef.current) return;

    let resizeObserver: ResizeObserver | null = null;

    try {
      // Clean up previous viewer
      containerRef.current.innerHTML = '';

      const config = { backgroundColor: '#090d16', antialias: true };
      const viewer = ($3Dmol as any).createViewer(containerRef.current, config);
      if (!viewer) return;
      viewerRef.current = viewer;

      if (targetPdb && targetPdb.trim().length > 0) {
        viewer.addModel(targetPdb, targetPdb.includes('_atom_site.') ? 'cif' : 'pdb');
      }
      if (candidatePdb && candidatePdb.trim().length > 0) {
        viewer.addModel(candidatePdb, candidatePdb.includes('_atom_site.') ? 'cif' : 'pdb');
      }

      updateStyles();

      // Zoom focus
      if (targetChain) {
        try {
          viewer.zoomTo({ chain: targetChain });
        } catch (_) {
          viewer.zoomTo();
        }
      } else {
        viewer.zoomTo();
      }
      viewer.render();

      // Ensure canvas adjusts if parent size updates
      if (containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          if (viewerRef.current) {
            try {
              viewerRef.current.resize();
              viewerRef.current.render();
            } catch (_) {}
          }
        });
        resizeObserver.observe(containerRef.current);
      }
    } catch (viewerErr) {
      console.warn('3Dmol viewer initialization error:', viewerErr);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (viewerRef.current) {
        try {
          viewerRef.current.clear();
        } catch (_) {}
      }
    };
  }, [libReady, targetPdb, candidatePdb]);

  useEffect(() => {
    updateStyles();
  }, [
    showTarget,
    showCandidate,
    showEpitopeSticks,
    showSurface,
    colorByDeviation,
    renderMode,
    isolateTargetChain,
    residueDeviations,
    epitopeResidues,
    multiEpitopes,
    targetChain,
    candidateChain,
  ]);

  const toggleSpin = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const next = !isSpinning;
    setIsSpinning(next);
    viewer.spin(next ? 'y' : false, 1.2);
  };

  const handleResetCamera = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    
    // Stop spinning if active
    if (isSpinning) {
      setIsSpinning(false);
      viewer.spin(false);
    }
    
    // Reset toggle states back to original defaults
    setShowTarget(true);
    setShowCandidate(true);
    setShowEpitopeSticks(true);
    setShowSurface(false);
    setColorByDeviation(false);
    setIsolateTargetChain(false);
    setZoomFocus('default');
    
    // Reset camera zoom
    try {
      viewer.zoomTo();
    } catch (_) {}
    viewer.render();
  };

  const handleToggleFocusTarget = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    
    if (zoomFocus === 'target') {
      // Second click: restore back to original full overview
      setZoomFocus('default');
      viewer.zoomTo();
    } else {
      // First click: zoom to target chain
      setZoomFocus('target');
      try {
        viewer.zoomTo({ chain: targetChain });
      } catch (_) {
        viewer.zoomTo();
      }
    }
    viewer.render();
  };

  const handleToggleFocusEpitope = () => {
    const viewer = viewerRef.current;
    if (!viewer || epitopeResidues.length === 0) return;
    
    if (zoomFocus === 'epitope') {
      // Second click: restore back to original full overview
      setZoomFocus('default');
      viewer.zoomTo();
    } else {
      // First click: zoom to epitope pocket
      setZoomFocus('epitope');
      try {
        const sel: any = { resi: epitopeResidues };
        if (targetChain) sel.chain = targetChain;
        viewer.zoomTo(sel);
      } catch (_) {
        viewer.zoomTo({ resi: epitopeResidues });
      }
    }
    viewer.render();
  };

  const handleZoom = (factor: number) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.zoom(factor);
    viewer.render();
  };

  return (
    <div className="relative flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Top viewer control header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 text-xs backdrop-blur-sm gap-2">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
          <span className="font-semibold text-slate-200">{title || '3D 단백질 구조 겹침 (Superposition View)'}</span>
        </div>

        {/* Legend badges */}
        <div className="flex items-center flex-wrap gap-2 text-[11px]">
          {targetPdb && (
            <button
              onClick={() => setShowTarget(!showTarget)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition font-medium ${
                showTarget
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                  : 'bg-slate-800/80 text-slate-500 line-through border border-transparent hover:text-slate-400'
              }`}
              title="타겟 단백질 표시/숨김 토글 (클릭 시 ON/OFF 전환)"
            >
              <span className={`w-2.5 h-2.5 rounded-sm ${showTarget ? 'bg-sky-400' : 'bg-slate-600'}`}></span>
              <span>타겟 ({targetChain}체인)</span>
            </button>
          )}

          {candidatePdb && (
            <button
              onClick={() => setShowCandidate(!showCandidate)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition font-medium ${
                showCandidate
                  ? colorByDeviation
                    ? 'bg-gradient-to-r from-blue-500/30 to-red-500/30 text-amber-200 border border-amber-500/40 shadow-sm'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'bg-slate-800/80 text-slate-500 line-through border border-transparent hover:text-slate-400'
              }`}
              title="후보 물질 표시/숨김 토글 (클릭 시 ON/OFF 전환)"
            >
              <span className={`w-2.5 h-2.5 rounded-sm ${showCandidate ? (colorByDeviation ? 'bg-gradient-to-r from-blue-400 to-red-400' : 'bg-amber-400') : 'bg-slate-600'}`}></span>
              <span>{colorByDeviation ? '후보 (편차 색상)' : `후보 (${candidateChain}체인)`}</span>
            </button>
          )}

          {epitopeResidues.length > 0 && (
            <button
              onClick={() => setShowEpitopeSticks(!showEpitopeSticks)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md transition font-medium ${
                showEpitopeSticks
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'bg-slate-800/80 text-slate-500 line-through border border-transparent hover:text-slate-400'
              }`}
              title="에피톱 스틱 하이라이트 토글 (클릭 시 ON/OFF 전환)"
            >
              <span className={`w-2.5 h-2.5 rounded-sm ${showEpitopeSticks ? 'bg-rose-500' : 'bg-slate-600'}`}></span>
              <span>에피톱 스틱 ({epitopeResidues.length}개)</span>
            </button>
          )}
        </div>

        {/* View toggles */}
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
          {candidatePdb && (
            <button
              onClick={() => setColorByDeviation(!colorByDeviation)}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                colorByDeviation
                  ? 'bg-gradient-to-r from-cyan-600 to-rose-600 text-white shadow-md ring-1 ring-white/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50'
              }`}
              title="Cα 원자간 거리 편차에 따라 색상 그라데이션 적용 (재클릭 시 기본 단색으로 복귀)"
            >
              <Sparkles className="w-3 h-3 text-yellow-300" />
              <span>편차 색상 {colorByDeviation ? 'ON' : 'OFF'}</span>
            </button>
          )}

          <button
            onClick={() => setIsolateTargetChain(!isolateTargetChain)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              isolateTargetChain
                ? 'bg-indigo-600 text-white font-bold shadow-md ring-1 ring-indigo-300/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50'
            }`}
            title="타겟 단백질의 비분석 체인을 숨기고 분석 체인만 격리 (재클릭 시 복합체 전체 표시)"
          >
            체인 {targetChain} 격리 {isolateTargetChain ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={handleToggleFocusTarget}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              zoomFocus === 'target'
                ? 'bg-sky-600 text-white font-bold shadow-md ring-1 ring-sky-300/40'
                : 'bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700/50'
            }`}
            title="분석 체인으로 줌 포커스 (재클릭 시 전체 화면으로 복귀)"
          >
            체인 {targetChain} 줌 {zoomFocus === 'target' ? '✓' : ''}
          </button>

          {epitopeResidues.length > 0 && (
            <button
              onClick={handleToggleFocusEpitope}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                zoomFocus === 'epitope'
                  ? 'bg-rose-600 text-white font-bold shadow-md ring-1 ring-rose-300/40'
                : 'bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700/50'
              }`}
              title="에피톱 부위로 줌 포커스 (재클릭 시 전체 화면으로 복귀)"
            >
              에피톱 줌 {zoomFocus === 'epitope' ? '✓' : ''}
            </button>
          )}

          <button
            onClick={() => setShowSurface(!showSurface)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              showSurface
                ? 'bg-sky-600 text-white font-bold shadow-md ring-1 ring-sky-300/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50'
            }`}
            title="타겟 3D 분자 표면(Surface) 생성/제거 토글"
          >
            표면 (Surface) {showSurface ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={toggleSpin}
            className={`p-1.5 rounded-md transition ${
              isSpinning
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50'
            }`}
            title={isSpinning ? '3D 자동 회전 정지' : '3D 자동 회전 시작'}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleResetCamera}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 transition"
            title="모든 옵션 및 카메라 시점을 최초 기본 상태로 전체 리셋"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => handleZoom(1.2)}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 transition"
            title="1.2x 확대"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleZoom(0.8)}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/50 transition"
            title="0.8x 축소"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3Dmol canvas container */}
      <div
        ref={containerRef}
        style={{ height, width: '100%' }}
        className="relative bg-[#090d16] cursor-grab active:cursor-grabbing select-none"
      >
        {!libReady && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
              <span>3Dmol.js 그래픽 엔진 초기화 중...</span>
            </div>
          </div>
        )}
      </div>

      {/* Colormap legend bar when deviation mode is active */}
      {colorByDeviation && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-300">
          <span className="font-semibold text-cyan-300">잔기별 Cα 거리 편차 (Deviation Spectrum):</span>
          <div className="flex items-center space-x-2">
            <span className="text-blue-400 font-mono">0.0 Å (일치)</span>
            <div className="w-36 h-2.5 rounded-full bg-gradient-to-r from-blue-600 via-cyan-400 via-yellow-400 via-orange-500 to-red-600 border border-slate-700"></div>
            <span className="text-red-400 font-mono">≥ 5.0 Å (괴리)</span>
          </div>
        </div>
      )}

      {/* Bottom control instructions */}
      <div className="px-3 py-1 bg-slate-950/60 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
        <span>좌클릭: 회전 | 우클릭 / Ctrl+클릭: 이동 | 휠 스크롤: 줌</span>
        <span>3Dmol.js Accelerated WebGL</span>
      </div>
    </div>
  );
};

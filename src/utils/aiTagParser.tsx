import React from 'react';
import { ShieldAlert, Award, FileText, CheckCircle2, Lightbulb, Activity } from 'lucide-react';
import { escapeHtml } from './htmlSanitizer.ts';

export interface AiMetricItem {
  metricName: string;
  explanation: string;
}

export interface AiSectionItem {
  title: string;
  metrics: AiMetricItem[];
  explanation: string;
  recommendation?: string;
}

export interface ParsedAiInsight {
  header: string;
  sections: AiSectionItem[];
  disclaimer: string;
}

/**
 * Parses custom structured tags ([HEADER], [SECTION: ...], [METRIC: ...], [EXPLAIN], [RECOMMEND], [DISCLAIMER])
 */
export function parseAiInsightTags(rawText: string): ParsedAiInsight {
  if (!rawText) {
    return { header: '', sections: [], disclaimer: '' };
  }

  // 1. Extract Header
  let header = '';
  const headerMatch = rawText.match(/\[HEADER\]([\s\S]*?)\[\/HEADER\]/i);
  if (headerMatch) {
    header = headerMatch[1].trim();
  }

  // 2. Extract Disclaimer
  let disclaimer = '';
  const disclaimerMatch = rawText.match(/\[DISCLAIMER\]([\s\S]*?)\[\/DISCLAIMER\]/i);
  if (disclaimerMatch) {
    disclaimer = disclaimerMatch[1].trim();
  }

  // 3. Extract Sections
  const sections: AiSectionItem[] = [];
  const sectionRegex = /\[SECTION:\s*([^\]]+)\]([\s\S]*?)\[\/SECTION\]/gi;
  let sMatch: RegExpExecArray | null;

  while ((sMatch = sectionRegex.exec(rawText)) !== null) {
    const title = sMatch[1].trim();
    const sBody = sMatch[2].trim();

    const metrics: AiMetricItem[] = [];
    const metricRegex = /\[METRIC:\s*([^\]]+)\]\s*(?:\[EXPLAIN\]([\s\S]*?)\[\/EXPLAIN\])?/gi;
    let mMatch: RegExpExecArray | null;

    while ((mMatch = metricRegex.exec(sBody)) !== null) {
      metrics.push({
        metricName: mMatch[1].trim(),
        explanation: (mMatch[2] || '').trim(),
      });
    }

    // Get general explanation outside of individual metric tags
    let generalExplain = '';
    const plainExplains = sBody.match(/\[EXPLAIN\]([\s\S]*?)\[\/EXPLAIN\]/gi);
    if (plainExplains && metrics.length === 0) {
      generalExplain = plainExplains
        .map((e) => e.replace(/\[\/?EXPLAIN\]/gi, '').trim())
        .filter(Boolean)
        .join('\n\n');
    }

    // Extract recommendations if any
    let recommendation = '';
    const recMatch = sBody.match(/\[RECOMMEND\]([\s\S]*?)\[\/RECOMMEND\]/i);
    if (recMatch) {
      recommendation = recMatch[1].trim();
    }

    sections.push({
      title,
      metrics,
      explanation: generalExplain,
      recommendation,
    });
  }

  // Fallback if model didn't follow tags strictly
  if (sections.length === 0 && !header && !disclaimer) {
    return {
      header: 'AI 심층 항원성 구조 분석 리포트',
      sections: [
        {
          title: '종합 분석 소견',
          metrics: [],
          explanation: rawText.replace(/\[\/?(HEADER|SECTION|METRIC|EXPLAIN|RECOMMEND|DISCLAIMER)[^\]]*\]/gi, '').trim(),
        },
      ],
      disclaimer: '본 분석은 in silico 3차원 구조 비교 분석 결과이며 실제 임상 효능이나 생물학적 안전성을 보증하지 않습니다.',
    };
  }

  return { header, sections, disclaimer };
}

/**
 * Converts parsed AI insight to clean HTML for PDF / Print view
 */
export function convertAiInsightToPrintHtml(rawText: string): string {
  const parsed = parseAiInsightTags(rawText);
  if (!parsed.header && parsed.sections.length === 0) return '';

  let html = `<div style="margin-top: 6px;">`;

  if (parsed.header) {
    html += `
      <div style="font-weight: 800; font-size: 13px; color: #4338ca; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1.5px solid #e0e7ff;">
        ${escapeHtml(parsed.header)}
      </div>
    `;
  }

  parsed.sections.forEach((sec, idx) => {
    html += `
      <div style="margin-bottom: 10px; background: #ffffff; border: 1px solid #e0e7ff; border-radius: 6px; padding: 8px 10px;">
        <div style="font-weight: 700; font-size: 11.5px; color: #3730a3; margin-bottom: 6px; display: flex; align-items: center;">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #6366f1; margin-right: 6px;"></span>
          ${escapeHtml(sec.title)}
        </div>
    `;

    if (sec.metrics.length > 0) {
      html += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">`;
      sec.metrics.forEach((m) => {
        html += `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 8px; font-size: 10.5px;">
            <div style="font-weight: bold; color: #0284c7; margin-bottom: 2px;">• ${escapeHtml(m.metricName)}</div>
            <div style="color: #334155; line-height: 1.5;">${escapeHtml(m.explanation)}</div>
          </div>
        `;
      });
      html += `</div>`;
    }

    if (sec.explanation) {
      html += `
        <div style="font-size: 10.5px; color: #334155; line-height: 1.6; white-space: pre-wrap;">
          ${escapeHtml(sec.explanation)}
        </div>
      `;
    }

    if (sec.recommendation) {
      html += `
        <div style="margin-top: 6px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px; padding: 6px 8px; font-size: 10.5px; color: #065f46;">
          <strong style="color: #047857;">[추천 실험 방향]:</strong> ${escapeHtml(sec.recommendation)}
        </div>
      `;
    }

    html += `</div>`;
  });

  if (parsed.disclaimer) {
    html += `
      <div style="margin-top: 8px; font-size: 9.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 6px 8px;">
        <strong>면책 조항:</strong> ${escapeHtml(parsed.disclaimer)}
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

/**
 * Modern React Component to render parsed AI insight on screen
 */
export const AiInsightView: React.FC<{ rawText: string }> = ({ rawText }) => {
  const parsed = parseAiInsightTags(rawText);

  if (!parsed.header && parsed.sections.length === 0) {
    return <div className="text-xs text-slate-300">{rawText}</div>;
  }

  return (
    <div className="space-y-4 text-xs">
      {parsed.header && (
        <div className="p-3 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-indigo-200 font-bold text-sm flex items-center space-x-2">
          <Award className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{parsed.header}</span>
        </div>
      )}

      <div className="space-y-3">
        {parsed.sections.map((sec, idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-slate-900/90 border border-indigo-500/30 shadow-md space-y-2.5"
          >
            <div className="font-bold text-indigo-300 flex items-center space-x-2 text-xs border-b border-indigo-950 pb-2">
              <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>{sec.title}</span>
            </div>

            {sec.metrics.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {sec.metrics.map((m, mIdx) => (
                  <div
                    key={mIdx}
                    className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-300 space-y-1"
                  >
                    <div className="font-bold text-cyan-300 text-[11px] flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      <span>{m.metricName}</span>
                    </div>
                    <div className="text-[11px] leading-relaxed text-slate-300">{m.explanation}</div>
                  </div>
                ))}
              </div>
            )}

            {sec.explanation && (
              <div className="text-slate-300 leading-relaxed whitespace-pre-wrap text-xs bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80">
                {sec.explanation}
              </div>
            )}

            {sec.recommendation && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-start space-x-2">
                <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-emerald-300 font-bold block mb-0.5">후속 실험 및 최적화 추천 방향:</strong>
                  <span className="leading-relaxed text-emerald-100">{sec.recommendation}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {parsed.disclaimer && (
        <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-300 text-[11px] flex items-center space-x-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{parsed.disclaimer}</span>
        </div>
      )}
    </div>
  );
};

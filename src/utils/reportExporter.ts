import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { JobResultData } from '../services/api.ts';
import { convertAiInsightToPrintHtml } from './aiTagParser.tsx';
import { escapeHtml } from './escapeHtml.ts';
import { getStructureSourceInfo, getConfidenceGrade } from './structureSource.ts';

export type ResultData = NonNullable<JobResultData['data']>;

export function generateReportHtml(
  result: ResultData,
  dynamicScore: number,
  normWeights: number[],
  aiInsight?: string
): string {
  const timestamp = result.reproducibility?.timestamp || new Date().toISOString();
  const residues = result.residues || [];
  const epitopeResidues = residues.filter((r) => r.in_epitope);

  const isSimulated =
    result.auto_settings.is_simulated ||
    result.auto_settings.candidate_source === 'simulated';

  const srcInfo = getStructureSourceInfo(
    result.auto_settings.candidate_source,
    result.auto_settings.is_simulated,
    result.auto_settings.is_experimental_candidate
  );

  const gradeInfo = getConfidenceGrade(
    dynamicScore,
    result.auto_settings.is_temporary_epitope,
    isSimulated
  );

  const candidateSourceLabel = srcInfo.label;
  const gradeLabel = gradeInfo.label;
  const gradeColor = gradeInfo.colorHex;
  const gradeBg = gradeInfo.bgHex;

  const residueRows = residues
    .slice(0, 100)
    .map(
      (r) => `
    <tr style="border-bottom: 1px solid #e2e8f0; ${r.in_epitope ? 'background-color: #fff1f2;' : ''}">
      <td style="padding: 5px 8px; font-weight: ${r.in_epitope ? 'bold' : 'normal'}; text-align: center; color: #1e293b;">${escapeHtml(String(r.res_id))}</td>
      <td style="padding: 5px 8px; font-weight: bold; text-align: center; color: #0f172a;">${escapeHtml(r.res_name || '')}</td>
      <td style="padding: 5px 8px; text-align: center; color: ${r.in_epitope ? '#e11d48' : '#64748b'}; font-weight: bold;">
        ${r.in_epitope ? '★ 에피톱' : '골격(비에피톱)'}
      </td>
      <td style="padding: 5px 8px; text-align: right; font-family: monospace; font-weight: 600; color: ${r.distance < 0 ? '#64748b' : r.distance <= 1.5 ? '#059669' : r.distance <= 3.0 ? '#d97706' : '#e11d48'};">
        ${r.distance >= 0 ? r.distance.toFixed(3) + ' Å' : '미정렬'}
      </td>
      <td style="padding: 5px 8px; text-align: right; font-family: monospace; color: #334155;">${(r.rsa_target ?? 0).toFixed(3)}</td>
      <td style="padding: 5px 8px; text-align: right; font-family: monospace; color: #334155;">${(r.rsa_candidate ?? 0).toFixed(3)}</td>
      <td style="padding: 5px 8px; text-align: right; font-family: monospace; font-weight: 600; color: ${(r.plddt ?? 0) >= 70 ? '#059669' : '#e11d48'};">
        ${(r.plddt ?? 0).toFixed(1)}
      </td>
      <td style="padding: 5px 8px; text-align: right; font-family: monospace; font-weight: bold; color: #0284c7;">
        ${(r.similarity ?? 0).toFixed(3)}
      </td>
    </tr>
  `
    )
    .join('');

  // Format rationale paragraphs cleanly with bold headers
  const formattedRationale = (result.evaluation_rationale || '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const escaped = escapeHtml(trimmed);
      if (trimmed.startsWith('【') || trimmed.startsWith('[')) {
        return `<div style="font-weight: 800; font-size: 12px; color: #0f172a; margin-top: 10px; margin-bottom: 4px; border-left: 3px solid #0284c7; padding-left: 8px;">${escaped}</div>`;
      }
      if (trimmed.startsWith('•')) {
        return `<div style="padding-left: 12px; margin-bottom: 3px; color: #334155; line-height: 1.6;">${escaped}</div>`;
      }
      return `<div style="margin-bottom: 4px; color: #334155; line-height: 1.6;">${escaped}</div>`;
    })
    .join('');

  const formattedAiInsight = aiInsight ? convertAiInsightToPrintHtml(aiInsight) : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>2026 SSEP_TEAM SSBD(씁뜩) - 백신 후보 물질 항원성 모방도 정밀 평가서</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 12mm 12mm 12mm;
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", "Segoe UI", Roboto, sans-serif;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      font-size: 11.5px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-after: always;
      }
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 2.5px solid #0284c7;
      padding-bottom: 10px;
      margin-bottom: 12px;
    }
    .header-title {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .header-sub {
      font-size: 11px;
      color: #0284c7;
      font-weight: 600;
      margin-top: 3px;
    }
    .disclaimer-box {
      background-color: #fffbeb;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 12px;
      font-size: 10.5px;
      color: #92400e;
      line-height: 1.5;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: 12px;
      margin-bottom: 12px;
    }
    .card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .card-title {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 8px;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .score-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 19px;
      color: ${gradeColor};
      background-color: ${gradeBg};
      border: 1px solid ${gradeColor}40;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      margin-top: 6px;
    }
    th {
      background-color: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
      padding: 6px 8px;
      border-bottom: 2px solid #cbd5e1;
      text-align: center;
    }
    .param-table td {
      padding: 3.5px 0;
      font-size: 11px;
    }
    .rationale-container {
      background: #ffffff;
      padding: 10px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      font-size: 11px;
    }
    .btn-print {
      background: #0284c7;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; background: #f1f5f9; padding: 10px 16px; border-radius: 8px; border: 1px solid #cbd5e1;">
    <span style="font-size: 12px; color: #1e293b;"><strong>인쇄 및 PDF 저장 안내:</strong> 아래 버튼을 누르거나 Ctrl+P / Cmd+P 를 눌러 출력 또는 PDF 저장이 가능합니다.</span>
    <button class="btn-print" onclick="window.print()">인쇄 / PDF로 저장</button>
  </div>

  <div class="header-bar">
    <div>
      <h1 class="header-title">2026 SSEP_TEAM SSBD(씁뜩) 항원성 모방도 정밀 분석 리포트</h1>
      <div class="header-sub">Antigenic Mimicry & 3D Epitope Conformational Fitness Evaluation Report</div>
    </div>
    <div style="text-align: right; font-size: 10.5px; color: #64748b;">
      <div><strong>분석 일시:</strong> ${timestamp.substring(0, 19).replace('T', ' ')} UTC</div>
      <div><strong>분석 엔진:</strong> SSBD Core v1.0.0 (Kabsch + TM-align + SASA)</div>
    </div>
  </div>

  ${
    isSimulated
      ? `
  <div style="background-color: #ffe4e6; border: 2px solid #e11d48; border-radius: 6px; padding: 10px 14px; margin-bottom: 12px; font-size: 11px; color: #9f1239; line-height: 1.5;">
    <strong style="font-size: 12px; color: #e11d48;">⚠️ 경고: 모사 구조 기반, 연구용 사용 불가 (Simulated Model - Not For Research Use)</strong><br />
    본 분석 결과는 ESMFold API 응답 부재 시 서열 템플릿 모사(Sequence Threading)로 생성된 대체 구조에 기반합니다. 실제 단백질 3D 좌표 예측이 아니므로 점수를 신뢰할 수 없으며, 학술 논문 및 공식 연구 결과물로 사용할 수 없습니다.
  </div>
  `
      : ''
  }

  <div class="disclaimer-box">
    <strong>면책 조항 (Mandatory Scientific Disclaimer):</strong><br />
    "본 결과는 단백질 3차원 좌표 기반의 <em>in silico</em> 구조 중첩 및 에피톱 국소 모방도 수학적 비교 분석 결과이며, 백신의 실제 임상 효능이나 생물학적 안전성을 보증하지 않습니다. 논문 및 보고서 작성 시 '효과 검증'이 아닌 '구조 모방도 기반 항원성 보존 예측'으로 기술해야 합니다."
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">
        <span>1. 종합 적합도 점수 (Antigenic Mimicry Fitness Score)</span>
        <span style="font-size: 10px; font-weight: normal; color: #64748b;">100점 만점 기준</span>
      </div>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; margin-bottom: 8px;">
        <span class="score-badge">${dynamicScore.toFixed(2)} 점</span>
        <div style="text-align: right;">
          <div style="font-size: 13px; font-weight: 800; color: ${gradeColor};">${gradeLabel}</div>
          <div style="font-size: 10px; color: #64748b;">정밀 구조 적합성 판정</div>
        </div>
      </div>
      <div style="font-size: 10.5px; border-top: 1px solid #e2e8f0; padding-top: 6px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
        <div>• <strong>골격 유사도(S_global):</strong> ${(result.sub_scores.s_global * 100).toFixed(1)}% (가중치 ${(normWeights[0] * 100).toFixed(0)}%)</div>
        <div>• <strong>에피톱 모방도(S_epi):</strong> ${(result.sub_scores.s_epi * 100).toFixed(1)}% (가중치 ${(normWeights[1] * 100).toFixed(0)}%)</div>
        <div>• <strong>노출도 일치율(S_exp):</strong> ${(result.sub_scores.s_exp * 100).toFixed(1)}% (가중치 ${(normWeights[2] * 100).toFixed(0)}%)</div>
        <div>• <strong>구조 신뢰도(S_conf):</strong> ${result.sub_scores.s_conf !== null && result.sub_scores.s_conf !== undefined ? `${(result.sub_scores.s_conf * 100).toFixed(1)}%` : '해당 없음 (실험 결정 구조)'} (가중치 ${(normWeights[3] * 100).toFixed(0)}%)</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        <span>2. 정렬 및 결정학적 파라미터 (Alignment Metrics)</span>
      </div>
      <table class="param-table" style="margin-top: 2px;">
        <tr>
          <td style="color: #64748b;">TM-score (타겟 / 후보 정규화):</td>
          <td style="font-weight: bold; text-align: right; font-family: monospace;">${result.alignment.tm_score_target_norm.toFixed(4)} / ${result.alignment.tm_score_candidate_norm.toFixed(4)}</td>
        </tr>
        <tr>
          <td style="color: #64748b;">에피톱 Cα 중첩 RMSD:</td>
          <td style="font-weight: bold; text-align: right; font-family: monospace; color: ${result.alignment.rmsd <= 2.0 ? '#059669' : '#e11d48'};">${result.alignment.rmsd.toFixed(2)} Å</td>
        </tr>
        <tr>
          <td style="color: #64748b;">정렬 잔기 수 / 서열 커버리지:</td>
          <td style="font-weight: bold; text-align: right;">${result.alignment.aligned_length}개 잔기 (${(result.alignment.coverage * 100).toFixed(1)}%)</td>
        </tr>
        <tr>
          <td style="color: #64748b;">분석 모드 / 분석 타겟 체인:</td>
          <td style="font-weight: bold; text-align: right;">${result.auto_settings.mode === 'fragment' ? '단편 (Fragment)' : '전체 (Full)'} / ${escapeHtml(result.auto_settings.target_chain)}체인</td>
        </tr>
        <tr>
          <td style="color: #64748b;">후보 구조 출처 (Structure Source):</td>
          <td style="font-weight: bold; text-align: right;">
            <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10.5px; font-weight: bold; color: ${srcInfo.colorHex}; background-color: ${srcInfo.colorHex}15; border: 1px solid ${srcInfo.colorHex}40;">
              ${escapeHtml(srcInfo.badgeText)}
            </span> (${escapeHtml(srcInfo.label)})
          </td>
        </tr>
        <tr>
          <td style="color: #64748b;">에피톱 소스 / 잔기 개수:</td>
          <td style="font-weight: bold; text-align: right;">${result.auto_settings.is_temporary_epitope ? '임시 자동 추출 (RSA ≥ 0.2)' : escapeHtml(result.auto_settings.epitope_source)} (${epitopeResidues.length}개 잔기)</td>
        </tr>
      </table>
    </div>
  </div>

  <div class="card" style="margin-bottom: 12px;">
    <div class="card-title">
      <span>3. 과학적 평가 소견 및 심층 해석 (Scientific Evaluation Rationale)</span>
    </div>
    <div class="rationale-container">
      ${formattedRationale}
    </div>
  </div>

  ${
    formattedAiInsight
      ? `
  <div class="card" style="margin-bottom: 12px; border-color: #a5b4fc; background: #f5f3ff;">
    <div class="card-title" style="color: #4338ca; border-bottom-color: #c7d2fe;">
      <span>★ AI 심층 분석 및 백신 항원성 전망 리포트 (Groq LLaMA 3.3 Engine)</span>
      <span style="font-size: 10px; font-weight: normal; color: #6366f1;">구조생물학/백신학 AI 정밀 해설</span>
    </div>
    <div class="rationale-container" style="background: #ffffff; border-color: #e0e7ff;">
      ${formattedAiInsight}
    </div>
  </div>
  `
      : ''
  }

  <div class="card">
    <div class="card-title">
      <span>4. 잔기별 정밀 분석 매트릭스 (Residue Analysis Matrix, 상위 ${Math.min(residues.length, 100)}개 잔기)</span>
      <span style="font-size: 10px; font-weight: normal; color: #64748b;">총 ${residues.length}개 잔기 분석 완료</span>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width: 10%;">잔기 번호</th>
          <th style="width: 10%;">아미노산</th>
          <th style="width: 15%;">에피톱 여부</th>
          <th style="width: 15%; text-align: right;">Cα 편차 (Å)</th>
          <th style="width: 12%; text-align: right;">RSA 타겟</th>
          <th style="width: 12%; text-align: right;">RSA 후보</th>
          <th style="width: 12%; text-align: right;">pLDDT</th>
          <th style="width: 14%; text-align: right;">국소 유사도</th>
        </tr>
      </thead>
      <tbody>
        ${residueRows}
      </tbody>
    </table>
    ${residues.length > 100 ? `<div style="font-size: 10px; color: #64748b; margin-top: 6px; text-align: center;">* 전체 ${residues.length}개 잔기 데이터는 CSV 다운로드를 통해 전체 확인이 가능합니다.</div>` : ''}
  </div>

  <div style="margin-top: 16px; padding-top: 8px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
    <span>2026 SSEP_TEAM SSBD(씁뜩) Bioinformatics Platform • Deterministic In Silico Mimicry Evaluation</span>
    <span>Kabsch SVD + TM-score + Shrake-Rupley SASA Calculation</span>
  </div>
</body>
</html>`;
}

/**
 * Executes a clean browser print dialog using an isolated hidden iframe
 */
export function printReport(
  result: ResultData,
  dynamicScore: number,
  normWeights: number[],
  aiInsight?: string
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const html = generateReportHtml(result, dynamicScore, normWeights, aiInsight);

      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc || !iframe.contentWindow) {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) {
          win.onload = () => win.print();
        }
        resolve();
        return;
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn('Iframe print fallback:', e);
        }
        setTimeout(() => {
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          resolve();
        }, 2000);
      }, 500);
    } catch (err) {
      console.error('Print report error:', err);
      resolve();
    }
  });
}

/**
 * Direct high-fidelity PDF file generation using html2canvas + jsPDF
 * Perfectly renders Korean (Hangul) typography, badges, and tables without any corrupted characters!
 */
export async function downloadPdfReport(
  result: ResultData,
  dynamicScore: number,
  normWeights: number[],
  aiInsight?: string
): Promise<void> {
  try {
    const html = generateReportHtml(result, dynamicScore, normWeights, aiInsight);

    // Create an off-screen container matching A4 pixel width (794px @ 96dpi)
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '794px';
    container.style.background = '#ffffff';
    container.style.zIndex = '-1000';
    container.innerHTML = html;

    // Remove no-print instruction button inside captured container
    const noPrintEl = container.querySelector('.no-print');
    if (noPrintEl) {
      noPrintEl.remove();
    }

    document.body.appendChild(container);

    // Render HTML to high-resolution canvas (scale: 2 for 300dpi-equivalent sharpness)
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    document.body.removeChild(container);

    // Initialize A4 PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = 210;
    const pdfHeight = 297;

    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    const pageCanvas = document.createElement('canvas');
    const pageCtx = pageCanvas.getContext('2d');

    const pxPageHeight = Math.floor((canvas.width * pdfHeight) / pdfWidth);
    pageCanvas.width = canvas.width;
    pageCanvas.height = pxPageHeight;

    let srcY = 0;

    // First page
    if (pageCtx) {
      pageCtx.fillStyle = '#ffffff';
      pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageCtx.drawImage(
        canvas,
        0,
        srcY,
        canvas.width,
        Math.min(canvas.height - srcY, pxPageHeight),
        0,
        0,
        canvas.width,
        Math.min(canvas.height - srcY, pxPageHeight)
      );
      const pageData = pageCanvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(pageData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      heightLeft -= pdfHeight;
      srcY += pxPageHeight;
    }

    // Subsequent pages
    while (heightLeft > 5 && srcY < canvas.height) {
      pdf.addPage();
      if (pageCtx) {
        pageCtx.fillStyle = '#ffffff';
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageCtx.drawImage(
          canvas,
          0,
          srcY,
          canvas.width,
          Math.min(canvas.height - srcY, pxPageHeight),
          0,
          0,
          canvas.width,
          Math.min(canvas.height - srcY, pxPageHeight)
        );
        const pageData = pageCanvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(pageData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      }
      heightLeft -= pdfHeight;
      srcY += pxPageHeight;
    }

    pdf.save(`SSBD_Report_${Date.now()}.pdf`);
  } catch (err) {
    console.error('PDF export error:', err);
    // Fallback: trigger print dialog if canvas capture fails
    printReport(result, dynamicScore, normWeights, aiInsight);
  }
}

/**
 * Standalone HTML report downloader
 */
export function downloadHtmlReport(
  result: ResultData,
  dynamicScore: number,
  normWeights: number[],
  aiInsight?: string
): void {
  const html = generateReportHtml(result, dynamicScore, normWeights, aiInsight);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `SSBD_Report_${Date.now()}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

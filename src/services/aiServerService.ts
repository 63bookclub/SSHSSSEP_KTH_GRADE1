/**
 * Server-side AI insight generator for VaxMatch 3D.
 * Communicates with high-throughput LLM endpoints (Groq API) securely from the backend.
 * Uses strict semantic tag rules ([HEADER], [SECTION: ...], [METRIC: ...], [EXPLAIN], [RECOMMEND], [DISCLAIMER])
 * to eliminate messy markdown symbols, LaTeX formatting, and truncation issues.
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

export interface AiInsightRequest {
  finalScore: number;
  grade: string;
  subScores: {
    s_global: number;
    s_epi: number;
    s_exp: number;
    s_conf: number;
  };
  alignment: {
    tm_score_target_norm: number;
    tm_score_candidate_norm: number;
    rmsd: number;
    aligned_length: number;
    coverage: number;
  };
  autoSettings: {
    mode: string;
    target_chain: string;
    epitope_source: string;
  };
}

export async function generateAiInsight(data: AiInsightRequest): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY가 서버 환경 변수에 설정되지 않았습니다. 환경 변수 GROQ_API_KEY를 등록해 주세요.');
  }

  const prompt = `
당신은 백신학 및 구조생물학(Computational Vaccinology) 전문 AI 분석관입니다.
아래 제공된 단백질 3차원 구조 비교 분석 데이터를 바탕으로, 연구자와 학생을 위한 정밀 평가 보고서를 작성해 주십시오.

[데이터 요약]
- 종합 모방 적합도 점수: ${data.finalScore.toFixed(2)}점 / 100점 (판정 등급: ${data.grade})
- 전체 골격 유사도 (S_global): ${(data.subScores.s_global * 100).toFixed(1)}% (TM-score 타겟: ${data.alignment.tm_score_target_norm.toFixed(4)}, 후보: ${data.alignment.tm_score_candidate_norm.toFixed(4)})
- 에피톱 국소 모방도 (S_epi): ${(data.subScores.s_epi * 100).toFixed(1)}% (에피톱 Cα 중첩 RMSD: ${data.alignment.rmsd.toFixed(2)} Å)
- 용매 접근 표면적 일치율 (S_exp): ${(data.subScores.s_exp * 100).toFixed(1)}% (Shrake-Rupley SASA 기준)
- 구조 신뢰도 지수 (S_conf): ${(data.subScores.s_conf * 100).toFixed(1)}%
- 정렬 정보: 총 ${data.alignment.aligned_length}개 잔기 정렬 (커버리지 ${(data.alignment.coverage * 100).toFixed(1)}%), 분석 체인: ${data.autoSettings.target_chain}체인

[서식 규칙 (Strict Tagging Specification)]
★ 마크다운 특수기호(###, **, ***, ---, $, \\text{} 등)를 일절 사용하지 마십시오.
★ 오직 아래 지정된 정형 태그 규격만을 순서대로 사용하여 리포트를 작성하십시오:

[HEADER]VaxMatch 3D 항원성 모방도 정밀 평가 보고서 - ${data.autoSettings.target_chain}체인 분석 요약[/HEADER]
[SECTION: 1. 점수 체계의 구체적 의미와 생물학적 해석]
[METRIC: 전체 골격 유사도 S_global ${(data.subScores.s_global * 100).toFixed(1)}%]
[EXPLAIN]TM-score 수치가 의미하는 단백질 도메인 3D 폴딩 보존성과 스캐폴드 안정성 해설 (2~3문장)[/EXPLAIN]
[METRIC: 에피톱 국소 모방도 S_epi ${(data.subScores.s_epi * 100).toFixed(1)}% (RMSD ${data.alignment.rmsd.toFixed(2)}Å)]
[EXPLAIN]RMSD와 국소 모방도 수치가 의미하는 중화항체 결합 포켓의 원자 수준 정밀도 해설 (2~3문장)[/EXPLAIN]
[METRIC: 용매 접근 표면적 일치율 S_exp ${(data.subScores.s_exp * 100).toFixed(1)}%]
[EXPLAIN]SASA 일치율이 의미하는 항체 접근 가능 표면 노출도 보존성 및 매몰 위험 진단 (2~3문장)[/EXPLAIN]
[METRIC: 구조 신뢰도 지수 S_conf ${(data.subScores.s_conf * 100).toFixed(1)}%]
[EXPLAIN]구조 모델의 물리화학적 신뢰도 및 유연성 평가 (2~3문장)[/EXPLAIN]
[/SECTION]
[SECTION: 2. 항원 결정기(Epitope) 3D 보존성 및 결합 포켓 분석]
[EXPLAIN]중화항체가 인식하는 3차원 결합 포켓의 형태학적 일치도와 전하/소수성 보존성 상세 분석 (3~4문장)[/EXPLAIN]
[/SECTION]
[SECTION: 3. 체액성 면역 및 표면 노출도 평가]
[EXPLAIN]체액 내 B세포 수용체(BCR) 및 순환 항체의 물리적 결합 용이성과 면역 유도성 평가 (3~4문장)[/EXPLAIN]
[/SECTION]
[SECTION: 4. 백신 후보 물질로서의 구조적 항원성 및 교차 반응성 전망]
[EXPLAIN]in silico 구조적 관점에서 타겟 항원과 유사한 중화항체를 유도할 가능성 및 보호 스펙트럼 전망 (3~4문장)[/EXPLAIN]
[/SECTION]
[SECTION: 5. 연구자 후속 검증 권장사항]
[RECOMMEND]SPR/BLI 결합 친화도 측정, Cryo-EM/결정학 구조 검증, 잔기 재설계 등 구체적인 추천 실험 방향 (3~4문장)[/RECOMMEND]
[/SECTION]
[DISCLAIMER]과학적 면책 조항: 본 분석은 in silico 3차원 구조 비교 분석 결과이며 실제 임상 효능이나 생물학적 안전성을 보증하지 않습니다.[/DISCLAIMER]

★ 절대 문장이 중간에 잘리지 않도록 각 문장을 명확하고 간결하게 작성하여 마지막 [/DISCLAIMER] 태그까지 완결하여 출력하십시오.
`;

  const candidateModels = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
  ];
  let lastError = '';

  for (const model of candidateModels) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: '당신은 VaxMatch 3D의 전문 AI 분석관입니다. 마크다운 특수기호(###, **, ***, ---, $, 수식 기호)를 절대 쓰지 않고, 지정된 정형 태그([HEADER], [SECTION: ...], [METRIC: ...], [EXPLAIN], [RECOMMEND], [DISCLAIMER])만 사용하여 깔끔하고 완결된 문장으로 응답합니다.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 1900,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `Groq (${model}) 오류 [${res.status}]: ${errText}`;
        continue;
      }

      const resJson = await res.json();
      const content = resJson.choices?.[0]?.message?.content;
      if (content) {
        return content;
      }
    } catch (err: any) {
      lastError = err.message || String(err);
    }
  }

  throw new Error(`AI 리포트 생성 실패: ${lastError}`);
}

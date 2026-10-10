import { describe, expect, it } from 'bun:test';
import { generateReportHtml } from './reportExporter.ts';

describe('Report Exporter (generateReportHtml)', () => {
  const sampleResult: any = {
    auto_settings: {
      mode: 'full',
      target_chain: 'A',
      epitope_source: '437-508',
      is_temporary_epitope: false,
      is_experimental_candidate: false,
      candidate_source: 'esmfold',
      is_simulated: false,
    },
    alignment: {
      tm_score_target_norm: 0.85,
      tm_score_candidate_norm: 0.82,
      rmsd: 1.25,
      aligned_length: 150,
      coverage: 0.95,
    },
    sub_scores: {
      s_global: 0.85,
      s_epi: 0.90,
      s_exp: 0.88,
      s_conf: 0.80,
    },
    weights: [0.25, 0.40, 0.20, 0.15],
    final_fitness_score: 86.5,
    evaluation_rationale: 'Sample rationale',
    residues: [
      {
        res_id: 1,
        res_name: 'ALA',
        in_epitope: true,
        distance: 1.2,
        rsa_target: 0.4,
        rsa_candidate: 0.38,
        plddt: 85.0,
        similarity: 0.9,
      },
    ],
    reproducibility: {
      timestamp: '2026-03-31T00:00:00Z',
    },
  };

  it('should include structure source badge and trust grade for ESMFold candidate', () => {
    const html = generateReportHtml(sampleResult, 86.5, [0.25, 0.40, 0.20, 0.15]);
    expect(html).toContain('구조 출처: ESMFold 예측');
    expect(html).toContain('신뢰 등급: pLDDT 기반');
  });

  it('should include structure source badge and trust grade for Experimental candidate', () => {
    const expResult = {
      ...sampleResult,
      auto_settings: {
        ...sampleResult.auto_settings,
        is_experimental_candidate: true,
        candidate_source: 'experimental',
      },
    };
    const html = generateReportHtml(expResult, 86.5, [0.25, 0.40, 0.20, 0.15]);
    expect(html).toContain('구조 출처: 실험');
    expect(html).toContain('신뢰 등급: 높음');
  });

  it('should include structure source badge and trust grade for Simulated candidate', () => {
    const simResult = {
      ...sampleResult,
      auto_settings: {
        ...sampleResult.auto_settings,
        is_simulated: true,
        candidate_source: 'simulated',
      },
    };
    const html = generateReportHtml(simResult, 50.0, [0.25, 0.40, 0.20, 0.15]);
    expect(html).toContain('구조 출처: 모사(대체)');
    expect(html).toContain('신뢰 등급: 낮음');
  });
});

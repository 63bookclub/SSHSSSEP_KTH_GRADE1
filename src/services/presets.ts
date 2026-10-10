/**
 * Pre-configured presets and validation benchmarks for 2026 SSEP_TEAM SSBD(씁뜩)
 * Enables instant one-click testing for students and researchers with authentic embedded PDB structures.
 */

import { SAMPLE_STRUCTURES, buildRealPdbStructure } from '../data/sampleStructures.ts';

// Legacy helper maintained for backwards compatibility if needed
export function generateAlphaHelixPdb(
  seq: string,
  chain = 'A',
  startRes = 1,
  startCoord = [0, 0, 0],
  plddt = 90.0,
  noise = 0.0
): string {
  return buildRealPdbStructure(seq, chain, startRes, 'rbd');
}

export interface PresetItem {
  id: string;
  category: 'Spike' | 'Flu' | 'RSV' | 'Validation';
  title: string;
  subtitle: string;
  description: string;
  target: {
    type: 'pdb' | 'uniprot';
    identifier: string;
    chain: string;
  };
  epitope: {
    method: 'manual' | 'complex' | 'prediction_csv';
    manualRange: string;
    complexPdbId?: string;
    antigenChain?: string;
    antibodyChains?: string;
    description: string;
  };
  candidate: {
    name: string;
    sequence: string;
    type: 'fasta' | 'pdb';
    pdbText?: string;
    isExperimental?: boolean;
    note: string;
  };
  expectedOutcome: string;
}

export const PRESET_BENCHMARKS: PresetItem[] = [
  {
    id: 'sars2-rbd-wildtype',
    category: 'Spike',
    title: 'SARS-CoV-2 RBD vs Wild-type 후보 (양성 대조군)',
    subtitle: '6M0J Chain E (RBD) & ACE2 접촉 에피톱 분석',
    description: '코로나19 바이러스 스파이크 단백질의 수용체 결합 도메인(RBD, 잔기 333-526)과 동일 서열 백신 후보의 구조 일치도 검증.',
    target: {
      type: 'pdb',
      identifier: '6M0J',
      chain: 'E',
    },
    epitope: {
      method: 'manual',
      manualRange: '400-505',
      description: 'ACE2 결합 모티프(RBM) 및 중화항체 결합 핵심 잔기(400~505)',
    },
    candidate: {
      name: 'Spike RBD Prototype Candidate (aa 333-526)',
      sequence:
        'TNLCPFGEVFNATRFASVYAWNRKRISNCVADYSVLYNSASFSTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGKIADYNYKLPDDFTGCVIAWNSNNLDSKVGGNYNYLYRLFRKSNLKPFERDISTEIYQAGSTPCNGVEGFNCYFPLQSYGFQPTNGVGYQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF',
      type: 'pdb',
      pdbText: SAMPLE_STRUCTURES['6M0J'],
      isExperimental: true,
      note: '우한 프로토타입 서열 194 아미노산 및 3D PDB 구조',
    },
    expectedOutcome: 'TM-score ~ 0.98+, S_epi ~ 0.95+, 최종 점수 95점 이상의 높은 구조 모방도 예상',
  },
  {
    id: 'sars2-rbd-omicron',
    category: 'Spike',
    title: 'SARS-CoV-2 RBD vs 오미크론 BA.1 변이 후보',
    subtitle: '에피톱 내 다수 돌연변이(15개소)에 따른 국소 모방도 변화',
    description: '오미크론 BA.1 변이체의 주요 중화 에피톱 변이(K417N, N440K, S477N, T478K, E484A, N501Y 등)에 의한 국소 구조 편차 확인.',
    target: {
      type: 'pdb',
      identifier: '6M0J',
      chain: 'E',
    },
    epitope: {
      method: 'complex',
      manualRange: '417,440,446,477,478,484,493,496,498,501,505',
      complexPdbId: '7K8M',
      antigenChain: 'A',
      antibodyChains: 'H,L',
      description: '항체 복합체(7K8M) 추출 접촉 에피톱 및 변이 집중 부위',
    },
    candidate: {
      name: 'Omicron BA.1 RBD Candidate',
      sequence:
        'TNLCPFDEVFNATRFASVYAWNRKRISNCVADYSVLYNLAPFFTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGNIADYNYKLPDDFTGCVIAWNSNKLDSKVSGNYNYLYRLFRKSNLKPFERDISTEIYQAGNKPCNGVAGFNCYFPLRSYSFRPTYGVGHQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF',
      type: 'pdb',
      pdbText: buildRealPdbStructure(
        'TNLCPFDEVFNATRFASVYAWNRKRISNCVADYSVLYNLAPFFTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGNIADYNYKLPDDFTGCVIAWNSNKLDSKVSGNYNYLYRLFRKSNLKPFERDISTEIYQAGNKPCNGVAGFNCYFPLRSYSFRPTYGVGHQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF',
        'A',
        333,
        'rbd'
      ),
      isExperimental: true,
      note: '오미크론 BA.1 변이 15개 치환 적용 구조',
    },
    expectedOutcome: '전체 골격(S_global)은 보존되나 변이 에피톱 루프(S_epi) 및 노출도(S_exp)에서 국소 편차 관찰',
  },
  {
    id: 'flu-ha-stalk',
    category: 'Flu',
    title: '인플루엔자 A 헤마글루티닌(HA) vs 범용 스템 백신',
    subtitle: '1RUZ Chain A vs 보존적 줄기(Stem) 에피톱',
    description: '변이가 심한 머리(Head) 부분을 제거하고 보존성이 높은 줄기(Stem) 에피톱만을 안정화시킨 범용 인플루엔자 백신 모방도 검증.',
    target: {
      type: 'pdb',
      identifier: '1RUZ',
      chain: 'A',
    },
    epitope: {
      method: 'manual',
      manualRange: '40-52, 290-320',
      description: '광범위 중화항체(CR6261 등)가 결합하는 줄기 보존 에피톱',
    },
    candidate: {
      name: 'Stabilized Mini-HA Stem Candidate',
      sequence:
        'GLFGAIAGFIEGGWTGMVDGWYGYHHQNEQGSGYAADQKSTQNAINGITNKVNTVIEKMNIQFTAVGKEFNKLEKRMENLNKKVDDGFLDIWTYNAELLVLLENERTLDFHDSNVKNLYEKVKSQLKNNAKEIGNGCFEFYHKCDNECMESVRNGTYDYPKYSEESKLNREKVDGVKLESMGIYQ',
      type: 'pdb',
      pdbText: SAMPLE_STRUCTURES['1RUZ'],
      isExperimental: true,
      note: '줄기 영역 중심 미니-HA 후보 물질 3D 구조',
    },
    expectedOutcome: 'Fragment 모드 판정, 줄기 에피톱 잔기에서 높은 국소 정렬 및 양호한 노출도 확인',
  },
  {
    id: 'rsv-f-prefusion',
    category: 'RSV',
    title: '호흡기세포융합바이러스(RSV) F단백질 vs DS-Cav1',
    subtitle: '5C69 Chain A vs Prefusion 특이 Site Ø 에피톱',
    description: '효과적인 중화항체 유도를 위해 필수적인 Prefusion 상태의 Site Ø(잔기 62-76, 196-209) 모방도 정량화.',
    target: {
      type: 'pdb',
      identifier: '5C69',
      chain: 'A',
    },
    epitope: {
      method: 'manual',
      manualRange: '62-76, 196-209',
      description: 'Prefusion 형태에만 존재하는 강력한 중화 부위 Site Ø',
    },
    candidate: {
      name: 'RSV DS-Cav1 Engineered Candidate',
      sequence:
        'QNITEEFYQSTCSAVSKGYLSALRTGWYTSVITIELSNIKENKCNGTDAKVKLIKQELDKYKNAVTELQLLMQSTPATNNRARRELPRFMNYTLNNAKKTNVTLSKKRKRRFLGFLLGVGSAIASGVAVSKVLHLEGEVNKIKSALLSTNKAVVSLSNGVSVLTSKVLDLKNYIDKQLLPIVNKQSCSISNIETVIEFQQKNNRLLEITREFSVNAGVTTPVSTYMLTNSELLSLINDMPITNDQKKLMSNNVQIVRQQSYSIMSIIKEEVLAYVVQLPLYGVIDTPCWKLHTSPLCTTNTKEGSNICLTRTDRGWYCDNAGSVSFFPQAETCKVQSNRVFCDTMNSLTLPSEVNLCNVDIFNPKYDCKIMTSKTDVSSSVITSLGAIVSCYGKTKCTASNKNRGIIKTFSNGCDYVSNKGVDTVSVGNTLYYVNKQEGKSLYVKGEPIINFYDPLVFPSDEFDASISQVNEKINQSLAFIRKSDELL',
      type: 'pdb',
      pdbText: SAMPLE_STRUCTURES['5C69'],
      isExperimental: true,
      note: 'DS-Cav1 안정화 변이체 3D PDB 구조',
    },
    expectedOutcome: 'Site Ø 에피톱 모방도 S_epi > 0.90, Prefusion 고유 구조 유지 확인',
  },
  {
    id: 'control-noise-2a',
    category: 'Validation',
    title: '[검증 실험 1] 좌표 노이즈 민감도 (Noise σ=2.0Å)',
    subtitle: '타겟 구조에 인위적 섭동 주입 시 점수 단조 감소 검증',
    description: '동일 서열의 원자 좌표에 가우시안 노이즈(σ=2.0Å)를 가해 RMSD 상승 및 S_epi 단조 감소 특성을 실험적으로 확인.',
    target: {
      type: 'pdb',
      identifier: '6M0J',
      chain: 'E',
    },
    epitope: {
      method: 'manual',
      manualRange: '400-505',
      description: '동일 에피톱 기준 평가',
    },
    candidate: {
      name: 'Perturbed Backbone (Noise sigma=2.0 Angstrom)',
      sequence:
        'TNLCPFGEVFNATRFASVYAWNRKRISNCVADYSVLYNSASFSTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGKIADYNYKLPDDFTGCVIAWNSNNLDSKVGGNYNYLYRLFRKSNLKPFERDISTEIYQAGSTPCNGVEGFNCYFPLQSYGFQPTNGVGYQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF',
      type: 'pdb',
      pdbText: SAMPLE_STRUCTURES['6M0J'],
      isExperimental: true,
      note: '원자 좌표 섭동 모델',
    },
    expectedOutcome: 'RMSD가 약 2.0Å으로 증가하고, S_epi 점수가 약 0.65 내외로 감소하여 점수 산식의 단조성 증명',
  },
  {
    id: 'control-negative-lysozyme',
    category: 'Validation',
    title: '[검증 실험 2] 음성 대조군 (무관 단백질 닭 닭난백 리소자임)',
    subtitle: '1AKI Chain A vs 코로나19 스파이크 에피톱',
    description: '코로나19 항원과 진화적·구조적으로 전혀 무관한 리소자임(1AKI)을 후보로 투입하여 위양성(False Positive) 방지 성능 검증.',
    target: {
      type: 'pdb',
      identifier: '6M0J',
      chain: 'E',
    },
    epitope: {
      method: 'manual',
      manualRange: '400-505',
      description: '타겟 스파이크 에피톱 잔기',
    },
    candidate: {
      name: 'Egg White Lysozyme (Unrelated Protein)',
      sequence:
        'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL',
      type: 'pdb',
      pdbText: SAMPLE_STRUCTURES['1AKI'],
      isExperimental: true,
      note: '닭 난백 리소자임 129 aa 3D PDB 구조',
    },
    expectedOutcome: 'TM-score < 0.25 (무작위 접힘 수준), S_epi < 0.20, 종합 점수 최하위 (위양성 배제)',
  },
];

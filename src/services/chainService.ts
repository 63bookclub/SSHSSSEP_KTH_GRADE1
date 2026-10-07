/**
 * Modular Service for resolving and validating target and candidate structure chain selections.
 */

export function resolveTargetChain(chains: string[], reqChain?: string): string {
  const requested = reqChain?.trim();
  if (requested) {
    if (!chains.includes(requested)) {
      throw new Error(
        `요청한 타겟 체인 '${requested}'이(가) 타겟 구조에 존재하지 않습니다. (가능한 체인: ${chains.join(', ')})`
      );
    }
    return requested;
  }
  if (chains.includes('E')) return 'E';
  if (chains.includes('A')) return 'A';
  return chains[0] || 'A';
}

export function resolveCandidateChain(
  chains: string[],
  reqChain?: string,
  candName?: string
): string {
  const requested = reqChain?.trim();
  const nameLabel = candName ? `'${candName}'` : '';
  if (requested) {
    if (!chains.includes(requested)) {
      throw new Error(
        `요청한 후보 체인 '${requested}'이(가) 후보 구조${nameLabel ? ' ' + nameLabel : ''}에 존재하지 않습니다. (가능한 체인: ${chains.join(', ')})`
      );
    }
    return requested;
  }
  if (chains.length > 1) {
    throw new Error(
      `후보 구조${nameLabel ? ' ' + nameLabel : ''}에 여러 체인(${chains.join(', ')})이 존재합니다. 사용하고자 하는 후보 체인을 명시해 주세요.`
    );
  }
  return chains[0] || 'A';
}

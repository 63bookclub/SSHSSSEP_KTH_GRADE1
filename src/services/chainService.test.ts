import { describe, expect, it } from 'bun:test';
import { resolveCandidateChain, resolveTargetChain } from './chainService.ts';

describe('Chain Service Validation (resolveTargetChain & resolveCandidateChain)', () => {
  it('should return requested target chain if present in structure', () => {
    const chain = resolveTargetChain(['A', 'B', 'C'], 'B');
    expect(chain).toBe('B');
  });

  it('should throw error if requested target chain is not present in structure', () => {
    expect(() => resolveTargetChain(['A', 'B'], 'Z')).toThrow('요청한 타겟 체인 \'Z\'이(가) 타겟 구조에 존재하지 않습니다');
  });

  it('should default to E or A or chains[0] if target chain is not requested', () => {
    expect(resolveTargetChain(['B', 'E', 'C'])).toBe('E');
    expect(resolveTargetChain(['B', 'A', 'C'])).toBe('A');
    expect(resolveTargetChain(['B', 'C'])).toBe('B');
  });

  it('should return requested candidate chain if present in structure', () => {
    const chain = resolveCandidateChain(['H', 'L'], 'L');
    expect(chain).toBe('L');
  });

  it('should throw error if requested candidate chain is not present in structure', () => {
    expect(() => resolveCandidateChain(['A', 'B'], 'X', 'Cand1')).toThrow(
      '요청한 후보 체인 \'X\'이(가) 후보 구조 \'Cand1\'에 존재하지 않습니다'
    );
  });

  it('should throw error if candidate chain is unselected and candidate structure has multiple chains', () => {
    expect(() => resolveCandidateChain(['A', 'B'])).toThrow(
      '후보 구조에 여러 체인(A, B)이 존재합니다. 사용하고자 하는 후보 체인을 명시해 주세요.'
    );
  });

  it('should return single chain if candidate structure has only one chain and no chain requested', () => {
    expect(resolveCandidateChain(['A'])).toBe('A');
  });
});

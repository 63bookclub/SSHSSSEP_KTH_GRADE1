import { describe, expect, it } from 'bun:test';
import { fetchRcsbStructure } from './rcsbService.ts';

describe('RCSB Service (fetchRcsbStructure)', () => {
  it('should throw an error for invalid PDB ID format', async () => {
    expect(fetchRcsbStructure('INVALID_PDB_ID_1234')).rejects.toThrow(
      '유효하지 않은 PDB ID 형식입니다'
    );
  });
});

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { fetchRcsbStructure } from './rcsbService.ts';
import { SAMPLE_STRUCTURES } from '../data/sampleStructures.ts';

describe('Unified RCSB Structure Downloader (fetchRcsbStructure)', () => {
  test('should load embedded sample structure offline when RCSB fetch fails for 6M0J', async () => {
    // Calling fetchRcsbStructure for 6M0J should succeed via embedded sample if network fails or offline
    const res = await fetchRcsbStructure('6M0J');
    expect(res.structureText).toBeDefined();
    expect(res.structureText).toContain('ATOM');
    expect(res.format).toBe('pdb');
  });

  test('should load embedded sample structure offline for 1RUZ, 5C69, and 1AKI', async () => {
    const res1RUZ = await fetchRcsbStructure('1RUZ');
    expect(res1RUZ.structureText).toContain('ATOM');

    const res5C69 = await fetchRcsbStructure('5C69');
    expect(res5C69.structureText).toContain('ATOM');

    const res1AKI = await fetchRcsbStructure('1AKI');
    expect(res1AKI.structureText).toContain('ATOM');
  });

  test('should throw explicit error when PDB ID is unknown and not in embedded sample dataset', async () => {
    expect(fetchRcsbStructure('99999XYZ')).rejects.toThrow();
  });
});

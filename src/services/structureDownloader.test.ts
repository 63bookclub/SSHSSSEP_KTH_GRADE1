import { describe, test, expect } from 'bun:test';
import { fetchRcsbStructure } from './structureDownloader.ts';

describe('Unified Structure Downloader Service', () => {
  test('returns embedded structure for offline preset IDs', async () => {
    const text = await fetchRcsbStructure('6M0J');
    expect(text).toBeTruthy();
    expect(text).toContain('ATOM');
    expect(text).toContain('THR E 333');
  });

  test('fetches PDB structure format first for valid online ID', async () => {
    const text = await fetchRcsbStructure('1AKI');
    expect(text).toBeTruthy();
    expect(text).toContain('ATOM');
  });
});

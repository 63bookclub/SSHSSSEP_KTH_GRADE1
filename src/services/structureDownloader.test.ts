import { describe, expect, it } from 'bun:test';
import { downloadRcsbStructure } from './structureDownloader.ts';
import { getRealStructurePdb, getEmbeddedStructure } from './presetStructures.ts';

describe('Structure Downloader & Preset Structures Service', () => {
  it('should load embedded real PDB structure for 6M0J', () => {
    const pdbText = getRealStructurePdb('6M0J');
    expect(pdbText.length).toBeGreaterThan(0);
    expect(pdbText).toContain('HEADER');
    expect(pdbText).toContain('6M0J');
  });

  it('should retrieve embedded structure via getEmbeddedStructure', () => {
    const embedded = getEmbeddedStructure('1AKI');
    expect(embedded).toBeDefined();
    expect(embedded?.format).toBe('pdb');
    expect(embedded?.text).toContain('LYSOZYME');
  });

  it('should fall back to local embedded structure in downloadRcsbStructure when offline or ID requested', async () => {
    const result = await downloadRcsbStructure('6M0J');
    expect(result.pdbId).toBe('6M0J');
    expect(result.format).toBe('pdb');
    expect(result.text.length).toBeGreaterThan(0);
  });
});

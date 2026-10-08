import { describe, test, expect } from 'bun:test';
import { escapeHtml } from './escapeHtml.ts';
describe('escapeHtml Utility', () => {
  test('escapes special HTML characters', () => {
    const raw = '<script>alert("xss & \'test\'")</script>';
    const escaped = escapeHtml(raw);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss &amp; &#39;test&#39;&quot;)&lt;/script&gt;');
  });

  test('handles null or undefined input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

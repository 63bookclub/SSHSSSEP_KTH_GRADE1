import { describe, test, expect } from 'bun:test';
import { escapeHtml, sanitizeHtml } from './htmlSanitizer.ts';
import { convertAiInsightToPrintHtml } from './aiTagParser.tsx';

describe('HTML Sanitizer & Escaping Utilities', () => {
  test('escapeHtml should convert dangerous characters to HTML entities', () => {
    const maliciousInput = '<script>alert("XSS")</script> & \'quote\'';
    const escaped = escapeHtml(maliciousInput);
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &#039;quote&#039;');
  });

  test('escapeHtml should handle null, undefined, or empty string safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  test('sanitizeHtml should strip script tags and event handlers', () => {
    const rawHtml = '<div>Hello <script>alert(1)</script><img src="x" onerror="alert(2)" /></div>';
    const sanitized = sanitizeHtml(rawHtml);
    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('onerror=');
    expect(sanitized).toContain('<div>Hello <img src="x" /></div>');
  });

  test('convertAiInsightToPrintHtml should escape AI output with embedded script tags', () => {
    const maliciousAiOutput = `[HEADER]<script>alert('header xss')</script>[/HEADER]
[SECTION: <img src=x onerror=alert('sec')>]
[METRIC: <script>xss</script>]
[EXPLAIN]<svg onload=alert(1)>[/EXPLAIN]
[/SECTION]`;

    const html = convertAiInsightToPrintHtml(maliciousAiOutput);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<svg onload');
    expect(html).toContain('&lt;script&gt;alert(&#039;header xss&#039;)&lt;/script&gt;');
  });
});

/**
 * HTML Sanitization and Escaping Utilities
 * Prevents XSS / HTML Injection in exported HTML and printed reports.
 */

/**
 * Escapes special HTML characters in a string to safe HTML entities.
 */
export function escapeHtml(str: string | number | null | undefined | unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strips dangerous tags (like <script>, <iframe>, <object>, <embed>, event handlers like onload/onerror)
 * from an HTML string while preserving basic formatting if needed.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  let sanitized = String(html);
  // Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '');
  // Remove iframe/object/embed tags
  sanitized = sanitized.replace(/<(iframe|object|embed)\b[^<]*>([\s\S]*?)<\/\1>/gi, '');
  // Remove event handlers like onload=, onerror=, onclick=
  sanitized = sanitized.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // Remove javascript: pseudo-protocol URIs
  sanitized = sanitized.replace(/javascript:[^\s"'>]+/gi, '');
  return sanitized;
}

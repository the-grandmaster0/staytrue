import DOMPurify from 'dompurify';

/**
 * Strips all HTML/XSS from a user-provided string.
 * Use before saving any user-generated text to Supabase.
 */
export function sanitize(value: string | null | undefined): string {
  if (!value) return '';
  // FORCE_BODY strips wrapping <body> tags; ALLOWED_TAGS: [] strips everything
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
}

/** Sanitize and truncate in one call */
export function sanitizeTrunc(value: string | null | undefined, maxLen: number): string {
  return sanitize(value).slice(0, maxLen);
}

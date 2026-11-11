/**
 * Escapes special regular expression characters in user-supplied strings.
 */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

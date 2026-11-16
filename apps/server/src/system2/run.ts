/**
 * Shared System 2 cancellation helper.
 */
export function abortError(message = 'System 2 request aborted'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

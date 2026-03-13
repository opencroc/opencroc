import type { ValidationError } from '../types.js';

export function validateConfig(_config: Record<string, unknown>): ValidationError[] {
  // TODO: Implement 3-layer validation (schema → semantic → dry-run)
  return [];
}

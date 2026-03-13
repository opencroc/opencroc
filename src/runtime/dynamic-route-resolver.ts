/**
 * Dynamic route parameter resolver.
 * Extracts path parameters by matching URL templates against actual hrefs.
 * Framework-level utility — no app-specific dependencies.
 */

export interface ResolvedRoute {
  /** Original path template (e.g. '/users/:id/detail') */
  originalPath: string;
  /** Resolved path with actual values (e.g. '/users/42/detail') */
  resolvedPath: string;
  /** Extracted parameter map (e.g. { id: '42' }) */
  params: Record<string, string>;
  /** How the parameters were resolved */
  resolveMethod: 'href-extraction' | 'seed-data' | 'text-extraction';
}

/**
 * Extract parameter names from a path template.
 * @example extractParamNames('/users/:id/posts/:postId') → ['id', 'postId']
 */
export function extractParamNames(pathTemplate: string): string[] {
  return (pathTemplate.match(/:([^/]+)/g) ?? []).map((m) => m.substring(1));
}

/**
 * Extract parameter values by matching a URL template against an actual href.
 * Returns null if the href doesn't match the template structure.
 *
 * @example
 * extractParamsFromHref('/users/:id/detail', '/users/42/detail')
 * // → { id: '42' }
 */
export function extractParamsFromHref(
  pathTemplate: string,
  href: string,
): Record<string, string> | null {
  const templateParts = pathTemplate.split('/');
  const hrefParts = href.split('/');

  if (templateParts.length > hrefParts.length) return null;

  const params: Record<string, string> = {};

  for (let i = 0; i < templateParts.length; i++) {
    if (templateParts[i].startsWith(':') && hrefParts[i]) {
      params[templateParts[i].substring(1)] = hrefParts[i];
    }
  }

  const names = extractParamNames(pathTemplate);
  return names.every((n) => params[n]) ? params : null;
}

/**
 * Build a concrete path from a template and parameter values.
 *
 * @example
 * buildPath('/users/:id/posts/:postId', { id: '42', postId: '7' })
 * // → '/users/42/posts/7'
 */
export function buildPath(pathTemplate: string, params: Record<string, string>): string {
  let result = pathTemplate;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, value);
  }
  return result;
}

/**
 * Try to extract an ID-like value from a text string.
 * Matches numeric IDs and UUIDs.
 */
export function extractIdFromText(text: string): string | null {
  const match = text.match(/\b(\d+|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i);
  return match?.[1] ?? null;
}

/**
 * Resolve dynamic route parameters from a seed data map.
 *
 * @param pathTemplate - URL template with :params
 * @param seedData - Map of route keys to param objects
 * @param routeKey - Optional explicit key; defaults to normalized path
 */
export function resolveFromSeedData(
  pathTemplate: string,
  seedData: Record<string, Record<string, string>>,
  routeKey?: string,
): ResolvedRoute | null {
  const key = routeKey ?? pathTemplate.replace(/\//g, '_').replace(/:/g, '');
  const params = seedData[key];
  if (!params) return null;

  return {
    originalPath: pathTemplate,
    resolvedPath: buildPath(pathTemplate, params),
    params,
    resolveMethod: 'seed-data',
  };
}

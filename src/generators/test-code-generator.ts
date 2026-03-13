import type { GeneratedTestFile, TestChain, TestStep } from '../types.js';

export interface TestCodeGenerator {
  generate(chains: TestChain[]): GeneratedTestFile[];
}

/**
 * Resolve a path parameter from the available createdIds.
 */
function resolvePathParam(param: string, ids: string[]): string {
  // Try direct match (e.g., 'kbId' → look for 'kbId' in ids)
  if (ids.includes(param)) return `createdIds['${param}']`;
  // Try with 'Id' suffix stripped
  const stripped = param.endsWith('Id') ? param.slice(0, -2) : param;
  if (ids.includes(stripped)) return `createdIds['${stripped}']`;
  // Generic id
  if (param === 'id') return `createdIds['id']`;
  return `createdIds['${param}'] || '1'`;
}

/**
 * Generate URL building code for a test step.
 */
function buildUrlCode(step: TestStep): string {
  const pathParams = step.endpoint.pathParams;
  if (pathParams.length === 0) return `const url = '${step.endpoint.path}';`;

  let urlTemplate = step.endpoint.path;
  const replacements: string[] = [];
  for (const param of pathParams) {
    urlTemplate = urlTemplate.replace(`:${param}`, `\${${resolvePathParam(param, pathParams)}}`);
    replacements.push(param);
  }
  return `const url = \`${urlTemplate}\`;`;
}

/**
 * Generate assertion code for a test step.
 */
function generateAssertions(step: TestStep): string[] {
  const lines: string[] = [];
  if (step.assertions.length > 0) {
    for (const assertion of step.assertions) {
      lines.push(`    expect(${assertion}).toBeTruthy();`);
    }
  } else {
    // Default assertions
    if (step.endpoint.method === 'POST') {
      lines.push('    expect(response.status()).toBeLessThan(400);');
      lines.push('    const body = await response.json();');
      lines.push("    if (body.data?.id) createdIds['id'] = body.data.id;");
    } else if (step.endpoint.method === 'GET') {
      lines.push('    expect(response.ok()).toBeTruthy();');
    } else if (step.endpoint.method === 'DELETE') {
      lines.push('    expect(response.status()).toBeLessThan(400);');
    } else {
      lines.push('    expect(response.status()).toBeLessThan(400);');
    }
  }
  return lines;
}

/**
 * Generate a single Playwright test file from a test chain.
 */
function generateTestFile(chain: TestChain): string {
  const lines: string[] = [];

  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push('');
  lines.push(`test.describe('${chain.name}', () => {`);
  lines.push("  const createdIds: Record<string, string> = {};");
  lines.push('');

  for (const step of chain.steps) {
    lines.push(`  test('Step ${step.order}: ${step.description}', async ({ request }) => {`);
    lines.push(`    // ${step.action}: ${step.endpoint.method} ${step.endpoint.path}`);
    lines.push(`    ${buildUrlCode(step)}`);
    lines.push('');

    if (step.endpoint.method === 'GET') {
      lines.push('    const response = await request.get(url);');
    } else if (step.endpoint.method === 'POST') {
      lines.push('    const response = await request.post(url, { data: {} });');
    } else if (step.endpoint.method === 'PUT') {
      lines.push('    const response = await request.put(url, { data: {} });');
    } else if (step.endpoint.method === 'DELETE') {
      lines.push('    const response = await request.delete(url);');
    } else if (step.endpoint.method === 'PATCH') {
      lines.push('    const response = await request.patch(url, { data: {} });');
    }

    lines.push('');
    lines.push(...generateAssertions(step));
    lines.push('  });');
    lines.push('');
  }

  lines.push('});');
  return lines.join('\n');
}

export function createTestCodeGenerator(): TestCodeGenerator {
  return {
    generate(chains: TestChain[]): GeneratedTestFile[] {
      return chains.map((chain) => ({
        filePath: `${chain.module}/${chain.name.replace(/\s+/g, '-').toLowerCase()}.spec.ts`,
        content: generateTestFile(chain),
        module: chain.module,
        chain: chain.name,
      }));
    },
  };
}

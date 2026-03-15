/**
 * Chain Planner
 *
 * Rule-based test chain planning:
 * - Groups endpoints by resource path
 * - Applies chain templates (CRUD, nested, batch, status, error handling)
 * - Uses greedy algorithm for optimal coverage selection
 * - Detects shared setup steps
 */

import type {
  ApiEndpoint,
  ApiChainAnalysisResult,
  TestStep,
  TestChain,
  ChainPlanResult,
  LlmProvider,
} from '../types.js';
import { topologicalSort } from '../analyzers/api-chain-analyzer.js';

// ============================================================
// Constants
// ============================================================

const MIN_CHAINS = 3;
const MAX_CHAINS = 10;
const COVERAGE_TARGET = 0.8;
const SMALL_MODULE_THRESHOLD = 3;

// ============================================================
// Helpers
// ============================================================

function endpointKey(ep: ApiEndpoint): string {
  return `${ep.method} ${ep.path}`;
}

function basePath(ep: ApiEndpoint): string {
  return ep.path.replace(/\/:[^/]+/g, '');
}

function groupByResource(endpoints: ApiEndpoint[]): Map<string, ApiEndpoint[]> {
  const groups = new Map<string, ApiEndpoint[]>();
  for (const ep of endpoints) {
    const base = basePath(ep);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(ep);
  }
  return groups;
}

function isListEndpoint(ep: ApiEndpoint): boolean {
  if (ep.method !== 'GET') return false;
  const params = (ep.pathParams ?? []).filter((p) => p !== 'tenantId');
  return params.length === 0;
}

function isDetailEndpoint(ep: ApiEndpoint): boolean {
  if (ep.method !== 'GET') return false;
  const params = (ep.pathParams ?? []).filter((p) => p !== 'tenantId');
  return params.length > 0;
}

function inferAction(ep: ApiEndpoint): string {
  switch (ep.method) {
    case 'POST': return 'create';
    case 'GET': return 'read';
    case 'PUT':
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return 'read';
  }
}

function buildDescription(ep: ApiEndpoint, action: string, parentKey?: string): string {
  const parts = [`${action} ${ep.method} ${ep.path}`];
  if (parentKey) parts.push(`(depends on ${parentKey})`);
  for (const param of ep.pathParams ?? []) {
    if (param === 'tenantId') parts.push(`${param}: config.tenantId`);
  }
  return parts.join(' ');
}

function buildAssertions(ep: ApiEndpoint, action: string): string[] {
  switch (action) {
    case 'create': return ['响应状态码 200/201', '响应 data.id 非空'];
    case 'read':
      return isListEndpoint(ep)
        ? ['响应状态码 200', '响应 data 为数组']
        : ['响应状态码 200', '响应 data.id 与请求参数一致'];
    case 'update': return ['响应状态码 200', '更新字段值已变更'];
    case 'delete': return ['响应状态码 200/204', '再次 GET 返回 404 或空'];
    case 'verify': return ['验证数据一致性'];
    default: return ['响应状态码 200'];
  }
}

function createStep(order: number, ep: ApiEndpoint, action: string, parentKey?: string): TestStep {
  return {
    order,
    endpoint: ep,
    action,
    description: buildDescription(ep, action, parentKey),
    assertions: buildAssertions(ep, action),
  };
}

// ============================================================
// Internal chain type (extends public TestChain with planning fields)
// ============================================================

interface InternalChain {
  name: string;
  module: string;
  priority: 'P0' | 'P1' | 'P2';
  steps: TestStep[];
  coverageApis: string[];
}

function toPublicChain(c: InternalChain): TestChain {
  return { name: c.name, module: c.module, steps: c.steps };
}

// ============================================================
// Chain templates
// ============================================================

interface ChainTemplate {
  pattern: string;
  priority: 'P0' | 'P1' | 'P2';
  generate(name: string, endpoints: ApiEndpoint[], groups: Map<string, ApiEndpoint[]>, topo: string[]): InternalChain | null;
}

function crudFullCycleTemplate(): ChainTemplate {
  return {
    pattern: 'crud-full-cycle',
    priority: 'P0',
    generate(name, _endpoints, groups) {
      let best: ApiEndpoint[] = [];
      for (const group of groups.values()) {
        if (group.length > best.length) best = group;
      }
      if (best.length === 0) return null;

      const post = best.find((e) => e.method === 'POST');
      const getD = best.find(isDetailEndpoint);
      const put = best.find((e) => e.method === 'PUT' || e.method === 'PATCH');
      const del = best.find((e) => e.method === 'DELETE');
      if (!post) return null;

      const steps: TestStep[] = [];
      let o = 1;
      const pk = 'step_1';
      steps.push(createStep(o++, post, 'create'));
      if (getD) steps.push(createStep(o++, getD, 'read', pk));
      if (put) steps.push(createStep(o++, put, 'update', pk));
      if (getD) steps.push(createStep(o++, getD, 'verify', pk));
      if (del) steps.push(createStep(o++, del, 'delete', pk));

      return {
        name: `${name}-crud-full-cycle`,
        module: name,
        priority: 'P0',
        steps,
        coverageApis: [...new Set(steps.map((s) => endpointKey(s.endpoint)))],
      };
    },
  };
}

function listFilterTemplate(): ChainTemplate {
  return {
    pattern: 'list-filter',
    priority: 'P1',
    generate(name, endpoints) {
      const lists = endpoints.filter(isListEndpoint);
      if (lists.length === 0) return null;
      const steps = lists.slice(0, 2).map((ep, i) => createStep(i + 1, ep, 'read'));
      return {
        name: `${name}-list-filter`,
        module: name,
        priority: 'P1',
        steps,
        coverageApis: [...new Set(steps.map((s) => endpointKey(s.endpoint)))],
      };
    },
  };
}

function nestedResourceTemplate(): ChainTemplate {
  return {
    pattern: 'nested-resource',
    priority: 'P0',
    generate(name, _endpoints, groups) {
      const entries = Array.from(groups.entries());
      if (entries.length < 2) return null;
      entries.sort((a, b) => a[0].split('/').length - b[0].split('/').length);

      const parentPost = entries[0][1].find((e) => e.method === 'POST');
      const childPost = entries[1][1].find((e) => e.method === 'POST');
      const childGet = entries[1][1].find((e) => isDetailEndpoint(e) || isListEndpoint(e));
      const childDel = entries[1][1].find((e) => e.method === 'DELETE');
      const parentDel = entries[0][1].find((e) => e.method === 'DELETE');
      if (!parentPost || !childPost) return null;

      const steps: TestStep[] = [];
      let o = 1;
      steps.push(createStep(o++, parentPost, 'setup'));
      steps.push(createStep(o++, childPost, 'create', 'step_1'));
      if (childGet) steps.push(createStep(o++, childGet, 'read', 'step_2'));
      if (childDel) steps.push(createStep(o++, childDel, 'cleanup', 'step_2'));
      if (parentDel) steps.push(createStep(o++, parentDel, 'cleanup', 'step_1'));

      return {
        name: `${name}-nested-resource`,
        module: name,
        priority: 'P0',
        steps,
        coverageApis: [...new Set(steps.map((s) => endpointKey(s.endpoint)))],
      };
    },
  };
}

function batchOperationTemplate(): ChainTemplate {
  return {
    pattern: 'batch-operation',
    priority: 'P1',
    generate(name, endpoints) {
      const batch = endpoints.filter((ep) =>
        ep.path.toLowerCase().includes('batch') || ep.path.toLowerCase().includes('bulk'),
      );
      if (batch.length === 0) return null;
      const steps = batch.slice(0, 3).map((ep, i) => createStep(i + 1, ep, inferAction(ep)));
      return {
        name: `${name}-batch-operation`,
        module: name,
        priority: 'P1',
        steps,
        coverageApis: [...new Set(steps.map((s) => endpointKey(s.endpoint)))],
      };
    },
  };
}

function errorHandlingTemplate(): ChainTemplate {
  return {
    pattern: 'error-handling',
    priority: 'P2',
    generate(name, endpoints) {
      const post = endpoints.find((ep) => ep.method === 'POST');
      if (!post) return null;
      return {
        name: `${name}-error-handling`,
        module: name,
        priority: 'P2',
        steps: [{
          order: 1,
          endpoint: post,
          action: 'verify',
          description: `verify ${post.method} ${post.path} with invalid data`,
          assertions: ['响应状态码 400', '响应包含错误信息'],
        }],
        coverageApis: [endpointKey(post)],
      };
    },
  };
}

function topoOrderTemplate(): ChainTemplate {
  return {
    pattern: 'topo-order-walk',
    priority: 'P1',
    generate(name, endpoints, _groups, topo) {
      if (topo.length === 0) return null;
      const epMap = new Map(endpoints.map((ep) => [endpointKey(ep), ep]));
      const steps: TestStep[] = [];
      let o = 1;
      for (const key of topo.slice(0, 6)) {
        const ep = epMap.get(key);
        if (ep) steps.push(createStep(o++, ep, inferAction(ep)));
      }
      if (steps.length === 0) return null;
      return {
        name: `${name}-topo-order-walk`,
        module: name,
        priority: 'P1',
        steps,
        coverageApis: [...new Set(steps.map((s) => endpointKey(s.endpoint)))],
      };
    },
  };
}

// ============================================================
// Greedy coverage selection
// ============================================================

function greedySelectChains(
  candidates: InternalChain[],
  allKeys: Set<string>,
  targetCount: number,
  coverageTarget: number,
): InternalChain[] {
  const selected: InternalChain[] = [];
  const covered = new Set<string>();
  const remaining = [...candidates];

  const pOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  remaining.sort((a, b) => pOrder[a.priority] - pOrder[b.priority] || b.coverageApis.length - a.coverageApis.length);

  while (selected.length < targetCount && remaining.length > 0) {
    let bestIdx = -1, bestScore = -1;
    for (let i = 0; i < remaining.length; i++) {
      const newApis = remaining[i].coverageApis.filter((a) => !covered.has(a));
      const score = remaining[i].priority === 'P0' ? newApis.length * 1.5 : newApis.length;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx === -1 || bestScore <= 0) break;

    const chosen = remaining.splice(bestIdx, 1)[0];
    selected.push(chosen);
    chosen.coverageApis.forEach((a) => covered.add(a));

    if (allKeys.size > 0 && covered.size / allKeys.size >= coverageTarget && selected.length >= MIN_CHAINS) break;
  }
  return selected;
}

// ============================================================
// Shared setup detection
// ============================================================

function detectSharedSetups(chains: InternalChain[], moduleName: string): InternalChain[] {
  const firstSteps = new Map<string, { ep: ApiEndpoint; count: number }>();
  for (const chain of chains) {
    if (chain.steps.length === 0) continue;
    const first = chain.steps[0];
    if (first.action === 'create' || first.action === 'setup') {
      const key = endpointKey(first.endpoint);
      const e = firstSteps.get(key);
      if (e) e.count++;
      else firstSteps.set(key, { ep: first.endpoint, count: 1 });
    }
  }

  const setups: InternalChain[] = [];
  for (const [key, { ep, count }] of firstSteps) {
    if (count >= 2) {
      const setupName = `${moduleName}-shared-setup-${setups.length + 1}`;
      setups.push({
        name: setupName,
        module: moduleName,
        priority: 'P0',
        steps: [createStep(1, ep, 'setup')],
        coverageApis: [key],
      });
    }
  }
  return setups;
}

// ============================================================
// Public API
// ============================================================

export interface ChainPlanner {
  planForModule(moduleName: string, analysis: ApiChainAnalysisResult): ChainPlanResult;
}

export function createChainPlanner(): ChainPlanner {
  return {
    planForModule(moduleName, analysis) {
      const { endpoints, dag } = analysis;

      // Small module shortcut
      if (endpoints.length < SMALL_MODULE_THRESHOLD) {
        if (endpoints.length === 0) {
          return { chains: [], totalSteps: 0 };
        }
        const steps = endpoints.map((ep, i) => createStep(i + 1, ep, inferAction(ep)));
        return {
          chains: [{ name: `${moduleName}-basic-flow`, module: moduleName, steps }],
          totalSteps: steps.length,
        };
      }

      // Full planning
      const topoOrder = topologicalSort(dag);
      const groups = groupByResource(endpoints);

      // Generate candidates from templates
      const templates: ChainTemplate[] = [
        crudFullCycleTemplate(),
        listFilterTemplate(),
        nestedResourceTemplate(),
        batchOperationTemplate(),
        errorHandlingTemplate(),
        topoOrderTemplate(),
      ];

      const candidates: InternalChain[] = [];
      for (const t of templates) {
        const chain = t.generate(moduleName, endpoints, groups, topoOrder);
        if (chain && chain.steps.length > 0) candidates.push(chain);
      }

      // Supplement uncovered endpoints
      const coveredSet = new Set<string>();
      for (const c of candidates) c.coverageApis.forEach((a) => coveredSet.add(a));
      const uncovered = endpoints.filter((ep) => !coveredSet.has(endpointKey(ep)));
      if (uncovered.length > 0) {
        const steps = uncovered.slice(0, 5).map((ep, i) => createStep(i + 1, ep, inferAction(ep)));
        candidates.push({
          name: `${moduleName}-supplement`,
          module: moduleName,
          priority: 'P2',
          steps,
          coverageApis: [...new Set(steps.map((s) => endpointKey(s.endpoint)))],
        });
      }

      // Greedy selection
      const allKeys = new Set(endpoints.map(endpointKey));
      const targetCount = Math.min(MAX_CHAINS, Math.max(MIN_CHAINS, candidates.length));
      const selected = greedySelectChains(candidates, allKeys, targetCount, COVERAGE_TARGET);

      // Shared setups
      detectSharedSetups(selected, moduleName);

      const totalSteps = selected.reduce((sum, c) => sum + c.steps.length, 0);
      return { chains: selected.map(toPublicChain), totalSteps };
    },
  };
}

// ============================================================
// LLM-Enhanced Chain Planner
// ============================================================

export interface LlmChainPlanner extends ChainPlanner {
  planForModuleWithLLM(
    moduleName: string,
    analysis: ApiChainAnalysisResult,
    llmProvider: LlmProvider,
  ): Promise<ChainPlanResult>;
}

/**
 * Create a chain planner with optional LLM constraint reasoning.
 *
 * The LLM is used to:
 * 1. Infer business constraints that rule-based templates cannot detect
 * 2. Prioritize chains based on domain understanding
 * 3. Suggest additional edge-case chains
 */
export function createLlmChainPlanner(): LlmChainPlanner {
  const basePlanner = createChainPlanner();

  return {
    planForModule: basePlanner.planForModule,

    async planForModuleWithLLM(moduleName, analysis, llmProvider) {
      // Step 1: Get rule-based plan
      const basePlan = basePlanner.planForModule(moduleName, analysis);

      // Step 2: Ask LLM to evaluate and enhance
      const endpointSummary = analysis.endpoints
        .map((e) => `${e.method} ${e.path}`)
        .join('\n');

      const chainSummary = basePlan.chains
        .map((c) => `- ${c.name}: ${c.steps.length} steps`)
        .join('\n');

      const system = `You are a test planning expert. Given a module's API endpoints and existing test chains,
suggest improvements. Output a JSON object with:
{
  "priorityAdjustments": [{ "chainName": "...", "newPriority": "P0|P1|P2", "reason": "..." }],
  "additionalChains": [{ "name": "...", "description": "...", "priority": "P0|P1|P2", "endpointKeys": ["GET /path", ...] }],
  "insights": "brief text about business constraints or edge cases"
}
Only return JSON. No explanation.`;

      const user = `Module: ${moduleName}

API Endpoints:
${endpointSummary}

Existing Chains:
${chainSummary}

Coverage: ${basePlan.totalSteps} total steps
Cycles detected: ${analysis.hasCycles}

Suggest improvements (JSON):`;

      try {
        const raw = await llmProvider.chat([
          { role: 'system', content: system },
          { role: 'user', content: user },
        ]);

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return basePlan;

        const suggestions = JSON.parse(jsonMatch[0]);

        // Apply priority adjustments (stored as metadata, not on public type)
        // Skip - remote TestChain doesn't have priority field

        // Add suggested chains (if they cover uncovered endpoints)
        if (Array.isArray(suggestions.additionalChains)) {
          const covered = new Set<string>();
          for (const c of basePlan.chains) {
            for (const s of c.steps) covered.add(endpointKey(s.endpoint));
          }

          for (const suggestion of suggestions.additionalChains) {
            if (!suggestion.endpointKeys || !Array.isArray(suggestion.endpointKeys)) continue;

            const newApis = suggestion.endpointKeys.filter((k: string) => !covered.has(k));
            if (newApis.length === 0) continue;

            const steps: TestStep[] = [];
            for (const key of newApis) {
              const ep = analysis.endpoints.find((e) => `${e.method} ${e.path}` === key);
              if (ep) {
                steps.push(createStep(steps.length + 1, ep, inferAction(ep)));
                covered.add(key);
              }
            }

            if (steps.length > 0) {
              basePlan.chains.push({
                name: suggestion.name || `${moduleName}-llm-suggested`,
                module: moduleName,
                steps,
              });
              basePlan.totalSteps += steps.length;
            }
          }
        }

        return basePlan;
      } catch {
        // LLM failed, fall back to rule-based plan
        return basePlan;
      }
    },
  };
}

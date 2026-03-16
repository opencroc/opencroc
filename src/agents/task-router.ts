/**
 * OpenCroc Task Router
 *
 * Analyzes a scanned project and decides which croc roles to summon.
 * Returns a prioritized list of roles matching the project's characteristics.
 */

import type { ScanResult } from '../graph/types.js';
import type { RoleDefinition, MatchContext, RoleTrigger } from './role-registry.js';
import { getRoleRegistry } from './role-registry.js';

export interface SummonPlan {
  /** Roles to summon, sorted by priority (lower = first) */
  roles: SummonedRole[];
  /** Summary of why each role was picked */
  reasoning: string[];
  /** Project context used for matching */
  context: MatchContext;
}

export interface SummonedRole {
  role: RoleDefinition;
  /** Why this role was summoned */
  reason: string;
  /** Match confidence 0-1 */
  confidence: number;
}

/**
 * Build a MatchContext from a ScanResult.
 */
export function buildMatchContext(scan: ScanResult): MatchContext {
  const languages = scan.languages;
  const frameworks = scan.frameworks.map(f => f.name);
  // Infer project type from frameworks/languages
  const frontendFrameworks = ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt'];
  const backendFrameworks = ['Express', 'Fastify', 'NestJS', 'Django', 'Flask', 'Spring Boot', 'Gin', 'Actix'];
  const hasFE = frameworks.some(f => frontendFrameworks.includes(f));
  const hasBE = frameworks.some(f => backendFrameworks.includes(f));
  const projectType = hasFE && hasBE ? 'fullstack' : hasFE ? 'frontend' : hasBE ? 'backend' : 'unknown';

  const entityTypes = new Set(scan.entities.map(e => e.type));
  const hasModels = entityTypes.has('model') || entityTypes.has('class');
  const hasAPIs = entityTypes.has('api') || entityTypes.has('route');

  const hasFrontend = hasFE ||
    (languages['html'] ?? 0) > 10 || (languages['css'] ?? 0) > 5;

  // Detect Docker/CI from file paths
  const allPaths = scan.files.map(f => f.path);
  const hasDocker = allPaths.some(p =>
    p.includes('Dockerfile') || p.includes('docker-compose')
  );
  const hasCI = allPaths.some(p =>
    p.includes('.github/workflows') ||
    p.includes('.gitlab-ci') ||
    p.includes('Jenkinsfile')
  );

  const riskCategories: string[] = [];

  return {
    languages,
    frameworks,
    projectType,
    fileCount: scan.files.length,
    entityCount: scan.entities.length,
    riskCategories,
    hasModels,
    hasAPIs,
    hasFrontend,
    hasDocker,
    hasCI,
  };
}

/**
 * Check if a role's triggers match the given context.
 */
function matchesTriggers(trigger: RoleTrigger, ctx: MatchContext): { matches: boolean; reason: string; confidence: number } {
  const reasons: string[] = [];
  let score = 0;
  let checks = 0;

  // Language match
  if (trigger.languages && trigger.languages.length > 0) {
    checks++;
    const matched = trigger.languages.filter(l => (ctx.languages[l] ?? 0) > 0);
    if (matched.length > 0) {
      score++;
      reasons.push(`语言匹配: ${matched.join(', ')}`);
    }
  }

  // Framework match
  if (trigger.frameworks && trigger.frameworks.length > 0) {
    checks++;
    const matched = trigger.frameworks.filter(f =>
      ctx.frameworks.some(cf => cf.toLowerCase() === f.toLowerCase())
    );
    if (matched.length > 0) {
      score++;
      reasons.push(`框架匹配: ${matched.join(', ')}`);
    }
  }

  // Project type match
  if (trigger.projectTypes && trigger.projectTypes.length > 0) {
    checks++;
    if (trigger.projectTypes.includes(ctx.projectType)) {
      score++;
      reasons.push(`项目类型匹配: ${ctx.projectType}`);
    }
  }

  // Entity threshold
  if (trigger.minEntities !== undefined) {
    checks++;
    if (ctx.entityCount >= trigger.minEntities) {
      score++;
      reasons.push(`实体数量满足: ${ctx.entityCount} ≥ ${trigger.minEntities}`);
    }
  }

  // Risk categories
  if (trigger.riskCategories && trigger.riskCategories.length > 0) {
    checks++;
    const matched = trigger.riskCategories.filter(r => ctx.riskCategories.includes(r));
    if (matched.length > 0) {
      score++;
      reasons.push(`风险类别匹配: ${matched.join(', ')}`);
    }
  }

  // Custom predicate
  if (trigger.custom) {
    checks++;
    try {
      if (trigger.custom(ctx)) {
        score++;
        reasons.push('自定义条件满足');
      }
    } catch {
      // Custom predicate threw — treat as no match
    }
  }

  // A role matches if ALL specified trigger conditions pass
  // (OR logic: at least one condition must match if multiple are specified)
  const matches = checks === 0 ? false : score > 0;
  const confidence = checks > 0 ? score / checks : 0;

  return {
    matches,
    reason: reasons.join('; ') || '无匹配',
    confidence,
  };
}

/**
 * Given a scan result, determine which roles should be summoned.
 *
 * @param scan - The scan result from the project scanner
 * @param maxRoles - Maximum number of non-core roles to summon (default: 8)
 * @param riskCategories - Risk categories detected (from insight engine)
 * @returns A SummonPlan with prioritized roles
 */
export function planSummon(
  scan: ScanResult,
  maxRoles: number = 8,
  riskCategories: string[] = [],
): SummonPlan {
  const registry = getRoleRegistry();
  const ctx = buildMatchContext(scan);
  ctx.riskCategories = riskCategories;

  const summoned: SummonedRole[] = [];
  const reasoning: string[] = [];

  const allRoles = registry.list();

  // Always include core roles
  const coreRoles = allRoles.filter(r => r.category === 'core');
  for (const role of coreRoles) {
    summoned.push({ role, reason: '核心角色(始终召唤)', confidence: 1.0 });
    reasoning.push(`✅ ${role.name} — 核心角色`);
  }

  // Match non-core roles
  const nonCore = allRoles.filter(r => r.category !== 'core');
  const candidates: SummonedRole[] = [];

  for (const role of nonCore) {
    const result = matchesTriggers(role.triggers, ctx);
    if (result.matches) {
      candidates.push({
        role,
        reason: result.reason,
        confidence: result.confidence,
      });
    }
  }

  // Sort by priority (lower first), then confidence (higher first)
  candidates.sort((a, b) => {
    if (a.role.priority !== b.role.priority) return a.role.priority - b.role.priority;
    return b.confidence - a.confidence;
  });

  // Take top N
  const selected = candidates.slice(0, maxRoles);
  for (const s of selected) {
    summoned.push(s);
    reasoning.push(`🐊 ${s.role.name} — ${s.reason} (置信度: ${(s.confidence * 100).toFixed(0)}%)`);
  }

  // Log skipped roles
  const skipped = candidates.slice(maxRoles);
  for (const s of skipped) {
    reasoning.push(`⏭️ ${s.role.name} — 匹配但超出限制 (置信度: ${(s.confidence * 100).toFixed(0)}%)`);
  }

  return { roles: summoned, reasoning, context: ctx };
}

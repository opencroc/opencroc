/**
 * OpenCroc Agents Module — Public API
 */
export { RoleRegistry, getRoleRegistry } from './role-registry.js';
export type { RoleDefinition, RoleCategory, RoleTrigger, MatchContext } from './role-registry.js';
export { planSummon, buildMatchContext } from './task-router.js';
export type { SummonPlan, SummonedRole } from './task-router.js';

/**
 * OpenCroc Dynamic Role Registry
 *
 * Manages an extensible pool of croc expert roles that can be
 * dynamically summoned based on project characteristics.
 *
 * Architecture:
 *   RoleDefinition → what a croc CAN do (template)
 *   CrocAgent      → a live instance doing work (runtime)
 *   TaskRouter      → decides WHICH roles to summon for a project
 */

// ─── Role Definition ─────────────────────────────────────────────────────────

export type RoleCategory =
  | 'core'        // 官方核心角色 (always available)
  | 'language'    // 语言专家鳄
  | 'framework'   // 框架专家鳄
  | 'domain'      // 领域专家鳄 (security, performance, etc.)
  | 'community';  // 社区贡献角色

export interface RoleTrigger {
  /** Match against detected languages (e.g. "python", "typescript") */
  languages?: string[];
  /** Match against detected frameworks (e.g. "Express", "Django", "React") */
  frameworks?: string[];
  /** Match against project type */
  projectTypes?: string[];
  /** Match against file patterns (glob-style) */
  filePatterns?: string[];
  /** Match against entity count thresholds */
  minEntities?: number;
  /** Match against risk categories found */
  riskCategories?: string[];
  /** Custom predicate for advanced matching */
  custom?: (ctx: MatchContext) => boolean;
}

export interface MatchContext {
  languages: Record<string, number>;
  frameworks: string[];
  projectType: string;
  fileCount: number;
  entityCount: number;
  riskCategories: string[];
  hasModels: boolean;
  hasAPIs: boolean;
  hasFrontend: boolean;
  hasDocker: boolean;
  hasCI: boolean;
}

export interface RoleDefinition {
  /** Unique identifier, e.g. "security-auditor" */
  id: string;
  /** Display name in Chinese, e.g. "安全审计鳄" */
  name: string;
  /** English name for international display */
  nameEn: string;
  /** Role category */
  category: RoleCategory;
  /** Short description of expertise */
  description: string;
  /** Icon/sprite identifier for 3D rendering */
  sprite: string;
  /** Color theme (hex) for the croc's glow */
  color: string;
  /** Priority: lower = summoned first when multiple match (0-100) */
  priority: number;
  /** When should this role be summoned? */
  triggers: RoleTrigger;
  /** System prompt template for LLM analysis */
  systemPrompt: string;
  /** What this role outputs */
  outputType: 'report' | 'analysis' | 'fix' | 'review' | 'diagram';
  /** Tags for search/filtering */
  tags: string[];
  /** Author info (for community roles) */
  author?: string;
  /** Version string */
  version?: string;
}

// ─── Built-in Core Roles ─────────────────────────────────────────────────────

const CORE_ROLES: RoleDefinition[] = [
  {
    id: 'parser-croc',
    name: '解析鳄',
    nameEn: 'Parser Croc',
    category: 'core',
    description: '解析项目结构、提取实体和关系',
    sprite: 'parser',
    color: '#34d399',
    priority: 0,
    triggers: { custom: () => true }, // Always summoned
    systemPrompt: 'You are an expert code parser. Analyze the project structure, extract all entities (classes, functions, APIs, models) and their relationships.',
    outputType: 'analysis',
    tags: ['core', 'parser', 'structure'],
  },
  {
    id: 'analyzer-croc',
    name: '分析鳄',
    nameEn: 'Analyzer Croc',
    category: 'core',
    description: '构建知识图谱、分析依赖关系',
    sprite: 'analyzer',
    color: '#60a5fa',
    priority: 1,
    triggers: { custom: () => true },
    systemPrompt: 'You are an expert software architect. Build a knowledge graph of the project, analyze dependencies, coupling, and cohesion.',
    outputType: 'diagram',
    tags: ['core', 'graph', 'architecture'],
  },
  {
    id: 'tester-croc',
    name: '测试鳄',
    nameEn: 'Tester Croc',
    category: 'core',
    description: '生成和执行 E2E 测试',
    sprite: 'tester',
    color: '#a78bfa',
    priority: 2,
    triggers: { custom: () => true },
    systemPrompt: 'You are an expert test engineer. Generate comprehensive E2E test cases covering all critical paths, edge cases, and error scenarios.',
    outputType: 'analysis',
    tags: ['core', 'testing', 'e2e'],
  },
  {
    id: 'healer-croc',
    name: '修复鳄',
    nameEn: 'Healer Croc',
    category: 'core',
    description: '自动修复测试失败和代码问题',
    sprite: 'healer',
    color: '#f87171',
    priority: 3,
    triggers: { custom: () => true },
    systemPrompt: 'You are an expert debugger and code fixer. Analyze test failures, diagnose root causes, and propose minimal targeted fixes.',
    outputType: 'fix',
    tags: ['core', 'healing', 'debug'],
  },
  {
    id: 'planner-croc',
    name: '规划鳄',
    nameEn: 'Planner Croc',
    category: 'core',
    description: '制定测试策略和执行计划',
    sprite: 'planner',
    color: '#fbbf24',
    priority: 4,
    triggers: { custom: () => true },
    systemPrompt: 'You are an expert project planner. Create test strategies, prioritize test execution order, and optimize the testing pipeline.',
    outputType: 'analysis',
    tags: ['core', 'planning', 'strategy'],
  },
  {
    id: 'reporter-croc',
    name: '汇报鳄',
    nameEn: 'Reporter Croc',
    category: 'core',
    description: '生成多视角分析报告',
    sprite: 'reporter',
    color: '#22d3ee',
    priority: 5,
    triggers: { custom: () => true },
    systemPrompt: 'You are an expert technical writer. Generate clear, actionable reports from multiple perspectives (developer, architect, tester, product, executive).',
    outputType: 'report',
    tags: ['core', 'reporting', 'documentation'],
  },
];

// ─── Language Expert Roles ───────────────────────────────────────────────────

const LANGUAGE_ROLES: RoleDefinition[] = [
  {
    id: 'python-croc',
    name: 'Python专家鳄',
    nameEn: 'Python Expert Croc',
    category: 'language',
    description: 'Python 生态专家：Django/Flask/FastAPI/SQLAlchemy',
    sprite: 'language',
    color: '#3776ab',
    priority: 10,
    triggers: { languages: ['python'] },
    systemPrompt: 'You are a Python ecosystem expert. Analyze Python code for best practices, type safety, async patterns, Django/Flask/FastAPI conventions, SQLAlchemy usage, and Python-specific security issues.',
    outputType: 'review',
    tags: ['language', 'python', 'django', 'flask', 'fastapi'],
  },
  {
    id: 'go-croc',
    name: 'Go专家鳄',
    nameEn: 'Go Expert Croc',
    category: 'language',
    description: 'Go 生态专家：goroutine/channel/接口设计',
    sprite: 'language',
    color: '#00add8',
    priority: 10,
    triggers: { languages: ['go'] },
    systemPrompt: 'You are a Go ecosystem expert. Analyze Go code for goroutine safety, channel patterns, interface design, error handling, and Go-specific performance concerns.',
    outputType: 'review',
    tags: ['language', 'go', 'golang', 'concurrency'],
  },
  {
    id: 'java-croc',
    name: 'Java专家鳄',
    nameEn: 'Java Expert Croc',
    category: 'language',
    description: 'Java/Kotlin 生态专家：Spring Boot/JPA/微服务',
    sprite: 'language',
    color: '#ed8b00',
    priority: 10,
    triggers: { languages: ['java', 'kotlin'] },
    systemPrompt: 'You are a Java/Kotlin ecosystem expert. Analyze Spring Boot applications for bean lifecycle issues, JPA N+1 queries, transaction management, and microservice patterns.',
    outputType: 'review',
    tags: ['language', 'java', 'kotlin', 'spring'],
  },
  {
    id: 'rust-croc',
    name: 'Rust专家鳄',
    nameEn: 'Rust Expert Croc',
    category: 'language',
    description: 'Rust 生态专家：所有权/生命周期/unsafe',
    sprite: 'language',
    color: '#dea584',
    priority: 10,
    triggers: { languages: ['rust'] },
    systemPrompt: 'You are a Rust ecosystem expert. Analyze Rust code for ownership patterns, lifetime issues, unsafe code safety, and performance optimization.',
    outputType: 'review',
    tags: ['language', 'rust', 'ownership', 'safety'],
  },
];

// ─── Framework Expert Roles ──────────────────────────────────────────────────

const FRAMEWORK_ROLES: RoleDefinition[] = [
  {
    id: 'react-croc',
    name: 'React专家鳄',
    nameEn: 'React Expert Croc',
    category: 'framework',
    description: 'React/Next.js 前端性能和架构专家',
    sprite: 'framework',
    color: '#61dafb',
    priority: 15,
    triggers: { frameworks: ['React', 'Next.js'] },
    systemPrompt: 'You are a React/Next.js expert. Analyze component architecture, render performance, state management, SSR/SSG patterns, and React-specific anti-patterns.',
    outputType: 'review',
    tags: ['framework', 'react', 'nextjs', 'frontend'],
  },
  {
    id: 'vue-croc',
    name: 'Vue专家鳄',
    nameEn: 'Vue Expert Croc',
    category: 'framework',
    description: 'Vue/Nuxt 专家：组合式API/响应式/SSR',
    sprite: 'framework',
    color: '#42b883',
    priority: 15,
    triggers: { frameworks: ['Vue', 'Nuxt'] },
    systemPrompt: 'You are a Vue/Nuxt expert. Analyze Composition API usage, reactivity patterns, Pinia stores, SSR hydration, and Vue-specific best practices.',
    outputType: 'review',
    tags: ['framework', 'vue', 'nuxt', 'frontend'],
  },
  {
    id: 'express-croc',
    name: 'Express专家鳄',
    nameEn: 'Express Expert Croc',
    category: 'framework',
    description: 'Express/Koa/Fastify 路由和中间件专家',
    sprite: 'framework',
    color: '#68a063',
    priority: 15,
    triggers: { frameworks: ['Express', 'Koa', 'Fastify'] },
    systemPrompt: 'You are a Node.js backend expert. Analyze Express/Koa/Fastify middleware chains, route organization, error handling, authentication patterns, and performance.',
    outputType: 'review',
    tags: ['framework', 'express', 'koa', 'fastify', 'nodejs'],
  },
  {
    id: 'django-croc',
    name: 'Django专家鳄',
    nameEn: 'Django Expert Croc',
    category: 'framework',
    description: 'Django/DRF 专家：ORM/序列化/权限',
    sprite: 'framework',
    color: '#092e20',
    priority: 15,
    triggers: { frameworks: ['Django', 'DRF'] },
    systemPrompt: 'You are a Django/DRF expert. Analyze ORM query efficiency, serializer design, view permissions, middleware, and Django-specific security practices.',
    outputType: 'review',
    tags: ['framework', 'django', 'drf', 'python'],
  },
  {
    id: 'spring-croc',
    name: 'SpringBoot专家鳄',
    nameEn: 'Spring Boot Expert Croc',
    category: 'framework',
    description: 'Spring Boot/Cloud 微服务架构专家',
    sprite: 'framework',
    color: '#6db33f',
    priority: 15,
    triggers: { frameworks: ['Spring Boot', 'Spring Cloud'] },
    systemPrompt: 'You are a Spring Boot/Cloud expert. Analyze bean configurations, transaction management, service discovery, circuit breakers, and microservice communication patterns.',
    outputType: 'review',
    tags: ['framework', 'spring', 'springboot', 'microservice'],
  },
];

// ─── Domain Expert Roles ─────────────────────────────────────────────────────

const DOMAIN_ROLES: RoleDefinition[] = [
  {
    id: 'security-croc',
    name: '安全审计鳄',
    nameEn: 'Security Auditor Croc',
    category: 'domain',
    description: '安全漏洞检测：注入/XSS/CSRF/认证/授权',
    sprite: 'security',
    color: '#ef4444',
    priority: 8,
    triggers: {
      riskCategories: ['security'],
      custom: (ctx) => ctx.hasAPIs,
    },
    systemPrompt: 'You are a security auditor. Scan for OWASP Top 10 vulnerabilities: SQL injection, XSS, CSRF, broken authentication, sensitive data exposure, insecure deserialization, and missing access controls.',
    outputType: 'report',
    tags: ['domain', 'security', 'owasp', 'audit'],
  },
  {
    id: 'performance-croc',
    name: '性能分析鳄',
    nameEn: 'Performance Analyst Croc',
    category: 'domain',
    description: '性能瓶颈检测：N+1查询/内存泄漏/慢接口',
    sprite: 'performance',
    color: '#f59e0b',
    priority: 9,
    triggers: {
      minEntities: 50,
      custom: (ctx) => ctx.hasModels && ctx.hasAPIs,
    },
    systemPrompt: 'You are a performance analyst. Detect N+1 queries, memory leaks, slow API endpoints, missing indexes, unnecessary data loading, and recommend caching strategies.',
    outputType: 'report',
    tags: ['domain', 'performance', 'optimization', 'n+1'],
  },
  {
    id: 'architecture-croc',
    name: '架构评审鳄',
    nameEn: 'Architecture Reviewer Croc',
    category: 'domain',
    description: '架构质量评审：耦合度/内聚性/分层/DDD',
    sprite: 'architecture',
    color: '#8b5cf6',
    priority: 7,
    triggers: {
      minEntities: 30,
    },
    systemPrompt: 'You are a software architect. Evaluate coupling, cohesion, layering, dependency injection, SOLID principles, DDD patterns, and recommend architectural improvements.',
    outputType: 'review',
    tags: ['domain', 'architecture', 'solid', 'ddd'],
  },
  {
    id: 'data-modeling-croc',
    name: '数据建模鳄',
    nameEn: 'Data Modeling Croc',
    category: 'domain',
    description: '数据模型评审：范式/索引/关联/迁移',
    sprite: 'database',
    color: '#06b6d4',
    priority: 9,
    triggers: {
      custom: (ctx) => ctx.hasModels,
      frameworks: ['Sequelize', 'Prisma', 'TypeORM', 'Drizzle', 'SQLAlchemy', 'Django'],
    },
    systemPrompt: 'You are a database expert. Review data models for normalization, index design, relationship integrity, migration safety, cascade delete risks, and query optimization.',
    outputType: 'review',
    tags: ['domain', 'database', 'modeling', 'orm'],
  },
  {
    id: 'devops-croc',
    name: '运维部署鳄',
    nameEn: 'DevOps Croc',
    category: 'domain',
    description: 'CI/CD、Docker、K8s 部署和运维专家',
    sprite: 'devops',
    color: '#2563eb',
    priority: 12,
    triggers: {
      custom: (ctx) => ctx.hasDocker || ctx.hasCI,
      filePatterns: ['Dockerfile', 'docker-compose*', '.github/workflows/*', '.gitlab-ci*', 'Jenkinsfile'],
    },
    systemPrompt: 'You are a DevOps expert. Analyze Dockerfile efficiency, compose orchestration, CI/CD pipeline design, secret management, health checks, and deployment strategies.',
    outputType: 'review',
    tags: ['domain', 'devops', 'docker', 'ci/cd', 'kubernetes'],
  },
  {
    id: 'api-design-croc',
    name: 'API设计鳄',
    nameEn: 'API Design Croc',
    category: 'domain',
    description: 'RESTful API 设计评审：命名/版本/分页/错误处理',
    sprite: 'api',
    color: '#10b981',
    priority: 11,
    triggers: {
      custom: (ctx) => ctx.hasAPIs,
      minEntities: 10,
    },
    systemPrompt: 'You are an API design expert. Review REST API naming conventions, versioning strategy, pagination, filtering, error response format, rate limiting, and documentation completeness.',
    outputType: 'review',
    tags: ['domain', 'api', 'rest', 'design'],
  },
  {
    id: 'refactor-croc',
    name: '重构建议鳄',
    nameEn: 'Refactoring Croc',
    category: 'domain',
    description: '代码质量评估：技术债/复杂度/重复代码',
    sprite: 'refactor',
    color: '#ec4899',
    priority: 13,
    triggers: {
      riskCategories: ['maintainability'],
      minEntities: 40,
    },
    systemPrompt: 'You are a refactoring expert. Identify code smells, duplicated logic, high cyclomatic complexity, god classes, feature envy, and suggest targeted refactoring strategies with minimal risk.',
    outputType: 'review',
    tags: ['domain', 'refactoring', 'quality', 'tech-debt'],
  },
  {
    id: 'microservice-croc',
    name: '服务治理鳄',
    nameEn: 'Microservice Governance Croc',
    category: 'domain',
    description: '微服务架构治理：服务边界/熔断/链路追踪',
    sprite: 'microservice',
    color: '#7c3aed',
    priority: 14,
    triggers: {
      projectTypes: ['microservice', 'monorepo'],
      custom: (ctx) => ctx.entityCount > 100,
    },
    systemPrompt: 'You are a microservice governance expert. Analyze service boundaries, inter-service communication, circuit breakers, distributed tracing, service mesh, and API gateway patterns.',
    outputType: 'review',
    tags: ['domain', 'microservice', 'governance', 'distributed'],
  },
];

// ─── Role Registry ───────────────────────────────────────────────────────────

export class RoleRegistry {
  private roles = new Map<string, RoleDefinition>();

  constructor() {
    // Register all built-in roles
    for (const role of [...CORE_ROLES, ...LANGUAGE_ROLES, ...FRAMEWORK_ROLES, ...DOMAIN_ROLES]) {
      this.roles.set(role.id, role);
    }
  }

  /** Register a new role (community or custom) */
  register(role: RoleDefinition): void {
    if (this.roles.has(role.id)) {
      throw new Error(`Role "${role.id}" is already registered`);
    }
    this.roles.set(role.id, role);
  }

  /** Unregister a role */
  unregister(id: string): boolean {
    return this.roles.delete(id);
  }

  /** Get a role by ID */
  get(id: string): RoleDefinition | undefined {
    return this.roles.get(id);
  }

  /** List all registered roles */
  list(): RoleDefinition[] {
    return Array.from(this.roles.values());
  }

  /** List roles by category */
  listByCategory(category: RoleCategory): RoleDefinition[] {
    return this.list().filter(r => r.category === category);
  }

  /** Search roles by tags */
  search(query: string): RoleDefinition[] {
    const q = query.toLowerCase();
    return this.list().filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.nameEn.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.tags.some(t => t.includes(q))
    );
  }

  /** Total number of registered roles */
  get size(): number {
    return this.roles.size;
  }
}

// ─── Singleton instance ──────────────────────────────────────────────────────

let _registry: RoleRegistry | null = null;

export function getRoleRegistry(): RoleRegistry {
  if (!_registry) {
    _registry = new RoleRegistry();
  }
  return _registry;
}

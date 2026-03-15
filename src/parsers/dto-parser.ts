/**
 * DTO / TypeScript Interface Parser
 *
 * Uses ts-morph to parse TypeScript interfaces from Service and Model files,
 * extracting field info (name, type, required, enum values) and
 * express-validator rules from Controller files.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Project,
  SyntaxKind,
  type InterfaceDeclaration,
  type PropertySignature,
  type SourceFile,
  type Node,
  type PropertyAccessExpression,
} from 'ts-morph';
import type { DTOInfo, DTOFieldInfo, ValidatorRule, ModuleMetadata } from '../types.js';

// ============================================================
// System fields (auto-generated, not user-editable)
// ============================================================

const SYSTEM_FIELDS = new Set([
  'id', 'tenant_id', 'tenantId',
  'created_at', 'createdAt', 'updated_at', 'updatedAt',
  'created_by', 'createdBy', 'updated_by', 'updatedBy',
]);

// ============================================================
// Core exports
// ============================================================

/**
 * Parse DTOs (TypeScript interfaces) from Service and Model files.
 *
 * @param filePaths  Files to scan (Service / Model .ts files)
 * @param options.dtoNamePatterns  Regex patterns to match DTO interface names
 */
export function parseDTOs(
  filePaths: string[],
  options?: { dtoNamePatterns?: RegExp[] },
): DTOInfo[] {
  const patterns = options?.dtoNamePatterns ?? [
    /DTO$/i, /Query$/i, /Params$/i, /Attributes$/i, /Input$/i, /Request$/i,
  ];

  const allDTOs: DTOInfo[] = [];
  const project = new Project({ compilerOptions: { strict: false } });

  for (const filePath of filePaths) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) continue;

    try {
      const sourceFile = project.addSourceFileAtPath(absolutePath);
      const interfaces = sourceFile.getInterfaces();

      for (const iface of interfaces) {
        const name = iface.getName();
        const matchesPattern = patterns.some((p) => p.test(name));
        if (!matchesPattern) continue;

        const dto = parseInterfaceToDTO(iface, absolutePath);
        if (dto) allDTOs.push(dto);
      }
    } catch (err) {
      console.warn(`[dto-parser] Failed to parse ${filePath}:`, (err as Error).message);
    }
  }

  return deduplicateDTOs(allDTOs);
}

/**
 * Parse express-validator rules from Controller files.
 *
 * Scans router.get/post/put/delete calls for middleware arrays containing
 * body('field').notEmpty(), param('field').isInt(), etc.
 *
 * @returns Map<routeKey, ValidatorRule[]>  routeKey = "METHOD /path"
 */
export function parseValidatorRules(
  controllerPaths: string[],
): Map<string, ValidatorRule[]> {
  const result = new Map<string, ValidatorRule[]>();
  const project = new Project({ compilerOptions: { strict: false } });

  for (const filePath of controllerPaths) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) continue;

    try {
      const sourceFile = project.addSourceFileAtPath(absolutePath);
      const routeRules = extractValidatorRulesFromSource(sourceFile);

      for (const [routeKey, rules] of routeRules) {
        result.set(routeKey, rules);
      }
    } catch (err) {
      console.warn(`[dto-parser] Failed to parse validators in ${filePath}:`, (err as Error).message);
    }
  }

  return result;
}

/**
 * Scan a module comprehensively, returning enhanced ModuleMetadata.
 */
export function scanModuleMetadata(
  moduleName: string,
  servicePaths: string[],
  controllerPaths: string[],
  modelDir?: string,
): ModuleMetadata {
  const allFilePaths = [...servicePaths];

  if (modelDir) {
    const absoluteModelDir = path.resolve(modelDir);
    if (fs.existsSync(absoluteModelDir)) {
      const modelFiles = fs
        .readdirSync(absoluteModelDir)
        .filter((f) =>
          f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts' && f !== 'associations.ts',
        )
        .map((f) => path.join(absoluteModelDir, f));
      allFilePaths.push(...modelFiles);
    }
  }

  const dtos = parseDTOs(allFilePaths);
  const validatorRules = parseValidatorRules(controllerPaths);

  return { moduleName, dtos, validatorRules, timestamp: new Date().toISOString() };
}

// ============================================================
// Interface parsing internals
// ============================================================

function parseInterfaceToDTO(iface: InterfaceDeclaration, sourcePath: string): DTOInfo | null {
  const fields: DTOFieldInfo[] = [];

  const extendsClause = iface.getExtends();
  const extendsName = extendsClause.length > 0 ? extendsClause[0].getText() : undefined;

  for (const prop of iface.getProperties()) {
    const field = parsePropertyToField(prop);
    if (field) fields.push(field);
  }

  if (fields.length === 0) return null;

  return { name: iface.getName(), sourcePath, fields, extends: extendsName };
}

function parsePropertyToField(prop: PropertySignature): DTOFieldInfo | null {
  const name = prop.getName();
  const typeNode = prop.getTypeNode();
  if (!typeNode) return null;

  const { baseType, enumValues } = resolveType(typeNode.getText().trim());

  return {
    name,
    type: baseType,
    required: !prop.hasQuestionToken(),
    enumValues: enumValues.length > 0 ? enumValues : undefined,
    isSystemField: SYSTEM_FIELDS.has(name),
  };
}

function resolveType(typeText: string): { baseType: string; enumValues: string[] } {
  const cleaned = typeText.split('|').map((t) => t.trim()).filter((t) => t !== 'null' && t !== 'undefined');

  // String literal union: 'TEXT' | 'IMAGE'
  const stringLiterals = cleaned.filter((t) => /^['"].*['"]$/.test(t));
  if (stringLiterals.length > 0 && stringLiterals.length === cleaned.length) {
    return { baseType: 'string', enumValues: stringLiterals.map((t) => t.replace(/^['"]|['"]$/g, '')) };
  }

  // Number literal union: 0 | 1 | 2
  const numberLiterals = cleaned.filter((t) => /^\d+$/.test(t));
  if (numberLiterals.length > 0 && numberLiterals.length === cleaned.length) {
    return { baseType: 'number', enumValues: numberLiterals };
  }

  if (cleaned.length === 1) return { baseType: cleaned[0], enumValues: [] };
  return { baseType: cleaned[0] || typeText, enumValues: [] };
}

// ============================================================
// express-validator rule extraction
// ============================================================

function extractValidatorRulesFromSource(sourceFile: SourceFile): Map<string, ValidatorRule[]> {
  const result = new Map<string, ValidatorRule[]>();
  const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);
  const METHOD_MAP: Record<string, string> = { get: 'GET', post: 'POST', put: 'PUT', delete: 'DELETE', patch: 'PATCH' };

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const propAccess = expr as PropertyAccessExpression;
    const methodName = propAccess.getName().toLowerCase();
    if (!HTTP_METHODS.has(methodName)) continue;

    const objectText = propAccess.getExpression().getText().trim();
    if (objectText !== 'router' && objectText !== 'this.router') continue;

    const args = call.getArguments();
    if (args.length < 2) continue;

    const routePath = resolveArgText(args[0]);
    if (!routePath) continue;

    const validatorRules: ValidatorRule[] = [];
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const elements = arg.asKindOrThrow(SyntaxKind.ArrayLiteralExpression).getElements();
        for (const element of elements) {
          const rule = parseValidatorChain(element);
          if (rule) validatorRules.push(rule);
        }
      }
    }

    if (validatorRules.length > 0) {
      result.set(`${METHOD_MAP[methodName]} ${routePath}`, validatorRules);
    }
  }

  return result;
}

function parseValidatorChain(node: Node): ValidatorRule | null {
  const text = node.getText().trim();

  const sourceMatch = text.match(/^(body|param|query)\(\s*['"](\w+)['"]\s*\)/);
  if (!sourceMatch) return null;

  const source = sourceMatch[1] as 'body' | 'param' | 'query';
  const field = sourceMatch[2];
  const rules: string[] = [];

  const chainRegex = /\.(\w+)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = chainRegex.exec(text)) !== null) {
    const method = match[1];
    const args = match[2].trim();
    if (method === 'withMessage' || method === 'bail') continue;

    if (method === 'isIn') {
      const valuesMatch = args.match(/\[([^\]]+)\]/);
      if (valuesMatch) {
        const values = valuesMatch[1].split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
        rules.push(`isIn(${values.join(',')})`);
      }
    } else if (method === 'optional') {
      rules.push('optional');
    } else {
      rules.push(method);
    }
  }

  return { field, source, rules };
}

function resolveArgText(node: Node): string | null {
  const text = node.getText().trim();

  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1);
  }

  if (text.startsWith('`') && text.endsWith('`')) {
    return text.slice(1, -1).replace(/\$\{[^}]+\}/g, (m) => m);
  }

  return null;
}

// ============================================================
// Helpers
// ============================================================

function deduplicateDTOs(dtos: DTOInfo[]): DTOInfo[] {
  const seen = new Map<string, DTOInfo>();
  for (const dto of dtos) {
    if (!seen.has(dto.name)) seen.set(dto.name, dto);
  }
  return Array.from(seen.values());
}

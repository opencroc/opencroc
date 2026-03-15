/**
 * Sequelize Backend Adapter
 *
 * Implements BackendAdapter for Sequelize ORM projects.
 * Uses ts-morph to parse Model.init() calls, association definitions, and controller routes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Project,
  SyntaxKind,
  type CallExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type Node,
  type SourceFile,
  type PropertyAccessExpression,
} from 'ts-morph';
import type {
  BackendAdapter,
  TableSchema,
  FieldSchema,
  IndexSchema,
  ForeignKeyRelation,
  RouteEntry,
} from '../types.js';

// ============================================================
// Factory
// ============================================================

export function createSequelizeAdapter(): BackendAdapter {
  return {
    name: 'sequelize',

    async parseModels(dir: string): Promise<TableSchema[]> {
      return parseModelsFromDir(dir);
    },

    async parseAssociations(file: string): Promise<ForeignKeyRelation[]> {
      return parseAssociationsFromFile(file);
    },

    async parseControllers(dir: string): Promise<RouteEntry[]> {
      return parseControllersFromDir(dir);
    },
  };
}

// ============================================================
// Model Parsing
// ============================================================

function parseModelsFromDir(modelDir: string): TableSchema[] {
  const absoluteDir = path.resolve(modelDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const files = fs.readdirSync(absoluteDir).filter((f) => {
    return (
      f.endsWith('.ts') &&
      !f.endsWith('.test.ts') &&
      !f.endsWith('.spec.ts') &&
      f !== 'index.ts' &&
      f !== 'associations.ts'
    );
  });

  const schemas: TableSchema[] = [];
  for (const file of files) {
    try {
      const schema = parseModelFile(path.join(absoluteDir, file));
      if (schema) schemas.push(schema);
    } catch {
      // Skip files that fail to parse
    }
  }
  return schemas;
}

function parseModelFile(filePath: string): TableSchema | null {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return null;

  const project = new Project({ compilerOptions: { strict: false } });
  const sourceFile = project.addSourceFileAtPath(absolutePath);

  const initCall = findInitCall(sourceFile);
  if (!initCall) return null;

  const args = initCall.getArguments();
  if (args.length < 2) return null;

  const fields = parseFieldDefinitions(args[0]);
  const { tableName, indexes } = parseOptions(args[1]);
  if (!tableName) return null;

  // Derive className from file name
  const className = path.basename(filePath, '.ts');

  return { tableName, className, fields, indexes };
}

function findInitCall(sourceFile: SourceFile): CallExpression | null {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    const expr = call.getExpression();
    if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      if (propAccess.getName() === 'init') return call;
    }
  }
  return null;
}

function parseFieldDefinitions(fieldsNode: Node): FieldSchema[] {
  const fields: FieldSchema[] = [];
  if (fieldsNode.getKind() !== SyntaxKind.ObjectLiteralExpression) return fields;

  const objLiteral = fieldsNode as ObjectLiteralExpression;
  for (const prop of objLiteral.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const propAssign = prop as PropertyAssignment;
    const fieldName = propAssign.getName();
    const initializer = propAssign.getInitializer();
    if (!initializer || initializer.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;

    fields.push(parseFieldObject(fieldName, initializer as ObjectLiteralExpression));
  }
  return fields;
}

function parseFieldObject(fieldName: string, fieldObj: ObjectLiteralExpression): FieldSchema {
  const field: FieldSchema = { name: fieldName, type: 'STRING', allowNull: true, primaryKey: false };

  for (const prop of fieldObj.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const propAssign = prop as PropertyAssignment;
    const key = propAssign.getName();
    const init = propAssign.getInitializer();
    if (!init) continue;

    switch (key) {
      case 'type':
        field.type = extractDataType(init);
        break;
      case 'allowNull':
        field.allowNull = extractBooleanValue(init);
        break;
      case 'primaryKey':
        field.primaryKey = extractBooleanValue(init);
        break;
      case 'defaultValue':
        field.defaultValue = extractDefaultValue(init);
        break;
      case 'unique':
        field.unique = extractBooleanValue(init);
        break;
      case 'comment': {
        const text = init.getText().trim();
        if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
          field.comment = text.slice(1, -1);
        }
        break;
      }
    }
  }
  return field;
}

function extractDataType(node: Node): string {
  const text = node.getText().trim();
  const callMatch = text.match(/^DataTypes\.(\w+)\((.+)\)$/);
  if (callMatch) return `${callMatch[1]}(${callMatch[2]})`;
  const propMatch = text.match(/^DataTypes\.(\w+)$/);
  if (propMatch) return propMatch[1];
  return text;
}

function extractBooleanValue(node: Node): boolean {
  return node.getText().trim() === 'true';
}

function extractDefaultValue(node: Node): unknown {
  const text = node.getText().trim();
  if (text === 'DataTypes.NOW') return 'DataTypes.NOW';
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null') return null;
  return text;
}

function parseOptions(optionsNode: Node): { tableName: string | null; indexes: IndexSchema[] } {
  let tableName: string | null = null;
  let indexes: IndexSchema[] = [];

  if (optionsNode.getKind() !== SyntaxKind.ObjectLiteralExpression) return { tableName, indexes };

  const objLiteral = optionsNode as ObjectLiteralExpression;
  for (const prop of objLiteral.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const propAssign = prop as PropertyAssignment;
    const key = propAssign.getName();
    const init = propAssign.getInitializer();
    if (!init) continue;

    if (key === 'tableName') tableName = extractStringValue(init);
    else if (key === 'indexes') indexes = parseIndexes(init);
  }
  return { tableName, indexes };
}

function extractStringValue(node: Node): string | null {
  const text = node.getText().trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    return text.slice(1, -1);
  }
  return null;
}

function parseIndexes(node: Node): IndexSchema[] {
  const indexes: IndexSchema[] = [];
  if (node.getKind() !== SyntaxKind.ArrayLiteralExpression) return indexes;

  const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  for (const el of arr.getElements()) {
    if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const idx = parseIndexObject(el as ObjectLiteralExpression);
    if (idx) indexes.push(idx);
  }
  return indexes;
}

function parseIndexObject(obj: ObjectLiteralExpression): IndexSchema | null {
  let name: string | undefined;
  let fields: string[] = [];
  let unique = false;

  for (const prop of obj.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const propAssign = prop as PropertyAssignment;
    const key = propAssign.getName();
    const init = propAssign.getInitializer();
    if (!init) continue;

    if (key === 'name') name = extractStringValue(init) ?? undefined;
    else if (key === 'fields') fields = extractStringArray(init);
    else if (key === 'unique') unique = extractBooleanValue(init);
  }

  if (fields.length === 0) return null;
  return { name, fields, unique };
}

function extractStringArray(node: Node): string[] {
  if (node.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  const result: string[] = [];
  for (const el of arr.getElements()) {
    const text = el.getText().trim();
    if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
      result.push(text.slice(1, -1));
    }
  }
  return result;
}

// ============================================================
// Association Parsing
// ============================================================

function parseAssociationsFromFile(filePath: string): ForeignKeyRelation[] {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return [];

  const project = new Project({ compilerOptions: { strict: false } });
  const sourceFile = project.addSourceFileAtPath(absolutePath);
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  const seen = new Map<string, ForeignKeyRelation>();

  for (const call of calls) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const propAccess = expr as PropertyAccessExpression;
    const methodName = propAccess.getName();
    if (!['hasMany', 'belongsTo', 'hasOne', 'belongsToMany'].includes(methodName)) continue;

    const sourceClass = propAccess.getExpression().getText().trim();
    const args = call.getArguments();
    if (args.length < 1) continue;

    const targetClass = args[0].getText().trim();
    let foreignKey = '';

    if (args.length >= 2 && args[1].getKind() === SyntaxKind.ObjectLiteralExpression) {
      foreignKey = extractObjStringProp(args[1] as ObjectLiteralExpression, 'foreignKey');
    }

    const relation: ForeignKeyRelation = {
      sourceTable: pascalToSnake(sourceClass),
      targetTable: pascalToSnake(targetClass),
      sourceField: methodName === 'belongsTo' ? foreignKey || 'id' : 'id',
      targetField: methodName === 'belongsTo' ? 'id' : foreignKey || 'id',
      cardinality: methodName === 'hasMany' ? '1:N' : methodName === 'belongsTo' ? 'N:1' : '1:1',
    };

    const key = `${relation.sourceTable}|${relation.targetTable}|${foreignKey}`;
    if (!seen.has(key)) seen.set(key, relation);
  }

  return Array.from(seen.values());
}

function extractObjStringProp(obj: ObjectLiteralExpression, propName: string): string {
  for (const prop of obj.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const pa = prop as PropertyAssignment;
    if (pa.getName() !== propName) continue;
    const init = pa.getInitializer();
    if (!init) continue;
    const text = init.getText().trim();
    if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
      return text.slice(1, -1);
    }
    return text;
  }
  return '';
}

function pascalToSnake(name: string): string {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

// ============================================================
// Controller Parsing
// ============================================================

const HTTP_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch']);

function parseControllersFromDir(controllerDir: string): RouteEntry[] {
  const absoluteDir = path.resolve(controllerDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const stat = fs.statSync(absoluteDir);
  const files: string[] = [];

  if (stat.isDirectory()) {
    const entries = fs.readdirSync(absoluteDir);
    for (const entry of entries) {
      if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')) {
        files.push(path.join(absoluteDir, entry));
      }
    }
  } else if (stat.isFile()) {
    files.push(absoluteDir);
  }

  const allRoutes: RouteEntry[] = [];
  for (const file of files) {
    try {
      allRoutes.push(...parseControllerFile(file));
    } catch {
      // Skip files that fail to parse
    }
  }

  return deduplicateRoutes(allRoutes);
}

function parseControllerFile(filePath: string): RouteEntry[] {
  const project = new Project({ compilerOptions: { strict: false } });
  const sourceFile = project.addSourceFileAtPath(filePath);
  const routes: RouteEntry[] = [];

  // Extract router.get/post/put/delete calls
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of calls) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const propAccess = expr as PropertyAccessExpression;
    const methodName = propAccess.getName().toLowerCase();
    if (!HTTP_METHODS.has(methodName)) continue;

    const objectText = propAccess.getExpression().getText().trim();
    if (objectText !== 'router' && objectText !== 'this.router') continue;

    const args = call.getArguments();
    if (args.length === 0) continue;

    const routePath = resolveStringArg(args[0]);
    if (!routePath) continue;

    // Try to extract handler name from second argument
    let handler = '';
    if (args.length >= 2) {
      handler = args[1].getText().trim();
    }

    routes.push({
      method: methodName.toUpperCase(),
      path: routePath,
      handler,
      controllerClass: path.basename(filePath, '.ts'),
    });
  }

  // Check for BaseCrudController
  routes.push(...extractBaseCrudRoutes(sourceFile, filePath));

  return routes;
}

function extractBaseCrudRoutes(sourceFile: SourceFile, filePath: string): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const classes = sourceFile.getClasses();
  let isBaseCrud = false;

  for (const cls of classes) {
    const heritage = cls.getExtends();
    if (heritage?.getText().includes('BaseCrudController')) {
      isBaseCrud = true;
      break;
    }
  }
  if (!isBaseCrud) return routes;

  // Find super.registerRoutes(router, 'resourcePath')
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  let resourcePath: string | null = null;

  for (const call of calls) {
    const exprText = call.getExpression().getText();
    if (
      (exprText === 'super.registerRoutes' || exprText.endsWith('.registerRoutes')) &&
      !exprText.includes('Custom')
    ) {
      const args = call.getArguments();
      if (args.length >= 2) resourcePath = resolveStringArg(args[1]);
    }
  }

  if (!resourcePath) return routes;
  const controllerClass = path.basename(filePath, '.ts');
  const basePath = `/v1/:tenantId/${resourcePath}`;

  const crudOps = [
    { method: 'GET', path: basePath, handler: 'list' },
    { method: 'GET', path: `${basePath}/:id`, handler: 'getById' },
    { method: 'POST', path: basePath, handler: 'create' },
    { method: 'PUT', path: `${basePath}/:id`, handler: 'update' },
    { method: 'DELETE', path: `${basePath}/:id`, handler: 'delete' },
    { method: 'POST', path: `${basePath}/batch-delete`, handler: 'batchDelete' },
  ];

  for (const op of crudOps) {
    routes.push({ method: op.method, path: op.path, handler: op.handler, controllerClass });
  }
  return routes;
}

function resolveStringArg(node: Node): string | null {
  const kind = node.getKind();
  if (kind === SyntaxKind.StringLiteral) {
    const text = node.getText();
    return text.slice(1, -1);
  }
  if (kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    const text = node.getText();
    return text.slice(1, -1);
  }
  if (kind === SyntaxKind.TemplateExpression) {
    // Best-effort resolve template literals
    const sourceFile = node.getSourceFile();
    let result = node.getText().slice(1, -1);
    result = result.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
      const resolved = resolveVariable(sourceFile, expr.trim());
      return resolved || `{${expr.trim()}}`;
    });
    return result;
  }
  if (kind === SyntaxKind.Identifier) {
    return resolveVariable(node.getSourceFile(), node.getText().trim());
  }
  return null;
}

function resolveVariable(sourceFile: SourceFile, varName: string): string | null {
  const varDecls = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
  for (const decl of varDecls) {
    if (decl.getName() === varName) {
      const init = decl.getInitializer();
      if (!init) continue;
      const text = init.getText().trim();
      if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
        return text.slice(1, -1);
      }
    }
  }
  return null;
}

function deduplicateRoutes(routes: RouteEntry[]): RouteEntry[] {
  const seen = new Map<string, RouteEntry>();
  for (const r of routes) {
    const key = `${r.method}:${r.path}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return Array.from(seen.values());
}

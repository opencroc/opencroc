import * as fs from 'fs';
import * as path from 'path';
import {
  Project,
  SyntaxKind,
  type CallExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type Node,
} from 'ts-morph';
import type { TableSchema, FieldSchema, IndexSchema } from '../types.js';

export interface ModelParser {
  parseFile(filePath: string): Promise<TableSchema | null>;
  parseDirectory(dirPath: string): Promise<TableSchema[]>;
}

/**
 * Parse a single Sequelize Model file and extract TableSchema.
 */
export function parseModelFile(filePath: string): TableSchema | null {
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

  return { tableName, fields, indexes };
}

/**
 * Batch parse all Model files in a directory.
 */
export function parseModuleModels(modelDir: string): TableSchema[] {
  const absoluteDir = path.resolve(modelDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const files = fs.readdirSync(absoluteDir).filter((f) =>
    f.endsWith('.ts') &&
    !f.endsWith('.test.ts') &&
    !f.endsWith('.spec.ts') &&
    f !== 'index.ts' &&
    f !== 'associations.ts',
  );

  const schemas: TableSchema[] = [];
  for (const file of files) {
    try {
      const schema = parseModelFile(path.join(absoluteDir, file));
      if (schema) schemas.push(schema);
    } catch {
      // skip unparseable files
    }
  }
  return schemas;
}

function findInitCall(sourceFile: Node): CallExpression | null {
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
    const initializer = propAssign.getInitializer();
    if (!initializer || initializer.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    fields.push(parseFieldObject(propAssign.getName(), initializer as ObjectLiteralExpression));
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
      case 'type': field.type = extractDataType(init); break;
      case 'allowNull': field.allowNull = init.getText().trim() === 'true'; break;
      case 'primaryKey': field.primaryKey = init.getText().trim() === 'true'; break;
      case 'defaultValue': field.defaultValue = extractDefaultValue(init); break;
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

function extractDefaultValue(node: Node): unknown {
  const text = node.getText().trim();
  if (text === 'DataTypes.NOW') return 'DataTypes.NOW';
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))
    return text.slice(1, -1);
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
    if (key === 'indexes') indexes = parseIndexes(init);
  }
  return { tableName, indexes };
}

function extractStringValue(node: Node): string | null {
  const text = node.getText().trim();
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))
    return text.slice(1, -1);
  return null;
}

function parseIndexes(node: Node): IndexSchema[] {
  if (node.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  const indexes: IndexSchema[] = [];
  for (const el of arr.getElements()) {
    if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const idx = parseIndexObject(el as ObjectLiteralExpression);
    if (idx) indexes.push(idx);
  }
  return indexes;
}

function parseIndexObject(obj: ObjectLiteralExpression): IndexSchema | null {
  let name = '';
  let fields: string[] = [];
  let unique = false;

  for (const prop of obj.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const pa = prop as PropertyAssignment;
    const init = pa.getInitializer();
    if (!init) continue;
    switch (pa.getName()) {
      case 'name': name = extractStringValue(init) || ''; break;
      case 'fields': fields = extractStringArray(init); break;
      case 'unique': unique = init.getText().trim() === 'true'; break;
    }
  }
  if (!name || fields.length === 0) return null;
  return { name, fields, unique };
}

function extractStringArray(node: Node): string[] {
  if (node.getKind() !== SyntaxKind.ArrayLiteralExpression) return [];
  const arr = node.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  return arr.getElements()
    .map((el) => el.getText().trim())
    .filter((t) => (t.startsWith("'") || t.startsWith('"')))
    .map((t) => t.slice(1, -1));
}

export function createModelParser(): ModelParser {
  return {
    async parseFile(filePath: string) {
      return parseModelFile(filePath);
    },
    async parseDirectory(dirPath: string) {
      return parseModuleModels(dirPath);
    },
  };
}

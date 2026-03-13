import * as fs from 'fs';
import * as path from 'path';
import {
  Project,
  SyntaxKind,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
} from 'ts-morph';
import type { ForeignKeyRelation } from '../types.js';
import { parseModelFile } from './model-parser.js';

export interface AssociationParser {
  parseFile(filePath: string): Promise<ForeignKeyRelation[]>;
}

interface RawAssociation {
  sourceClass: string;
  targetClass: string;
  foreignKey: string;
  type: 'hasMany' | 'belongsTo' | 'hasOne';
  importPath?: string;
}

/**
 * Parse an associations.ts file to extract all foreign key relations.
 */
export function parseAssociationFile(
  filePath: string,
  classToTableMap?: Map<string, string>,
  moduleTablePrefix?: string,
): ForeignKeyRelation[] {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return [];

  const project = new Project({ compilerOptions: { strict: false } });
  const sourceFile = project.addSourceFileAtPath(absolutePath);

  const importPathMap = collectImportPaths(sourceFile);
  const rawAssociations = extractAssociationCalls(sourceFile, importPathMap);
  if (rawAssociations.length === 0) return [];

  return deduplicateRelations(rawAssociations, classToTableMap, moduleTablePrefix);
}

/**
 * Build className → tableName map from Model files in a directory.
 */
export function buildClassToTableMap(modelDir: string): Map<string, string> {
  const map = new Map<string, string>();
  const absoluteDir = path.resolve(modelDir);
  if (!fs.existsSync(absoluteDir)) return map;

  const files = fs.readdirSync(absoluteDir).filter((f) =>
    f.endsWith('.ts') &&
    !f.endsWith('.test.ts') &&
    !f.endsWith('.spec.ts') &&
    f !== 'index.ts' &&
    f !== 'associations.ts',
  );

  for (const file of files) {
    try {
      const schema = parseModelFile(path.join(absoluteDir, file));
      if (schema) {
        const className = file.replace('.ts', '');
        map.set(className, schema.tableName);
      }
    } catch {
      // skip
    }
  }
  return map;
}

function collectImportPaths(sourceFile: SourceFile): Map<string, string> {
  const map = new Map<string, string>();
  for (const decl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = decl.getModuleSpecifierValue();
    for (const named of decl.getNamedImports()) {
      map.set(named.getName(), moduleSpecifier);
    }
  }
  return map;
}

function extractAssociationCalls(
  sourceFile: SourceFile,
  importPathMap: Map<string, string>,
): RawAssociation[] {
  const associations: RawAssociation[] = [];
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of calls) {
    const expr = call.getExpression();
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue;

    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    const methodName = propAccess.getName();
    if (methodName !== 'hasMany' && methodName !== 'belongsTo' && methodName !== 'hasOne') continue;

    const sourceClass = propAccess.getExpression().getText().trim();
    const args = call.getArguments();
    if (args.length < 1) continue;

    const targetClass = args[0].getText().trim();
    let foreignKey = '';

    if (args.length >= 2 && args[1].getKind() === SyntaxKind.ObjectLiteralExpression) {
      foreignKey = extractStringProperty(args[1] as ObjectLiteralExpression, 'foreignKey');
    }

    associations.push({
      sourceClass,
      targetClass,
      foreignKey,
      type: methodName as RawAssociation['type'],
      importPath: importPathMap.get(targetClass),
    });
  }
  return associations;
}

function extractStringProperty(obj: ObjectLiteralExpression, propertyName: string): string {
  for (const prop of obj.getProperties()) {
    if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const pa = prop as PropertyAssignment;
    if (pa.getName() !== propertyName) continue;
    const init = pa.getInitializer();
    if (!init) continue;
    const text = init.getText().trim();
    if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))
      return text.slice(1, -1);
    return text;
  }
  return '';
}

export function classNameToTableName(className: string): string {
  return className.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function resolveTableName(className: string, classToTableMap?: Map<string, string>): string {
  if (classToTableMap?.has(className)) return classToTableMap.get(className)!;
  return classNameToTableName(className);
}

function isCrossModuleRef(
  targetTableName: string,
  importPath: string | undefined,
  moduleTablePrefix?: string,
): boolean {
  if (moduleTablePrefix) return !targetTableName.startsWith(moduleTablePrefix);
  if (importPath) {
    const upLevels = (importPath.match(/\.\.\//g) || []).length;
    return upLevels >= 2;
  }
  return false;
}

function deduplicateRelations(
  rawAssociations: RawAssociation[],
  classToTableMap?: Map<string, string>,
  moduleTablePrefix?: string,
): ForeignKeyRelation[] {
  const seen = new Map<string, ForeignKeyRelation>();

  for (const raw of rawAssociations) {
    const sourceTable = resolveTableName(raw.sourceClass, classToTableMap);
    const targetTable = resolveTableName(raw.targetClass, classToTableMap);
    const crossModule = isCrossModuleRef(targetTable, raw.importPath, moduleTablePrefix);

    let parentTable: string;
    let childTable: string;
    let cardinality: ForeignKeyRelation['cardinality'];

    switch (raw.type) {
      case 'hasMany':
        parentTable = sourceTable; childTable = targetTable; cardinality = '1:N'; break;
      case 'belongsTo':
        parentTable = targetTable; childTable = sourceTable; cardinality = 'N:1'; break;
      case 'hasOne':
        parentTable = sourceTable; childTable = targetTable; cardinality = '1:1'; break;
    }

    const dedupeKey = `${parentTable}|${childTable}|${raw.foreignKey}`;
    if (seen.has(dedupeKey)) {
      const existing = seen.get(dedupeKey)!;
      if (existing.cardinality === 'N:1' && (cardinality === '1:N' || cardinality === '1:1')) {
        seen.set(dedupeKey, {
          sourceTable: parentTable, sourceField: 'id',
          targetTable: childTable, targetField: raw.foreignKey,
          cardinality, isCrossModule: crossModule || existing.isCrossModule,
        });
      }
    } else {
      seen.set(dedupeKey, {
        sourceTable: parentTable, sourceField: 'id',
        targetTable: childTable, targetField: raw.foreignKey,
        cardinality, isCrossModule: crossModule,
      });
    }
  }
  return Array.from(seen.values());
}

export function createAssociationParser(): AssociationParser {
  return {
    async parseFile(filePath: string) {
      return parseAssociationFile(filePath);
    },
  };
}

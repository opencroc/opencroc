import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { resolve } from 'node:path';

interface PackageJsonSummary {
  name?: string;
  description?: string;
  keywords?: string[];
}

export interface ProjectChatSnapshot {
  packageName?: string;
  packageDescription?: string;
  packageKeywords: string[];
  valueProp?: string;
  coreFeatures: string[];
  graphSummary?: {
    projectName: string;
    projectType: string;
    frameworks: string[];
    modules: number;
    apiEndpoints: number;
    dataModels: number;
  };
}

export interface ProjectChatGraphSummary {
  projectName: string;
  projectType: string;
  frameworks: string[];
  modules: number;
  apiEndpoints: number;
  dataModels: number;
}

async function canRead(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readUtf8(path: string): Promise<string | undefined> {
  if (!(await canRead(path))) return undefined;
  return readFile(path, 'utf8');
}

function stripMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_>~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSection(markdown: string, headings: string[]): string | undefined {
  const escaped = headings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`^##\\s+(?:${escaped.join('|')})\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'gim');
  const match = pattern.exec(markdown);
  return match?.[1]?.trim();
}

function extractBulletItems(section: string | undefined, limit: number): string[] {
  if (!section) return [];
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => stripMarkdown(line.replace(/^[-*]\s+/, '')))
    .filter(Boolean)
    .slice(0, limit);
}

async function readPackageSummary(cwd: string): Promise<PackageJsonSummary | undefined> {
  const raw = await readUtf8(resolve(cwd, 'package.json'));
  if (!raw) return undefined;
  try {
    const json = JSON.parse(raw) as PackageJsonSummary;
    return {
      name: typeof json.name === 'string' ? json.name : undefined,
      description: typeof json.description === 'string' ? json.description : undefined,
      keywords: Array.isArray(json.keywords) ? json.keywords.filter((item): item is string => typeof item === 'string') : [],
    };
  } catch {
    return undefined;
  }
}

async function readPreferredReadme(cwd: string): Promise<string | undefined> {
  const candidates = ['README.zh-CN.md', 'README.md', 'README.en.md'];
  for (const name of candidates) {
    const content = await readUtf8(resolve(cwd, name));
    if (!content) continue;
    if (name === 'README.md' && /^README\.zh-CN\.md:/m.test(content)) continue;
    return content;
  }
  return undefined;
}

export async function collectProjectChatSnapshot(cwd: string, graph?: ProjectChatGraphSummary): Promise<ProjectChatSnapshot> {
  const [pkg, readme] = await Promise.all([
    readPackageSummary(cwd),
    readPreferredReadme(cwd),
  ]);

  const valueProp = readme
    ? stripMarkdown(extractSection(readme, ['一句话价值', 'Why OpenCroc?', 'OpenCroc の価値']) || '')
    : undefined;
  const coreFeatures = readme
    ? extractBulletItems(extractSection(readme, ['核心特性', 'Core Features', '主な機能']), 4)
    : [];

  return {
    packageName: pkg?.name,
    packageDescription: pkg?.description,
    packageKeywords: pkg?.keywords ?? [],
    valueProp: valueProp || undefined,
    coreFeatures,
    graphSummary: graph,
  };
}

function summarizeKeywords(keywords: string[]): string | undefined {
  if (keywords.length === 0) return undefined;
  return keywords.slice(0, 5).join('、');
}

export function buildProjectChatAnswer(question: string, snapshot: ProjectChatSnapshot): string {
  const subject = snapshot.packageName || snapshot.graphSummary?.projectName || '这个项目';
  const description = snapshot.packageDescription || snapshot.valueProp;
  const keywords = summarizeKeywords(snapshot.packageKeywords);
  const graph = snapshot.graphSummary;
  const wantsPurpose = /干啥|做什么|用途|定位|是什么|介绍/i.test(question);

  const lines = [
    description
      ? `${subject} 主要是：${description}`
      : `${subject} 更像一个面向工程团队的代码扫描、测试生成和执行平台。`,
    snapshot.valueProp && snapshot.valueProp !== description
      ? `一句话看，它的价值是：${snapshot.valueProp}`
      : undefined,
    snapshot.coreFeatures.length > 0
      ? `核心能力包括：${snapshot.coreFeatures.join('；')}`
      : undefined,
    graph
      ? `从仓库结构看，它当前偏 ${graph.projectType}，大致有 ${graph.modules} 个模块、${graph.apiEndpoints} 个 API、${graph.dataModels} 个数据模型。`
      : undefined,
    graph && graph.frameworks.length > 0
      ? `识别到的主要技术栈/框架：${graph.frameworks.slice(0, 5).join('、')}`
      : undefined,
    keywords && wantsPurpose
      ? `关键词上它聚焦在：${keywords}`
      : undefined,
    wantsPurpose
      ? '换句话说，它想解决的是“先理解项目，再自动产出测试和执行结果”，而不是只做单点代码生成。'
      : undefined,
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

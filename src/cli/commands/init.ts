import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const ADAPTERS = ['sequelize', 'typeorm', 'prisma'] as const;
const LLM_PROVIDERS = ['openai', 'zhipu', 'ollama', 'none'] as const;

export interface InitAnswers {
  backendRoot: string;
  adapter: string;
  llmProvider: string;
  outDir: string;
}

const DEFAULTS: InitAnswers = {
  backendRoot: './backend',
  adapter: 'sequelize',
  llmProvider: 'openai',
  outDir: './opencroc-output',
};

export function buildConfigContent(answers: InitAnswers): string {
  const llmBlock =
    answers.llmProvider === 'none'
      ? ''
      : `
  llm: {
    provider: '${answers.llmProvider}',${answers.llmProvider === 'ollama' ? '' : "\n    // apiKey: process.env.OPENCROC_LLM_API_KEY,"}
    model: '${answers.llmProvider === 'zhipu' ? 'glm-4' : answers.llmProvider === 'ollama' ? 'llama3' : 'gpt-4o-mini'}',
  },`;

  return `import { defineConfig } from 'opencroc';

export default defineConfig({
  backendRoot: '${answers.backendRoot}',
  adapter: '${answers.adapter}',${llmBlock}
  outDir: '${answers.outDir}',
  selfHealing: {
    enabled: true,
    maxIterations: 3,
  },
});
`;
}

async function prompt(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultValue: string,
): Promise<string> {
  const answer = await rl.question(`  ${question} ${chalk.gray(`(${defaultValue})`)}: `);
  return answer.trim() || defaultValue;
}

async function promptChoice(
  rl: ReturnType<typeof createInterface>,
  question: string,
  choices: readonly string[],
  defaultValue: string,
): Promise<string> {
  const list = choices
    .map((c) => (c === defaultValue ? chalk.underline(c) : c))
    .join(' / ');
  const answer = await rl.question(`  ${question} [${list}]: `);
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed) return defaultValue;
  return choices.find((c) => c.toLowerCase() === trimmed) || defaultValue;
}

async function collectAnswers(): Promise<InitAnswers> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const backendRoot = await prompt(rl, 'Backend source root', DEFAULTS.backendRoot);
    const adapter = await promptChoice(rl, 'ORM adapter', ADAPTERS, DEFAULTS.adapter);
    const llmProvider = await promptChoice(rl, 'LLM provider', LLM_PROVIDERS, DEFAULTS.llmProvider);
    const outDir = await prompt(rl, 'Test output directory', DEFAULTS.outDir);
    return { backendRoot, adapter, llmProvider, outDir };
  } finally {
    rl.close();
  }
}

function writeProject(cwd: string, answers: InitAnswers): void {
  const configPath = join(cwd, 'opencroc.config.ts');
  writeFileSync(configPath, buildConfigContent(answers), 'utf-8');
  console.log(chalk.green('  ✓ Created opencroc.config.ts'));

  const outputDir = join(cwd, answers.outDir);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log(chalk.green(`  ✓ Created ${answers.outDir}/`));
  }
}

function printNextSteps(answers: InitAnswers): void {
  const needsKey = answers.llmProvider !== 'none' && answers.llmProvider !== 'ollama';
  console.log('');
  console.log(chalk.cyan('  Next steps:'));
  let step = 1;
  console.log(`    ${step++}. Review opencroc.config.ts`);
  if (needsKey) {
    console.log(`    ${step++}. Set OPENCROC_LLM_API_KEY environment variable`);
  }
  console.log(`    ${step++}. npx opencroc generate --all`);
  console.log(`    ${step}. npx opencroc test`);
}

export async function initProject(opts?: { yes?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, 'opencroc.config.ts');

  if (existsSync(configPath)) {
    console.log(chalk.yellow('\n  ⚠ opencroc.config.ts already exists. Skipping.\n'));
    return;
  }

  console.log(chalk.cyan.bold('\n  🐊 OpenCroc — Project Setup\n'));

  const answers = opts?.yes ? { ...DEFAULTS } : await collectAnswers();

  console.log('');
  writeProject(cwd, answers);
  printNextSteps(answers);
  console.log('');
}

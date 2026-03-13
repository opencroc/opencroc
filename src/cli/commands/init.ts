import chalk from 'chalk';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG_TEMPLATE = `import { defineConfig } from 'opencroc';

export default defineConfig({
  backendRoot: './backend',
  adapter: 'sequelize',
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini',
  },
  selfHealing: {
    enabled: true,
    maxIterations: 3,
  },
});
`;

export async function initProject(): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, 'opencroc.config.ts');

  if (existsSync(configPath)) {
    console.log(chalk.yellow('opencroc.config.ts already exists. Skipping.'));
    return;
  }

  writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
  console.log(chalk.green('✓ Created opencroc.config.ts'));

  const outDir = join(cwd, 'opencroc-output');
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
    console.log(chalk.green('✓ Created opencroc-output/'));
  }

  console.log('');
  console.log(chalk.cyan('Next steps:'));
  console.log('  1. Edit opencroc.config.ts with your project settings');
  console.log('  2. Run: npx opencroc generate --all');
  console.log('  3. Run: npx opencroc test');
}

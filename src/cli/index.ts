#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('opencroc')
  .description('AI-native E2E testing framework')
  .version('0.9.0');

program
  .command('init')
  .description('Initialize OpenCroc in the current project')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .action(async (opts) => {
    const { initProject } = await import('./commands/init.js');
    await initProject(opts);
  });

program
  .command('generate')
  .description('Generate E2E test cases from source code')
  .option('-m, --module <name>', 'Generate for a specific module')
  .option('-a, --all', 'Generate for all discovered modules')
  .option('--steps <steps>', 'Run specific pipeline steps (comma-separated)')
  .option('--dry-run', 'Preview without writing files')
  .action(async (opts) => {
    const { generate } = await import('./commands/generate.js');
    await generate(opts);
  });

program
  .command('test')
  .description('Run generated E2E tests')
  .option('-m, --module <name>', 'Run tests for a specific module')
  .option('--headed', 'Run in headed browser mode')
  .option('--setup-hook <cmd>', 'Run setup hook command before test execution')
  .option('--auth-hook <cmd>', 'Run auth hook command before test execution')
  .option('--teardown-hook <cmd>', 'Run teardown hook command after test execution')
  .action(async (opts) => {
    const { runTests } = await import('./commands/test.js');
    await runTests(opts);
  });

program
  .command('validate')
  .description('Validate module configurations and generated tests')
  .option('-m, --module <name>', 'Validate a specific module')
  .action(async (opts) => {
    const { validate } = await import('./commands/validate.js');
    await validate(opts);
  });

program
  .command('heal')
  .description('Run self-healing loop on failed tests')
  .option('-m, --module <name>', 'Heal a specific module')
  .option('--max-iterations <n>', 'Maximum healing iterations', '3')
  .action(async (opts) => {
    const { heal } = await import('./commands/heal.js');
    await heal(opts);
  });

program
  .command('ci')
  .description('Generate CI/CD pipeline template')
  .option('-p, --platform <name>', 'CI platform (github, gitlab)', 'github')
  .option('--self-heal', 'Include self-healing step')
  .option('--node <versions>', 'Node.js versions (comma-separated)', '20.x')
  .action(async (opts) => {
    const { ci } = await import('./commands/ci.js');
    await ci(opts);
  });

program
  .command('report')
  .description('Generate pipeline report (HTML/JSON/Markdown)')
  .option('-f, --format <formats>', 'Report formats (comma-separated)', 'html')
  .option('-o, --output <dir>', 'Output directory')
  .action(async (opts) => {
    const { report } = await import('./commands/report.js');
    await report(opts);
  });

program
  .command('dashboard')
  .description('Generate visual dashboard (opencroc-dashboard.html)')
  .option('-i, --input <file>', 'Build from existing opencroc-report.json file')
  .option('-o, --output <dir>', 'Output directory', './opencroc-output')
  .action(async (opts) => {
    const { dashboard } = await import('./commands/dashboard.js');
    await dashboard(opts);
  });

program
  .command('init-runtime')
  .description('Generate Playwright runtime infrastructure (config, setup, teardown, auth)')
  .option('-o, --output <dir>', 'Output directory for generated files', '.')
  .option('--force', 'Overwrite existing files')
  .action(async (opts) => {
    const { initRuntime } = await import('./commands/init-runtime.js');
    await initRuntime(opts);
  });

program.parse();

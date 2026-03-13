import chalk from 'chalk';

interface TestOptions {
  module?: string;
  headed?: boolean;
}

export async function runTests(opts: TestOptions): Promise<void> {
  console.log(chalk.cyan('🐊 OpenCroc — Running E2E tests...\n'));

  // TODO: Load config, discover generated tests, and run with Playwright
  console.log(chalk.yellow('Test runner is under development.'));
  console.log('Options:', opts);
}

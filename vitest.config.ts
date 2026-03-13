import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: 'node_modules/.vitest',
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
  },
});

import { describe, it, expect } from 'vitest';
import { buildConfigContent, type InitAnswers } from './init.js';

describe('buildConfigContent', () => {
  it('generates config with sequelize + openai defaults', () => {
    const answers: InitAnswers = {
      backendRoot: './backend',
      adapter: 'sequelize',
      llmProvider: 'openai',
      outDir: './opencroc-output',
    };
    const result = buildConfigContent(answers);
    expect(result).toContain("adapter: 'sequelize'");
    expect(result).toContain("provider: 'openai'");
    expect(result).toContain("model: 'gpt-4o-mini'");
    expect(result).toContain("backendRoot: './backend'");
    expect(result).toContain("outDir: './opencroc-output'");
    expect(result).toContain('OPENCROC_LLM_API_KEY');
    expect(result).toContain("import { defineConfig } from 'opencroc'");
  });

  it('generates config with typeorm + zhipu', () => {
    const answers: InitAnswers = {
      backendRoot: './src',
      adapter: 'typeorm',
      llmProvider: 'zhipu',
      outDir: './tests-out',
    };
    const result = buildConfigContent(answers);
    expect(result).toContain("adapter: 'typeorm'");
    expect(result).toContain("provider: 'zhipu'");
    expect(result).toContain("model: 'glm-4'");
    expect(result).toContain("backendRoot: './src'");
    expect(result).toContain("outDir: './tests-out'");
  });

  it('generates config with prisma + ollama (no apiKey comment)', () => {
    const answers: InitAnswers = {
      backendRoot: './api',
      adapter: 'prisma',
      llmProvider: 'ollama',
      outDir: './out',
    };
    const result = buildConfigContent(answers);
    expect(result).toContain("adapter: 'prisma'");
    expect(result).toContain("provider: 'ollama'");
    expect(result).toContain("model: 'llama3'");
    expect(result).not.toContain('OPENCROC_LLM_API_KEY');
  });

  it('generates config without llm block when provider is none', () => {
    const answers: InitAnswers = {
      backendRoot: './backend',
      adapter: 'sequelize',
      llmProvider: 'none',
      outDir: './opencroc-output',
    };
    const result = buildConfigContent(answers);
    expect(result).not.toContain('llm:');
    expect(result).not.toContain('provider:');
    expect(result).toContain("adapter: 'sequelize'");
    expect(result).toContain('selfHealing');
  });

  it('always includes selfHealing block', () => {
    const answers: InitAnswers = {
      backendRoot: '.',
      adapter: 'sequelize',
      llmProvider: 'none',
      outDir: './out',
    };
    const result = buildConfigContent(answers);
    expect(result).toContain('selfHealing');
    expect(result).toContain('maxIterations: 3');
  });
});

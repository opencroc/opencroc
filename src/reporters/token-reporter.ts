/**
 * Token Usage Reporter — tracks and reports LLM token consumption.
 *
 * Aggregates usage entries by category and model, computes costs,
 * tracks budget utilization, and renders both structured data and Markdown.
 */

import type { TokenUsageEntry, TokenUsageSummary } from '../types.js';

// ===== Token Tracker =====

export class TokenTracker {
  private entries: TokenUsageEntry[] = [];
  private budget: number | null = null;

  setBudget(maxTokens: number): void {
    this.budget = maxTokens;
  }

  record(entry: TokenUsageEntry): void {
    this.entries.push(entry);
  }

  reset(): void {
    this.entries = [];
  }

  getSummary(): TokenUsageSummary {
    const totalRequests = this.entries.length;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalEstimatedCost = 0;
    let totalLatency = 0;

    const byCategory: TokenUsageSummary['byCategory'] = {};
    const byModel: TokenUsageSummary['byModel'] = {};

    for (const e of this.entries) {
      totalPromptTokens += e.promptTokens;
      totalCompletionTokens += e.completionTokens;
      totalEstimatedCost += e.estimatedCost;
      totalLatency += e.latencyMs;

      // By category
      if (!byCategory[e.category]) {
        byCategory[e.category] = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 };
      }
      const cat = byCategory[e.category];
      cat.requests++;
      cat.promptTokens += e.promptTokens;
      cat.completionTokens += e.completionTokens;
      cat.totalTokens += e.promptTokens + e.completionTokens;
      cat.estimatedCost += e.estimatedCost;

      // By model
      if (!byModel[e.model]) {
        byModel[e.model] = { requests: 0, totalTokens: 0, estimatedCost: 0 };
      }
      const mod = byModel[e.model];
      mod.requests++;
      mod.totalTokens += e.promptTokens + e.completionTokens;
      mod.estimatedCost += e.estimatedCost;
    }

    const totalTokens = totalPromptTokens + totalCompletionTokens;
    const budgetUsedPercent = this.budget && this.budget > 0
      ? Math.round(totalTokens / this.budget * 10000) / 100
      : null;

    return {
      totalRequests,
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      totalEstimatedCost,
      avgLatencyMs: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
      byCategory,
      byModel,
      budgetUsedPercent,
      budgetExceeded: budgetUsedPercent !== null && budgetUsedPercent > 100,
    };
  }
}

// ===== Markdown renderer =====

export function renderTokenReportMarkdown(summary: TokenUsageSummary): string {
  const lines: string[] = [
    '# AI Token Usage Report',
    '',
    `- Total requests: ${summary.totalRequests}`,
    `- Total tokens: ${summary.totalTokens.toLocaleString()}`,
    `- Prompt tokens: ${summary.totalPromptTokens.toLocaleString()}`,
    `- Completion tokens: ${summary.totalCompletionTokens.toLocaleString()}`,
    `- Estimated cost: ¥${summary.totalEstimatedCost.toFixed(4)}`,
    `- Average latency: ${summary.avgLatencyMs}ms`,
  ];

  if (summary.budgetUsedPercent !== null) {
    lines.push(`- Budget used: ${summary.budgetUsedPercent}%${summary.budgetExceeded ? ' **EXCEEDED**' : ''}`);
  }
  lines.push('');

  // By category
  const cats = Object.entries(summary.byCategory).sort((a, b) => b[1].totalTokens - a[1].totalTokens);
  if (cats.length > 0) {
    lines.push(
      '## By Category',
      '',
      '| Category | Requests | Prompt | Completion | Total | Cost |',
      '|----------|----------|--------|------------|-------|------|',
    );
    for (const [cat, d] of cats) {
      lines.push(`| ${cat} | ${d.requests} | ${d.promptTokens.toLocaleString()} | ${d.completionTokens.toLocaleString()} | ${d.totalTokens.toLocaleString()} | ¥${d.estimatedCost.toFixed(4)} |`);
    }
    lines.push('');
  }

  // By model
  const models = Object.entries(summary.byModel);
  if (models.length > 0) {
    lines.push(
      '## By Model',
      '',
      '| Model | Requests | Total Tokens | Cost |',
      '|-------|----------|-------------|------|',
    );
    for (const [model, d] of models) {
      lines.push(`| ${model} | ${d.requests} | ${d.totalTokens.toLocaleString()} | ¥${d.estimatedCost.toFixed(4)} |`);
    }
    lines.push('');
  }

  return lines.join('\n') + '\n';
}

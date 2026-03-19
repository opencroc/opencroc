import { describe, expect, it } from 'vitest';
import { classifyChatTaskIntent } from './chat-task-dispatcher.js';

describe('classifyChatTaskIntent', () => {
  it('classifies scan-like requests', () => {
    const plan = classifyChatTaskIntent('帮我扫描这个仓库结构并生成知识图谱');
    expect(plan.intent).toBe('scan');
  });

  it('classifies pipeline-like requests', () => {
    const plan = classifyChatTaskIntent('请跑 pipeline 生成测试用例');
    expect(plan.intent).toBe('pipeline');
  });

  it('classifies report-like requests', () => {
    const plan = classifyChatTaskIntent('请生成一份总结报告');
    expect(plan.intent).toBe('report');
  });

  it('falls back to analysis when intent is open-ended', () => {
    const plan = classifyChatTaskIntent('帮我分析 OpenCroc 的平台定位和 roadmap');
    expect(plan.intent).toBe('analysis');
  });

  it('keeps repository introduction questions on analysis intent', () => {
    const plan = classifyChatTaskIntent('帮我分析这个项目是干啥用的');
    expect(plan.intent).toBe('analysis');
  });
});

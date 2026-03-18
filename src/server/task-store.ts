export type TaskStageStatus = 'pending' | 'running' | 'done' | 'failed';
export type TaskStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed';

export interface TaskStage {
  key: string;
  label: string;
  status: TaskStageStatus;
  detail?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskEvent {
  type: 'created' | 'progress' | 'log' | 'waiting' | 'done' | 'failed';
  message: string;
  progress?: number;
  stageKey?: string;
  level?: 'info' | 'warn' | 'error';
  time: number;
}

export interface TaskDecisionOption {
  id: string;
  label: string;
  description?: string;
}

export interface TaskDecisionPrompt {
  prompt: string;
  options: TaskDecisionOption[];
  allowFreeText?: boolean;
}

export interface TaskRecord {
  id: string;
  kind: string;
  title: string;
  status: TaskStatus;
  progress: number;
  currentStageKey?: string;
  stages: TaskStage[];
  summary?: string;
  waitingFor?: string;
  decision?: TaskDecisionPrompt;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  events: TaskEvent[];
}

export interface CreateTaskInput {
  kind: string;
  title: string;
  stageLabels: Array<{ key: string; label: string }>;
}

function now(): number {
  return Date.now();
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export class TaskStore {
  private tasks = new Map<string, TaskRecord>();

  create(input: CreateTaskInput): TaskRecord {
    const createdAt = now();
    const id = `task_${createdAt.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const task: TaskRecord = {
      id,
      kind: input.kind,
      title: input.title,
      status: 'queued',
      progress: 0,
      createdAt,
      updatedAt: createdAt,
      stages: input.stageLabels.map((stage) => ({ ...stage, status: 'pending' })),
      events: [
        {
          type: 'created',
          message: `Task created: ${input.title}`,
          time: createdAt,
        },
      ],
    };
    this.tasks.set(id, task);
    return structuredClone(task);
  }

  list(limit = 20): TaskRecord[] {
    return [...this.tasks.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((task) => structuredClone(task));
  }

  get(id: string): TaskRecord | undefined {
    const task = this.tasks.get(id);
    return task ? structuredClone(task) : undefined;
  }

  update(id: string, updater: (task: TaskRecord) => void): TaskRecord | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;
    updater(task);
    task.updatedAt = now();
    this.tasks.set(id, task);
    return structuredClone(task);
  }

  markRunning(id: string, stageKey?: string, detail?: string, progress?: number): TaskRecord | undefined {
    return this.update(id, (task) => {
      task.status = 'running';
      if (typeof progress === 'number') task.progress = clampProgress(progress);
      if (!stageKey) return;
      const previousStageKey = task.currentStageKey;
      task.currentStageKey = stageKey;
      for (const stage of task.stages) {
        if (stage.key === stageKey) {
          if (!stage.startedAt) stage.startedAt = now();
          stage.status = 'running';
          if (detail) stage.detail = detail;
        } else if (stage.status === 'running') {
          if (stage.key === previousStageKey) {
            stage.status = 'done';
            stage.completedAt ??= now();
          } else {
            stage.status = 'pending';
          }
        }
      }
      task.events.push({
        type: 'progress',
        message: detail || `Running ${stageKey}`,
        progress: task.progress,
        stageKey,
        time: now(),
      });
    });
  }

  updateStage(id: string, stageKey: string, patch: Partial<TaskStage>, progress?: number): TaskRecord | undefined {
    return this.update(id, (task) => {
      const stage = task.stages.find((item) => item.key === stageKey);
      if (!stage) return;
      Object.assign(stage, patch);
      if (typeof progress === 'number') task.progress = clampProgress(progress);
      if (patch.status === 'running') {
        task.status = 'running';
        task.currentStageKey = stageKey;
        if (!stage.startedAt) stage.startedAt = now();
      }
      if (patch.status === 'done' && !stage.completedAt) {
        stage.completedAt = now();
      }
      if (patch.status === 'failed') {
        task.status = 'failed';
      }
      task.events.push({
        type: 'progress',
        message: patch.detail || `${stage.label}: ${patch.status || stage.status}`,
        progress: task.progress,
        stageKey,
        time: now(),
      });
    });
  }

  log(id: string, message: string, level: 'info' | 'warn' | 'error' = 'info', progress?: number): TaskRecord | undefined {
    return this.update(id, (task) => {
      if (typeof progress === 'number') task.progress = clampProgress(progress);
      task.events.push({ type: 'log', message, level, progress: task.progress, stageKey: task.currentStageKey, time: now() });
    });
  }

  markWaiting(id: string, waitingFor: string, detail?: string, progress?: number, decision?: TaskDecisionPrompt): TaskRecord | undefined {
    return this.update(id, (task) => {
      task.status = 'waiting';
      task.waitingFor = waitingFor;
      task.decision = decision;
      if (typeof progress === 'number') task.progress = clampProgress(progress);
      task.events.push({
        type: 'waiting',
        message: detail || `Waiting for ${waitingFor}`,
        progress: task.progress,
        stageKey: task.currentStageKey,
        time: now(),
      });
    });
  }

  markDone(id: string, summary?: string): TaskRecord | undefined {
    return this.update(id, (task) => {
      task.status = 'done';
      task.progress = 100;
      task.summary = summary;
      task.waitingFor = undefined;
      task.decision = undefined;
      task.completedAt = now();
      const current = task.stages.find((stage) => stage.key === task.currentStageKey);
      if (current && current.status !== 'done') {
        current.status = 'done';
        current.completedAt = now();
      }
      task.events.push({ type: 'done', message: summary || 'Task completed', progress: 100, stageKey: task.currentStageKey, time: now() });
    });
  }

  markFailed(id: string, message: string): TaskRecord | undefined {
    return this.update(id, (task) => {
      task.status = 'failed';
      task.waitingFor = undefined;
      task.decision = undefined;
      task.completedAt = now();
      const current = task.stages.find((stage) => stage.key === task.currentStageKey);
      if (current) {
        current.status = 'failed';
        current.detail = message;
      }
      task.events.push({ type: 'failed', message, level: 'error', progress: task.progress, stageKey: task.currentStageKey, time: now() });
    });
  }
}

/**
 * Types for the eval harness
 */

export interface EvalTask {
  id: string;
  query: string;
  expectedKeywords?: string[];
  shouldNotContain?: string[];
  minLength?: number;
  maxLength?: number;
}

export interface EvalResult {
  taskId: string;
  passed: boolean;
  response: string;
  traceId: string;
  cost?: number;
  latencyMs: number;
  error?: string;
  failureReasons?: string[];
}

export interface EvalSummary {
  totalTasks: number;
  passed: number;
  failed: number;
  passRate: number;
  totalCost: number;
  avgCostPerTask: number;
  avgLatencyMs: number;
  results: EvalResult[];
}

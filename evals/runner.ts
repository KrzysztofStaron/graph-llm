#!/usr/bin/env node
/**
 * Eval harness for testing agent quality and cost
 * 
 * Usage:
 *   pnpm eval              # Run in dry mode (no API calls)
 *   pnpm eval --live       # Run against live API (requires credentials)
 */

import { EvalTask, EvalResult, EvalSummary } from "./types";
import { FIXTURE_TASKS, MOCK_RESPONSES } from "./fixtures";

// Simple trace ID generator (reusing pattern from app/utils/traceId.ts)
function generateTraceId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `eval-${timestamp}-${random}`;
}

/**
 * Evaluate a single task
 */
async function evaluateTask(
  task: EvalTask,
  dryRun: boolean
): Promise<EvalResult> {
  const traceId = generateTraceId();
  const startTime = Date.now();

  try {
    let response: string;
    let cost = 0;

    if (dryRun) {
      // Dry run: use mock responses
      response = MOCK_RESPONSES[task.id] || "Mock response";
      // Simulate some latency
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
      // Mock cost (rough estimate: $0.001-0.003 per task)
      cost = 0.001 + Math.random() * 0.002;
    } else {
      // Live mode: call the actual API
      // This would integrate with the existing aiService
      // For now, we'll throw an error to indicate live mode needs implementation
      throw new Error(
        "Live mode not yet implemented. Run eval against local backend or add API integration here."
      );
    }

    const latencyMs = Date.now() - startTime;

    // Evaluate the response
    const failureReasons: string[] = [];
    let passed = true;

    // Check expected keywords
    if (task.expectedKeywords) {
      const responseLowecase = response.toLowerCase();
      const hasKeyword = task.expectedKeywords.some((keyword) =>
        responseLowecase.includes(keyword.toLowerCase())
      );
      if (!hasKeyword) {
        passed = false;
        failureReasons.push(
          `Missing expected keywords: ${task.expectedKeywords.join(", ")}`
        );
      }
    }

    // Check forbidden content
    if (task.shouldNotContain) {
      const responseLowercase = response.toLowerCase();
      const forbidden = task.shouldNotContain.find((term) =>
        responseLowercase.includes(term.toLowerCase())
      );
      if (forbidden) {
        passed = false;
        failureReasons.push(`Contains forbidden term: ${forbidden}`);
      }
    }

    // Check length constraints
    if (task.minLength !== undefined && response.length < task.minLength) {
      passed = false;
      failureReasons.push(
        `Response too short: ${response.length} < ${task.minLength}`
      );
    }
    if (task.maxLength !== undefined && response.length > task.maxLength) {
      passed = false;
      failureReasons.push(
        `Response too long: ${response.length} > ${task.maxLength}`
      );
    }

    return {
      taskId: task.id,
      passed,
      response,
      traceId,
      cost,
      latencyMs,
      failureReasons: failureReasons.length > 0 ? failureReasons : undefined,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      taskId: task.id,
      passed: false,
      response: "",
      traceId,
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run all eval tasks and generate summary
 */
async function runEvals(dryRun: boolean): Promise<EvalSummary> {
  console.log(`\n🧪 Running evals in ${dryRun ? "DRY" : "LIVE"} mode...\n`);

  const results: EvalResult[] = [];

  for (const task of FIXTURE_TASKS) {
    process.stdout.write(`Testing ${task.id}... `);
    const result = await evaluateTask(task, dryRun);
    results.push(result);

    if (result.passed) {
      console.log(`✅ PASS (${result.latencyMs}ms)`);
    } else {
      console.log(`❌ FAIL (${result.latencyMs}ms)`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      if (result.failureReasons) {
        result.failureReasons.forEach((reason) => {
          console.log(`   - ${reason}`);
        });
      }
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
  const avgLatencyMs =
    results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;

  return {
    totalTasks: FIXTURE_TASKS.length,
    passed,
    failed,
    passRate: passed / FIXTURE_TASKS.length,
    totalCost,
    avgCostPerTask: totalCost / FIXTURE_TASKS.length,
    avgLatencyMs,
    results,
  };
}

/**
 * Print summary report
 */
function printSummary(summary: EvalSummary) {
  console.log("\n" + "=".repeat(60));
  console.log("📊 EVAL SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total Tasks:     ${summary.totalTasks}`);
  console.log(`Passed:          ${summary.passed} ✅`);
  console.log(`Failed:          ${summary.failed} ❌`);
  console.log(
    `Pass Rate:       ${(summary.passRate * 100).toFixed(1)}%`
  );
  console.log(`Total Cost:      $${summary.totalCost.toFixed(6)}`);
  console.log(`Avg Cost/Task:   $${summary.avgCostPerTask.toFixed(6)}`);
  console.log(`Avg Latency:     ${summary.avgLatencyMs.toFixed(0)}ms`);
  console.log("=".repeat(60) + "\n");

  // Print failed tasks in detail
  const failedResults = summary.results.filter((r) => !r.passed);
  if (failedResults.length > 0) {
    console.log("❌ Failed Tasks:\n");
    failedResults.forEach((result) => {
      console.log(`  ${result.taskId}:`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
      if (result.failureReasons) {
        result.failureReasons.forEach((reason) => {
          console.log(`    - ${reason}`);
        });
      }
      console.log(`    Trace ID: ${result.traceId}\n`);
    });
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const isLive = args.includes("--live");
  const dryRun = !isLive;

  if (isLive) {
    console.log("⚠️  Live mode requested but not yet implemented.");
    console.log("To enable live mode:");
    console.log("  1. Ensure NEXT_PUBLIC_GRAPH_LLM_BACKEND_URL is set");
    console.log("  2. Implement API integration in runner.ts");
    console.log("\nFalling back to dry mode...\n");
  }

  const summary = await runEvals(true); // Always dry run for now
  printSummary(summary);

  // Exit with non-zero code if any tests failed
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error running evals:", error);
  process.exit(1);
});

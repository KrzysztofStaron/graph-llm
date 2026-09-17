#!/usr/bin/env node
/**
 * Jev Gate Statistics Script
 * 
 * Analyzes the jev-gate-decisions.jsonl log file and prints statistics.
 * 
 * Usage: pnpm jev:stats
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'evals', 'jev-gate-decisions.jsonl');

function readLog() {
  if (!fs.existsSync(LOG_FILE)) {
    console.log('No Jev gate log found. Run some actions with the gate enabled first.');
    process.exit(0);
  }

  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function analyzeLog(entries) {
  if (entries.length === 0) {
    console.log('No entries in log file.');
    return;
  }

  const stats = {
    total: entries.length,
    bypassed: entries.filter(e => e.decision.bypassed).length,
    proceed: entries.filter(e => e.decision.finalAction === 'proceed').length,
    ask_user: entries.filter(e => e.decision.finalAction === 'ask_user').length,
    abort: entries.filter(e => e.decision.finalAction === 'abort').length,
    totalLatency: 0,
    avgLatency: 0,
    maxLatency: 0,
    minLatency: Infinity,
    highRisk: entries.filter(e => e.decision.riskScore >= 0.7).length,
    irreversible: entries.filter(e => e.decision.irreversible).length,
  };

  entries.forEach(entry => {
    stats.totalLatency += entry.decision.latencyMs || 0;
    stats.maxLatency = Math.max(stats.maxLatency, entry.decision.latencyMs || 0);
    stats.minLatency = Math.min(stats.minLatency, entry.decision.latencyMs || Infinity);
  });

  stats.avgLatency = stats.totalLatency / entries.length;

  console.log('\n=== Jev Gate Statistics ===\n');
  console.log(`Total decisions: ${stats.total}`);
  console.log(`Bypassed (no API key): ${stats.bypassed} (${(stats.bypassed / stats.total * 100).toFixed(1)}%)`);
  console.log('');
  console.log('Final Actions:');
  console.log(`  Proceed: ${stats.proceed} (${(stats.proceed / stats.total * 100).toFixed(1)}%)`);
  console.log(`  Ask User: ${stats.ask_user} (${(stats.ask_user / stats.total * 100).toFixed(1)}%)`);
  console.log(`  Abort: ${stats.abort} (${(stats.abort / stats.total * 100).toFixed(1)}%)`);
  console.log('');
  console.log(`High Risk Actions (≥0.7): ${stats.highRisk}`);
  console.log(`Irreversible Actions: ${stats.irreversible}`);
  console.log('');
  console.log('Latency:');
  console.log(`  Average: ${stats.avgLatency.toFixed(0)}ms`);
  console.log(`  Min: ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency.toFixed(0) + 'ms'}`);
  console.log(`  Max: ${stats.maxLatency.toFixed(0)}ms`);
  console.log('');

  // Recent entries
  console.log('Last 5 decisions:');
  entries.slice(-5).forEach(entry => {
    const timestamp = new Date(entry.timestamp).toLocaleString();
    const action = entry.decision.finalAction;
    const risk = entry.decision.riskScore.toFixed(2);
    const type = entry.actionContext.actionType;
    console.log(`  [${timestamp}] ${type} → ${action} (risk: ${risk})`);
  });
  console.log('');
}

const entries = readLog();
analyzeLog(entries);

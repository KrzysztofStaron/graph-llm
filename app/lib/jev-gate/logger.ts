/**
 * Logging for Jev gate decisions
 * 
 * Appends each decision to a JSONL file for later analysis.
 * Works in both Node.js and browser environments.
 */

import { JevDecision, ActionContext } from './types';

// Dynamically import fs only on server-side
let fs: any = null;
let path: any = null;

if (typeof window === 'undefined') {
  try {
    fs = require('fs');
    path = require('path');
  } catch (e) {
    // fs not available, skip
  }
}

function getEvalsDir() {
  if (!path) return null;
  return path.join(process.cwd(), 'evals');
}

function getLogFile() {
  const evalsDir = getEvalsDir();
  if (!evalsDir || !path) return null;
  return path.join(evalsDir, 'jev-gate-decisions.jsonl');
}

/**
 * Ensure the evals directory exists
 */
function ensureEvalsDir() {
  if (!fs || !path) return false;
  
  const evalsDir = getEvalsDir();
  if (!evalsDir) return false;

  try {
    if (!fs.existsSync(evalsDir)) {
      fs.mkdirSync(evalsDir, { recursive: true });
    }
    return true;
  } catch (error) {
    return false;
  }
}

export interface JevLogEntry {
  timestamp: string;
  actionContext: ActionContext;
  decision: JevDecision;
  nodeEnv?: string;
}

/**
 * Log a Jev gate decision to the JSONL file
 */
export function logJevDecision(context: ActionContext, decision: JevDecision): void {
  // Skip logging in browser environments
  if (typeof window !== 'undefined') {
    return;
  }

  // Skip if fs not available
  if (!fs) {
    return;
  }

  try {
    if (!ensureEvalsDir()) {
      return;
    }

    const logFile = getLogFile();
    if (!logFile) return;

    const entry: JevLogEntry = {
      timestamp: new Date().toISOString(),
      actionContext: context,
      decision,
      nodeEnv: process.env.NODE_ENV,
    };

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logFile, line, 'utf-8');
  } catch (error) {
    // Fail soft - don't crash the app if logging fails
    console.warn('[Jev Gate] Failed to log decision:', error);
  }
}

/**
 * Read all logged decisions from the JSONL file
 */
export function readJevLog(): JevLogEntry[] {
  if (typeof window !== 'undefined' || !fs) {
    return [];
  }

  try {
    const logFile = getLogFile();
    if (!logFile || !fs.existsSync(logFile)) {
      return [];
    }

    const content = fs.readFileSync(logFile, 'utf-8');
    return content
      .split('\n')
      .filter((line: string) => line.trim())
      .map((line: string) => JSON.parse(line));
  } catch (error) {
    console.warn('[Jev Gate] Failed to read log:', error);
    return [];
  }
}

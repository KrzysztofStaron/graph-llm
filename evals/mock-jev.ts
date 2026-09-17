/**
 * Mock implementation of Jev evaluate for testing without API key
 * 
 * Usage: Set JEV_MOCK_MODE=true to use this instead of real Jev
 */

import { ActionContext, JevDecision } from '../app/lib/jev-gate/types';

/**
 * Mock Jev evaluation - always approves safe-looking actions
 */
export async function mockVerifyAction(context: ActionContext): Promise<JevDecision> {
  // Simulate network latency
  const latencyMs = Math.random() * 100 + 50;
  await new Promise(resolve => setTimeout(resolve, latencyMs));

  // Simple heuristic: abort if description contains suspicious keywords
  const suspiciousKeywords = ['delete', 'remove', 'drop', 'destroy', 'harm', 'malicious'];
  const description = context.description.toLowerCase();
  const isAbort = suspiciousKeywords.some(keyword => description.includes(keyword));

  // Ask user if high risk patterns detected
  const highRiskKeywords = ['permanent', 'irreversible', 'critical', 'sensitive'];
  const isAskUser = highRiskKeywords.some(keyword => description.includes(keyword));

  let action: 'proceed' | 'ask_user' | 'abort' = 'proceed';
  let riskScore = 0.2;
  let irreversible = false;

  if (isAbort) {
    action = 'abort';
    riskScore = 0.9;
    irreversible = true;
  } else if (isAskUser) {
    action = 'ask_user';
    riskScore = 0.7;
    irreversible = true;
  }

  return {
    action,
    riskScore,
    irreversible,
    finalAction: action,
    reason: isAbort 
      ? 'Mock: Suspicious keywords detected'
      : isAskUser 
        ? 'Mock: High-risk pattern detected'
        : 'Mock: Action appears safe',
    confidence: 0.85,
    latencyMs,
    bypassed: false,
  };
}

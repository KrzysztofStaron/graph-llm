/**
 * Jev Verification Gate
 * 
 * Uses TypeSafe Jev via Vercel AI Gateway to verify agent actions
 * before they are executed.
 * 
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/evaluation
 */

import { experimental_evaluate as evaluate } from 'ai';
import { getJevGateConfig } from './config';
import { JevDecision, ActionContext, JevAction } from './types';
import { logJevDecision } from './logger';

/**
 * Call Jev to verify an action should be taken
 * 
 * @param context - Information about the action being verified
 * @returns Decision on whether to proceed, ask the user, or abort
 */
export async function verifyAction(context: ActionContext): Promise<JevDecision> {
  const config = getJevGateConfig();
  const startTime = Date.now();

  // If gate is disabled or no API key, bypass with proceed
  if (!config.enabled) {
    const decision: JevDecision = {
      action: 'proceed',
      riskScore: 0,
      irreversible: false,
      finalAction: 'proceed',
      latencyMs: 0,
      bypassed: true,
      bypassReason: process.env.AI_GATEWAY_API_KEY 
        ? 'JEV_GATE_ENABLED=false' 
        : 'Missing AI_GATEWAY_API_KEY',
    };

    logJevDecision(context, decision);
    return decision;
  }

  try {
    // Prepare state for Jev - ensure it's JSON-serializable
    const state = {
      actionType: context.actionType,
      description: context.description,
      userIntent: context.userIntent || 'unknown',
      recentMemory: context.recentMemory || '',
      model: context.model || 'unknown',
      metadata: context.metadata ? JSON.parse(JSON.stringify(context.metadata)) : {},
    };

    // Call Jev with parallel questions
    const result = await evaluate({
      model: 'typesafe-ai/jev',
      state,
      questions: {
        action: {
          type: 'choice' as const,
          instructions: 'Should the agent proceed with this action, ask the user for confirmation, or abort?',
          criteria: {
            proceed: 'The action is safe, reversible, and aligned with user intent',
            ask_user: 'The action is ambiguous or needs user confirmation',
            abort: 'The action is harmful, off-task, or a distraction',
          },
        },
        risk: {
          type: 'score' as const,
          instructions: 'How risky is this action? (0 = low risk, 1 = high risk)',
          criteria: ['Low risk', 'Medium risk', 'High risk'],
        },
        irreversible: {
          type: 'boolean' as const,
          instructions: 'Would this action be hard or impossible to undo?',
        },
      },
    });

    const latencyMs = Date.now() - startTime;

    // Extract results
    const action = result.answers.action.choice as JevAction;
    const actionProbabilities = result.answers.action.probabilities;
    
    // Calculate risk score from score result (0 to criteria.length-1, fractional)
    const riskScore = result.answers.risk.score / 2; // Normalize to 0-1 (we have 3 levels)
    
    const irreversible = result.answers.irreversible.probability >= 0.5;
    
    // Use action probability as confidence
    const confidence = actionProbabilities?.[action] || 0.5;

    // Apply config thresholds to determine final action
    let finalAction = action;
    let reason: string | undefined;

    // Force ask_user for high risk + irreversible
    if (
      config.forceAskOnHighRiskIrreversible &&
      riskScore >= config.highRiskThreshold &&
      irreversible
    ) {
      if (finalAction === 'proceed') {
        finalAction = 'ask_user';
        reason = `High risk (${riskScore.toFixed(2)}) + irreversible action requires user confirmation`;
      }
    }

    // Force ask_user for low confidence
    if (confidence !== undefined && confidence < config.lowConfidenceThreshold) {
      if (finalAction === 'proceed') {
        finalAction = 'ask_user';
        reason = `Low confidence (${confidence.toFixed(2)}) requires user confirmation`;
      }
    }

    const decision: JevDecision = {
      action,
      riskScore,
      irreversible,
      finalAction,
      reason,
      confidence,
      latencyMs,
      bypassed: false,
    };

    logJevDecision(context, decision);
    return decision;
  } catch (error) {
    // Fail soft - if Jev call fails, log and proceed with caution (ask_user)
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.warn('[Jev Gate] Verification failed, defaulting to ask_user:', errorMessage);

    const decision: JevDecision = {
      action: 'ask_user',
      riskScore: 0.5,
      irreversible: true,
      finalAction: 'ask_user',
      reason: `Jev verification failed: ${errorMessage}`,
      latencyMs,
      bypassed: false,
    };

    logJevDecision(context, decision);
    return decision;
  }
}

export * from './types';
export * from './config';
export * from './logger';

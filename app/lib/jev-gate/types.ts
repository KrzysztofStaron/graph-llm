/**
 * Types for Jev verification gate
 */

export type JevAction = 'proceed' | 'ask_user' | 'abort';

export interface JevDecision {
  /**
   * The recommended action: proceed, ask_user, or abort
   */
  action: JevAction;

  /**
   * Risk score from 0 (low) to 1 (high)
   */
  riskScore: number;

  /**
   * Whether this action would be hard or impossible to undo
   */
  irreversible: boolean;

  /**
   * Final decision after applying config thresholds
   */
  finalAction: JevAction;

  /**
   * Human-readable reason for the decision
   */
  reason?: string;

  /**
   * Confidence in the decision (0-1)
   */
  confidence?: number;

  /**
   * Latency of the Jev call in milliseconds
   */
  latencyMs: number;

  /**
   * Whether the gate was bypassed (e.g., missing API key)
   */
  bypassed: boolean;

  /**
   * Bypass reason if applicable
   */
  bypassReason?: string;
}

export interface ActionContext {
  /**
   * Type of action being taken
   */
  actionType: 'chat' | 'stream_chat' | 'tool_call' | 'api_request';

  /**
   * Description of the action
   */
  description: string;

  /**
   * Recent context/memory
   */
  recentMemory?: string;

  /**
   * User intent or query
   */
  userIntent?: string;

  /**
   * Model being used
   */
  model?: string;

  /**
   * Any additional context
   */
  metadata?: Record<string, unknown>;
}

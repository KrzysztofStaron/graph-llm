/**
 * Configuration for Jev verification gate
 * 
 * Controls when the agent should proceed, ask the user, or abort actions.
 */

export interface JevGateConfig {
  /**
   * Whether the Jev gate is enabled.
   * Defaults to true when AI_GATEWAY_API_KEY is present.
   */
  enabled: boolean;

  /**
   * High risk + irreversible actions should always ask the user,
   * even if Jev says proceed.
   */
  forceAskOnHighRiskIrreversible: boolean;

  /**
   * Risk score threshold (0-1) above which we consider an action "high risk"
   */
  highRiskThreshold: number;

  /**
   * Confidence threshold (0-1) below which we should ask the user
   * regardless of the recommended action
   */
  lowConfidenceThreshold: number;
}

export const defaultJevGateConfig: JevGateConfig = {
  enabled: typeof process !== 'undefined' && !!process.env.AI_GATEWAY_API_KEY,
  forceAskOnHighRiskIrreversible: true,
  highRiskThreshold: 0.7,
  lowConfidenceThreshold: 0.6,
};

/**
 * Get the current Jev gate configuration.
 * Can be overridden via environment variables.
 */
export function getJevGateConfig(): JevGateConfig {
  return {
    enabled: process.env.JEV_GATE_ENABLED !== 'false' && defaultJevGateConfig.enabled,
    forceAskOnHighRiskIrreversible: process.env.JEV_FORCE_ASK_HIGH_RISK !== 'false',
    highRiskThreshold: parseFloat(process.env.JEV_HIGH_RISK_THRESHOLD || String(defaultJevGateConfig.highRiskThreshold)),
    lowConfidenceThreshold: parseFloat(process.env.JEV_LOW_CONFIDENCE_THRESHOLD || String(defaultJevGateConfig.lowConfidenceThreshold)),
  };
}

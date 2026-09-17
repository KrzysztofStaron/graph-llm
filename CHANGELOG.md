# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Jev Verification Gate**: TypeSafe Jev integration via Vercel AI Gateway to verify agent actions before execution
  - Evaluates actions for safety, risk, and reversibility
  - Three decision modes: `proceed`, `ask_user`, `abort`
  - Configurable risk and confidence thresholds
  - Comprehensive logging to `evals/jev-gate-decisions.jsonl`
  - Graceful degradation when API key is missing (logs warning, bypasses gate)
  - Replaces ad-hoc LLM-as-judge patterns with systematic verification
- AI SDK 7.0.105 with `experimental_evaluate` for Jev integration
- Configuration via environment variables for gate behavior tuning
- Evaluation analytics script (`pnpm jev:stats`) for pass/ask/abort rates and latency metrics

### Changed
- `aiService.chat()` now runs through Jev gate before making API calls
- `aiService.streamChat()` now runs through Jev gate before streaming responses
- Enhanced error messages to surface Jev decisions to users when actions are blocked

### Security
- API keys never committed or logged (only presence/absence is logged)
- Fail-soft architecture: missing API key or Jev errors default to safe behavior

## [0.1.0] - Initial Release
- Initial graph-based LLM chat interface

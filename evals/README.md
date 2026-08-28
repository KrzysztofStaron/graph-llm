# Eval Harness

A lightweight eval harness for testing agent quality and cost.

## Usage

### Dry Run (Default)

Run evals without making actual API calls. Uses mock responses for quick validation:

```bash
pnpm eval
```

This is useful for:
- CI/CD pipelines
- Local development without API access
- Quick smoke testing

### Live Mode (Future)

To run evals against the live API (requires credentials):

```bash
pnpm eval --live
```

**Note:** Live mode is not yet implemented. To enable it:
1. Ensure `NEXT_PUBLIC_GRAPH_LLM_BACKEND_URL` environment variable is set
2. Implement API integration in `runner.ts` using the existing `aiService`

## Adding Tests

Edit `fixtures.ts` to add new test cases:

```typescript
{
  id: "your-test-id",
  query: "Your test question",
  expectedKeywords: ["keyword1", "keyword2"], // Optional
  shouldNotContain: ["error", "fail"],        // Optional
  minLength: 10,                              // Optional
  maxLength: 500,                             // Optional
}
```

## Metrics

The harness tracks:
- **Pass Rate**: Percentage of tests passing validation criteria
- **Cost per Task**: Estimated cost of each API call (based on model pricing)
- **Latency**: Response time for each query
- **Trace IDs**: For debugging with existing Loki observability stack

## Integration

The eval harness integrates with existing tracing infrastructure:
- Uses same `traceId` pattern as the app (`app/utils/traceId.ts`)
- Can be extended to send logs to Loki (`app/api/sendToLoki.ts`)
- Future: Wire into the actual `aiService` for live testing

#!/usr/bin/env node
/**
 * Dry-run test for Jev gate
 * 
 * Tests basic configuration and validates the gate exists.
 * Safe to run in CI without API key.
 * 
 * Usage: node evals/test-jev-gate.js
 */

const fs = require('fs');
const path = require('path');

console.log('=== Jev Gate Dry Run Test ===\n');

try {
  // Test 1: Verify Jev gate modules exist
  console.log('Test 1: Checking Jev gate modules...');
  const gateIndexPath = path.join(process.cwd(), 'app', 'lib', 'jev-gate', 'index.ts');
  const gateConfigPath = path.join(process.cwd(), 'app', 'lib', 'jev-gate', 'config.ts');
  const gateTypesPath = path.join(process.cwd(), 'app', 'lib', 'jev-gate', 'types.ts');
  const gateLoggerPath = path.join(process.cwd(), 'app', 'lib', 'jev-gate', 'logger.ts');

  if (!fs.existsSync(gateIndexPath)) {
    throw new Error('Jev gate index.ts not found');
  }
  if (!fs.existsSync(gateConfigPath)) {
    throw new Error('Jev gate config.ts not found');
  }
  if (!fs.existsSync(gateTypesPath)) {
    throw new Error('Jev gate types.ts not found');
  }
  if (!fs.existsSync(gateLoggerPath)) {
    throw new Error('Jev gate logger.ts not found');
  }
  console.log('  ✓ All Jev gate modules found');
  console.log('');

  // Test 2: Verify integration in aiService
  console.log('Test 2: Checking aiService integration...');
  const aiServicePath = path.join(process.cwd(), 'app', 'interfaces', 'aiService.ts');
  const aiServiceContent = fs.readFileSync(aiServicePath, 'utf-8');

  if (!aiServiceContent.includes("import { verifyAction")) {
    throw new Error('aiService missing Jev gate import');
  }
  if (!aiServiceContent.includes("await verifyAction")) {
    throw new Error('aiService not calling verifyAction');
  }
  console.log('  ✓ aiService properly integrated');
  console.log('');

  // Test 3: Verify environment example
  console.log('Test 3: Checking .env.example...');
  const envExamplePath = path.join(process.cwd(), '.env.example');
  if (!fs.existsSync(envExamplePath)) {
    throw new Error('.env.example not found');
  }
  const envContent = fs.readFileSync(envExamplePath, 'utf-8');
  if (!envContent.includes('AI_GATEWAY_API_KEY')) {
    throw new Error('.env.example missing AI_GATEWAY_API_KEY');
  }
  console.log('  ✓ .env.example configured');
  console.log('');

  // Test 4: Verify CHANGELOG
  console.log('Test 4: Checking CHANGELOG...');
  const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    throw new Error('CHANGELOG.md not found');
  }
  const changelogContent = fs.readFileSync(changelogPath, 'utf-8');
  if (!changelogContent.includes('Jev Verification Gate')) {
    throw new Error('CHANGELOG missing Jev gate entry');
  }
  console.log('  ✓ CHANGELOG updated');
  console.log('');

  // Test 5: Verify package.json scripts
  console.log('Test 5: Checking package.json scripts...');
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  
  if (!packageContent.scripts['jev:stats']) {
    throw new Error('package.json missing jev:stats script');
  }
  if (!packageContent.scripts['jev:test']) {
    throw new Error('package.json missing jev:test script');
  }
  console.log('  ✓ package.json scripts configured');
  console.log('');

  // Test 6: Verify AI SDK dependency
  console.log('Test 6: Checking AI SDK dependency...');
  if (!packageContent.dependencies.ai) {
    throw new Error('package.json missing ai dependency');
  }
  const aiVersion = packageContent.dependencies.ai;
  console.log(`  ✓ AI SDK ${aiVersion} installed`);
  console.log('');

  // Test 7: Verify evals directory structure
  console.log('Test 7: Checking evals directory...');
  const evalsDir = path.join(process.cwd(), 'evals');
  if (!fs.existsSync(evalsDir)) {
    fs.mkdirSync(evalsDir, { recursive: true });
    console.log('  ✓ evals directory created');
  } else {
    console.log('  ✓ evals directory exists');
  }

  const mockJevPath = path.join(evalsDir, 'mock-jev.ts');
  if (!fs.existsSync(mockJevPath)) {
    throw new Error('mock-jev.ts not found');
  }
  console.log('  ✓ mock-jev.ts exists');
  console.log('');

  console.log('✅ All tests passed!\n');
  console.log('Summary:');
  console.log('  - Jev verification gate modules: ✓');
  console.log('  - aiService integration: ✓');
  console.log('  - Configuration files: ✓');
  console.log('  - Scripts and dependencies: ✓');
  console.log('  - Evals infrastructure: ✓');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Set AI_GATEWAY_API_KEY in .env to enable the gate');
  console.log('  2. Run the app and make some AI requests');
  console.log('  3. Check evals/jev-gate-decisions.jsonl for logged decisions');
  console.log('  4. Run "pnpm jev:stats" to see analytics');
  console.log('');
  console.log('Note: Without AI_GATEWAY_API_KEY, gate bypasses with "proceed" (safe default).\n');

  process.exit(0);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}

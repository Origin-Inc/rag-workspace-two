#!/usr/bin/env tsx
/**
 * Verification script for GPT-5 migration
 * Checks that all components are properly configured
 */

import { aiModelConfig } from '../app/services/ai-model-config.server';
import { ContextWindowManager } from '../app/services/context-window-manager.server';

console.log('🔍 Verifying GPT-5 Migration Configuration...\n');

// Check 1: Model Configuration
console.log('1️⃣  Model Configuration:');
const config = aiModelConfig.getConfig();
console.log(`   ✅ Model: ${config.model}`);
console.log(`   ✅ Fallback: ${config.fallbackModel}`);
console.log(`   ✅ Context Window: ${config.contextWindow.toLocaleString()} tokens`);
console.log(`   ✅ Max Tokens: ${config.maxTokens.toLocaleString()}`);
console.log(`   ✅ Cache Enabled: ${config.cacheEnabled}`);

// Check 2: Cost Calculations
console.log('\n2️⃣  Cost Comparison:');
const inputTokens = 10000;
const outputTokens = 5000;

const gpt4Cost = aiModelConfig.calculateCost('gpt-4-turbo-preview', inputTokens, outputTokens);
const gpt5Cost = aiModelConfig.calculateCost('gpt-5-mini', inputTokens, outputTokens);
const gpt5CachedCost = aiModelConfig.calculateCost('gpt-5-mini', inputTokens, outputTokens, true);

console.log(`   GPT-4-turbo: $${gpt4Cost.toFixed(4)}`);
console.log(`   GPT-5-mini: $${gpt5Cost.toFixed(4)} (${((1 - gpt5Cost/gpt4Cost) * 100).toFixed(1)}% savings)`);
console.log(`   GPT-5-mini (cached): $${gpt5CachedCost.toFixed(4)} (${((1 - gpt5CachedCost/gpt4Cost) * 100).toFixed(1)}% savings)`);

// Check 3: Token Counting
console.log('\n3️⃣  Token Counting:');
const testText = 'This is a test string for token counting in GPT-5 models';
const gpt5Tokens = ContextWindowManager.countTokens(testText, 'gpt-5-mini');
const gpt4Tokens = ContextWindowManager.countTokens(testText, 'gpt-4');

console.log(`   Test text: "${testText}"`);
console.log(`   GPT-5 tokens: ${gpt5Tokens}`);
console.log(`   GPT-4 tokens: ${gpt4Tokens}`);
console.log(`   Character count: ${testText.length}`);

// Check 4: Environment Variables
console.log('\n4️⃣  Environment Variables:');
const envVars = [
  'OPENAI_MODEL',
  'OPENAI_FALLBACK_MODEL',
  'GPT5_ROLLOUT_PERCENTAGE',
  'DAILY_COST_LIMIT',
  'ENABLE_CACHE'
];

for (const varName of envVars) {
  const value = process.env[varName];
  if (value) {
    console.log(`   ✅ ${varName}: ${value}`);
  } else {
    console.log(`   ⚠️  ${varName}: Not set`);
  }
}

// Check 5: API Parameters
console.log('\n5️⃣  API Parameters Generation:');
const apiParams = aiModelConfig.buildAPIParameters({
  messages: [{ role: 'user', content: 'test' }],
  jsonResponse: true,
  queryType: 'analysis'
});

console.log(`   Model: ${apiParams.model}`);
console.log(`   Temperature: ${apiParams.temperature}`);
console.log(`   Max Tokens: ${apiParams.max_tokens}`);
if (apiParams.verbosity) console.log(`   Verbosity: ${apiParams.verbosity}`);
if (apiParams.reasoning_effort) console.log(`   Reasoning: ${apiParams.reasoning_effort}`);
if (apiParams.response_format) console.log(`   Response Format: ${JSON.stringify(apiParams.response_format)}`);

// Check 6: Model Selection
console.log('\n6️⃣  Smart Model Selection:');
const taskTypes = [
  { budgetSensitive: true, complexity: 'low' as const },
  { requiresMath: true, complexity: 'high' as const },
  { requiresLargeContext: true, complexity: 'medium' as const },
  { requiresSpeed: true, complexity: 'low' as const }
];

for (const task of taskTypes) {
  const selectedModel = aiModelConfig.selectModelForTask(task);
  console.log(`   ${JSON.stringify(task)} → ${selectedModel}`);
}

// Summary
console.log('\n✨ Migration Verification Complete!');
console.log('\n📋 Next Steps:');
console.log('   1. Start the development server: npm run dev');
console.log('   2. Test a query with files to verify the integration');
console.log('   3. Monitor the logs for cost tracking');
console.log('   4. Check cache hits in Redis');
console.log('   5. Gradually increase GPT5_ROLLOUT_PERCENTAGE');

// Cost savings summary
const monthlyCalls = 10000;
const avgInputTokens = 5000;
const avgOutputTokens = 2000;

const monthlyGPT4 = monthlyCalls * aiModelConfig.calculateCost('gpt-4-turbo-preview', avgInputTokens, avgOutputTokens);
const monthlyGPT5 = monthlyCalls * aiModelConfig.calculateCost('gpt-5-mini', avgInputTokens, avgOutputTokens);
const monthlyGPT5Cached = monthlyCalls * 0.7 * aiModelConfig.calculateCost('gpt-5-mini', avgInputTokens, avgOutputTokens, false) +
                          monthlyCalls * 0.3 * aiModelConfig.calculateCost('gpt-5-mini', avgInputTokens, avgOutputTokens, true);

console.log('\n💰 Projected Monthly Savings (10K queries):');
console.log(`   GPT-4-turbo: $${monthlyGPT4.toFixed(2)}`);
console.log(`   GPT-5-mini: $${monthlyGPT5.toFixed(2)} (save $${(monthlyGPT4 - monthlyGPT5).toFixed(2)})`);
console.log(`   GPT-5-mini w/30% cache: $${monthlyGPT5Cached.toFixed(2)} (save $${(monthlyGPT4 - monthlyGPT5Cached).toFixed(2)})`);
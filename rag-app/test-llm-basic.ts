#!/usr/bin/env node

/**
 * Basic validation test for LLM Orchestration components
 * Tests that all modules can be imported and instantiated
 */

import { config } from 'dotenv';
config();

async function validateComponents() {
  console.log('🔍 Validating LLM Orchestration Components\n');
  console.log('=' .repeat(50));
  
  const results: { component: string; status: 'pass' | 'fail'; error?: string }[] = [];
  
  // Test 1: Intent Classifier
  try {
    const { IntentClassificationService, QueryIntent } = await import('./app/services/llm-orchestration/intent-classifier.server');
    const classifier = new IntentClassificationService();
    console.log('✅ Intent Classifier: Loaded successfully');
    
    // Check enums are exported
    if (QueryIntent.DATA_QUERY && QueryIntent.CONTENT_SEARCH) {
      console.log('  ✓ Query intents enum available');
    }
    
    results.push({ component: 'IntentClassifier', status: 'pass' });
  } catch (error) {
    console.log('❌ Intent Classifier: Failed to load');
    console.log(`  Error: ${error}`);
    results.push({ component: 'IntentClassifier', status: 'fail', error: String(error) });
  }
  
  // Test 2: Context Extractor
  try {
    const { ContextExtractionEngine } = await import('./app/services/llm-orchestration/context-extractor.server');
    const extractor = new ContextExtractionEngine();
    console.log('✅ Context Extractor: Loaded successfully');
    results.push({ component: 'ContextExtractor', status: 'pass' });
  } catch (error) {
    console.log('❌ Context Extractor: Failed to load');
    console.log(`  Error: ${error}`);
    results.push({ component: 'ContextExtractor', status: 'fail', error: String(error) });
  }
  
  // Test 3: Query Router
  try {
    const { QueryRouter, RouteType } = await import('./app/services/llm-orchestration/query-router.server');
    const router = new QueryRouter();
    console.log('✅ Query Router: Loaded successfully');
    
    // Check route types
    if (RouteType.DATABASE_QUERY && RouteType.RAG_SEARCH) {
      console.log('  ✓ Route types enum available');
    }
    
    results.push({ component: 'QueryRouter', status: 'pass' });
  } catch (error) {
    console.log('❌ Query Router: Failed to load');
    console.log(`  Error: ${error}`);
    results.push({ component: 'QueryRouter', status: 'fail', error: String(error) });
  }
  
  // Test 4: Route Handlers
  try {
    const { RouteHandlers } = await import('./app/services/llm-orchestration/route-handlers.server');
    const handlers = new RouteHandlers();
    console.log('✅ Route Handlers: Loaded successfully');
    results.push({ component: 'RouteHandlers', status: 'pass' });
  } catch (error) {
    console.log('❌ Route Handlers: Failed to load');
    console.log(`  Error: ${error}`);
    results.push({ component: 'RouteHandlers', status: 'fail', error: String(error) });
  }
  
  // Test 5: Structured Output Generator
  try {
    const { StructuredOutputGenerator } = await import('./app/services/llm-orchestration/structured-output.server');
    const generator = new StructuredOutputGenerator();
    console.log('✅ Structured Output Generator: Loaded successfully');
    
    // Test validation method exists
    if (typeof generator.validateResponse === 'function') {
      console.log('  ✓ Validation method available');
    }
    
    results.push({ component: 'StructuredOutputGenerator', status: 'pass' });
  } catch (error) {
    console.log('❌ Structured Output Generator: Failed to load');
    console.log(`  Error: ${error}`);
    results.push({ component: 'StructuredOutputGenerator', status: 'fail', error: String(error) });
  }
  
  // Test 6: Main Orchestrator
  try {
    const { LLMOrchestrator } = await import('./app/services/llm-orchestration/orchestrator.server');
    const orchestrator = new LLMOrchestrator();
    console.log('✅ LLM Orchestrator: Loaded successfully');
    
    // Test cache methods exist
    if (typeof orchestrator.clearCache === 'function' && typeof orchestrator.getCacheStats === 'function') {
      console.log('  ✓ Cache management methods available');
      const stats = orchestrator.getCacheStats();
      console.log(`  ✓ Cache stats: Size=${stats.size}, MaxSize=${stats.maxSize}, TTL=${stats.ttl}s`);
    }
    
    results.push({ component: 'LLMOrchestrator', status: 'pass' });
  } catch (error) {
    console.log('❌ LLM Orchestrator: Failed to load');
    console.log(`  Error: ${error}`);
    results.push({ component: 'LLMOrchestrator', status: 'fail', error: String(error) });
  }
  
  // Test 7: API Endpoint (check if file exists)
  try {
    const fs = await import('fs/promises');
    const apiPath = './app/routes/api.llm-orchestration.tsx';
    await fs.access(apiPath);
    console.log('✅ API Endpoint: File exists');
    results.push({ component: 'APIEndpoint', status: 'pass' });
  } catch (error) {
    console.log('❌ API Endpoint: File not found');
    results.push({ component: 'APIEndpoint', status: 'fail', error: 'File not found' });
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Validation Summary:\n');
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  
  console.log(`✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  console.log(`📈 Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Components:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`  - ${r.component}: ${r.error}`);
    });
  }
  
  // Test OpenAI configuration
  console.log('\n' + '='.repeat(50));
  console.log('🔑 Checking OpenAI Configuration:\n');
  
  if (process.env.OPENAI_API_KEY) {
    console.log('✅ OPENAI_API_KEY is configured');
    console.log(`  Key length: ${process.env.OPENAI_API_KEY.length} characters`);
  } else {
    console.log('⚠️  OPENAI_API_KEY is not configured');
    console.log('  The orchestration layer requires OpenAI API access to function');
  }
  
  // Test dependencies
  console.log('\n' + '='.repeat(50));
  console.log('📦 Checking Dependencies:\n');
  
  const requiredDeps = ['openai', 'zod', '@remix-run/node'];
  for (const dep of requiredDeps) {
    try {
      await import(dep);
      console.log(`✅ ${dep}: Installed`);
    } catch {
      console.log(`❌ ${dep}: Not installed`);
    }
  }
  
  console.log('\n✅ Validation complete!');
}

// Run validation
validateComponents().catch(console.error);
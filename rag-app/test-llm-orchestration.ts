#!/usr/bin/env node

/**
 * Integration test for LLM Orchestration Layer
 * Tests the complete flow with real-world scenarios
 */

import { config } from 'dotenv';
config();

// Test queries covering different intents
const TEST_QUERIES = [
  // Data queries
  {
    query: "show my pending tasks",
    expectedIntent: "data_query",
    expectedResponseType: "table"
  },
  {
    query: "how many projects are active?",
    expectedIntent: "data_query",
    expectedResponseType: "text"
  },
  
  // Content search
  {
    query: "find documentation about authentication",
    expectedIntent: "content_search",
    expectedResponseType: "text"
  },
  
  // Analytics
  {
    query: "show revenue trends for last quarter",
    expectedIntent: "analytics",
    expectedResponseType: "chart"
  },
  {
    query: "what's the average task completion time?",
    expectedIntent: "analytics",
    expectedResponseType: "text"
  },
  
  // Summaries
  {
    query: "summarize the current project status",
    expectedIntent: "summary",
    expectedResponseType: "mixed"
  },
  
  // Actions
  {
    query: "create a new bug report task",
    expectedIntent: "action",
    expectedResponseType: "action_confirmation"
  },
  
  // Complex queries
  {
    query: "show me all high priority tasks from last week and their completion status",
    expectedIntent: "data_query",
    expectedResponseType: "table"
  }
];

async function testOrchestration() {
  console.log('🧪 Testing LLM Orchestration Layer\n');
  console.log('=' .repeat(50));
  
  const API_URL = 'http://localhost:3001/api/llm-orchestration';
  const WORKSPACE_ID = 'test-workspace-id';
  
  // Test authentication token (mock for testing)
  const AUTH_TOKEN = 'test-token';
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of TEST_QUERIES) {
    console.log(`\n📝 Testing: "${testCase.query}"`);
    console.log('-'.repeat(40));
    
    try {
      const startTime = Date.now();
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify({
          query: testCase.query,
          workspaceId: WORKSPACE_ID,
          options: {
            includeDebug: true,
            maxResponseTime: 5000
          }
        })
      });
      
      const responseTime = Date.now() - startTime;
      const result = await response.json();
      
      // Validate response structure
      console.log(`✓ Response received in ${responseTime}ms`);
      
      if (result.success) {
        console.log(`✓ Query processed successfully`);
        
        // Check response structure
        if (result.response && result.response.blocks) {
          console.log(`✓ Response has ${result.response.blocks.length} blocks`);
          
          // Log block types
          const blockTypes = result.response.blocks.map((b: any) => b.type);
          console.log(`  Block types: ${blockTypes.join(', ')}`);
        }
        
        // Check debug info
        if (result.debug) {
          console.log(`✓ Debug info: Intent=${result.debug.intent}, Confidence=${result.debug.confidence}`);
          
          if (result.debug.intent === testCase.expectedIntent) {
            console.log(`✓ Intent classification correct`);
          } else {
            console.log(`⚠️  Expected intent: ${testCase.expectedIntent}, Got: ${result.debug.intent}`);
          }
        }
        
        // Check performance metrics
        if (result.performance) {
          console.log(`✓ Performance metrics:`);
          console.log(`  - Intent classification: ${result.performance.intentClassificationTime}ms`);
          console.log(`  - Context extraction: ${result.performance.contextExtractionTime}ms`);
          console.log(`  - Routing: ${result.performance.routingTime}ms`);
          console.log(`  - Execution: ${result.performance.executionTime}ms`);
          console.log(`  - Structuring: ${result.performance.structuringTime}ms`);
          console.log(`  - Total: ${result.performance.totalTime}ms`);
          
          // Check if under 2 seconds
          if (result.performance.totalTime < 2000) {
            console.log(`✓ Response time under 2 seconds target`);
          } else {
            console.log(`⚠️  Response time exceeded 2 seconds`);
          }
        }
        
        passedTests++;
      } else {
        console.log(`❌ Query failed: ${result.error || 'Unknown error'}`);
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ Test failed with error: ${error}`);
      failedTests++;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`✅ Passed: ${passedTests}/${TEST_QUERIES.length}`);
  console.log(`❌ Failed: ${failedTests}/${TEST_QUERIES.length}`);
  console.log(`📈 Success Rate: ${((passedTests / TEST_QUERIES.length) * 100).toFixed(1)}%`);
  
  // Test cache functionality
  console.log('\n' + '='.repeat(50));
  console.log('🔄 Testing Cache Functionality\n');
  
  const cacheTestQuery = "show my tasks";
  console.log(`Testing cache with query: "${cacheTestQuery}"`);
  
  // First call
  const firstCallStart = Date.now();
  await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({
      query: cacheTestQuery,
      workspaceId: WORKSPACE_ID
    })
  });
  const firstCallTime = Date.now() - firstCallStart;
  console.log(`First call: ${firstCallTime}ms`);
  
  // Second call (should be cached)
  const secondCallStart = Date.now();
  await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({
      query: cacheTestQuery,
      workspaceId: WORKSPACE_ID
    })
  });
  const secondCallTime = Date.now() - secondCallStart;
  console.log(`Second call (cached): ${secondCallTime}ms`);
  
  if (secondCallTime < firstCallTime * 0.5) {
    console.log('✓ Cache is working (second call >50% faster)');
  } else {
    console.log('⚠️  Cache may not be working effectively');
  }
  
  // Test error handling
  console.log('\n' + '='.repeat(50));
  console.log('🔥 Testing Error Handling\n');
  
  // Test with invalid workspace
  console.log('Testing with invalid workspace ID...');
  const errorResponse = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`
    },
    body: JSON.stringify({
      query: "test query",
      workspaceId: "invalid-workspace-id"
    })
  });
  
  const errorResult = await errorResponse.json();
  if (!errorResult.success && errorResult.response && errorResult.response.blocks) {
    console.log('✓ Error handling working correctly');
  } else {
    console.log('❌ Error handling may have issues');
  }
  
  console.log('\n✅ Integration tests complete!');
}

// Run tests
testOrchestration().catch(console.error);
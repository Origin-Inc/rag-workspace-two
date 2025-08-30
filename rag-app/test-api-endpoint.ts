#!/usr/bin/env node

/**
 * Test the LLM Orchestration API endpoint
 */

async function testEndpoint() {
  console.log('🧪 Testing LLM Orchestration API Endpoint\n');
  
  const API_URL = 'http://localhost:3001/api/llm-orchestration';
  
  // Test 1: Check if endpoint exists (GET request for stats)
  console.log('1. Testing GET endpoint (stats)...');
  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Cookie': 'auth-session=test' // Mock auth
      }
    });
    
    if (response.status === 401) {
      console.log('  ⚠️  Endpoint exists but requires authentication');
    } else if (response.ok) {
      const data = await response.json();
      console.log('  ✅ Stats endpoint working');
      console.log(`     Cache stats: ${JSON.stringify(data.cache)}`);
    } else {
      console.log(`  ❌ Unexpected status: ${response.status}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed to reach endpoint: ${error}`);
  }
  
  // Test 2: Test POST endpoint with a simple query
  console.log('\n2. Testing POST endpoint (query processing)...');
  try {
    const testQuery = {
      query: "show my tasks",
      workspaceId: "550e8400-e29b-41d4-a716-446655440000", // Valid UUID
      options: {
        includeDebug: true,
        maxResponseTime: 5000
      }
    };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'auth-session=test' // Mock auth
      },
      body: JSON.stringify(testQuery)
    });
    
    console.log(`  Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log('  ⚠️  Authentication required - this is expected');
      console.log('  ℹ️  In production, proper auth tokens would be needed');
    } else if (response.ok) {
      const data = await response.json();
      console.log('  ✅ Query processed successfully');
      
      if (data.success) {
        console.log(`     Response blocks: ${data.response?.blocks?.length || 0}`);
        console.log(`     Performance: ${data.performance?.totalTime}ms`);
        if (data.debug) {
          console.log(`     Debug - Intent: ${data.debug.intent}, Confidence: ${data.debug.confidence}`);
        }
      } else {
        console.log(`     ⚠️  Processing failed: ${data.error}`);
      }
    } else {
      const errorData = await response.text();
      console.log(`  ❌ Error response: ${errorData.substring(0, 200)}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed to call endpoint: ${error}`);
  }
  
  // Test 3: Test with invalid data
  console.log('\n3. Testing error handling (invalid request)...');
  try {
    const invalidQuery = {
      // Missing required fields
      options: {}
    };
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'auth-session=test'
      },
      body: JSON.stringify(invalidQuery)
    });
    
    if (response.status === 400) {
      console.log('  ✅ Invalid request correctly rejected');
    } else if (response.status === 401) {
      console.log('  ⚠️  Auth check happens before validation');
    } else {
      console.log(`  ⚠️  Unexpected status for invalid request: ${response.status}`);
    }
  } catch (error) {
    console.log(`  ❌ Failed: ${error}`);
  }
  
  console.log('\n✅ API endpoint tests complete!');
}

// Run test
testEndpoint().catch(console.error);
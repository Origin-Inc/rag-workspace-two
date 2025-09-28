#!/usr/bin/env node

const fetch = require('node-fetch');

// Test CSV data
const testCSVData = {
  query: "What is the total number of cases in this COVID data?",
  files: [
    {
      filename: "test-covid.csv",
      type: "csv",
      rowCount: 10,
      data: [
        { country: "USA", cases: 1000, deaths: 50, date: "2024-01-01" },
        { country: "UK", cases: 800, deaths: 40, date: "2024-01-01" },
        { country: "France", cases: 700, deaths: 35, date: "2024-01-01" },
        { country: "Germany", cases: 900, deaths: 45, date: "2024-01-01" },
        { country: "Italy", cases: 600, deaths: 30, date: "2024-01-01" }
      ],
      schema: {
        columns: [
          { name: "country", type: "string" },
          { name: "cases", type: "number" },
          { name: "deaths", type: "number" },
          { name: "date", type: "string" }
        ]
      }
    }
  ],
  pageId: "test-page-123",
  workspaceId: "test-workspace-456"
};

async function testCSVFlow() {
  console.log('Testing CSV processing flow...\n');
  console.log('Test data:', JSON.stringify(testCSVData, null, 2));
  
  try {
    // First need to login
    console.log('\n1. Logging in...');
    const loginResponse = await fetch('http://localhost:3003/auth/dev-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'redirectTo=/app',
      redirect: 'manual'
    });
    
    const cookies = loginResponse.headers.raw()['set-cookie'];
    if (!cookies) {
      console.error('Failed to get auth cookies');
      return;
    }
    
    console.log('✓ Logged in successfully');
    
    // Now make the query
    console.log('\n2. Sending CSV query...');
    const response = await fetch('http://localhost:3003/api/chat-query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies.join('; ')
      },
      body: JSON.stringify(testCSVData)
    });
    
    const result = await response.json();
    
    console.log('\n3. Response received:');
    console.log('Status:', response.status);
    console.log('Result:', JSON.stringify(result, null, 2));
    
    // Check for tokens
    console.log('\n4. Token Analysis:');
    console.log('Total tokens used:', result.metadata?.totalTokens || 0);
    console.log('Model used:', result.metadata?.model || 'unknown');
    
    if (result.metadata?.totalTokens === 0) {
      console.error('\n⚠️  CRITICAL: No tokens were used - OpenAI was NOT called!');
    } else {
      console.log('\n✓ OpenAI was called successfully');
    }
    
    // Check for generic response
    if (result.content?.includes('The content analysis reveals:') || 
        result.content?.includes('Unable to extract')) {
      console.error('\n⚠️  WARNING: Generic response detected!');
      console.log('Response preview:', result.content.slice(0, 200));
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testCSVFlow();
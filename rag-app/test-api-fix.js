// Test script for API error fix
const testAPIEndpoint = async () => {
  try {
    // Test 1: Call with undefined conversationHistory
    console.log('Test 1: Undefined conversationHistory');
    const response1 = await fetch('http://localhost:3001/api/chat-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test query',
        files: [],
        pageId: 'test-page',
        workspaceId: 'test-workspace'
        // conversationHistory is undefined
      })
    });
    console.log('Response 1 status:', response1.status);
    if (!response1.ok) {
      const text = await response1.text();
      console.log('Response 1 error:', text);
    }

    // Test 2: Call with null conversationHistory
    console.log('\nTest 2: Null conversationHistory');
    const response2 = await fetch('http://localhost:3001/api/chat-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test query',
        files: [],
        pageId: 'test-page',
        workspaceId: 'test-workspace',
        conversationHistory: null
      })
    });
    console.log('Response 2 status:', response2.status);
    if (!response2.ok) {
      const text = await response2.text();
      console.log('Response 2 error:', text);
    }

    // Test 3: Call with empty array conversationHistory
    console.log('\nTest 3: Empty array conversationHistory');
    const response3 = await fetch('http://localhost:3001/api/chat-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test query',
        files: [],
        pageId: 'test-page',
        workspaceId: 'test-workspace',
        conversationHistory: []
      })
    });
    console.log('Response 3 status:', response3.status);

    // Test 4: Call with valid conversationHistory
    console.log('\nTest 4: Valid conversationHistory');
    const response4 = await fetch('http://localhost:3001/api/chat-query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'test query',
        files: [],
        pageId: 'test-page',
        workspaceId: 'test-workspace',
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' }
        ]
      })
    });
    console.log('Response 4 status:', response4.status);

    console.log('\n✅ All tests completed');
  } catch (error) {
    console.error('Test error:', error);
  }
};

testAPIEndpoint();
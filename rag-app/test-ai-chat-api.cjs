const fetch = require('node-fetch');

async function testAIChat() {
  console.log('🤖 Testing AI Chat API');
  console.log('======================\n');

  const baseUrl = 'http://localhost:3002';
  
  try {
    // First, login to get a session
    console.log('1️⃣ Logging in...');
    const loginResponse = await fetch(`${baseUrl}/auth/login-simple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email: 'test@example.com',
        password: 'test123456'
      }),
      redirect: 'manual'
    });

    const cookies = loginResponse.headers.get('set-cookie');
    if (!cookies) {
      console.error('❌ No session cookie received');
      return;
    }

    console.log('✅ Logged in successfully');
    
    // Extract session cookie
    const sessionCookie = cookies.split(';')[0];
    console.log('   Session:', sessionCookie.substring(0, 50) + '...');

    // Test AI chat parse command
    console.log('\n2️⃣ Testing AI chat parse command...');
    const command = 'Add a database to track project tasks';
    
    const formData = new URLSearchParams({
      action: 'parse',
      command: command,
      workspaceId: '550e8400-e29b-41d4-a716-446655440000'
    });

    const parseResponse = await fetch(`${baseUrl}/api/ai-controller`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    });

    if (!parseResponse.ok) {
      const errorText = await parseResponse.text();
      console.error('❌ Parse request failed:', parseResponse.status);
      console.error('   Response:', errorText);
      return;
    }

    const parseResult = await parseResponse.json();
    console.log('✅ Parse successful!');
    console.log('   Action log ID:', parseResult.actionLogId);
    console.log('   Preview:', parseResult.preview);
    console.log('   Actions:', JSON.stringify(parseResult.parseResult.actions, null, 2));

    // Test history endpoint
    console.log('\n3️⃣ Testing history endpoint...');
    const historyResponse = await fetch(`${baseUrl}/api/ai-controller`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action: 'history',
        workspaceId: '550e8400-e29b-41d4-a716-446655440000'
      })
    });

    if (historyResponse.ok) {
      const history = await historyResponse.json();
      console.log('✅ History retrieved:');
      if (history.history && history.history.length > 0) {
        history.history.slice(0, 3).forEach(item => {
          console.log(`   - ${item.command} (${item.status})`);
        });
      } else {
        console.log('   No history found');
      }
    }

    // Test execute endpoint
    console.log('\n4️⃣ Testing execute command...');
    const executeResponse = await fetch(`${baseUrl}/api/ai-controller`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action: 'execute',
        actionLogId: parseResult.actionLogId,
        workspaceId: '550e8400-e29b-41d4-a716-446655440000'
      })
    });

    if (executeResponse.ok) {
      const executeResult = await executeResponse.json();
      console.log('✅ Execute successful!');
      console.log('   Result:', executeResult);
    } else {
      console.log('⚠️ Execute skipped (optional test)');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAIChat().then(() => {
  console.log('\n✅ All API tests complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test error:', error);
  process.exit(1);
});
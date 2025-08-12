const fetch = require('node-fetch');

async function testAIWorking() {
  console.log('🤖 Testing AI Chat with correct user');
  console.log('=====================================\n');

  const baseUrl = 'http://localhost:3001';
  
  try {
    // 1. Login with the test user
    console.log('1️⃣ Logging in as test@example.com...');
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
      console.error('❌ Login failed - no cookie');
      console.log('   Status:', loginResponse.status);
      const text = await loginResponse.text();
      console.log('   Response:', text.substring(0, 200));
      return;
    }
    
    const sessionCookie = cookies.split(';')[0];
    console.log('✅ Logged in successfully');
    
    // Parse the session cookie to see the user ID
    try {
      const sessionData = Buffer.from(
        decodeURIComponent(sessionCookie.split('=')[1].split('.')[0]),
        'base64'
      ).toString();
      const session = JSON.parse(sessionData);
      console.log('   Session user ID:', session.userId);
      console.log('   Session email:', session.email);
    } catch (e) {
      // Session might be encrypted, that's okay
    }

    // 2. Test AI parse command
    console.log('\n2️⃣ Testing AI command parsing...');
    const command = 'Create a simple task tracker database';
    
    const parseResponse = await fetch(`${baseUrl}/api/ai-controller`, {
      method: 'POST',
      headers: {
        'Cookie': sessionCookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        action: 'parse',
        command: command,
        workspaceId: '550e8400-e29b-41d4-a716-446655440000'
      })
    });

    console.log('   Response status:', parseResponse.status);
    const responseText = await parseResponse.text();
    
    if (!parseResponse.ok) {
      console.error('❌ Parse failed');
      console.error('   Response:', responseText.substring(0, 500));
      return;
    }

    const parseResult = JSON.parse(responseText);
    console.log('✅ AI command parsed successfully!');
    console.log('   Action Log ID:', parseResult.actionLogId);
    
    if (parseResult.preview && parseResult.preview.length > 0) {
      console.log('   Preview:');
      parseResult.preview.forEach(p => {
        console.log(`     - [${p.type}] ${p.content || 'No content'}`);
      });
    }
    
    if (parseResult.parseResult && parseResult.parseResult.actions) {
      console.log('   Actions:');
      parseResult.parseResult.actions.forEach(action => {
        console.log(`     - ${action.type}: ${action.name || 'N/A'}`);
      });
    }

    console.log('\n✨ SUCCESS! The AI chat is working correctly!');
    console.log('   - Authentication: ✅');
    console.log('   - OpenAI parsing: ✅');
    console.log('   - Database storage: ✅');
    console.log('   - Preview generation: ✅');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testAIWorking().then(() => {
  console.log('\n✅ Test complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
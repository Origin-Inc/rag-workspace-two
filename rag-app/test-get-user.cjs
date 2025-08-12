const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function getOrCreateUser() {
  try {
    // List all users
    console.log('📋 Listing all users...');
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError);
      return;
    }
    
    console.log(`Found ${users.length} users:`);
    users.forEach(user => {
      console.log(`  - ${user.id}: ${user.email}`);
    });
    
    // Find test user or use first user
    let testUser = users.find(u => u.email === 'test@example.com') || users[0];
    
    if (!testUser) {
      console.log('\n📝 No users found, creating test user...');
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: 'test@example.com',
        password: 'test123456',
        email_confirm: true,
        user_metadata: { name: 'Test User' }
      });
      
      if (createError) {
        console.error('❌ Failed to create user:', createError);
        return;
      }
      
      testUser = newUser.user;
      console.log('✅ Created user:', testUser.id);
    }
    
    // Now test insert with this user
    console.log('\n🧪 Testing insert with user:', testUser.id);
    
    // Ensure workspace exists
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces_extended')
      .select('*')
      .eq('id', '550e8400-e29b-41d4-a716-446655440000')
      .maybeSingle();
    
    if (!workspace) {
      console.log('Creating workspace...');
      await supabase
        .from('workspaces_extended')
        .insert({
          id: '550e8400-e29b-41d4-a716-446655440000',
          workspace_id: 'demo-workspace'
        });
    }
    
    // Insert action log
    const actionData = {
      workspace_id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: testUser.id,
      command: 'Add a database to track project tasks',
      parsed_action: {
        actions: [{
          type: 'create_database',
          name: 'Project Tasks',
          description: 'Track project tasks and their status'
        }]
      },
      action_type: 'create_database',
      preview: [{
        type: 'info',
        content: 'Will create a new database block "Project Tasks"'
      }],
      preview_shown: false,
      status: 'pending'
    };
    
    console.log('Inserting action log...');
    const { data: result, error: insertError } = await supabase
      .from('action_logs')
      .insert(actionData)
      .select();
    
    if (insertError) {
      console.error('❌ Insert failed:', insertError);
    } else {
      console.log('✅ Insert successful!');
      console.log('Result:', result);
      
      // Clean up
      if (result && result[0]) {
        await supabase.from('action_logs').delete().eq('id', result[0].id);
        console.log('Cleaned up test data');
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

getOrCreateUser().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
});
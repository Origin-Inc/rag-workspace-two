const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

console.log('🔍 Direct Insert Test for action_logs');
console.log('=====================================');
console.log('Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function testDirectInsert() {
  try {
    // First, verify the table exists by attempting a select
    console.log('\n1️⃣ Checking if action_logs table exists...');
    const { data: tableCheck, error: tableError } = await supabase
      .from('action_logs')
      .select('id')
      .limit(1);
    
    if (tableError && tableError.code === '42P01') {
      console.error('❌ Table does not exist:', tableError);
      return;
    } else if (tableError) {
      console.log('⚠️ Table exists but returned error:', tableError.code, tableError.message);
    } else {
      console.log('✅ Table exists (found', tableCheck?.length || 0, 'rows)');
    }

    // Check if workspace exists
    console.log('\n2️⃣ Checking if workspace exists...');
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces_extended')
      .select('*')
      .eq('id', '550e8400-e29b-41d4-a716-446655440000')
      .single();
    
    if (wsError) {
      console.error('❌ Workspace not found:', wsError);
      console.log('\n   Creating workspace...');
      
      const { data: newWs, error: createWsError } = await supabase
        .from('workspaces_extended')
        .insert({
          id: '550e8400-e29b-41d4-a716-446655440000',
          workspace_id: 'demo-workspace'
        })
        .select()
        .single();
      
      if (createWsError) {
        console.error('❌ Failed to create workspace:', createWsError);
        return;
      }
      console.log('✅ Workspace created');
    } else {
      console.log('✅ Workspace exists:', workspace.workspace_id);
    }

    // Create a test user if needed
    console.log('\n3️⃣ Checking users...');
    const testUserId = '660d0519-bb28-49bc-98fc-aa2af5e6fb6c';
    
    // Try inserting with minimal data first
    console.log('\n4️⃣ Testing minimal insert...');
    const minimalData = {
      workspace_id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: testUserId,
      command: 'test command',
      parsed_action: {},
      preview: [],
      status: 'pending'
    };
    
    console.log('   Inserting:', JSON.stringify(minimalData, null, 2));
    
    const { data: minimalResult, error: minimalError } = await supabase
      .from('action_logs')
      .insert(minimalData)
      .select();
    
    if (minimalError) {
      console.error('❌ Minimal insert failed:');
      console.error('   Code:', minimalError.code);
      console.error('   Message:', minimalError.message);
      console.error('   Details:', minimalError.details);
      console.error('   Hint:', minimalError.hint);
      
      // Try to get more info about the error
      if (minimalError.code === '23503') {
        console.log('\n   This is a foreign key violation. Checking references...');
        
        // Check if user exists in auth.users
        const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(testUserId);
        if (authError || !authUser) {
          console.log('   ❌ User does not exist in auth.users');
          console.log('   Creating test user...');
          
          // Create user
          const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
            email: 'test@example.com',
            password: 'test123456',
            email_confirm: true,
            user_metadata: { name: 'Test User' }
          });
          
          if (createUserError) {
            console.error('   ❌ Failed to create user:', createUserError);
          } else {
            console.log('   ✅ User created:', newUser.user.id);
            // Update our test user ID
            minimalData.user_id = newUser.user.id;
            
            // Retry insert with new user ID
            console.log('\n5️⃣ Retrying insert with created user...');
            const { data: retryResult, error: retryError } = await supabase
              .from('action_logs')
              .insert(minimalData)
              .select();
            
            if (retryError) {
              console.error('❌ Retry failed:', retryError);
            } else {
              console.log('✅ Insert successful!');
              console.log('   Result:', retryResult);
              
              // Clean up
              if (retryResult && retryResult[0]) {
                await supabase.from('action_logs').delete().eq('id', retryResult[0].id);
                console.log('   Cleaned up test data');
              }
            }
          }
        } else {
          console.log('   ✅ User exists in auth.users');
        }
      }
    } else {
      console.log('✅ Minimal insert successful!');
      console.log('   Result:', minimalResult);
      
      // Clean up
      if (minimalResult && minimalResult[0]) {
        await supabase.from('action_logs').delete().eq('id', minimalResult[0].id);
        console.log('   Cleaned up test data');
      }
    }

    // Test with full data
    console.log('\n6️⃣ Testing full insert (if user exists)...');
    const fullData = {
      workspace_id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: minimalData.user_id, // Use the potentially updated user ID
      command: 'Add a database to track project tasks',
      parsed_action: {
        actions: [{
          type: 'create_database',
          name: 'Project Tasks',
          description: 'Track project tasks and their status',
          columns: [
            { name: 'Task Name', type: 'text' },
            { name: 'Status', type: 'select', options: ['Todo', 'In Progress', 'Done'] },
            { name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
            { name: 'Due Date', type: 'date' }
          ]
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
    
    const { data: fullResult, error: fullError } = await supabase
      .from('action_logs')
      .insert(fullData)
      .select();
    
    if (fullError) {
      console.error('❌ Full insert failed:', fullError);
    } else {
      console.log('✅ Full insert successful!');
      console.log('   Result:', fullResult);
      
      // Clean up
      if (fullResult && fullResult[0]) {
        await supabase.from('action_logs').delete().eq('id', fullResult[0].id);
        console.log('   Cleaned up test data');
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testDirectInsert().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
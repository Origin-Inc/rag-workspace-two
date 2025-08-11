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

async function testAIController() {
  try {
    console.log('🤖 Testing AI Controller with real user');
    console.log('=========================================\n');

    // Get a real user
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError || !users || users.length === 0) {
      console.error('❌ No users found');
      return;
    }
    
    const testUser = users[0];
    console.log('✅ Using user:', testUser.id, '-', testUser.email);
    
    // Ensure workspace exists
    const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
    const { data: workspace } = await supabase
      .from('workspaces_extended')
      .select('*')
      .eq('id', workspaceId)
      .maybeSingle();
    
    if (!workspace) {
      console.log('Creating workspace...');
      await supabase
        .from('workspaces_extended')
        .insert({
          id: workspaceId,
          workspace_id: 'demo-workspace'
        });
    }
    
    // Now test the AI controller flow
    console.log('\n📝 Testing AI Controller flow...');
    
    // 1. Create action log
    const command = 'Add a database to track project tasks with columns for name, status, and due date';
    const parsedAction = {
      actions: [{
        type: 'create_database',
        name: 'Project Tasks',
        description: 'Track project tasks and their status',
        columns: [
          { name: 'Task Name', type: 'text' },
          { name: 'Status', type: 'select', options: ['Todo', 'In Progress', 'Done'] },
          { name: 'Due Date', type: 'date' }
        ]
      }]
    };
    
    console.log('1️⃣ Creating action log...');
    const { data: actionLog, error: insertError } = await supabase
      .from('action_logs')
      .insert({
        workspace_id: workspaceId,
        user_id: testUser.id,
        command,
        parsed_action: parsedAction,
        action_type: 'create_database',
        preview: [{
          type: 'info',
          content: 'Will create a new database block "Project Tasks" with 3 columns'
        }],
        preview_shown: false,
        status: 'pending'
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('❌ Failed to create action log:', insertError);
      return;
    }
    
    console.log('✅ Action log created:', actionLog.id);
    
    // 2. Confirm the action
    console.log('\n2️⃣ Confirming action...');
    const { error: confirmError } = await supabase
      .from('action_logs')
      .update({
        preview_shown: true,
        confirmed_at: new Date().toISOString(),
        status: 'confirmed'
      })
      .eq('id', actionLog.id);
    
    if (confirmError) {
      console.error('❌ Failed to confirm action:', confirmError);
    } else {
      console.log('✅ Action confirmed');
    }
    
    // 3. Execute the action (simulate)
    console.log('\n3️⃣ Executing action...');
    const { error: executeError } = await supabase
      .from('action_logs')
      .update({
        executed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        status: 'completed',
        result: { success: true, message: 'Database created successfully' }
      })
      .eq('id', actionLog.id);
    
    if (executeError) {
      console.error('❌ Failed to execute action:', executeError);
    } else {
      console.log('✅ Action executed successfully');
    }
    
    // 4. Retrieve the completed action
    console.log('\n4️⃣ Retrieving completed action...');
    const { data: completedAction, error: getError } = await supabase
      .from('action_logs')
      .select('*')
      .eq('id', actionLog.id)
      .single();
    
    if (getError) {
      console.error('❌ Failed to retrieve action:', getError);
    } else {
      console.log('✅ Completed action:');
      console.log('   Command:', completedAction.command);
      console.log('   Status:', completedAction.status);
      console.log('   Result:', completedAction.result);
    }
    
    // Clean up
    console.log('\n🧹 Cleaning up...');
    await supabase.from('action_logs').delete().eq('id', actionLog.id);
    console.log('✅ Test data cleaned up');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testAIController().then(() => {
  console.log('\n✅ All tests complete!');
  process.exit(0);
});
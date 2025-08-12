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

async function fixUserReferences() {
  try {
    console.log('🔧 Fixing user references in database');
    console.log('=====================================\n');

    // The user ID that's in the session but not in auth.users
    const problematicUserId = '660d0519-bb28-49bc-aa2af5e6fb6c';
    
    // 1. List all auth users
    console.log('1️⃣ Listing auth.users...');
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError);
      return;
    }
    
    console.log(`Found ${users.length} users in auth.users:`);
    users.forEach(user => {
      console.log(`   - ${user.id}: ${user.email}`);
    });
    
    // Get a valid user (the test user we created)
    const validUser = users.find(u => u.email === 'test@example.com') || users[0];
    
    if (!validUser) {
      console.error('❌ No valid users found');
      return;
    }
    
    console.log(`\n✅ Using valid user: ${validUser.id} (${validUser.email})`);
    
    // 2. Check profiles table
    console.log('\n2️⃣ Checking profiles table...');
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', [problematicUserId, validUser.id]);
    
    if (profilesError) {
      console.error('❌ Error checking profiles:', profilesError);
    } else {
      console.log(`Found ${profiles.length} profiles:`);
      profiles.forEach(p => console.log(`   - ${p.id}: ${p.email}`));
    }
    
    // 3. Update any action_logs with the problematic user ID
    console.log('\n3️⃣ Checking action_logs for problematic user ID...');
    const { data: actionLogs, error: actionLogsError } = await supabase
      .from('action_logs')
      .select('id')
      .eq('user_id', problematicUserId);
    
    if (actionLogsError && actionLogsError.code !== '42P01') {
      console.log('⚠️ Error checking action_logs:', actionLogsError.message);
    } else if (actionLogs && actionLogs.length > 0) {
      console.log(`Found ${actionLogs.length} action logs with problematic user ID`);
      
      // Update them to use the valid user
      const { error: updateError } = await supabase
        .from('action_logs')
        .update({ user_id: validUser.id })
        .eq('user_id', problematicUserId);
      
      if (updateError) {
        console.error('❌ Error updating action_logs:', updateError);
      } else {
        console.log('✅ Updated action_logs to use valid user');
      }
    } else {
      console.log('✅ No action_logs with problematic user ID');
    }
    
    // 4. Update user_workspaces
    console.log('\n4️⃣ Checking user_workspaces...');
    const { data: memberships, error: membershipError } = await supabase
      .from('user_workspaces')
      .select('*')
      .eq('user_id', problematicUserId);
    
    if (membershipError && membershipError.code !== '42P01') {
      console.log('⚠️ Error checking user_workspaces:', membershipError.message);
    } else if (memberships && memberships.length > 0) {
      console.log(`Found ${memberships.length} workspace memberships with problematic user ID`);
      
      // Delete old memberships
      await supabase
        .from('user_workspaces')
        .delete()
        .eq('user_id', problematicUserId);
      
      // Create new membership for valid user
      const { error: insertError } = await supabase
        .from('user_workspaces')
        .insert({
          user_id: validUser.id,
          workspace_id: '550e8400-e29b-41d4-a716-446655440000',
          role: 'owner'
        });
      
      if (insertError && insertError.code !== '23505') {
        console.error('⚠️ Could not create workspace membership:', insertError.message);
      } else {
        console.log('✅ Created workspace membership for valid user');
      }
    }
    
    // 5. Test that everything works
    console.log('\n5️⃣ Testing action log creation with valid user...');
    const { data: testLog, error: testError } = await supabase
      .from('action_logs')
      .insert({
        workspace_id: '550e8400-e29b-41d4-a716-446655440000',
        user_id: validUser.id,
        command: 'Test command after fix',
        parsed_action: { test: true },
        preview: [],
        status: 'pending'
      })
      .select()
      .single();
    
    if (testError) {
      console.error('❌ Test failed:', testError);
    } else {
      console.log('✅ Test action log created successfully');
      
      // Clean up
      await supabase.from('action_logs').delete().eq('id', testLog.id);
      console.log('   Cleaned up test data');
    }
    
    console.log('\n📝 Summary:');
    console.log('   Valid User ID to use:', validUser.id);
    console.log('   Email:', validUser.email);
    console.log('   This user should be used for all operations');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

fixUserReferences().then(() => {
  console.log('\n✅ Fix complete!');
  process.exit(0);
});
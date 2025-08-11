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

async function fixAuthUser() {
  try {
    console.log('🔐 Setting up Supabase Auth user');
    console.log('===================================\n');

    const email = 'test@example.com';
    const password = 'test123456';
    
    // First check if user exists
    console.log('1️⃣ Checking if user exists in Supabase Auth...');
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Error listing users:', listError);
      return;
    }
    
    let testUser = users.find(u => u.email === email);
    
    if (testUser) {
      console.log('✅ User found:', testUser.id);
      
      // Update password
      console.log('\n2️⃣ Updating password...');
      const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
        testUser.id,
        { password: password }
      );
      
      if (updateError) {
        console.error('❌ Failed to update password:', updateError);
        return;
      }
      
      console.log('✅ Password updated successfully!');
    } else {
      console.log('❌ User not found, creating new user...');
      
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { name: 'Test User' }
      });
      
      if (createError) {
        console.error('❌ Failed to create user:', createError);
        return;
      }
      
      testUser = newUser.user;
      console.log('✅ User created:', testUser.id);
    }
    
    // Test login
    console.log('\n3️⃣ Testing login...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (authError) {
      console.error('❌ Login failed:', authError);
      return;
    }
    
    console.log('✅ Login successful!');
    console.log('   User ID:', authData.user.id);
    console.log('   Email:', authData.user.email);
    
    // Ensure profile exists
    console.log('\n4️⃣ Ensuring profile exists...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', testUser.id)
      .maybeSingle();
    
    if (!profile) {
      console.log('   Creating profile...');
      const { error: createProfileError } = await supabase
        .from('profiles')
        .insert({
          id: testUser.id,
          email: testUser.email,
          name: 'Test User'
        });
      
      if (createProfileError && createProfileError.code !== '23505') {
        console.error('⚠️ Could not create profile:', createProfileError.message);
      } else {
        console.log('✅ Profile created');
      }
    } else {
      console.log('✅ Profile exists');
    }
    
    // Ensure workspace membership
    console.log('\n5️⃣ Ensuring workspace membership...');
    const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
    
    // Check workspace
    const { data: workspace } = await supabase
      .from('workspaces_extended')
      .select('*')
      .eq('id', workspaceId)
      .maybeSingle();
    
    if (!workspace) {
      console.log('   Creating workspace...');
      await supabase
        .from('workspaces_extended')
        .insert({
          id: workspaceId,
          workspace_id: 'demo-workspace'
        });
    }
    
    // Add membership
    const { error: membershipError } = await supabase
      .from('user_workspaces')
      .insert({
        user_id: testUser.id,
        workspace_id: workspaceId,
        role: 'owner'
      });
    
    if (membershipError && membershipError.code !== '23505') {
      console.error('⚠️ Could not create membership:', membershipError.message);
    } else if (!membershipError) {
      console.log('✅ Workspace membership created');
    } else {
      console.log('✅ Workspace membership exists');
    }
    
    console.log('\n📝 Login credentials ready:');
    console.log('   Email:', email);
    console.log('   Password:', password);
    console.log('   URL: http://localhost:3002/auth/login-simple');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

fixAuthUser().then(() => {
  console.log('\n✅ Setup complete!');
  process.exit(0);
});
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function setupTestUser() {
  try {
    console.log('🔧 Setting up test user for authentication');
    console.log('==========================================\n');

    const email = 'test@example.com';
    const password = 'test123456';
    
    // Check if user exists in profiles table
    console.log('1️⃣ Checking profiles table...');
    const { data: existingProfile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    if (existingProfile) {
      console.log('✅ User already exists in profiles table');
      console.log('   ID:', existingProfile.id);
      console.log('   Email:', existingProfile.email);
      return existingProfile;
    }
    
    // Create user in profiles table (our custom auth)
    console.log('\n2️⃣ Creating user in profiles table...');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const { data: newProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        email,
        name: 'Test User',
        password_hash: hashedPassword
      })
      .select()
      .single();
    
    if (createError) {
      console.error('❌ Failed to create profile:', createError);
      return;
    }
    
    console.log('✅ User created successfully!');
    console.log('   ID:', newProfile.id);
    console.log('   Email:', newProfile.email);
    console.log('   Password: test123456');
    
    // Also ensure workspace membership exists
    console.log('\n3️⃣ Setting up workspace membership...');
    const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
    
    // Check if workspace exists
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
    
    // Add user to workspace
    const { data: membership, error: membershipError } = await supabase
      .from('user_workspaces')
      .insert({
        user_id: newProfile.id,
        workspace_id: workspaceId,
        role: 'owner'
      })
      .select()
      .maybeSingle();
    
    if (membershipError && membershipError.code !== '23505') { // Ignore duplicate key errors
      console.error('⚠️ Could not create workspace membership:', membershipError.message);
    } else if (!membershipError) {
      console.log('✅ Workspace membership created');
    } else {
      console.log('✅ Workspace membership already exists');
    }
    
    console.log('\n📝 Test user is ready for login:');
    console.log('   Email: test@example.com');
    console.log('   Password: test123456');
    console.log('   Login at: http://localhost:3002/auth/login-simple');
    
    return newProfile;
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

setupTestUser().then(() => {
  console.log('\n✅ Setup complete!');
  process.exit(0);
});
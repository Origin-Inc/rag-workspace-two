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

async function resetPassword() {
  try {
    console.log('🔑 Resetting test user password');
    console.log('================================\n');

    const email = 'test@example.com';
    const newPassword = 'test123456';
    
    // Hash the new password
    console.log('1️⃣ Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 12); // Using 12 rounds like in the app
    console.log('✅ Password hashed');
    
    // Update the user's password in profiles table
    console.log('\n2️⃣ Updating password in database...');
    const { data, error } = await supabase
      .from('profiles')
      .update({ password_hash: hashedPassword })
      .eq('email', email)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Failed to update password:', error);
      return;
    }
    
    console.log('✅ Password updated successfully!');
    console.log('   User ID:', data.id);
    console.log('   Email:', data.email);
    
    // Test the password
    console.log('\n3️⃣ Testing password verification...');
    const isValid = await bcrypt.compare(newPassword, data.password_hash);
    console.log(isValid ? '✅ Password verification successful!' : '❌ Password verification failed!');
    
    console.log('\n📝 Login credentials:');
    console.log('   Email:', email);
    console.log('   Password:', newPassword);
    console.log('   URL: http://localhost:3002/auth/login-simple');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

resetPassword().then(() => {
  console.log('\n✅ Password reset complete!');
  process.exit(0);
});
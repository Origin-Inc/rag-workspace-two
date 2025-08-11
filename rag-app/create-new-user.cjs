#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function createNewUser() {
  console.log('\n=== CREATING NEW USER ===\n');

  // Generate unique email with timestamp
  const timestamp = Date.now();
  const email = `user${timestamp}@example.com`;
  const password = 'password123!';

  // Create user
  const { data, error } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm for testing
  });

  if (error) {
    console.error('Error creating user:', error.message);
  } else {
    console.log('✅ New user created successfully!');
    console.log('\n📧 Login Credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\nYou can login at: http://localhost:3001/auth/login-simple');
    console.log('\nSave these credentials - the email is unique to this user!');
  }
}

createNewUser().catch(console.error);
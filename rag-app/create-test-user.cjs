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

async function createTestUser() {
  console.log('\n=== CREATING TEST USER ===\n');

  const email = 'test@example.com';
  const password = 'testpassword123';

  // Create user
  const { data, error } = await supabase.auth.admin.createUser({
    email: email,
    password: password,
    email_confirm: true, // Auto-confirm for testing
  });

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('User already exists. You can use these credentials:');
      console.log('Email:', email);
      console.log('Password:', password);
    } else {
      console.error('Error creating user:', error.message);
    }
  } else {
    console.log('✅ Test user created successfully!');
    console.log('\n📧 Login Credentials:');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('\nLogin at: http://localhost:3001/auth/login-simple');
  }
}

createTestUser().catch(console.error);
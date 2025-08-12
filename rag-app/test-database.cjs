#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

console.log('\n=== DATABASE CONNECTION TEST ===\n');
console.log('Environment:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
console.log('  SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
console.log('\n');

async function testConnection() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    return;
  }

  console.log('Creating Supabase client...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Test 1: Check if we can connect
  console.log('\nTest 1: Basic connection test');
  try {
    const { data, error } = await supabase.from('db_blocks').select('count').limit(1);
    if (error) {
      console.error('❌ Connection failed:', error.message);
      console.error('   Error code:', error.code);
      console.error('   Error hint:', error.hint);
    } else {
      console.log('✅ Connection successful');
    }
  } catch (e) {
    console.error('❌ Fatal error:', e.message);
  }

  // Test 2: Check table existence
  console.log('\nTest 2: Check tables');
  try {
    const { data: blocks, error: blocksError } = await supabase
      .from('db_blocks')
      .select('*')
      .limit(1);
    
    if (blocksError) {
      console.error('❌ db_blocks table:', blocksError.message);
    } else {
      console.log('✅ db_blocks table exists');
    }

    const { data: rows, error: rowsError } = await supabase
      .from('db_block_rows')
      .select('*')
      .limit(1);
    
    if (rowsError) {
      console.error('❌ db_block_rows table:', rowsError.message);
    } else {
      console.log('✅ db_block_rows table exists');
    }
  } catch (e) {
    console.error('❌ Fatal error:', e.message);
  }

  // Test 3: Try to insert a test record
  console.log('\nTest 3: Insert test');
  try {
    const testBlockId = `test-${Date.now()}`;
    const { data, error } = await supabase
      .from('db_blocks')
      .insert({
        block_id: testBlockId,
        name: 'Test Block',
        description: 'Test from Node.js',
        schema: []
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Insert failed:', error.message);
      console.error('   Error code:', error.code);
      console.error('   Error details:', error.details);
    } else {
      console.log('✅ Insert successful, ID:', data.id);
      
      // Clean up
      const { error: deleteError } = await supabase
        .from('db_blocks')
        .delete()
        .eq('block_id', testBlockId);
      
      if (!deleteError) {
        console.log('✅ Cleanup successful');
      }
    }
  } catch (e) {
    console.error('❌ Fatal error:', e.message);
  }

  // Test 4: Raw HTTP request
  console.log('\nTest 4: Raw HTTP request to Supabase');
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    console.log('   HTTP Status:', response.status, response.statusText);
    
    if (!response.ok) {
      const text = await response.text();
      console.error('   Response:', text.substring(0, 200));
    } else {
      console.log('✅ HTTP connection successful');
    }
  } catch (e) {
    console.error('❌ HTTP request failed:', e.message);
    if (e.cause) {
      console.error('   Cause:', e.cause);
    }
  }

  console.log('\n=== TEST COMPLETE ===\n');
}

testConnection().catch(console.error);
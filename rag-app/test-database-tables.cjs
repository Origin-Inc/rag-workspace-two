const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

console.log('🔍 Testing Database Tables');
console.log('============================');
console.log('Supabase URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
});

async function testTables() {
  try {
    // Test 1: Check if action_logs table exists
    console.log('\n📋 Test 1: Checking if action_logs table exists...');
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'action_logs');
    
    if (tablesError) {
      console.error('❌ Error checking tables:', tablesError);
    } else if (tables && tables.length > 0) {
      console.log('✅ action_logs table exists');
    } else {
      console.log('❌ action_logs table does NOT exist');
    }

    // Test 2: List all tables
    console.log('\n📋 Test 2: Listing all public tables...');
    const { data: allTables, error: allTablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .order('table_name');
    
    if (allTablesError) {
      console.error('❌ Error listing tables:', allTablesError);
    } else {
      console.log('✅ Found tables:');
      allTables.forEach(t => console.log(`   - ${t.table_name}`));
    }

    // Test 3: Check workspaces_extended table
    console.log('\n📋 Test 3: Checking workspaces_extended table...');
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces_extended')
      .select('*')
      .eq('id', '550e8400-e29b-41d4-a716-446655440000');
    
    if (wsError) {
      console.error('❌ Error checking workspaces:', wsError);
    } else {
      console.log(`✅ Found ${workspaces.length} workspace(s)`);
      if (workspaces.length > 0) {
        console.log('   Workspace:', workspaces[0]);
      }
    }

    // Test 4: Check user_workspaces table
    console.log('\n📋 Test 4: Checking user_workspaces table...');
    const { data: userWorkspaces, error: uwError } = await supabase
      .from('user_workspaces')
      .select('*')
      .eq('workspace_id', '550e8400-e29b-41d4-a716-446655440000');
    
    if (uwError) {
      console.error('❌ Error checking user_workspaces:', uwError);
    } else {
      console.log(`✅ Found ${userWorkspaces.length} user workspace(s)`);
      if (userWorkspaces.length > 0) {
        console.log('   User Workspace:', userWorkspaces[0]);
      }
    }

    // Test 5: Try to insert into action_logs
    console.log('\n📋 Test 5: Testing action_logs insert...');
    const testData = {
      workspace_id: '550e8400-e29b-41d4-a716-446655440000',
      user_id: '660d0519-bb28-49bc-98fc-aa2af5e6fb6c',
      command: 'Test command',
      parsed_action: { test: true },
      action_type: null,
      preview: [],
      preview_shown: false,
      status: 'pending'
    };
    
    console.log('   Inserting test data:', JSON.stringify(testData, null, 2));
    
    const { data: insertResult, error: insertError } = await supabase
      .from('action_logs')
      .insert(testData)
      .select('id');
    
    if (insertError) {
      console.error('❌ Error inserting into action_logs:');
      console.error('   Code:', insertError.code);
      console.error('   Message:', insertError.message);
      console.error('   Details:', insertError.details);
      console.error('   Hint:', insertError.hint);
      console.error('   Full error:', JSON.stringify(insertError, null, 2));
    } else {
      console.log('✅ Successfully inserted into action_logs');
      console.log('   Result:', insertResult);
      
      // Clean up test data
      if (insertResult && insertResult[0]) {
        const { error: deleteError } = await supabase
          .from('action_logs')
          .delete()
          .eq('id', insertResult[0].id);
        
        if (deleteError) {
          console.error('   Warning: Could not clean up test data:', deleteError);
        } else {
          console.log('   Test data cleaned up');
        }
      }
    }

    // Test 6: Check column types in action_logs
    console.log('\n📋 Test 6: Checking action_logs columns...');
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_schema', 'public')
      .eq('table_name', 'action_logs')
      .order('ordinal_position');
    
    if (columnsError) {
      console.error('❌ Error checking columns:', columnsError);
    } else if (columns && columns.length > 0) {
      console.log('✅ action_logs columns:');
      columns.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
    } else {
      console.log('❌ Could not retrieve column information');
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testTables().then(() => {
  console.log('\n✅ Tests complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
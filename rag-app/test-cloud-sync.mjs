#!/usr/bin/env node

/**
 * Test script for DuckDB Cloud Sync
 * Run with: node test-cloud-sync.mjs
 */

import { createClient } from '@supabase/supabase-js';

// Test configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54341';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test data that matches the export format
const testExportData = {
  tableName: "test_table_sync",
  schema: [
    { column_name: "id", data_type: "INTEGER" },
    { column_name: "name", data_type: "VARCHAR" },
    { column_name: "value", data_type: "DOUBLE" }
  ],
  data: [
    { id: 1, name: "Test 1", value: 10.5 },
    { id: 2, name: "Test 2", value: 20.7 },
    { id: 3, name: "Test 3", value: 30.2 }
  ],
  rowCount: 3,
  exportedAt: new Date().toISOString()
};

async function testUpload() {
  console.log('🧪 Testing DuckDB Cloud Sync...\n');
  
  try {
    // 1. Create test JSON file
    const blob = new Blob([JSON.stringify(testExportData)], { type: 'application/json' });
    const testPath = `tables/test-workspace/${Date.now()}_test_table_sync.json`;
    
    console.log('📤 Uploading test file to:', testPath);
    console.log('📊 Test data:', {
      rowCount: testExportData.rowCount,
      columns: testExportData.schema.map(s => s.column_name)
    });
    
    // 2. Upload to storage
    const { data, error } = await supabase.storage
      .from('duckdb-tables')
      .upload(testPath, blob, {
        contentType: 'application/json',
        upsert: true
      });
    
    if (error) {
      console.error('❌ Upload failed:', error);
      return;
    }
    
    console.log('✅ Upload successful:', data);
    
    // 3. Get public URL
    const { data: urlData } = supabase.storage
      .from('duckdb-tables')
      .getPublicUrl(testPath);
    
    console.log('🔗 Public URL:', urlData.publicUrl);
    
    // 4. Test download
    console.log('\n📥 Testing download...');
    const response = await fetch(urlData.publicUrl);
    const downloaded = await response.json();
    
    console.log('📋 Downloaded data structure:', {
      hasTableName: !!downloaded.tableName,
      hasSchema: !!downloaded.schema,
      hasData: !!downloaded.data,
      dataLength: downloaded.data?.length
    });
    
    // 5. Verify data integrity
    if (downloaded.data?.length === testExportData.data.length) {
      console.log('✅ Data integrity verified!');
    } else {
      console.error('❌ Data mismatch!');
    }
    
    // 6. Clean up test file
    console.log('\n🧹 Cleaning up...');
    const { error: deleteError } = await supabase.storage
      .from('duckdb-tables')
      .remove([testPath]);
    
    if (deleteError) {
      console.error('⚠️ Cleanup failed:', deleteError);
    } else {
      console.log('✅ Test file cleaned up');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testUpload().then(() => {
  console.log('\n✨ Test complete!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
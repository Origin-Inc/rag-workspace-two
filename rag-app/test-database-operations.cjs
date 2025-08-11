#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

console.log('\n=== COMPREHENSIVE DATABASE OPERATIONS TEST ===\n');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabaseOperations() {
  let testBlockId = `test-block-${Date.now()}`;
  let dbBlockId = null;

  try {
    // 1. Create a database block
    console.log('1. Creating database block...');
    const { data: block, error: blockError } = await supabase
      .from('db_blocks')
      .insert({
        block_id: testBlockId,
        name: 'Test Database Block',
        description: 'Testing all operations',
        schema: [
          {
            id: 'col-1',
            columnId: 'title',
            name: 'Title',
            type: 'text',
            width: 200,
            order: 0
          },
          {
            id: 'col-2',
            columnId: 'status',
            name: 'Status',
            type: 'select',
            config: {
              options: [
                { value: 'todo', label: 'To Do' },
                { value: 'done', label: 'Done' }
              ]
            },
            width: 150,
            order: 1
          }
        ]
      })
      .select()
      .single();

    if (blockError) {
      console.error('❌ Failed to create block:', blockError.message);
      return;
    }

    dbBlockId = block.id;
    console.log('✅ Block created with ID:', dbBlockId);

    // 2. Add a column to the schema
    console.log('\n2. Adding a new column to schema...');
    const currentSchema = block.schema || [];
    const newColumn = {
      id: 'col-3',
      columnId: 'priority',
      name: 'Priority',
      type: 'select',
      config: {
        options: [
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' }
        ]
      },
      width: 120,
      order: 2
    };
    
    const { error: updateError } = await supabase
      .from('db_blocks')
      .update({
        schema: [...currentSchema, newColumn]
      })
      .eq('id', dbBlockId);

    if (updateError) {
      console.error('❌ Failed to add column:', updateError.message);
    } else {
      console.log('✅ Column added successfully');
    }

    // 3. Create rows
    console.log('\n3. Creating rows...');
    const rows = [
      { title: 'Task 1', status: 'todo', priority: 'high' },
      { title: 'Task 2', status: 'done', priority: 'low' },
      { title: 'Task 3', status: 'todo', priority: 'high' }
    ];

    for (let i = 0; i < rows.length; i++) {
      const { error: rowError } = await supabase
        .from('db_block_rows')
        .insert({
          db_block_id: dbBlockId,
          data: rows[i],
          position: i + 1
        });

      if (rowError) {
        console.error(`❌ Failed to create row ${i + 1}:`, rowError.message);
      } else {
        console.log(`✅ Row ${i + 1} created`);
      }
    }

    // 4. Query rows
    console.log('\n4. Querying rows...');
    const { data: queriedRows, error: queryError } = await supabase
      .from('db_block_rows')
      .select('*')
      .eq('db_block_id', dbBlockId)
      .order('position');

    if (queryError) {
      console.error('❌ Failed to query rows:', queryError.message);
    } else {
      console.log(`✅ Found ${queriedRows.length} rows`);
      queriedRows.forEach((row, i) => {
        console.log(`   Row ${i + 1}:`, JSON.stringify(row.data));
      });
    }

    // 5. Update a row
    console.log('\n5. Updating a row...');
    if (queriedRows && queriedRows.length > 0) {
      const rowToUpdate = queriedRows[0];
      const updatedData = { ...rowToUpdate.data, status: 'done' };
      
      const { error: updateRowError } = await supabase
        .from('db_block_rows')
        .update({
          data: updatedData,
          version: (rowToUpdate.version || 1) + 1
        })
        .eq('id', rowToUpdate.id);

      if (updateRowError) {
        console.error('❌ Failed to update row:', updateRowError.message);
      } else {
        console.log('✅ Row updated successfully');
      }
    }

    // 6. Test aggregation
    console.log('\n6. Testing aggregation...');
    const { count, error: countError } = await supabase
      .from('db_block_rows')
      .select('*', { count: 'exact', head: true })
      .eq('db_block_id', dbBlockId);

    if (countError) {
      console.error('❌ Failed to count rows:', countError.message);
    } else {
      console.log(`✅ Total row count: ${count}`);
    }

    // 7. Clean up
    console.log('\n7. Cleaning up test data...');
    
    // Delete rows
    const { error: deleteRowsError } = await supabase
      .from('db_block_rows')
      .delete()
      .eq('db_block_id', dbBlockId);

    if (deleteRowsError) {
      console.error('❌ Failed to delete rows:', deleteRowsError.message);
    } else {
      console.log('✅ Rows deleted');
    }

    // Delete block
    const { error: deleteBlockError } = await supabase
      .from('db_blocks')
      .delete()
      .eq('id', dbBlockId);

    if (deleteBlockError) {
      console.error('❌ Failed to delete block:', deleteBlockError.message);
    } else {
      console.log('✅ Block deleted');
    }

    console.log('\n=== ALL TESTS COMPLETE ===\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    
    // Try to clean up if something went wrong
    if (dbBlockId) {
      console.log('\nAttempting cleanup...');
      await supabase.from('db_block_rows').delete().eq('db_block_id', dbBlockId);
      await supabase.from('db_blocks').delete().eq('id', dbBlockId);
    }
  }
}

testDatabaseOperations().catch(console.error);
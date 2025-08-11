#!/usr/bin/env node

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAddColumn() {
  console.log('\n=== TEST ADDING COLUMN ===\n');

  // Get the existing block
  const { data: blocks } = await supabase
    .from('db_blocks')
    .select('*')
    .eq('block_id', 'demo-database-block');

  if (!blocks || blocks.length === 0) {
    console.error('No database block found');
    return;
  }

  const block = blocks[0];
  console.log('Current schema:', JSON.stringify(block.schema, null, 2));
  console.log('Number of columns:', block.schema.length);

  // Add a new column
  const newColumn = {
    id: `col-${Date.now()}`,
    columnId: `test_column_${Date.now()}`,
    name: 'Test Column',
    type: 'text',
    width: 150,
    order: block.schema.length,
    isHidden: false,
    config: {},
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const updatedSchema = [...block.schema, newColumn];

  console.log('\nAdding new column:', newColumn.name);

  const { data, error } = await supabase
    .from('db_blocks')
    .update({
      schema: updatedSchema,
      updated_at: new Date().toISOString()
    })
    .eq('id', block.id)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to add column:', error);
  } else {
    console.log('✅ Column added successfully');
    console.log('New schema length:', data.schema.length);
    console.log('New column:', data.schema[data.schema.length - 1]);
  }
}

testAddColumn().catch(console.error);
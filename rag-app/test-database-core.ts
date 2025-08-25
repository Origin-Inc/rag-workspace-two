#!/usr/bin/env node
// Comprehensive test script for Database Block Core Infrastructure
// Tests CRUD operations, performance with 1000+ records, and edge cases

import { databaseBlockCoreService } from './app/services/database-block-core.server';
import { createSupabaseAdmin } from './app/utils/supabase.server';

const TEST_USER_ID = 'test-user-123';
const TEST_BLOCK_ID = 'test-perf-block-' + Date.now();

interface TestResult {
  test: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  console.log(`\n🧪 Running: ${name}`);
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    results.push({ test: name, passed: true, duration });
    console.log(`✅ Passed (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    results.push({ 
      test: name, 
      passed: false, 
      duration,
      error: error instanceof Error ? error.message : String(error)
    });
    console.log(`❌ Failed: ${error}`);
  }
}

async function setupTestBlock(): Promise<void> {
  const supabase = createSupabaseAdmin();
  
  // First ensure we have a workspace and page
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .limit(1)
    .single();

  let workspaceId = workspace?.id;
  
  if (!workspaceId) {
    const { data: newWorkspace } = await supabase
      .from('workspaces')
      .insert({
        name: 'Test Workspace',
        slug: 'test-workspace-' + Date.now()
      })
      .select()
      .single();
    workspaceId = newWorkspace?.id;
  }

  // Create a test page
  const pageSlug = 'test-page-' + Date.now();
  const { data: page, error: pageError } = await supabase
    .from('pages')
    .insert({
      title: 'Test Page',
      slug: pageSlug,
      workspace_id: workspaceId,
      created_by: TEST_USER_ID  // Text type
    })
    .select()
    .single();

  if (!page || pageError) {
    throw new Error(`Failed to create test page: ${pageError?.message}`);
  }

  // Create a test block
  const { error: blockError } = await supabase
    .from('blocks')
    .insert({
      id: TEST_BLOCK_ID,
      type: 'database',
      content: {},
      page_id: page.id,
      position: 0,
      created_by: TEST_USER_ID,
      updated_by: TEST_USER_ID
    });

  if (blockError) {
    throw new Error(`Failed to create test block: ${blockError.message}`);
  }
}

async function cleanupTestData(): Promise<void> {
  const supabase = createSupabaseAdmin();
  
  // Delete test block (cascade will handle database block)
  await supabase
    .from('blocks')
    .delete()
    .eq('id', TEST_BLOCK_ID);
}

// ============= TEST SUITE =============

async function testCreateDatabaseBlock(): Promise<void> {
  const dbBlock = await databaseBlockCoreService.createDatabaseBlock({
    blockId: TEST_BLOCK_ID,
    name: 'Performance Test Database',
    description: 'Testing with 1000+ records',
    userId: TEST_USER_ID
  });

  if (!dbBlock) throw new Error('Failed to create database block');
  if (dbBlock.blockId !== TEST_BLOCK_ID) throw new Error('Block ID mismatch');
  if (dbBlock.schema.length === 0) throw new Error('No default schema created');
  console.log(`  Created block with ${dbBlock.schema.length} columns`);
}

async function testGetDatabaseBlock(): Promise<void> {
  const dbBlock = await databaseBlockCoreService.getDatabaseBlock(TEST_BLOCK_ID);
  if (!dbBlock) throw new Error('Failed to retrieve database block');
  if (dbBlock.name !== 'Performance Test Database') throw new Error('Name mismatch');
}

async function testAddColumn(): Promise<void> {
  const column = {
    id: 'test_column',
    name: 'Test Column',
    type: 'text' as const,
    width: 200
  };
  
  const updated = await databaseBlockCoreService.addColumn(TEST_BLOCK_ID, column);
  const hasColumn = updated.schema.some(c => c.id === 'test_column');
  if (!hasColumn) throw new Error('Column was not added');
  console.log(`  Schema now has ${updated.schema.length} columns`);
}

async function testCreateSingleRow(): Promise<void> {
  const row = await databaseBlockCoreService.createRow(TEST_BLOCK_ID, {
    data: {
      title: 'Test Row 1',
      status: 'todo',
      priority: 'high',
      test_column: 'Test Value'
    },
    userId: TEST_USER_ID
  });

  if (!row) throw new Error('Failed to create row');
  if (row.data.title !== 'Test Row 1') throw new Error('Row data mismatch');
}

async function testBulkCreate100Rows(): Promise<void> {
  const count = await databaseBlockCoreService.bulkCreateRows(
    TEST_BLOCK_ID,
    100,
    TEST_USER_ID
  );
  
  if (count !== 100) throw new Error(`Expected 100 rows, created ${count}`);
  console.log(`  Created ${count} rows`);
}

async function testBulkCreate1000Rows(): Promise<void> {
  const count = await databaseBlockCoreService.bulkCreateRows(
    TEST_BLOCK_ID,
    1000,
    TEST_USER_ID
  );
  
  if (count !== 1000) throw new Error(`Expected 1000 rows, created ${count}`);
  console.log(`  Created ${count} rows`);
}

async function testBulkCreate5000Rows(): Promise<void> {
  const count = await databaseBlockCoreService.bulkCreateRows(
    TEST_BLOCK_ID,
    5000,
    TEST_USER_ID
  );
  
  if (count !== 5000) throw new Error(`Expected 5000 rows, created ${count}`);
  console.log(`  Created ${count} rows`);
}

async function testGetRowsPagination(): Promise<void> {
  const page1 = await databaseBlockCoreService.getRows(TEST_BLOCK_ID, {
    offset: 0,
    limit: 100
  });
  
  if (page1.rows.length !== 100) throw new Error(`Expected 100 rows, got ${page1.rows.length}`);
  console.log(`  Total rows: ${page1.totalCount}, Page 1: ${page1.rows.length} rows`);
  
  const page2 = await databaseBlockCoreService.getRows(TEST_BLOCK_ID, {
    offset: 100,
    limit: 100
  });
  
  if (page2.rows.length !== 100) throw new Error(`Expected 100 rows in page 2, got ${page2.rows.length}`);
  console.log(`  Page 2: ${page2.rows.length} rows`);
  
  // Verify no overlap
  const page1Ids = new Set(page1.rows.map(r => r.id));
  const hasOverlap = page2.rows.some(r => page1Ids.has(r.id));
  if (hasOverlap) throw new Error('Pages have overlapping rows');
}

async function testSorting(): Promise<void> {
  const sorted = await databaseBlockCoreService.getRows(TEST_BLOCK_ID, {
    offset: 0,
    limit: 10,
    sorts: [{ columnId: 'title', direction: 'desc', priority: 0 }]
  });
  
  // Check if properly sorted (titles should be in descending order)
  for (let i = 1; i < sorted.rows.length; i++) {
    const prev = sorted.rows[i - 1].data.title || '';
    const curr = sorted.rows[i].data.title || '';
    if (prev < curr) {
      throw new Error('Rows not properly sorted in descending order');
    }
  }
  console.log(`  Sorted ${sorted.rows.length} rows by title DESC`);
}

async function testFiltering(): Promise<void> {
  const filtered = await databaseBlockCoreService.getRows(TEST_BLOCK_ID, {
    offset: 0,
    limit: 100,
    filters: [{
      id: '1',
      columnId: 'status',
      operator: 'equals',
      value: 'done'
    }]
  });
  
  // All returned rows should have status = 'done'
  const allDone = filtered.rows.every(r => r.data.status === 'done');
  if (!allDone) throw new Error('Filter not applied correctly');
  console.log(`  Filtered results: ${filtered.rows.length} rows with status=done`);
}

async function testUpdateRow(): Promise<void> {
  const { rows } = await databaseBlockCoreService.getRows(TEST_BLOCK_ID, {
    offset: 0,
    limit: 1
  });
  
  if (rows.length === 0) throw new Error('No rows to update');
  
  const updated = await databaseBlockCoreService.updateRow(rows[0].id, {
    data: { ...rows[0].data, title: 'Updated Title' },
    version: rows[0].version,
    userId: TEST_USER_ID
  });
  
  if (updated.data.title !== 'Updated Title') throw new Error('Row not updated');
  console.log(`  Updated row ${updated.id}`);
}

async function testDeleteRows(): Promise<void> {
  const { rows } = await databaseBlockCoreService.getRows(TEST_BLOCK_ID, {
    offset: 0,
    limit: 5
  });
  
  const rowIds = rows.map(r => r.id);
  const success = await databaseBlockCoreService.deleteRows(rowIds, TEST_USER_ID);
  
  if (!success) throw new Error('Failed to delete rows');
  
  // Verify deletion
  const after = await databaseBlockCoreService.getRows(TEST_BLOCK_ID, {
    offset: 0,
    limit: 10
  });
  
  const stillExists = after.rows.some(r => rowIds.includes(r.id));
  if (stillExists) throw new Error('Rows were not deleted');
  console.log(`  Deleted ${rowIds.length} rows`);
}

async function testLargeDatasetPerformance(): Promise<void> {
  const start = Date.now();
  const result = await databaseBlockCoreService.getRows(TEST_BLOCK_ID, {
    offset: 0,
    limit: 100
  });
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    throw new Error(`Query too slow: ${duration}ms (should be < 1000ms)`);
  }
  
  console.log(`  Fetched 100 rows from ${result.totalCount} total in ${duration}ms`);
}

async function testUpdateColumn(): Promise<void> {
  const updated = await databaseBlockCoreService.updateColumn(
    TEST_BLOCK_ID,
    'test_column',
    { name: 'Updated Column Name', width: 300 }
  );
  
  const column = updated.schema.find(c => c.id === 'test_column');
  if (column?.name !== 'Updated Column Name') throw new Error('Column not updated');
  console.log(`  Updated column: ${column.name}`);
}

async function testDeleteColumn(): Promise<void> {
  const updated = await databaseBlockCoreService.deleteColumn(
    TEST_BLOCK_ID,
    'test_column'
  );
  
  const stillExists = updated.schema.some(c => c.id === 'test_column');
  if (stillExists) throw new Error('Column was not deleted');
  console.log(`  Schema now has ${updated.schema.length} columns`);
}

// ============= MAIN TEST RUNNER =============

async function runAllTests() {
  console.log('🚀 Database Block Core Infrastructure Test Suite');
  console.log('================================================\n');
  
  try {
    // Setup
    console.log('📦 Setting up test environment...');
    await setupTestBlock();
    
    // Database Block Tests
    await runTest('Create Database Block', testCreateDatabaseBlock);
    await runTest('Get Database Block', testGetDatabaseBlock);
    await runTest('Add Column', testAddColumn);
    
    // Row Operations Tests
    await runTest('Create Single Row', testCreateSingleRow);
    await runTest('Bulk Create 100 Rows', testBulkCreate100Rows);
    await runTest('Bulk Create 1000 Rows', testBulkCreate1000Rows);
    await runTest('Bulk Create 5000 Rows', testBulkCreate5000Rows);
    
    // Query Tests
    await runTest('Get Rows with Pagination', testGetRowsPagination);
    await runTest('Sorting', testSorting);
    await runTest('Filtering', testFiltering);
    
    // Update/Delete Tests
    await runTest('Update Row', testUpdateRow);
    await runTest('Delete Rows', testDeleteRows);
    
    // Performance Tests
    await runTest('Large Dataset Performance', testLargeDatasetPerformance);
    
    // Column Management Tests
    await runTest('Update Column', testUpdateColumn);
    await runTest('Delete Column', testDeleteColumn);
    
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    await cleanupTestData();
  }
  
  // Print summary
  console.log('\n================================================');
  console.log('📊 Test Results Summary\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total Duration: ${totalDuration}ms`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.test}: ${r.error}`);
    });
  }
  
  // Performance metrics
  const performanceTests = results.filter(r => 
    r.test.includes('Bulk') || r.test.includes('Performance')
  );
  
  if (performanceTests.length > 0) {
    console.log('\n⚡ Performance Metrics:');
    performanceTests.forEach(r => {
      console.log(`  - ${r.test}: ${r.duration}ms`);
    });
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
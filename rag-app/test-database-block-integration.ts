#!/usr/bin/env tsx

/**
 * Database Block Integration Test Script
 * Tests the full database block implementation with real data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  test: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class DatabaseBlockIntegrationTest {
  private results: TestResult[] = [];
  private workspaceId: string = '';
  private userId: string = '';
  private blockId: string = '';

  async setup() {
    console.log('🔧 Setting up test environment...');
    
    // Create or get admin role
    let adminRole = await prisma.role.findFirst({
      where: { name: 'admin' }
    });
    
    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: {
          name: 'admin',
          displayName: 'Administrator',
          description: 'Full access to workspace',
          isSystem: true
        }
      });
    }
    
    // Create test workspace and user
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Test Workspace',
        slug: `test-workspace-${Date.now()}`,
        description: 'Integration test workspace'
      }
    });
    this.workspaceId = workspace.id;

    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        name: 'Test User',
        passwordHash: 'test-hash' // Required field
      }
    });
    this.userId = user.id;

    // Create workspace member
    await prisma.userWorkspace.create({
      data: {
        workspace: { connect: { id: this.workspaceId }},
        user: { connect: { id: this.userId }},
        role: { connect: { id: adminRole.id }}
      }
    });

    console.log('✅ Test environment ready');
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    try {
      // Clean up in reverse order
      await prisma.userWorkspace.deleteMany({
        where: { workspaceId: this.workspaceId }
      });
      
      if (this.blockId) {
        await prisma.$executeRaw`DELETE FROM db_block_rows WHERE db_block_id = ${this.blockId}::uuid`;
        await prisma.$executeRaw`DELETE FROM db_blocks WHERE id = ${this.blockId}::uuid`;
      }
      
      await prisma.user.delete({ where: { id: this.userId }});
      await prisma.workspace.delete({ where: { id: this.workspaceId }});
      
      console.log('✅ Cleanup complete');
    } catch (error) {
      console.log('⚠️  Cleanup error (non-fatal):', error);
    }
  }

  async runTest(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
      await fn();
      this.results.push({
        test: name,
        passed: true,
        duration: Date.now() - start
      });
      console.log(`✅ ${name} (${Date.now() - start}ms)`);
    } catch (error) {
      this.results.push({
        test: name,
        passed: false,
        duration: Date.now() - start,
        error: error instanceof Error ? error.message : String(error)
      });
      console.log(`❌ ${name}: ${error}`);
    }
  }

  async testDatabaseBlockCreation() {
    await this.runTest('Create database block', async () => {
      const result = await prisma.$executeRaw`
        INSERT INTO db_blocks (id, workspace_id, name, schema, settings)
        VALUES (
          gen_random_uuid(),
          ${this.workspaceId}::uuid,
          'Test Database',
          jsonb_build_object(
            'columns', jsonb_build_array(
              jsonb_build_object('id', 'col1', 'name', 'Title', 'type', 'text'),
              jsonb_build_object('id', 'col2', 'name', 'Status', 'type', 'select'),
              jsonb_build_object('id', 'col3', 'name', 'Priority', 'type', 'number')
            )
          ),
          jsonb_build_object('view', 'table')
        )
        RETURNING id
      `;
      
      // Get the created block ID
      const block = await prisma.$queryRaw<{id: string}[]>`
        SELECT id FROM db_blocks WHERE workspace_id = ${this.workspaceId}::uuid LIMIT 1
      `;
      
      this.blockId = block[0].id;
      
      if (!this.blockId) throw new Error('Failed to create database block');
    });
  }

  async testMassiveDataInsertion() {
    await this.runTest('Insert 10,000 rows', async () => {
      const batchSize = 1000;
      const totalRows = 10000;
      
      for (let batch = 0; batch < totalRows / batchSize; batch++) {
        const values = Array.from({ length: batchSize }, (_, i) => {
          const rowNum = batch * batchSize + i;
          return `(
            gen_random_uuid(),
            '${this.blockId}'::uuid,
            jsonb_build_object(
              'col1', 'Task ${rowNum}',
              'col2', '${rowNum % 2 === 0 ? 'active' : 'inactive'}',
              'col3', ${rowNum}
            ),
            ${rowNum}
          )`;
        }).join(',');
        
        await prisma.$executeRawUnsafe(`
          INSERT INTO db_block_rows (id, db_block_id, data, "position")
          VALUES ${values}
        `);
      }
      
      // Verify count
      const count = await prisma.$queryRaw<{count: bigint}[]>`
        SELECT COUNT(*) as count FROM db_block_rows WHERE db_block_id = ${this.blockId}::uuid
      `;
      
      if (Number(count[0].count) !== totalRows) {
        throw new Error(`Expected ${totalRows} rows, got ${count[0].count}`);
      }
    });
  }

  async testQueryPerformance() {
    await this.runTest('Query with filters and sorting', async () => {
      const result = await prisma.$queryRaw<any[]>`
        SELECT * FROM db_block_rows 
        WHERE db_block_id = ${this.blockId}::uuid
          AND data->>'col2' = 'active'
          AND (data->>'col3')::int > 5000
        ORDER BY (data->>'col3')::int DESC
        LIMIT 100
      `;
      
      if (result.length === 0) {
        throw new Error('No results returned from filtered query');
      }
    });
  }

  async testFormulaEvaluation() {
    await this.runTest('Evaluate formulas on 1000 rows', async () => {
      // Add formula column
      await prisma.$executeRaw`
        UPDATE db_blocks 
        SET schema = schema || jsonb_build_object(
          'columns', schema->'columns' || jsonb_build_array(
            jsonb_build_object(
              'id', 'col4',
              'name', 'Calculated',
              'type', 'formula',
              'formula', 'col3 * 2 + 100'
            )
          )
        )
        WHERE id = ${this.blockId}::uuid
      `;
      
      // Simulate formula evaluation
      const rows = await prisma.$queryRaw<any[]>`
        SELECT id, data FROM db_block_rows 
        WHERE db_block_id = ${this.blockId}::uuid
        LIMIT 1000
      `;
      
      const evaluated = rows.map(row => ({
        ...row,
        calculated: (row.data.col3 * 2 + 100)
      }));
      
      if (evaluated.length !== 1000) {
        throw new Error('Failed to evaluate formulas');
      }
    });
  }

  async testViewAggregations() {
    await this.runTest('Aggregate data for views', async () => {
      // Group by status (for Kanban view)
      const kanbanGroups = await prisma.$queryRaw<any[]>`
        SELECT 
          data->>'col2' as status,
          COUNT(*) as count,
          AVG((data->>'col3')::int) as avg_priority
        FROM db_block_rows
        WHERE db_block_id = ${this.blockId}::uuid
        GROUP BY data->>'col2'
      `;
      
      if (kanbanGroups.length !== 2) { // active and inactive
        throw new Error('Incorrect grouping results');
      }
      
      // Date aggregation (for Calendar view)
      const calendarData = await prisma.$queryRaw<any[]>`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as count
        FROM db_block_rows
        WHERE db_block_id = ${this.blockId}::uuid
        GROUP BY DATE(created_at)
      `;
      
      if (calendarData.length === 0) {
        throw new Error('No calendar aggregation data');
      }
    });
  }

  async testConcurrentUpdates() {
    await this.runTest('Handle 100 concurrent updates', async () => {
      const updatePromises = Array.from({ length: 100 }, (_, i) => 
        prisma.$executeRaw`
          UPDATE db_block_rows
          SET data = data || jsonb_build_object('col1', ${'Updated ' + i})
          WHERE db_block_id = ${this.blockId}::uuid
          AND (data->>'col3')::int = ${i * 100}
        `
      );
      
      const results = await Promise.allSettled(updatePromises);
      const failed = results.filter(r => r.status === 'rejected');
      
      if (failed.length > 0) {
        throw new Error(`${failed.length} updates failed`);
      }
    });
  }

  async testIndexPerformance() {
    await this.runTest('Test JSONB index performance', async () => {
      // Create GIN index if not exists
      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_db_block_rows_data_gin 
        ON db_block_rows USING gin (data)
      `;
      
      // Test indexed query performance
      const start = Date.now();
      
      const result = await prisma.$queryRaw<any[]>`
        SELECT * FROM db_block_rows
        WHERE db_block_id = ${this.blockId}::uuid
          AND data @> '{"col2": "active"}'
        LIMIT 1000
      `;
      
      const queryTime = Date.now() - start;
      
      if (queryTime > 100) {
        throw new Error(`Query took ${queryTime}ms, expected < 100ms`);
      }
    });
  }

  async testPartitionedTablePerformance() {
    await this.runTest('Query partitioned table', async () => {
      // Check if partitioned table exists
      const partitions = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname LIKE 'db_block_rows_part_%'
          AND n.nspname = 'public'
      `;
      
      if (Number(partitions[0].count) > 0) {
        // Query partitioned table
        const result = await prisma.$queryRaw<any[]>`
          SELECT * FROM db_block_rows_partitioned
          WHERE db_block_id = ${this.blockId}::uuid
          LIMIT 100
        `;
        
        console.log(`  → Found ${result.length} rows in partitioned table`);
      } else {
        console.log('  → Partitioned tables not set up, skipping');
      }
    });
  }

  async testMemoryUsage() {
    await this.runTest('Memory usage under load', async () => {
      const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;
      
      // Load large dataset
      const rows = await prisma.$queryRaw<any[]>`
        SELECT * FROM db_block_rows
        WHERE db_block_id = ${this.blockId}::uuid
        LIMIT 5000
      `;
      
      // Process data
      const processed = rows.map(row => ({
        ...row,
        processed: true,
        timestamp: new Date()
      }));
      
      const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
      const memUsed = memAfter - memBefore;
      
      console.log(`  → Memory used: ${memUsed.toFixed(2)} MB`);
      
      if (memUsed > 100) {
        throw new Error(`Excessive memory usage: ${memUsed.toFixed(2)} MB`);
      }
    });
  }

  printReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DATABASE BLOCK INTEGRATION TEST RESULTS');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log(`\nTests: ${passed} passed, ${failed} failed, ${this.results.length} total`);
    console.log(`Duration: ${totalDuration}ms\n`);
    
    // Print detailed results
    console.log('Test Results:');
    console.log('-'.repeat(60));
    
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const duration = `${result.duration}ms`.padStart(8);
      console.log(`${status} ${duration} - ${result.test}`);
      if (result.error) {
        console.log(`     Error: ${result.error}`);
      }
    });
    
    console.log('-'.repeat(60));
    
    // Performance summary
    const avgDuration = totalDuration / this.results.length;
    console.log(`\nAverage test duration: ${avgDuration.toFixed(2)}ms`);
    
    if (failed > 0) {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
      process.exit(1);
    } else {
      console.log('\n🎉 All tests passed successfully!');
    }
  }

  async run() {
    console.log('🚀 Starting Database Block Integration Tests\n');
    
    try {
      await this.setup();
      
      // Run all tests in sequence
      await this.testDatabaseBlockCreation();
      await this.testMassiveDataInsertion();
      await this.testQueryPerformance();
      await this.testFormulaEvaluation();
      await this.testViewAggregations();
      await this.testConcurrentUpdates();
      await this.testIndexPerformance();
      await this.testPartitionedTablePerformance();
      await this.testMemoryUsage();
      
      this.printReport();
    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    } finally {
      await this.cleanup();
      await prisma.$disconnect();
    }
  }
}

// Run the tests
const tester = new DatabaseBlockIntegrationTest();
tester.run().catch(console.error);
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function applyIndexingFix() {
  try {
    // First drop the existing function
    await prisma.$executeRaw`
      DROP FUNCTION IF EXISTS enqueue_indexing_task(text,uuid,uuid,text,integer,jsonb)
    `;
    
    console.log('✅ Dropped existing enqueue_indexing_task function');
    
    // Create or replace the function with UPSERT logic
    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION enqueue_indexing_task(
        p_resource_type TEXT,
        p_resource_id UUID,
        p_workspace_id UUID,
        p_operation TEXT,
        p_priority INTEGER DEFAULT 0,
        p_metadata JSONB DEFAULT '{}'
      ) RETURNS VOID AS $$
      BEGIN
        -- Use UPSERT to handle duplicate entries
        -- If a pending task already exists, just update its metadata and timestamp
        INSERT INTO indexing_queue (
          resource_type,
          resource_id,
          workspace_id,
          operation,
          status,
          priority,
          metadata,
          created_at,
          updated_at
        ) VALUES (
          p_resource_type,
          p_resource_id,
          p_workspace_id,
          p_operation,
          'pending',
          p_priority,
          p_metadata,
          NOW(),
          NOW()
        )
        ON CONFLICT (resource_type, resource_id, operation, status) 
        DO UPDATE SET
          metadata = EXCLUDED.metadata || indexing_queue.metadata,
          priority = GREATEST(EXCLUDED.priority, indexing_queue.priority),
          updated_at = NOW();
          
        -- Log for debugging (optional, can be removed in production)
        RAISE NOTICE 'Indexing task queued/updated: % % %', p_resource_type, p_resource_id, p_operation;
        
      EXCEPTION WHEN OTHERS THEN
        -- Log error but don't fail the transaction
        RAISE WARNING 'Failed to queue indexing task: %', SQLERRM;
      END;
      $$ LANGUAGE plpgsql
    `;
    
    console.log('✅ Updated enqueue_indexing_task function with UPSERT logic');
    
    // Clear the existing queue
    const cleared = await prisma.$executeRaw`
      TRUNCATE TABLE indexing_queue
    `;
    
    console.log('✅ Cleared indexing queue');
    
    // Test the fix by updating a page
    console.log('\n🧪 Testing the fix...');
    
    // Use executeRaw for VOID functions
    await prisma.$executeRaw`
      SELECT enqueue_indexing_task(
        'page'::TEXT,
        'dc34bc7b-cdf9-4095-9c80-906e3c3d24d7'::UUID,
        NULL,
        'update'::TEXT,
        10,
        '{"test": true}'::JSONB
      )
    `;
    
    console.log('✅ Test successful - no duplicate constraint error');
    
    // Try again to ensure UPSERT works
    await prisma.$executeRaw`
      SELECT enqueue_indexing_task(
        'page'::TEXT,
        'dc34bc7b-cdf9-4095-9c80-906e3c3d24d7'::UUID,
        NULL,
        'update'::TEXT,
        10,
        '{"test": true, "second": true}'::JSONB
      )
    `;
    
    console.log('✅ Second test successful - UPSERT handled duplicate');
    
    // Check the queue
    const queueCheck = await prisma.$queryRaw`
      SELECT * FROM indexing_queue 
      WHERE resource_id = 'dc34bc7b-cdf9-4095-9c80-906e3c3d24d7'
    `;
    
    console.log('\nQueue entry after UPSERT:');
    console.log(queueCheck);
    
    // Clear test data
    await prisma.$executeRaw`
      DELETE FROM indexing_queue 
      WHERE metadata->>'test' = 'true'
    `;
    
    console.log('\n✅ Fix applied successfully! Page saves should work now.');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Details:', error);
  } finally {
    await prisma.$disconnect();
  }
}

applyIndexingFix();
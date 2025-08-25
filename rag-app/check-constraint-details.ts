import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkConstraintDetails() {
  try {
    // Get details of the unique constraint
    const constraintDetails = await prisma.$queryRaw`
      SELECT 
        tc.constraint_name,
        kcu.column_name,
        tc.table_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_name = 'unique_pending_entity'
      AND tc.table_schema = 'public'
      ORDER BY kcu.ordinal_position
    `;
    
    console.log('Unique constraint details:');
    console.log(constraintDetails);
    
    // Check current records in indexing_queue
    const queueRecords = await prisma.$queryRaw`
      SELECT 
        resource_type, 
        resource_id, 
        operation, 
        status,
        COUNT(*) as count
      FROM indexing_queue
      GROUP BY resource_type, resource_id, operation, status
      HAVING COUNT(*) > 0
      ORDER BY count DESC
      LIMIT 10
    `;
    
    console.log('\nCurrent indexing_queue records (grouped):');
    console.log(queueRecords);
    
    // Check the trigger function
    const triggerFunction = await prisma.$queryRaw`
      SELECT 
        routine_name,
        routine_definition
      FROM information_schema.routines
      WHERE routine_name = 'queue_content_for_indexing'
      AND routine_schema = 'public'
    `;
    
    console.log('\nTrigger function definition:');
    console.log(triggerFunction);
    
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkConstraintDetails();
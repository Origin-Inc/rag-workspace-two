import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixIndexingQueue() {
  try {
    // Clear all pending indexing tasks for pages
    const result = await prisma.$executeRaw`
      DELETE FROM indexing_queue 
      WHERE resource_type = 'page' 
      AND status = 'pending'
    `;
    
    console.log(`✅ Cleared ${result} pending indexing tasks for pages`);
    
    // Also clear any failed tasks
    const failedResult = await prisma.$executeRaw`
      DELETE FROM indexing_queue 
      WHERE status IN ('failed', 'error')
    `;
    
    console.log(`✅ Cleared ${failedResult} failed/error indexing tasks`);
    
    // Show remaining tasks
    const remaining = await prisma.$queryRaw`
      SELECT 
        resource_type, 
        status,
        COUNT(*) as count
      FROM indexing_queue
      GROUP BY resource_type, status
    `;
    
    console.log('\nRemaining indexing tasks:');
    console.log(remaining);
    
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixIndexingQueue();
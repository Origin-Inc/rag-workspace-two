import { Queue, Worker } from 'bullmq';
import { prisma } from '~/utils/db.server';

// Create queue
const indexingQueue = new Queue('indexing', {
  connection: {
    host: 'localhost',
    port: 6379,
  },
});

// Process indexing tasks
const worker = new Worker(
  'indexing',
  async (job) => {
    const { resourceType, resourceId, operation } = job.data;
    
    try {
      // Process based on operation
      if (operation === 'update' || operation === 'insert') {
        // TODO: Generate embeddings, update search index
        console.log(`Processing ${operation} for ${resourceType} ${resourceId}`);
      } else if (operation === 'delete') {
        // TODO: Remove from search index
        console.log(`Processing delete for ${resourceType} ${resourceId}`);
      }
      
      // Mark as processed in database
      await prisma.$executeRaw`
        UPDATE indexing_queue 
        SET status = 'completed', 
            processed_at = NOW() 
        WHERE resource_id = ${resourceId}::uuid 
        AND resource_type = ${resourceType}
        AND operation = ${operation}
      `;
      
      return { success: true };
    } catch (error) {
      console.error('Indexing error:', error);
      throw error;
    }
  },
  {
    connection: {
      host: 'localhost',
      port: 6379,
    },
    concurrency: 5, // Process 5 tasks concurrently
  }
);

// Poll database queue and add to Redis queue
setInterval(async () => {
  try {
    const tasks = await prisma.$queryRaw`
      SELECT * FROM indexing_queue 
      WHERE status = 'pending' 
      LIMIT 100
    `;
    
    for (const task of tasks as any[]) {
      await indexingQueue.add('process', {
        resourceType: task.resource_type,
        resourceId: task.resource_id,
        operation: task.operation,
      });
      
      // Mark as queued
      await prisma.$executeRaw`
        UPDATE indexing_queue 
        SET status = 'queued' 
        WHERE id = ${task.id}::uuid
      `;
    }
  } catch (error) {
    console.error('Queue polling error:', error);
  }
}, 5000); // Check every 5 seconds

export { worker, indexingQueue };
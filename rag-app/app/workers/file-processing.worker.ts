import { prisma } from '~/utils/db.server';
import { FileBatchProcessor } from '~/services/file-batch-processor.server';
import { getRedis } from '~/utils/redis.server';
import { parentPort } from 'worker_threads';

// Worker configuration
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_RETRIES = 3;
const LOCK_DURATION = 300000; // 5 minutes

// Redis client for distributed locking
let redis: Awaited<ReturnType<typeof getRedis>> | null = null;

/**
 * Initialize worker
 */
async function initWorker() {
  console.log(`[${WORKER_ID}] File processing worker starting...`);
  
  try {
    redis = await getRedis();
    console.log(`[${WORKER_ID}] Redis connection established`);
  } catch (error) {
    console.error(`[${WORKER_ID}] Failed to connect to Redis:`, error);
  }

  // Start processing loop
  processJobs();
}

/**
 * Main job processing loop
 */
async function processJobs() {
  while (true) {
    try {
      // Find next available job
      const job = await getNextJob();
      
      if (job) {
        console.log(`[${WORKER_ID}] Processing job ${job.id} for file ${job.fileId}`);
        await processJob(job);
      } else {
        // No jobs available, wait before polling again
        await sleep(POLL_INTERVAL);
      }
    } catch (error) {
      console.error(`[${WORKER_ID}] Error in processing loop:`, error);
      await sleep(POLL_INTERVAL);
    }
  }
}

/**
 * Get next available job from queue
 */
async function getNextJob() {
  try {
    // Find pending job and claim it atomically
    const job = await prisma.$transaction(async (tx) => {
      // Find next pending job
      const pendingJob = await tx.fileProcessingJob.findFirst({
        where: {
          status: 'pending',
          retryCount: { lt: MAX_RETRIES }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ]
      });

      if (!pendingJob) {
        return null;
      }

      // Try to acquire lock using Redis if available
      if (redis) {
        const lockKey = `job-lock:${pendingJob.id}`;
        const locked = await redis.set(lockKey, WORKER_ID, 'NX', 'PX', LOCK_DURATION);
        
        if (!locked) {
          // Another worker got this job
          return null;
        }
      }

      // Update job to claim it
      const claimedJob = await tx.fileProcessingJob.update({
        where: { 
          id: pendingJob.id,
          status: 'pending' // Double-check status hasn't changed
        },
        data: {
          status: 'running',
          workerId: WORKER_ID,
          startedAt: new Date()
        }
      });

      return claimedJob;
    });

    return job;
  } catch (error) {
    console.error(`[${WORKER_ID}] Error getting next job:`, error);
    return null;
  }
}

/**
 * Process a single job
 */
async function processJob(job: any) {
  try {
    // Process the file based on job type
    const result = await FileBatchProcessor.processFileFromStorage(
      job.fileId,
      job.id,
      {
        onProgress: async (progress, processedRows, totalRows) => {
          // Update job progress
          await prisma.fileProcessingJob.update({
            where: { id: job.id },
            data: {
              progressPercent: progress,
              processedRows,
              totalRows
            }
          });

          // Send progress to parent if in worker thread
          if (parentPort) {
            parentPort.postMessage({
              type: 'progress',
              jobId: job.id,
              progress,
              processedRows,
              totalRows
            });
          }
        },
        onBatch: async (batchData, batchNumber) => {
          // Here we could insert data into PostgreSQL
          // For now, we're just tracking progress
          console.log(`[${WORKER_ID}] Processed batch ${batchNumber} with ${batchData.length} rows`);
          
          // In a real implementation, you would:
          // 1. Create a dynamic table if it doesn't exist
          // 2. Insert batch data using COPY command or batch insert
          // 3. Update indexes and statistics
        }
      }
    );

    console.log(`[${WORKER_ID}] Job ${job.id} completed successfully`);
    
    // Release lock if using Redis
    if (redis) {
      const lockKey = `job-lock:${job.id}`;
      await redis.del(lockKey);
    }

    // Send completion message if in worker thread
    if (parentPort) {
      parentPort.postMessage({
        type: 'completed',
        jobId: job.id,
        result
      });
    }

  } catch (error) {
    console.error(`[${WORKER_ID}] Job ${job.id} failed:`, error);
    
    // Update job status
    const updatedJob = await prisma.fileProcessingJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        retryCount: { increment: 1 },
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorDetails: error instanceof Error ? { stack: error.stack } : {},
        completedAt: new Date()
      }
    });

    // Retry if under max retries
    if (updatedJob.retryCount < MAX_RETRIES) {
      console.log(`[${WORKER_ID}] Job ${job.id} will be retried (attempt ${updatedJob.retryCount + 1}/${MAX_RETRIES})`);
      
      // Reset status to pending for retry
      await prisma.fileProcessingJob.update({
        where: { id: job.id },
        data: {
          status: 'pending',
          workerId: null
        }
      });
    }

    // Release lock if using Redis
    if (redis) {
      const lockKey = `job-lock:${job.id}`;
      await redis.del(lockKey);
    }

    // Send error message if in worker thread
    if (parentPort) {
      parentPort.postMessage({
        type: 'error',
        jobId: job.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

/**
 * Helper function to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  console.log(`[${WORKER_ID}] Shutting down worker...`);
  
  // Mark any running jobs as pending so they can be picked up by another worker
  await prisma.fileProcessingJob.updateMany({
    where: {
      workerId: WORKER_ID,
      status: 'running'
    },
    data: {
      status: 'pending',
      workerId: null
    }
  });

  if (redis) {
    await redis.quit();
  }

  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the worker
initWorker();
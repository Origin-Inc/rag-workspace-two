#!/usr/bin/env node

/**
 * File Processing Worker Runner
 * 
 * This script runs the file processing worker that processes uploaded files
 * in the background. It handles CSV, Excel, and PDF files.
 * 
 * Usage:
 *   npm run worker:files
 *   node scripts/run-file-worker.js
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Worker configuration
const NUM_WORKERS = process.env.FILE_WORKER_COUNT || 2;
const workers = [];

/**
 * Create and start a worker
 */
function createWorker(id) {
  console.log(`Starting file processing worker ${id}...`);
  
  const worker = new Worker(
    join(__dirname, '../app/workers/file-processing.worker.ts'),
    {
      execArgv: ['--loader', 'tsx']
    }
  );

  worker.on('message', (message) => {
    console.log(`[Worker ${id}]`, message);
  });

  worker.on('error', (error) => {
    console.error(`[Worker ${id}] Error:`, error);
    // Restart worker on error
    setTimeout(() => {
      console.log(`Restarting worker ${id}...`);
      createWorker(id);
    }, 5000);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.error(`[Worker ${id}] Exited with code ${code}`);
      // Restart worker on non-zero exit
      setTimeout(() => {
        console.log(`Restarting worker ${id}...`);
        createWorker(id);
      }, 5000);
    }
  });

  workers[id] = worker;
  return worker;
}

/**
 * Start all workers
 */
function startWorkers() {
  console.log(`Starting ${NUM_WORKERS} file processing workers...`);
  
  for (let i = 0; i < NUM_WORKERS; i++) {
    createWorker(i);
  }

  console.log('File processing workers started successfully');
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('Shutting down file processing workers...');
  
  for (const worker of workers) {
    if (worker) {
      await worker.terminate();
    }
  }
  
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start workers
startWorkers();

// Keep process alive
setInterval(() => {
  // Health check - could add monitoring here
}, 60000);
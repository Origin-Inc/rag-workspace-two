import { useRef, useCallback, useEffect, useState } from 'react';

interface WorkerTask {
  id: string;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

interface WorkerOptions {
  maxWorkers?: number;
  fallbackToMainThread?: boolean;
  debug?: boolean;
}

/**
 * Hook for using Web Workers to process database data
 * Falls back to main thread if workers are not available
 */
export function useDataWorker(options: WorkerOptions = {}) {
  const {
    maxWorkers = navigator.hardwareConcurrency || 4,
    fallbackToMainThread = true,
    debug = false
  } = options;
  
  const workers = useRef<Worker[]>([]);
  const taskQueue = useRef<WorkerTask[]>([]);
  const activeWorkers = useRef<Map<Worker, string>>(new Map());
  const [isSupported, setIsSupported] = useState(true);
  const [workerCount, setWorkerCount] = useState(0);
  
  // Initialize workers
  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setIsSupported(false);
      if (debug) console.warn('Web Workers not supported');
      return;
    }
    
    try {
      // Create worker pool
      const workerPool: Worker[] = [];
      
      for (let i = 0; i < Math.min(maxWorkers, 4); i++) {
        const worker = new Worker(
          new URL('../workers/database-processor.worker.ts', import.meta.url),
          { type: 'module' }
        );
        
        worker.addEventListener('message', (event) => {
          const { id, result, error } = event.data;
          const task = taskQueue.current.find(t => t.id === id);
          
          if (task) {
            if (error) {
              task.reject(new Error(error));
            } else {
              task.resolve(result);
            }
            
            // Remove completed task
            taskQueue.current = taskQueue.current.filter(t => t.id !== id);
            
            // Mark worker as idle
            activeWorkers.current.delete(worker);
            
            // Process next task if available
            processNextTask();
          }
        });
        
        worker.addEventListener('error', (error) => {
          if (debug) console.error('Worker error:', error);
          
          // Find and reject all tasks for this worker
          const workerId = activeWorkers.current.get(worker);
          if (workerId) {
            const task = taskQueue.current.find(t => t.id === workerId);
            if (task) {
              task.reject(new Error('Worker error'));
              taskQueue.current = taskQueue.current.filter(t => t.id !== workerId);
            }
          }
          
          activeWorkers.current.delete(worker);
        });
        
        workerPool.push(worker);
      }
      
      workers.current = workerPool;
      setWorkerCount(workerPool.length);
      
      if (debug) console.log(`Initialized ${workerPool.length} workers`);
    } catch (error) {
      setIsSupported(false);
      if (debug) console.error('Failed to initialize workers:', error);
    }
    
    // Cleanup
    return () => {
      workers.current.forEach(worker => worker.terminate());
      workers.current = [];
      taskQueue.current = [];
      activeWorkers.current.clear();
    };
  }, [maxWorkers, debug]);
  
  // Process next task in queue
  const processNextTask = useCallback(() => {
    if (taskQueue.current.length === 0) return;
    
    // Find an idle worker
    const idleWorker = workers.current.find(w => !activeWorkers.current.has(w));
    if (!idleWorker) return;
    
    // Get next task
    const task = taskQueue.current[0];
    if (!task) return;
    
    // Mark worker as active
    activeWorkers.current.set(idleWorker, task.id);
    
    // Send task to worker
    const message = {
      id: task.id,
      ...task
    };
    
    idleWorker.postMessage(message);
  }, []);
  
  // Main thread fallback functions
  const filterMainThread = useCallback((data: any[], filters: any[]) => {
    return data.filter(row => {
      return filters.every(filter => {
        const value = row.cells?.[filter.columnId] ?? row[filter.columnId];
        
        switch (filter.operator) {
          case 'equals':
            return value === filter.value;
          case 'contains':
            return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          case 'greater_than':
            return Number(value) > Number(filter.value);
          case 'less_than':
            return Number(value) < Number(filter.value);
          case 'is_empty':
            return value == null || value === '';
          case 'is_not_empty':
            return value != null && value !== '';
          default:
            return true;
        }
      });
    });
  }, []);
  
  const sortMainThread = useCallback((data: any[], sorts: any[]) => {
    return [...data].sort((a, b) => {
      for (const sort of sorts) {
        const aVal = a.cells?.[sort.columnId] ?? a[sort.columnId];
        const bVal = b.cells?.[sort.columnId] ?? b[sort.columnId];
        
        let comparison = 0;
        
        if (aVal == null && bVal == null) comparison = 0;
        else if (aVal == null) comparison = 1;
        else if (bVal == null) comparison = -1;
        else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }
        
        if (comparison !== 0) {
          return sort.direction === 'desc' ? -comparison : comparison;
        }
      }
      
      return 0;
    });
  }, []);
  
  const searchMainThread = useCallback((data: any[], query: string) => {
    const searchTerm = query.toLowerCase();
    
    return data.filter(row => {
      const cells = row.cells || row;
      
      for (const value of Object.values(cells)) {
        if (String(value).toLowerCase().includes(searchTerm)) {
          return true;
        }
      }
      
      return false;
    });
  }, []);
  
  // Execute task
  const execute = useCallback(async <T = any>(
    type: string,
    data: any,
    options?: any
  ): Promise<T> => {
    // Use main thread if workers not supported
    if (!isSupported || (fallbackToMainThread && workers.current.length === 0)) {
      if (debug) console.log('Falling back to main thread for:', type);
      
      switch (type) {
        case 'filter':
          return filterMainThread(data, options) as T;
        case 'sort':
          return sortMainThread(data, options) as T;
        case 'search':
          return searchMainThread(data, options.query) as T;
        default:
          throw new Error(`Unsupported operation: ${type}`);
      }
    }
    
    // Create task promise
    return new Promise<T>((resolve, reject) => {
      const taskId = `task-${Date.now()}-${Math.random()}`;
      
      const task: WorkerTask = {
        id: taskId,
        resolve,
        reject
      };
      
      // Add to queue
      taskQueue.current.push(task);
      
      // Create worker message
      const message = {
        id: taskId,
        type,
        data,
        options
      };
      
      // Find idle worker or wait
      const idleWorker = workers.current.find(w => !activeWorkers.current.has(w));
      
      if (idleWorker) {
        activeWorkers.current.set(idleWorker, taskId);
        idleWorker.postMessage(message);
      }
      // Task will be processed when a worker becomes available
    });
  }, [isSupported, fallbackToMainThread, debug, filterMainThread, sortMainThread, searchMainThread]);
  
  // Convenience methods
  const filter = useCallback((data: any[], filters: any[]) => {
    return execute('filter', data, filters);
  }, [execute]);
  
  const sort = useCallback((data: any[], sorts: any[]) => {
    return execute('sort', data, sorts);
  }, [execute]);
  
  const aggregate = useCallback((data: any[], options: any) => {
    return execute('aggregate', data, options);
  }, [execute]);
  
  const search = useCallback((data: any[], query: string, options?: any) => {
    return execute('search', data, { query, ...options });
  }, [execute]);
  
  const transform = useCallback((data: any[], options: any) => {
    return execute('transform', data, options);
  }, [execute]);
  
  const batch = useCallback((operations: any[]) => {
    return execute('batch', null, operations);
  }, [execute]);
  
  // Get worker status
  const getStatus = useCallback(() => {
    return {
      isSupported,
      workerCount,
      activeWorkers: activeWorkers.current.size,
      queueLength: taskQueue.current.length,
      idleWorkers: workerCount - activeWorkers.current.size
    };
  }, [isSupported, workerCount]);
  
  return {
    // Status
    isSupported,
    workerCount,
    getStatus,
    
    // Operations
    execute,
    filter,
    sort,
    aggregate,
    search,
    transform,
    batch
  };
}
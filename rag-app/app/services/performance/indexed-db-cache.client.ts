import { debounce } from 'lodash';

interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl: number;
  size: number;
}

interface CacheStats {
  entries: number;
  totalSize: number;
  hitRate: number;
  hits: number;
  misses: number;
}

/**
 * IndexedDB caching layer for frequently accessed data
 */
export class IndexedDBCache {
  private static instance: IndexedDBCache;
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'AppCache';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'cache';
  private readonly MAX_SIZE = 50 * 1024 * 1024; // 50MB max cache size
  private stats: CacheStats = {
    entries: 0,
    totalSize: 0,
    hitRate: 0,
    hits: 0,
    misses: 0,
  };
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  static getInstance(): IndexedDBCache {
    if (!this.instance) {
      this.instance = new IndexedDBCache();
    }
    return this.instance;
  }
  
  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    if (this.db) return;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      
      request.onerror = () => {
        console.error('[IndexedDBCache] Failed to open database');
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDBCache] Database initialized');
        this.loadStats();
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('size', 'size', { unique: false });
        }
      };
    });
  }
  
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.get(key);
      
      request.onsuccess = () => {
        const entry: CacheEntry = request.result;
        
        if (!entry) {
          this.stats.misses++;
          this.updateHitRate();
          resolve(null);
          return;
        }
        
        // Check TTL
        const now = Date.now();
        if (entry.ttl > 0 && now - entry.timestamp > entry.ttl) {
          // Expired, delete it
          this.delete(key);
          this.stats.misses++;
          this.updateHitRate();
          resolve(null);
          return;
        }
        
        this.stats.hits++;
        this.updateHitRate();
        
        console.log(`[IndexedDBCache] Hit for key: ${key}`);
        resolve(entry.value);
      };
      
      request.onerror = () => {
        console.error(`[IndexedDBCache] Error getting key: ${key}`);
        resolve(null);
      };
    });
  }
  
  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttl: number = 24 * 60 * 60 * 1000): Promise<void> {
    if (!this.db) await this.init();
    
    const size = this.estimateSize(value);
    
    // Check if we need to evict old entries
    if (this.stats.totalSize + size > this.MAX_SIZE) {
      await this.evictOldest();
    }
    
    const entry: CacheEntry = {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      size,
    };
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.put(entry);
      
      request.onsuccess = () => {
        this.stats.entries++;
        this.stats.totalSize += size;
        this.saveStats();
        
        console.log(`[IndexedDBCache] Cached key: ${key} (${size} bytes)`);
        resolve();
      };
      
      request.onerror = () => {
        console.error(`[IndexedDBCache] Error setting key: ${key}`);
        reject(request.error);
      };
    });
  }
  
  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    if (!this.db) await this.init();
    
    // Get size first
    const entry = await this.get<any>(key);
    const size = entry ? this.estimateSize(entry) : 0;
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.delete(key);
      
      request.onsuccess = () => {
        this.stats.entries = Math.max(0, this.stats.entries - 1);
        this.stats.totalSize = Math.max(0, this.stats.totalSize - size);
        this.saveStats();
        resolve();
      };
      
      request.onerror = () => {
        console.error(`[IndexedDBCache] Error deleting key: ${key}`);
        resolve();
      };
    });
  }
  
  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => {
        this.stats = {
          entries: 0,
          totalSize: 0,
          hitRate: 0,
          hits: 0,
          misses: 0,
        };
        this.saveStats();
        console.log('[IndexedDBCache] Cache cleared');
        resolve();
      };
      
      request.onerror = () => {
        console.error('[IndexedDBCache] Error clearing cache');
        resolve();
      };
    });
  }
  
  /**
   * Evict oldest entries to make space
   */
  private async evictOldest(): Promise<void> {
    if (!this.db) return;
    
    return new Promise((resolve) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor();
      
      let deletedSize = 0;
      const targetSize = this.MAX_SIZE * 0.7; // Free up 30% of cache
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        
        if (cursor && this.stats.totalSize - deletedSize > targetSize) {
          const entry: CacheEntry = cursor.value;
          deletedSize += entry.size;
          cursor.delete();
          cursor.continue();
        } else {
          this.stats.totalSize -= deletedSize;
          this.stats.entries = Math.max(0, this.stats.entries - 1);
          this.saveStats();
          console.log(`[IndexedDBCache] Evicted ${deletedSize} bytes`);
          resolve();
        }
      };
      
      request.onerror = () => {
        console.error('[IndexedDBCache] Error during eviction');
        resolve();
      };
    });
  }
  
  /**
   * Estimate size of value in bytes
   */
  private estimateSize(value: any): number {
    const str = JSON.stringify(value);
    return new Blob([str]).size;
  }
  
  /**
   * Update hit rate statistics
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }
  
  /**
   * Load statistics from localStorage
   */
  private loadStats(): void {
    const saved = localStorage.getItem('indexeddb-cache-stats');
    if (saved) {
      this.stats = JSON.parse(saved);
    }
  }
  
  /**
   * Save statistics to localStorage
   */
  private saveStats = debounce(() => {
    localStorage.setItem('indexeddb-cache-stats', JSON.stringify(this.stats));
  }, 1000);
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  /**
   * Prefetch multiple keys
   */
  async prefetch<T>(
    keys: string[],
    fetcher: (key: string) => Promise<T>,
    ttl?: number
  ): Promise<void> {
    const promises = keys.map(async (key) => {
      const cached = await this.get(key);
      if (!cached) {
        const value = await fetcher(key);
        await this.set(key, value, ttl);
      }
    });
    
    await Promise.all(promises);
  }
}

/**
 * Request debouncing utility
 */
export class RequestDebouncer {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  
  /**
   * Debounce a request
   */
  debounce<T>(
    key: string,
    fn: () => Promise<T>,
    delay: number = 300
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Clear existing timer
      const existingTimer = this.timers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      // Set new timer
      const timer = setTimeout(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.timers.delete(key);
        }
      }, delay);
      
      this.timers.set(key, timer);
    });
  }
  
  /**
   * Cancel a debounced request
   */
  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }
  
  /**
   * Clear all timers
   */
  clear(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }
}

/**
 * Progressive data loader with intersection observer
 */
export class ProgressiveDataLoader {
  private observer: IntersectionObserver | null = null;
  private loadedElements: Set<string> = new Set();
  
  /**
   * Initialize progressive loading
   */
  init(
    onIntersect: (element: Element) => void,
    options?: IntersectionObserverInit
  ): void {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('data-load-id');
          if (id && !this.loadedElements.has(id)) {
            this.loadedElements.add(id);
            onIntersect(entry.target);
          }
        }
      });
    }, {
      rootMargin: '100px', // Start loading 100px before visible
      threshold: 0.01,
      ...options
    });
  }
  
  /**
   * Observe an element for lazy loading
   */
  observe(element: Element): void {
    if (this.observer) {
      this.observer.observe(element);
    }
  }
  
  /**
   * Unobserve an element
   */
  unobserve(element: Element): void {
    if (this.observer) {
      this.observer.unobserve(element);
    }
  }
  
  /**
   * Disconnect observer
   */
  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.loadedElements.clear();
  }
}

/**
 * Memory leak detector
 */
export class MemoryMonitor {
  private measurements: number[] = [];
  private interval: NodeJS.Timeout | null = null;
  
  /**
   * Start monitoring memory usage
   */
  start(intervalMs: number = 5000): void {
    if (this.interval) return;
    
    this.interval = setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
        
        this.measurements.push(usage);
        if (this.measurements.length > 100) {
          this.measurements.shift();
        }
        
        // Check for potential memory leak
        if (this.detectLeak()) {
          console.warn('[MemoryMonitor] Potential memory leak detected');
          this.reportLeak();
        }
      }
    }, intervalMs);
  }
  
  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
  
  /**
   * Detect potential memory leak
   */
  private detectLeak(): boolean {
    if (this.measurements.length < 10) return false;
    
    // Check if memory usage is consistently increasing
    const recent = this.measurements.slice(-10);
    let increasing = 0;
    
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] > recent[i - 1]) {
        increasing++;
      }
    }
    
    return increasing > 7; // 70% increasing trend
  }
  
  /**
   * Report memory leak
   */
  private reportLeak(): void {
    const avgUsage = this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length;
    console.error('[MemoryMonitor] Memory usage:', {
      average: (avgUsage * 100).toFixed(2) + '%',
      current: (this.measurements[this.measurements.length - 1] * 100).toFixed(2) + '%',
      trend: 'increasing'
    });
  }
  
  /**
   * Get current memory stats
   */
  getStats(): any {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024) + 'MB',
        total: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + 'MB',
        usage: ((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100).toFixed(2) + '%'
      };
    }
    return null;
  }
}
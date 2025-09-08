import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';
import { openai } from '../openai.server';

const logger = new DebugLogger('VectorMetrics');

export interface VectorStorageMetrics {
  timestamp: Date;
  tables: {
    [tableName: string]: {
      totalRows: number;
      vectorRows: number;
      halfvecRows: number;
      bothRows: number;
      nullRows: number;
      vectorStorageSize: string;
      halfvecStorageSize: string;
      storageReduction: number;
      indexSize: {
        vector: string;
        halfvec: string;
        reduction: number;
      };
    };
  };
  overall: {
    totalVectorStorage: string;
    totalHalfvecStorage: string;
    storageReduction: number;
    migrationProgress: number;
    estimatedSavings: string;
  };
}

export interface VectorSearchMetrics {
  timestamp: Date;
  searchPerformance: {
    vector: {
      avgLatencyMs: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
      p99LatencyMs: number;
      queriesPerSecond: number;
    };
    halfvec: {
      avgLatencyMs: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
      p99LatencyMs: number;
      queriesPerSecond: number;
    };
    improvement: {
      latencyReduction: number;
      throughputIncrease: number;
    };
  };
  searchAccuracy: {
    recall_at_10: number;
    precision_at_10: number;
    meanReciprocalRank: number;
    accuracyDegradation: number;
  };
}

/**
 * Service for monitoring vector to halfvec migration metrics
 */
export class VectorMetricsService {
  private static instance: VectorMetricsService;
  private metricsCache = new Map<string, { value: any; timestamp: number }>();
  private readonly CACHE_TTL = 60000; // 1 minute cache
  
  private constructor() {}
  
  static getInstance(): VectorMetricsService {
    if (!VectorMetricsService.instance) {
      VectorMetricsService.instance = new VectorMetricsService();
    }
    return VectorMetricsService.instance;
  }
  
  /**
   * Get comprehensive storage metrics
   */
  async getStorageMetrics(): Promise<VectorStorageMetrics> {
    const cacheKey = 'storageMetrics';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    
    logger.info('Collecting storage metrics...');
    
    const tables = [
      'page_embeddings',
      'block_embeddings',
      'database_row_embeddings',
      'embeddings'
    ];
    
    const metrics: VectorStorageMetrics = {
      timestamp: new Date(),
      tables: {},
      overall: {
        totalVectorStorage: '0 MB',
        totalHalfvecStorage: '0 MB',
        storageReduction: 0,
        migrationProgress: 0,
        estimatedSavings: '0 MB'
      }
    };
    
    let totalVectorBytes = 0;
    let totalHalfvecBytes = 0;
    let totalVectorRows = 0;
    let totalHalfvecRows = 0;
    
    for (const table of tables) {
      try {
        // Get row counts
        const countResult = await prisma.$queryRawUnsafe<any[]>(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN embedding IS NOT NULL AND embedding_halfvec IS NULL THEN 1 END) as vector_only,
            COUNT(CASE WHEN embedding IS NULL AND embedding_halfvec IS NOT NULL THEN 1 END) as halfvec_only,
            COUNT(CASE WHEN embedding IS NOT NULL AND embedding_halfvec IS NOT NULL THEN 1 END) as both,
            COUNT(CASE WHEN embedding IS NULL AND embedding_halfvec IS NULL THEN 1 END) as neither
          FROM ${table}
        `);
        
        const counts = countResult[0];
        
        // Get storage sizes
        const sizeResult = await prisma.$queryRawUnsafe<any[]>(`
          SELECT 
            pg_size_pretty(pg_total_relation_size('${table}')) as total_size,
            pg_size_pretty(
              COALESCE(SUM(pg_column_size(embedding)), 0)::bigint
            ) as vector_size,
            pg_size_pretty(
              COALESCE(SUM(pg_column_size(embedding_halfvec)), 0)::bigint
            ) as halfvec_size,
            COALESCE(SUM(pg_column_size(embedding)), 0)::bigint as vector_bytes,
            COALESCE(SUM(pg_column_size(embedding_halfvec)), 0)::bigint as halfvec_bytes
          FROM ${table}
          WHERE embedding IS NOT NULL OR embedding_halfvec IS NOT NULL
        `);
        
        const sizes = sizeResult[0];
        
        // Get index sizes
        const vectorIndexResult = await prisma.$queryRawUnsafe<any[]>(`
          SELECT 
            pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
            pg_relation_size(indexname::regclass) as bytes
          FROM pg_indexes
          WHERE tablename = '${table}'
            AND (indexname LIKE '%vector%' AND indexname NOT LIKE '%halfvec%')
          LIMIT 1
        `);
        
        const halfvecIndexResult = await prisma.$queryRawUnsafe<any[]>(`
          SELECT 
            pg_size_pretty(pg_relation_size(indexname::regclass)) as size,
            pg_relation_size(indexname::regclass) as bytes
          FROM pg_indexes
          WHERE tablename = '${table}'
            AND indexname LIKE '%halfvec%'
          LIMIT 1
        `);
        
        const vectorIndexSize = vectorIndexResult[0] || { size: 'N/A', bytes: 0 };
        const halfvecIndexSize = halfvecIndexResult[0] || { size: 'N/A', bytes: 0 };
        
        // Calculate storage reduction
        const vectorBytes = Number(sizes.vector_bytes) || 0;
        const halfvecBytes = Number(sizes.halfvec_bytes) || 0;
        const reduction = vectorBytes > 0 
          ? ((vectorBytes - halfvecBytes) / vectorBytes) * 100 
          : 0;
        
        const indexReduction = vectorIndexSize.bytes > 0
          ? ((vectorIndexSize.bytes - halfvecIndexSize.bytes) / vectorIndexSize.bytes) * 100
          : 0;
        
        metrics.tables[table] = {
          totalRows: Number(counts.total) || 0,
          vectorRows: Number(counts.vector_only) || 0,
          halfvecRows: Number(counts.halfvec_only) || 0,
          bothRows: Number(counts.both) || 0,
          nullRows: Number(counts.neither) || 0,
          vectorStorageSize: sizes.vector_size || '0 bytes',
          halfvecStorageSize: sizes.halfvec_size || '0 bytes',
          storageReduction: reduction,
          indexSize: {
            vector: vectorIndexSize.size,
            halfvec: halfvecIndexSize.size,
            reduction: indexReduction
          }
        };
        
        totalVectorBytes += vectorBytes;
        totalHalfvecBytes += halfvecBytes;
        totalVectorRows += Number(counts.vector_only) + Number(counts.both);
        totalHalfvecRows += Number(counts.halfvec_only) + Number(counts.both);
        
      } catch (error) {
        logger.error(`Failed to get metrics for ${table}`, error);
      }
    }
    
    // Calculate overall metrics
    const overallReduction = totalVectorBytes > 0 
      ? ((totalVectorBytes - totalHalfvecBytes) / totalVectorBytes) * 100 
      : 0;
    
    const migrationProgress = (totalVectorRows + totalHalfvecRows) > 0
      ? (totalHalfvecRows / (totalVectorRows + totalHalfvecRows)) * 100
      : 0;
    
    const estimatedSavings = totalVectorBytes > 0
      ? totalVectorBytes * 0.57 // 57% reduction expected
      : 0;
    
    metrics.overall = {
      totalVectorStorage: this.formatBytes(totalVectorBytes),
      totalHalfvecStorage: this.formatBytes(totalHalfvecBytes),
      storageReduction: overallReduction,
      migrationProgress,
      estimatedSavings: this.formatBytes(estimatedSavings)
    };
    
    this.setCached(cacheKey, metrics);
    return metrics;
  }
  
  /**
   * Compare search accuracy between vector and halfvec
   */
  async compareSearchAccuracy(testQueries?: string[]): Promise<VectorSearchMetrics> {
    const cacheKey = 'searchMetrics';
    const cached = this.getCached(cacheKey);
    if (cached) return cached;
    
    logger.info('Comparing search accuracy...');
    
    // Generate test queries if not provided
    if (!testQueries || testQueries.length === 0) {
      testQueries = await this.generateTestQueries();
    }
    
    const vectorLatencies: number[] = [];
    const halfvecLatencies: number[] = [];
    let totalRecall = 0;
    let totalPrecision = 0;
    let totalMRR = 0;
    let queryCount = 0;
    
    for (const query of testQueries) {
      try {
        // Generate embedding for query
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: query,
        });
        const queryEmbedding = response.data[0].embedding;
        const vectorString = `[${queryEmbedding.join(',')}]`;
        
        // Time vector search
        const vectorStart = Date.now();
        const vectorResults = await prisma.$queryRaw<any[]>`
          SELECT id, chunk_text, 1 - (embedding <=> ${vectorString}::extensions.vector) as similarity
          FROM page_embeddings
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${vectorString}::vector
          LIMIT 10
        `;
        const vectorLatency = Date.now() - vectorStart;
        vectorLatencies.push(vectorLatency);
        
        // Time halfvec search
        const halfvecStart = Date.now();
        const halfvecResults = await prisma.$queryRaw<any[]>`
          SELECT id, chunk_text, 1 - (embedding_halfvec <=> ${vectorString}::extensions.halfvec) as similarity
          FROM page_embeddings
          WHERE embedding_halfvec IS NOT NULL
          ORDER BY embedding_halfvec <=> ${vectorString}::halfvec
          LIMIT 10
        `;
        const halfvecLatency = Date.now() - halfvecStart;
        halfvecLatencies.push(halfvecLatency);
        
        // Calculate recall@10
        const vectorIds = new Set(vectorResults.map(r => r.id));
        const halfvecIds = new Set(halfvecResults.map(r => r.id));
        
        let matches = 0;
        for (const id of halfvecIds) {
          if (vectorIds.has(id)) matches++;
        }
        
        const recall = vectorIds.size > 0 ? matches / vectorIds.size : 0;
        const precision = halfvecIds.size > 0 ? matches / halfvecIds.size : 0;
        
        // Calculate Mean Reciprocal Rank
        let mrr = 0;
        for (let i = 0; i < halfvecResults.length; i++) {
          if (vectorIds.has(halfvecResults[i].id)) {
            mrr = 1 / (i + 1);
            break;
          }
        }
        
        totalRecall += recall;
        totalPrecision += precision;
        totalMRR += mrr;
        queryCount++;
        
      } catch (error) {
        logger.error('Failed to compare query', { query, error });
      }
    }
    
    // Calculate statistics
    const vectorStats = this.calculateLatencyStats(vectorLatencies);
    const halfvecStats = this.calculateLatencyStats(halfvecLatencies);
    
    const metrics: VectorSearchMetrics = {
      timestamp: new Date(),
      searchPerformance: {
        vector: {
          avgLatencyMs: vectorStats.avg,
          p50LatencyMs: vectorStats.p50,
          p95LatencyMs: vectorStats.p95,
          p99LatencyMs: vectorStats.p99,
          queriesPerSecond: 1000 / vectorStats.avg
        },
        halfvec: {
          avgLatencyMs: halfvecStats.avg,
          p50LatencyMs: halfvecStats.p50,
          p95LatencyMs: halfvecStats.p95,
          p99LatencyMs: halfvecStats.p99,
          queriesPerSecond: 1000 / halfvecStats.avg
        },
        improvement: {
          latencyReduction: vectorStats.avg > 0 
            ? ((vectorStats.avg - halfvecStats.avg) / vectorStats.avg) * 100 
            : 0,
          throughputIncrease: halfvecStats.avg > 0
            ? ((1000/halfvecStats.avg) - (1000/vectorStats.avg)) / (1000/vectorStats.avg) * 100
            : 0
        }
      },
      searchAccuracy: {
        recall_at_10: queryCount > 0 ? totalRecall / queryCount : 0,
        precision_at_10: queryCount > 0 ? totalPrecision / queryCount : 0,
        meanReciprocalRank: queryCount > 0 ? totalMRR / queryCount : 0,
        accuracyDegradation: queryCount > 0 ? (1 - (totalRecall / queryCount)) * 100 : 0
      }
    };
    
    this.setCached(cacheKey, metrics);
    return metrics;
  }
  
  /**
   * Generate test queries for accuracy comparison
   */
  private async generateTestQueries(): Promise<string[]> {
    // Get some actual content to use as queries
    const samples = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT chunk_text
      FROM page_embeddings
      WHERE chunk_text IS NOT NULL
        AND LENGTH(chunk_text) > 50
      ORDER BY RANDOM()
      LIMIT 10
    `;
    
    if (samples.length === 0) {
      // Return default test queries
      return [
        'How to implement user authentication?',
        'What are the best practices for database design?',
        'Explain the concept of microservices architecture',
        'How does caching improve performance?',
        'What is the difference between SQL and NoSQL?'
      ];
    }
    
    // Use first 50 words of each sample as a query
    return samples.map(s => {
      const words = s.chunk_text.split(/\s+/).slice(0, 50);
      return words.join(' ');
    });
  }
  
  /**
   * Calculate latency statistics
   */
  private calculateLatencyStats(latencies: number[]) {
    if (latencies.length === 0) {
      return { avg: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    
    return { avg, p50, p95, p99 };
  }
  
  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Get cached value
   */
  private getCached(key: string): any {
    const cached = this.metricsCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.value;
    }
    return null;
  }
  
  /**
   * Set cached value
   */
  private setCached(key: string, value: any): void {
    this.metricsCache.set(key, {
      value,
      timestamp: Date.now()
    });
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.metricsCache.clear();
  }
  
  /**
   * Generate migration progress report
   */
  async generateProgressReport(): Promise<string> {
    const storageMetrics = await this.getStorageMetrics();
    const searchMetrics = await this.compareSearchAccuracy();
    
    const report = `
HALFVEC MIGRATION PROGRESS REPORT
=====================================
Generated: ${new Date().toISOString()}

OVERALL PROGRESS
----------------
Migration Progress: ${storageMetrics.overall.migrationProgress.toFixed(2)}%
Storage Reduction: ${storageMetrics.overall.storageReduction.toFixed(2)}%
Current Vector Storage: ${storageMetrics.overall.totalVectorStorage}
Current Halfvec Storage: ${storageMetrics.overall.totalHalfvecStorage}
Estimated Savings: ${storageMetrics.overall.estimatedSavings}

TABLE BREAKDOWN
---------------
${Object.entries(storageMetrics.tables).map(([table, metrics]) => `
${table}:
  Total Rows: ${metrics.totalRows}
  Vector Only: ${metrics.vectorRows}
  Halfvec Only: ${metrics.halfvecRows}
  Both Types: ${metrics.bothRows}
  Storage Reduction: ${metrics.storageReduction.toFixed(2)}%
  Index Size Reduction: ${metrics.indexSize.reduction.toFixed(2)}%
`).join('')}

SEARCH PERFORMANCE
------------------
Vector Avg Latency: ${searchMetrics.searchPerformance.vector.avgLatencyMs.toFixed(2)}ms
Halfvec Avg Latency: ${searchMetrics.searchPerformance.halfvec.avgLatencyMs.toFixed(2)}ms
Latency Improvement: ${searchMetrics.searchPerformance.improvement.latencyReduction.toFixed(2)}%
Throughput Increase: ${searchMetrics.searchPerformance.improvement.throughputIncrease.toFixed(2)}%

SEARCH ACCURACY
---------------
Recall@10: ${(searchMetrics.searchAccuracy.recall_at_10 * 100).toFixed(2)}%
Precision@10: ${(searchMetrics.searchAccuracy.precision_at_10 * 100).toFixed(2)}%
Mean Reciprocal Rank: ${searchMetrics.searchAccuracy.meanReciprocalRank.toFixed(4)}
Accuracy Degradation: ${searchMetrics.searchAccuracy.accuracyDegradation.toFixed(2)}%
`;
    
    return report;
  }
}

// Export singleton instance
export const vectorMetricsService = VectorMetricsService.getInstance();
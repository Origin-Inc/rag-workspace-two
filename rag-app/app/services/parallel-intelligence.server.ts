import type { DataFile } from '~/atoms/chat-atoms';
import type { QueryIntent } from './query-intent-analyzer.server';
import { UnifiedIntelligenceService } from './unified-intelligence.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('parallel-intelligence');

export interface ParallelAnalysisResult {
  semantic?: {
    result: any;
    processingTime: number;
    error?: string;
  };
  statistical?: {
    result: any;
    processingTime: number;
    error?: string;
  };
  sql?: {
    result: any;
    processingTime: number;
    error?: string;
  };
  metadata: {
    totalProcessingTime: number;
    parallelEfficiency: number;
    successfulAnalyses: string[];
    failedAnalyses: string[];
  };
}

export interface StreamUpdate {
  type: 'progress' | 'result' | 'error' | 'complete';
  analysis: 'semantic' | 'statistical' | 'sql' | 'overall';
  data?: any;
  error?: string;
  timestamp: number;
}

export class ParallelIntelligenceService {
  private intelligence: UnifiedIntelligenceService;
  
  constructor() {
    this.intelligence = new UnifiedIntelligenceService();
  }
  
  /**
   * Process query with parallel analysis and streaming updates
   */
  async processWithStreaming(
    query: string,
    files: DataFile[],
    intent: QueryIntent,
    requestId: string,
    onUpdate: (update: StreamUpdate) => void
  ): Promise<ParallelAnalysisResult> {
    const startTime = Date.now();
    const results: ParallelAnalysisResult = {
      metadata: {
        totalProcessingTime: 0,
        parallelEfficiency: 0,
        successfulAnalyses: [],
        failedAnalyses: []
      }
    };
    
    logger.trace('[Parallel] Starting parallel analysis', {
      requestId,
      query,
      filesCount: files.length,
      intent: intent.queryType
    });
    
    // Send initial progress
    onUpdate({
      type: 'progress',
      analysis: 'overall',
      data: { message: 'Starting parallel analysis...' },
      timestamp: Date.now()
    });
    
    // Define analysis tasks
    const analysisTasks = [
      {
        name: 'semantic',
        execute: () => this.performSemanticAnalysis(query, files, intent, requestId)
      },
      {
        name: 'statistical',
        execute: () => this.performStatisticalAnalysis(query, files, intent, requestId)
      },
      {
        name: 'sql',
        execute: () => this.performSQLAnalysis(query, files, intent, requestId)
      }
    ];
    
    // Execute analyses in parallel with progress updates
    const promises = analysisTasks.map(async (task) => {
      const taskStart = Date.now();
      
      // Send start event
      onUpdate({
        type: 'progress',
        analysis: task.name as any,
        data: { status: 'started', message: `Starting ${task.name} analysis...` },
        timestamp: Date.now()
      });
      
      try {
        const result = await task.execute();
        const processingTime = Date.now() - taskStart;
        
        // Store result
        (results as any)[task.name] = {
          result,
          processingTime,
          error: undefined
        };
        
        results.metadata.successfulAnalyses.push(task.name);
        
        // Send success event
        onUpdate({
          type: 'result',
          analysis: task.name as any,
          data: { 
            result, 
            processingTime,
            message: `${task.name} analysis completed in ${processingTime}ms`
          },
          timestamp: Date.now()
        });
        
        logger.trace(`[Parallel] ${task.name} analysis completed`, {
          requestId,
          processingTime,
          hasResult: !!result
        });
        
        return { name: task.name, result, processingTime };
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const processingTime = Date.now() - taskStart;
        
        // Store error
        (results as any)[task.name] = {
          result: null,
          processingTime,
          error: errorMessage
        };
        
        results.metadata.failedAnalyses.push(task.name);
        
        // Send error event
        onUpdate({
          type: 'error',
          analysis: task.name as any,
          error: errorMessage,
          data: { processingTime },
          timestamp: Date.now()
        });
        
        logger.error(`[Parallel] ${task.name} analysis failed`, {
          requestId,
          error: errorMessage,
          processingTime
        });
        
        return { name: task.name, result: null, error: errorMessage, processingTime };
      }
    });
    
    // Wait for all analyses to complete
    const allResults = await Promise.allSettled(promises);
    
    // Calculate metadata
    results.metadata.totalProcessingTime = Date.now() - startTime;
    
    // Calculate parallel efficiency (vs sequential processing)
    const individualTimes = [
      results.semantic?.processingTime || 0,
      results.statistical?.processingTime || 0,
      results.sql?.processingTime || 0
    ];
    const sequentialTime = individualTimes.reduce((a, b) => a + b, 0);
    results.metadata.parallelEfficiency = sequentialTime > 0 
      ? Math.round((sequentialTime / results.metadata.totalProcessingTime) * 100) 
      : 100;
    
    // Send completion event
    onUpdate({
      type: 'complete',
      analysis: 'overall',
      data: {
        metadata: results.metadata,
        message: `Analysis complete in ${results.metadata.totalProcessingTime}ms (${results.metadata.parallelEfficiency}% efficiency)`
      },
      timestamp: Date.now()
    });
    
    logger.trace('[Parallel] All analyses completed', {
      requestId,
      totalTime: results.metadata.totalProcessingTime,
      efficiency: results.metadata.parallelEfficiency,
      successful: results.metadata.successfulAnalyses,
      failed: results.metadata.failedAnalyses
    });
    
    return results;
  }
  
  /**
   * Perform semantic analysis (understanding meaning)
   */
  private async performSemanticAnalysis(
    query: string,
    files: DataFile[],
    intent: QueryIntent,
    requestId: string
  ): Promise<any> {
    // Simulate semantic analysis
    await this.simulateProcessing(100, 500);
    
    // In production, this would call actual semantic analysis
    return {
      type: 'semantic',
      understanding: {
        mainTopic: this.extractMainTopic(query),
        entities: this.extractEntities(query),
        sentiment: 'neutral',
        complexity: intent.expectedDepth
      },
      relevantContent: files.map(f => ({
        filename: f.filename,
        relevance: Math.random() * 0.5 + 0.5,
        keyPoints: []
      }))
    };
  }
  
  /**
   * Perform statistical analysis (numerical insights)
   */
  private async performStatisticalAnalysis(
    query: string,
    files: DataFile[],
    intent: QueryIntent,
    requestId: string
  ): Promise<any> {
    // Simulate statistical analysis
    await this.simulateProcessing(200, 800);
    
    // Extract numerical data from CSV files
    const csvFiles = files.filter(f => f.type === 'csv');
    
    if (csvFiles.length === 0) {
      return { type: 'statistical', message: 'No data files available for statistical analysis' };
    }
    
    // In production, this would perform actual statistical calculations
    return {
      type: 'statistical',
      summary: {
        totalRows: csvFiles.reduce((sum, f) => sum + (f.rowCount || 0), 0),
        totalColumns: csvFiles.reduce((sum, f) => sum + (f.schema?.length || 0), 0),
        files: csvFiles.length
      },
      insights: [
        'Data appears to be well-structured',
        'Multiple data sources available for analysis'
      ]
    };
  }
  
  /**
   * Perform SQL analysis (structured queries)
   */
  private async performSQLAnalysis(
    query: string,
    files: DataFile[],
    intent: QueryIntent,
    requestId: string
  ): Promise<any> {
    // Simulate SQL analysis
    await this.simulateProcessing(150, 600);
    
    // Check if query contains SQL-like patterns
    const hasSQLPattern = /select|from|where|group by|order by|join/i.test(query);
    
    if (!hasSQLPattern) {
      return { type: 'sql', message: 'No SQL query patterns detected' };
    }
    
    // In production, this would translate natural language to SQL and execute
    return {
      type: 'sql',
      suggestedQuery: this.generateSQLSuggestion(query, files),
      canExecute: files.some(f => f.type === 'csv'),
      tables: files.filter(f => f.type === 'csv').map(f => f.tableName || f.filename)
    };
  }
  
  /**
   * Combine parallel results into unified response
   */
  combineResults(
    parallelResults: ParallelAnalysisResult,
    intent: QueryIntent
  ): any {
    const combined = {
      hasSemanticInsights: !!parallelResults.semantic?.result,
      hasStatisticalInsights: !!parallelResults.statistical?.result,
      hasSQLCapability: !!parallelResults.sql?.result,
      
      semantic: parallelResults.semantic?.result,
      statistical: parallelResults.statistical?.result,
      sql: parallelResults.sql?.result,
      
      processingMetrics: parallelResults.metadata,
      
      recommendedFormat: intent.formatPreference,
      confidence: this.calculateCombinedConfidence(parallelResults)
    };
    
    logger.trace('[Parallel] Combined results', {
      hasSemanticInsights: combined.hasSemanticInsights,
      hasStatisticalInsights: combined.hasStatisticalInsights,
      hasSQLCapability: combined.hasSQLCapability,
      confidence: combined.confidence
    });
    
    return combined;
  }
  
  // Helper methods
  
  private extractMainTopic(query: string): string {
    // Simple topic extraction - in production would use NLP
    const words = query.toLowerCase().split(/\s+/);
    const stopWords = ['the', 'is', 'at', 'which', 'on', 'a', 'an', 'as', 'are', 'was', 'were'];
    const significantWords = words.filter(w => !stopWords.includes(w) && w.length > 3);
    return significantWords[0] || 'general';
  }
  
  private extractEntities(query: string): string[] {
    // Simple entity extraction - in production would use NER
    const entities: string[] = [];
    
    // Extract quoted strings
    const quotedMatches = query.match(/"([^"]+)"/g);
    if (quotedMatches) {
      entities.push(...quotedMatches.map(m => m.replace(/"/g, '')));
    }
    
    // Extract capitalized words (potential proper nouns)
    const capitalizedWords = query.match(/\b[A-Z][a-z]+\b/g);
    if (capitalizedWords) {
      entities.push(...capitalizedWords);
    }
    
    return [...new Set(entities)];
  }
  
  private generateSQLSuggestion(query: string, files: DataFile[]): string {
    // Simple SQL generation - in production would use NL2SQL
    const csvFile = files.find(f => f.type === 'csv');
    if (!csvFile) return '';
    
    const tableName = csvFile.tableName || csvFile.filename?.replace(/\.[^/.]+$/, '');
    
    if (query.toLowerCase().includes('count')) {
      return `SELECT COUNT(*) FROM ${tableName}`;
    } else if (query.toLowerCase().includes('average')) {
      return `SELECT AVG(column_name) FROM ${tableName}`;
    } else if (query.toLowerCase().includes('sum')) {
      return `SELECT SUM(column_name) FROM ${tableName}`;
    } else {
      return `SELECT * FROM ${tableName} LIMIT 10`;
    }
  }
  
  private calculateCombinedConfidence(results: ParallelAnalysisResult): number {
    const successRate = results.metadata.successfulAnalyses.length / 3;
    const hasResults = [
      results.semantic?.result,
      results.statistical?.result,
      results.sql?.result
    ].filter(Boolean).length;
    
    return Math.min(1, (successRate + (hasResults / 3)) / 2);
  }
  
  private async simulateProcessing(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min) + min);
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}
import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { UnifiedIntelligenceService } from "~/services/unified-intelligence.server";
import { queryIntentAnalyzer } from "~/services/query-intent-analyzer.server";
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('test-csv-debug');

export const action: ActionFunction = async ({ request }) => {
  // Test data - simulating a CSV file
  const testData = {
    query: "What is the total number of cases in this COVID data?",
    files: [{
      filename: "test-covid.csv",
      type: "csv" as const,
      rowCount: 5,
      data: [
        { country: "USA", cases: 1000, deaths: 50, date: "2024-01-01" },
        { country: "UK", cases: 800, deaths: 40, date: "2024-01-01" },
        { country: "France", cases: 700, deaths: 35, date: "2024-01-01" },
        { country: "Germany", cases: 900, deaths: 45, date: "2024-01-01" },
        { country: "Italy", cases: 600, deaths: 30, date: "2024-01-01" }
      ],
      content: null,
      schema: {
        columns: [
          { name: "country", type: "string" },
          { name: "cases", type: "number" },
          { name: "deaths", type: "number" },
          { name: "date", type: "string" }
        ]
      }
    }]
  };

  logger.debug('Starting CSV debug test', {
    query: testData.query,
    fileCount: testData.files.length,
    firstFile: testData.files[0].filename,
    dataRows: testData.files[0].data.length
  });

  // Analyze intent
  const intent = queryIntentAnalyzer.analyzeIntent(testData.query);
  logger.debug('Intent analyzed', {
    queryType: intent.queryType,
    formatPreference: intent.formatPreference,
    confidence: intent.confidence
  });

  // Process with UnifiedIntelligenceService
  try {
    const intelligence = new UnifiedIntelligenceService();
    
    logger.debug('Processing with UnifiedIntelligenceService...');
    
    const result = await intelligence.process({
      requestId: `test_${Date.now()}`,
      query: testData.query,
      files: testData.files,
      intent,
      conversationHistory: [],
      options: {
        includeSQL: false,
        includeSemantic: true,
        includeInsights: true,
        includeStatistics: true,
        formatPreference: intent.formatPreference
      }
    });

    logger.debug('Processing complete', {
      hasSemanticSummary: !!result.semantic?.summary,
      semanticSummaryLength: result.semantic?.summary?.length || 0,
      tokensUsed: result.metadata?.tokensUsed || 0,
      confidence: result.confidence
    });

    return json({
      success: true,
      tokensUsed: result.metadata?.tokensUsed || 0,
      semanticSummary: result.semantic?.summary || 'No summary generated',
      presentationNarrative: result.presentation?.narrative || 'No narrative generated',
      debug: {
        intent,
        filesAnalyzed: result.metadata?.filesAnalyzed,
        processingTime: result.metadata?.processingTime
      }
    });

  } catch (error) {
    logger.error('Test failed', error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
};
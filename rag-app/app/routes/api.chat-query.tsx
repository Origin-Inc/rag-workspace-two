import { json } from "@remix-run/node";
import type { ActionFunction } from "@remix-run/node";
import { eventStream } from "remix-utils/sse/server";
import { prisma } from "~/utils/db.server";
import { queryIntentAnalyzer } from "~/services/query-intent-analyzer.server";
import { UnifiedIntelligenceService } from "~/services/unified-intelligence.server";
import { ResponseComposer } from "~/services/response-composer.server";
import { ConversationContextManager } from "~/services/conversation-context.server";
import { createChatCompletion, isOpenAIConfigured } from "~/services/openai.server";
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';
import { aiModelConfig } from '~/services/ai-model-config.server';
import { QueryErrorRecovery } from '~/services/query-error-recovery.server';
import { queryResultChartGenerator } from '~/services/ai/query-result-chart-generator.server';
import { sqlGenerator } from '~/services/ai/sql-generator.server';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { FileStorageService } from '~/services/storage/file-storage.server';

const logger = new DebugLogger('api.chat-query');

/**
 * Detect if query requires data access/visualization
 * Used to determine if we should auto-generate SQL
 */
function detectDataAccessIntent(query: string): boolean {
  const queryLower = query.toLowerCase();

  // Keywords that indicate the user wants to query/visualize data
  const dataAccessKeywords = [
    'visualize', 'chart', 'graph', 'plot', 'show',
    'what', 'how many', 'count', 'sum', 'average', 'mean',
    'top', 'bottom', 'highest', 'lowest', 'best', 'worst',
    'trend', 'over time', 'growth', 'change',
    'distribution', 'breakdown', 'by', 'per',
    'compare', 'comparison', 'versus', 'vs',
    'total', 'min', 'max', 'median',
    'list', 'all', 'find', 'search', 'filter'
  ];

  return dataAccessKeywords.some(keyword => queryLower.includes(keyword));
}

/**
 * Format query results as a markdown table
 * For narrow/tall chat interfaces, transpose single-row data to show columns vertically
 */
function formatQueryResultsAsMarkdown(queryResults: any): string {
  if (!queryResults?.data || queryResults.data.length === 0) {
    return '*No results*';
  }

  const rows = queryResults.data;
  const columns = Object.keys(rows[0]);

  // For single-row results (like aggregations), display vertically for better UX in chat
  if (rows.length === 1) {
    const header = `| Column | Value |`;
    const separator = `| --- | --- |`;

    const rowsMarkdown = columns.map(col => {
      const val = rows[0][col];
      let formattedVal = '';
      if (val === null || val === undefined) {
        formattedVal = '';
      } else if (typeof val === 'number') {
        formattedVal = val.toLocaleString();
      } else {
        formattedVal = String(val);
      }
      return `| ${col} | ${formattedVal} |`;
    }).join('\n');

    return `${header}\n${separator}\n${rowsMarkdown}`;
  }

  // For multi-row results, use traditional horizontal layout
  const header = `| ${columns.join(' | ')} |`;
  const separator = `| ${columns.map(() => '---').join(' | ')} |`;

  const rowsMarkdown = rows.map((row: any) => {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      if (typeof val === 'number') return val.toLocaleString();
      return String(val);
    });
    return `| ${values.join(' | ')} |`;
  }).join('\n');

  return `${header}\n${separator}\n${rowsMarkdown}`;
}

/**
 * TASK 56.5: Handle large result storage
 * Uploads results >100KB to external storage and returns reference metadata
 */
async function handleLargeResultStorage(
  data: any,
  type: 'chart' | 'table',
  workspaceId: string,
  pageId: string,
  messageId: string,
  request: Request
): Promise<{
  useExternalStorage: boolean;
  externalStorage?: {
    url: string;
    bucket: string;
    path: string;
    sizeBytes: number;
    expiresAt: string;
    type: 'chart' | 'table';
  };
  preview?: any;
}> {
  const dataJson = JSON.stringify(data);
  const sizeBytes = new Blob([dataJson]).size;
  const SIZE_THRESHOLD = 100 * 1024; // 100KB

  logger.info('[Task 56.5] Checking result size', {
    type,
    sizeBytes,
    sizeKB: (sizeBytes / 1024).toFixed(2),
    exceedsThreshold: sizeBytes > SIZE_THRESHOLD,
  });

  // If under 100KB, store inline
  if (sizeBytes <= SIZE_THRESHOLD) {
    return { useExternalStorage: false };
  }

  // Upload to external storage
  try {
    const bucket = 'query-results';
    const path = `${workspaceId}/${pageId}/${messageId}-${type}.json`;

    // Use FileStorageService for upload
    // Note: FileStorageService requires Request/Response for auth
    const response = new Response();
    const storage = new FileStorageService(request, response);

    await storage.uploadFile(
      bucket,
      path,
      Buffer.from(dataJson, 'utf-8'),
      'application/json'
    );

    // Generate signed URL (valid for 7 days)
    const expiresInSeconds = 7 * 24 * 60 * 60; // 7 days
    const signedUrl = await storage.getSignedUrl(bucket, path, expiresInSeconds);
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    // Create preview (first 10 rows for tables, summary for charts)
    let preview: any;
    if (type === 'table' && data.rows) {
      preview = {
        columns: data.columns,
        rows: data.rows.slice(0, 10),
        totalRows: data.rows.length,
        title: data.title,
      };
    } else if (type === 'chart' && data.data) {
      preview = {
        type: data.type,
        title: data.title,
        description: data.description,
        sampleDataPoints: Array.isArray(data.data) ? data.data.slice(0, 10).length : 'N/A',
      };
    }

    logger.info('[Task 56.5] Large result uploaded to external storage', {
      type,
      bucket,
      path,
      sizeKB: (sizeBytes / 1024).toFixed(2),
      expiresAt,
    });

    return {
      useExternalStorage: true,
      externalStorage: {
        url: signedUrl,
        bucket,
        path,
        sizeBytes,
        expiresAt,
        type,
      },
      preview,
    };
  } catch (error) {
    logger.error('[Task 56.5] Failed to upload to external storage, falling back to inline', {
      error: error instanceof Error ? error.message : 'Unknown error',
      type,
      sizeBytes,
    });

    // Fallback to inline storage with reduced data
    return { useExternalStorage: false };
  }
}

export const action: ActionFunction = async ({ request }) => {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Declare variables at top for error handler access
  let user: any;
  let query: string = '';
  let files: any[] = [];

  try {
    // Monitor request size
    const contentLength = request.headers.get('content-length');
    const requestSizeMB = contentLength ? parseInt(contentLength) / (1024 * 1024) : 0;

    logger.trace('[Unified] Request started', {
      requestId,
      userId: 'pending',
      requestSizeMB: requestSizeMB.toFixed(2),
      contentLength,
      isLargePayload: requestSizeMB > 1,
      isCriticalSize: requestSizeMB > 3.5 // Near Vercel limit
    });

    // Warn if approaching Vercel limits
    if (requestSizeMB > 3.5) {
      logger.warn('[Unified] LARGE PAYLOAD WARNING', {
        requestId,
        sizeMB: requestSizeMB.toFixed(2),
        vercelLimit: '4.5MB',
        recommendation: 'Consider implementing compression or chunking'
      });
    }

    // Require authentication
    const authStart = Date.now();
    try {
      user = await requireUser(request);
      const authTime = Date.now() - authStart;
      logger.error('[TIMING] Authentication', { requestId, authTimeMs: authTime });
    } catch (authError) {
      logger.error('[Unified] Authentication failed', {
        requestId,
        error: authError instanceof Error ? authError.message : 'Unknown auth error',
        stack: authError instanceof Error ? authError.stack : undefined
      });
      throw authError;
    }

    if (!isOpenAIConfigured()) {
      logger.warn('[Unified] OpenAI not configured');
      return json(
        { 
          content: "AI features are not configured. Please set up your OpenAI API key.",
          metadata: { error: "OpenAI not configured" }
        },
        { status: 503 }
      );
    }

    const parseStart = Date.now();
    const body = await request.json();
    // Extract variables (already declared at top for error handler)
    query = body.query;
    files = body.files || [];
    const { pageId, workspaceId, conversationHistory, sessionId, queryResults, fileMetadata, stream } = body;
    const parseTime = Date.now() - parseStart;
    logger.error('[TIMING] Parse request body', { requestId, parseTimeMs: parseTime });

    // CRITICAL DEBUG: Log what client sent
    logger.error('[REQUEST DEBUG] ⚠️ Request body analysis', {
      requestId,
      query: query?.slice(0, 100),
      filesCount: files?.length || 0,
      files: files?.map(f => ({
        filename: f.filename,
        type: f.type,
        tableName: f.tableName,
        hasData: !!f.data,
        dataIsArray: Array.isArray(f.data),
        dataLength: Array.isArray(f.data) ? f.data.length : 0,
        hasContent: !!f.content,
        contentType: typeof f.content,
        contentLength: typeof f.content === 'string' ? f.content.length :
                      Array.isArray(f.content) ? f.content.length : 0,
        hasParquetUrl: !!f.parquetUrl,
        hasStorageUrl: !!f.storageUrl,
        firstDataRow: f.data?.[0] ? Object.keys(f.data[0]) : null
      })),
      hasQueryResults: !!queryResults,
      queryResultsData: queryResults?.data ? `${queryResults.data.length} rows` : 'none'
    });
    
    // Generate session ID if not provided
    const currentSessionId = sessionId || `session_${user.id}_${Date.now()}`;
    
    // Get or create conversation context
    const context = ConversationContextManager.getContext(
      currentSessionId,
      user.id,
      workspaceId,
      pageId
    );
    
    // Ensure conversationHistory is always an array
    const safeConversationHistory = Array.isArray(conversationHistory) ? conversationHistory : [];
    
    // Calculate actual payload size after parsing
    const payloadSize = JSON.stringify(body).length;
    const payloadSizeMB = payloadSize / (1024 * 1024);
    
    logger.trace('[Unified] Payload size analysis', {
      requestId,
      payloadSizeMB: payloadSizeMB.toFixed(2),
      payloadSizeKB: (payloadSize / 1024).toFixed(2),
      queryLength: query?.length || 0,
      filesCount: files?.length || 0,
      totalContentLength: files?.reduce((sum, f) => {
        const contentLength = typeof f.content === 'string' ? f.content.length :
                            Array.isArray(f.content) ? f.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0;
        return sum + contentLength;
      }, 0) || 0,
      conversationHistoryCount: safeConversationHistory.length
    });

    logger.trace('[Unified] Request body parsed', {
      requestId,
      query,
      fileCount: files?.length || 0,
      pageId,
      workspaceId,
      hasConversationHistory: safeConversationHistory.length > 0,
      firstFile: files?.[0] ? {
        filename: files[0].filename,
        hasData: !!files[0].data,
        hasContent: !!files[0].content,
        dataLength: files[0].data?.length || 0,
        contentLength: files[0].content?.length || 0,
        contentType: Array.isArray(files[0].content) ? 'array' : typeof files[0].content,
        sampleContent: Array.isArray(files[0].content) ? 
                      (files[0].content[0] ? 
                        (typeof files[0].content[0] === 'string' ? 
                          files[0].content[0].slice(0, 100) : 
                          JSON.stringify(files[0].content[0]).slice(0, 100)) : 'No content') :
                      typeof files[0].content === 'string' ?
                      files[0].content.slice(0, 100) : 
                      files[0].content ? JSON.stringify(files[0].content).slice(0, 100) : 'No content',
        isContentEmpty: Array.isArray(files[0].content) ? 
                       files[0].content.length === 0 || files[0].content.every(c => 
                         !c || (typeof c === 'string' ? c.trim().length === 0 : false)
                       ) :
                       !files[0].content || (typeof files[0].content === 'string' && files[0].content.trim().length === 0)
      } : null
    });

    // CRITICAL DEBUG: Log detailed content for each file
    if (files && files.length > 0) {
      const contentValidation = files.map(file => {
        const contentLength = Array.isArray(file.content) ? 
          file.content.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 
          typeof file.content === 'string' ? file.content.length : 0;
        
        const hasActualContent = contentLength > 100 && 
          (Array.isArray(file.content) ? 
            file.content.some(c => c && (typeof c === 'string' ? c.trim().length > 50 : true)) :
            typeof file.content === 'string' && file.content.trim().length > 50);
        
        return {
          filename: file.filename,
          contentLength,
          hasActualContent,
          isEmpty: contentLength === 0
        };
      });
      
      const totalContentSize = contentValidation.reduce((sum, f) => sum + f.contentLength, 0);
      const filesWithContent = contentValidation.filter(f => f.hasActualContent).length;
      
      logger.trace('[Unified] CONTENT VALIDATION SUMMARY:', {
        requestId,
        totalContentSizeKB: (totalContentSize / 1024).toFixed(2),
        filesWithContent,
        totalFiles: files.length,
        emptyFiles: contentValidation.filter(f => f.isEmpty).length,
        validation: contentValidation
      });
      
      if (filesWithContent === 0) {
        logger.error('[Unified] CRITICAL: NO FILES HAVE ACTUAL CONTENT', {
          requestId,
          files: contentValidation
        });
      }
      
      logger.trace('[Unified] DETAILED FILE CONTENT DEBUG:', {
        requestId,
        totalFiles: files.length,
        files: files.map((file, index) => ({
          index,
          filename: file.filename,
          type: getFileType(file.filename),
          rawDataKeys: file.data ? Object.keys(file.data[0] || {}) : [],
          rawDataLength: Array.isArray(file.data) ? file.data.length : 0,
          rawContentType: typeof file.content,
          rawContentLength: Array.isArray(file.content) ? file.content.length : 
                           typeof file.content === 'string' ? file.content.length : 0,
          rawContentSample: Array.isArray(file.content) ? 
                           file.content.slice(0, 2).map((chunk: any) => 
                             chunk ? (typeof chunk === 'string' ? chunk.slice(0, 200) : JSON.stringify(chunk).slice(0, 200)) : 'Empty chunk'
                           ).join('\n---\n') :
                           typeof file.content === 'string' ? file.content.slice(0, 500) : 
                           'NO CONTENT DETECTED',
          hasSchema: !!file.schema,
          rowCount: file.rowCount,
          pageCount: file.pageCount,
          chunkCount: file.chunkCount
        }))
      });
    }

    if (!query || !files) {
      logger.warn('[Unified] Missing required fields', { query: !!query, files: !!files });
      return json(
        { 
          content: "Please provide a query.",
          metadata: { error: "Missing query or files parameter" }
        },
        { status: 400 }
      );
    }
    
    // Allow empty files array for general queries
    if (files.length === 0) {
      logger.trace('[Unified] Processing general query without files', { query });
    }

    // Analyze query intent
    const intent = queryIntentAnalyzer.analyzeIntent(query);
    logger.trace('[Unified] Query intent analyzed', {
      query,
      formatPreference: intent.formatPreference,
      queryType: intent.queryType,
      confidence: intent.confidence,
      needsDataAccess: queryIntentAnalyzer.needsDataAccess(intent)
    });
    
    // Update context with query and intent
    ConversationContextManager.updateWithQuery(context, query, intent, files || []);

    // Initialize services with extensive logging
    logger.trace('[Unified] Initializing services...');
    
    let intelligence;
    let composer;
    
    try {
      intelligence = new UnifiedIntelligenceService();
      logger.trace('[Unified] UnifiedIntelligenceService instantiated');
      
      // Verify the process method exists
      if (typeof intelligence.process !== 'function') {
        logger.error('[Unified] process method not found on UnifiedIntelligenceService', {
          availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(intelligence))
        });
        throw new Error('UnifiedIntelligenceService.process method not found');
      }
      
      composer = new ResponseComposer();
      logger.trace('[Unified] ResponseComposer instantiated');
      
      // Verify the compose method exists
      if (typeof composer.compose !== 'function') {
        logger.error('[Unified] compose method not found on ResponseComposer', {
          availableMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(composer))
        });
        throw new Error('ResponseComposer.compose method not found');
      }
    } catch (serviceError) {
      logger.error('[Unified] Service instantiation failed', serviceError);
      throw serviceError;
    }

    // Prepare file data based on type
    logger.trace('[Unified] Preparing file data...', { requestId, hasQueryResults: !!queryResults });
    const fileDataStart = Date.now();

    // QUERY-FIRST INTEGRATION (Task 61.1):
    // If query results are provided, use them instead of preparing full files
    let fileData;
    let storedQueryResults = null; // Store for passing to ResponseComposer

    // CRITICAL DEBUG: Check what we received
    logger.error('[CRITICAL DEBUG] Data path selection', {
      requestId,
      hasQueryResults: !!queryResults,
      queryResultsKeys: queryResults ? Object.keys(queryResults) : [],
      queryResultsData: queryResults?.data ? `${queryResults.data.length} rows` : 'no data',
      hasFiles: !!files,
      filesCount: files?.length || 0,
      filesPreview: files?.slice(0, 2).map(f => ({
        filename: f.filename,
        hasData: !!f.data,
        dataLength: Array.isArray(f.data) ? f.data.length : 0,
        hasContent: !!f.content,
        contentType: typeof f.content,
        contentLength: typeof f.content === 'string' ? f.content.length :
                      Array.isArray(f.content) ? f.content.length : 0
      }))
    });

    if (queryResults && queryResults.data) {
      logger.error('[Query-First] ✅ USING QUERY-FIRST PATH', {
        requestId,
        resultRows: queryResults.data.length,
        sql: queryResults.sql,
        executionTime: queryResults.executionTime
      });

      fileData = prepareQueryResults(queryResults, fileMetadata, requestId);

      // CRITICAL FIX: Store query results for ResponseComposer
      storedQueryResults = {
        success: true,
        data: queryResults.data,
        sql: queryResults.sql,
        columns: queryResults.columns,
        rowCount: queryResults.rowCount,
        executionTime: queryResults.executionTime
      };
    } else if (files && files.length > 0) {
      // AUTO-SQL GENERATION (Task 55.7)
      // No query results provided, attempt automatic SQL generation
      logger.trace('[Auto-SQL] No queryResults provided, checking if SQL generation needed', {
        requestId,
        filesCount: files.length,
        query: query?.slice(0, 100)
      });

      // Check if the query implies data access
      const needsSQL = detectDataAccessIntent(query);

      if (needsSQL) {
        logger.trace('[Auto-SQL] Data access intent detected, generating SQL', {
          requestId,
          query: query.slice(0, 100)
        });

        try {
          // Prepare file context for SQL generation
          const fileContext = files.map(f => ({
            id: f.id,
            filename: f.filename,
            tableName: f.tableName || f.filename.replace(/[^a-z0-9_]/gi, '_'),
            schema: f.schema || {
              columns: Object.keys(f.data?.[0] || {}).map(col => ({
                name: col,
                type: 'text' // Will be inferred by SQL generator
              }))
            },
            rowCount: f.rowCount || (f.data?.length) || 0,
            data: f.data?.slice(0, 5) // Send sample data for context
          }));

          // Generate SQL using the new service
          const sqlGenStart = Date.now();
          const sqlResult = await sqlGenerator.generate(query, fileContext, requestId);
          const sqlGenTime = Date.now() - sqlGenStart;

          logger.trace('[Auto-SQL] SQL generation completed', {
            requestId,
            hasSql: !!sqlResult.sql,
            confidence: sqlResult.confidence,
            generationTimeMs: sqlGenTime
          });

          if (sqlResult.sql && sqlResult.confidence > 0.7) {
            // SQL generated successfully!
            // Note: We don't execute it server-side because DuckDB runs client-side
            // Instead, we return an informative message telling the client to execute the SQL
            logger.error('[Auto-SQL] ✅ SQL generated, but execution should happen client-side', {
              requestId,
              sql: sqlResult.sql.slice(0, 200),
              confidence: sqlResult.confidence,
              suggestion: 'Client should execute this SQL in DuckDB and resend with queryResults'
            });

            return json(
              {
                content: `I can help you with that! Here's the SQL query I generated:\n\n\`\`\`sql\n${sqlResult.sql}\n\`\`\`\n\n**Note**: To see the results with a chart, the SQL needs to be executed client-side in DuckDB. Please execute this query and send the results back.`,
                metadata: {
                  sqlGenerated: true,
                  sql: sqlResult.sql,
                  confidence: sqlResult.confidence,
                  explanation: sqlResult.explanation,
                  tables: sqlResult.tables,
                  requiresClientExecution: true,
                  suggestion: 'Execute SQL in DuckDB client-side and resend with queryResults',
                  requestId
                }
              },
              { status: 200 }
            );
          } else {
            throw new Error(`SQL generation failed: low confidence (${sqlResult.confidence}) or no SQL generated`);
          }
        } catch (autoSQLError) {
          logger.error('[Auto-SQL] Automatic SQL generation failed', {
            requestId,
            error: autoSQLError instanceof Error ? autoSQLError.message : 'Unknown error',
            stack: autoSQLError instanceof Error ? autoSQLError.stack : undefined
          });

          // Fall through to original error response
        }
      }

      // If we reach here, either no SQL intent detected or SQL generation failed
      logger.error('[Query-First Required] ⚠️ Missing query results', {
        requestId,
        reason: !queryResults ? 'No queryResults' : 'No queryResults.data',
        filesCount: files?.length || 0,
        query: query?.slice(0, 100),
        hadSQLIntent: needsSQL
      });

      // Return error response - data analysis requires query-first approach
      return json(
        {
          content: "Unable to process data query. Please ensure files are properly loaded and query execution succeeds.",
          metadata: {
            error: "missing_query_results",
            requiresQueryFirst: true,
            suggestion: "Data analysis requires structured SQL queries. The query may have failed to generate or execute.",
            requestId
          }
        },
        { status: 400 }
      );
    } else {
      // No files provided at all
      logger.error('[Query-First Required] ⚠️ No files provided', {
        requestId,
        query: query?.slice(0, 100)
      });

      return json(
        {
          content: "Please upload data files to analyze.",
          metadata: {
            error: "no_files",
            suggestion: "Upload CSV, Excel, or other data files to get started",
            requestId
          }
        },
        { status: 400 }
      );
    }

    const fileDataTime = Date.now() - fileDataStart;
    logger.error('[TIMING] Data preparation', { requestId, dataPreparationTimeMs: fileDataTime });

    logger.error('[Unified] ⚠️ File data preparation CRITICAL CHECKPOINT', {
      requestId,
      preparationTimeMs: fileDataTime,
      preparedFiles: fileData.length,
      approach: queryResults ? 'query-first' : 'traditional',
      firstFile: fileData[0] ? {
        filename: fileData[0].filename,
        type: fileData[0].type,
        hasContent: !!fileData[0].content,
        contentType: typeof fileData[0].content,
        contentPreview: typeof fileData[0].content === 'string' ?
          fileData[0].content.slice(0, 300) :
          Array.isArray(fileData[0].content) ?
            `Array with ${fileData[0].content.length} items` :
            'NO CONTENT',
        hasData: !!fileData[0].data,
        dataLength: Array.isArray(fileData[0].data) ? fileData[0].data.length : 0
      } : 'NO FILES PREPARED'
    });

    // ========== QUERY-FIRST FAST PATH ==========
    // If we have query results, skip expensive semantic analysis entirely
    if (queryResults?.data && queryResults.data.length > 0) {
      logger.error('[Query-First Fast Path] Using optimized flow - skipping UnifiedIntelligenceService', {
        requestId,
        sql: queryResults.sql,
        rowCount: queryResults.data.length,
        executionTime: queryResults.executionTime
      });

      // Format the response directly without semantic analysis
      const formattedStart = Date.now();

      // Detect if this is an explicit visualization request
      const visualizationKeywords = /\b(visualize|chart|graph|plot|show.*chart|show.*graph)\b/i;
      const isExplicitVisualization = visualizationKeywords.test(query);

      let responseText = '';
      let chartGenerated = false;
      let chartResult: any = null; // Declare outside try-catch for metadata access

      // AUTO-CHART GENERATION: Check if we should visualize the results
      try {
        const chartGenStart = Date.now();
        chartResult = await queryResultChartGenerator.generateChartFromQueryResult(
          query,
          queryResults
        );

        if (chartResult.shouldChart && chartResult.chartData && chartResult.chartType) {
          const chartMarkdown = queryResultChartGenerator.generateChartMarkdown(
            chartResult.chartData,
            chartResult.chartType,
            chartResult.chartTitle,
            chartResult.chartDescription
          );

          // For explicit visualization requests, show chart FIRST
          if (isExplicitVisualization) {
            responseText = chartMarkdown;
            chartGenerated = true;
          } else {
            // For implicit requests, build table first and add chart after
            const tableMarkdown = formatQueryResultsAsMarkdown(queryResults);
            responseText = `### Query Results\n\n${tableMarkdown}\n\n**Query Details:**\n- SQL: \`${queryResults.sql}\`\n- Rows: ${queryResults.data.length}\n- Execution Time: ${queryResults.executionTime}ms`;
            responseText += chartMarkdown;
            chartGenerated = true;
          }

          logger.error('[Auto-Chart] Chart generated successfully', {
            requestId,
            chartType: chartResult.chartType,
            confidence: chartResult.confidence,
            generationTimeMs: Date.now() - chartGenStart,
            isExplicitVisualization
          });
        } else {
          logger.trace('[Auto-Chart] Skipped visualization', {
            requestId,
            reason: chartResult.reasoning,
            confidence: chartResult.confidence
          });
        }
      } catch (chartError) {
        logger.warn('[Auto-Chart] Chart generation failed, continuing without chart', {
          requestId,
          error: chartError instanceof Error ? chartError.message : 'Unknown error'
        });
        // Continue without chart - don't fail the entire request
      }

      // If no chart was generated, show table with query details
      if (!chartGenerated) {
        const tableMarkdown = formatQueryResultsAsMarkdown(queryResults);
        responseText = `### Query Results\n\n${tableMarkdown}\n\n**Query Details:**\n- SQL: \`${queryResults.sql}\`\n- Rows: ${queryResults.data.length}\n- Execution Time: ${queryResults.executionTime}ms`;
      } else if (isExplicitVisualization) {
        // For explicit visualization with chart, add query details as a collapsible section
        responseText += `\n\n<details>\n<summary>Query Details</summary>\n\n- **SQL**: \`${queryResults.sql}\`\n- **Rows**: ${queryResults.data.length}\n- **Execution Time**: ${queryResults.executionTime}ms\n\n</details>`;
      }

      const formattedTime = Date.now() - formattedStart;
      logger.error('[TIMING] Query-first formatting', { requestId, formattingTimeMs: formattedTime });

      // ========== TASK 56.1 & 56.5: SAVE ASSISTANT MESSAGE WITH METADATA ==========
      // Save the assistant response to database with rich metadata for block generation
      // Task 56.5: Handle large results (>100KB) with external storage
      try {
        const saveStart = Date.now();

        // Generate message ID upfront (needed for external storage path)
        const messageId = crypto.randomUUID();

        // TASK 56.5: Check and handle large chart data
        let chartMetadata: any = undefined;
        if (chartGenerated && chartResult?.shouldChart) {
          const chartData = {
            type: chartResult.chartType,
            data: chartResult.chartData,
            title: chartResult.chartTitle || `Results for: ${query.slice(0, 50)}...`,
            confidence: chartResult.confidence,
            description: chartResult.chartDescription,
          };

          const storageResult = await handleLargeResultStorage(
            chartData,
            'chart',
            workspaceId,
            pageId,
            messageId,
            request
          );

          if (storageResult.useExternalStorage) {
            // Store external reference + preview
            chartMetadata = {
              externalStorage: storageResult.externalStorage,
              preview: storageResult.preview,
            };
          } else {
            // Store inline
            chartMetadata = chartData;
          }
        }

        // TASK 56.5: Check and handle large table data
        let tableMetadata: any = undefined;
        if (!chartGenerated && queryResults.data.length > 0) {
          const tableData = {
            columns: queryResults.columns || Object.keys(queryResults.data[0] || {}),
            rows: queryResults.data,
            title: `Query Results: ${query.slice(0, 50)}${query.length > 50 ? '...' : ''}`,
          };

          const storageResult = await handleLargeResultStorage(
            tableData,
            'table',
            workspaceId,
            pageId,
            messageId,
            request
          );

          if (storageResult.useExternalStorage) {
            // Store external reference + preview
            tableMetadata = {
              externalStorage: storageResult.externalStorage,
              preview: storageResult.preview,
            };
          } else {
            // Store inline (limit to 100 rows)
            tableMetadata = {
              ...tableData,
              rows: tableData.rows.slice(0, 100),
            };
          }
        }

        // Prepare metadata structure following Task 56 specifications
        const assistantMetadata = {
          queryIntent: isExplicitVisualization ? 'data_visualization' : 'general_chat',
          generatedSQL: queryResults.sql,
          queryResultsSummary: {
            rowCount: queryResults.data.length,
            columns: queryResults.columns || Object.keys(queryResults.data[0] || {}),
            sampleRows: queryResults.data.slice(0, 10), // First 10 rows for preview
          },
          // Include chart config (inline or external reference)
          generatedChart: chartMetadata,
          // Include table config (inline or external reference)
          generatedTable: tableMetadata,
          // Include query execution metadata
          queryExecution: {
            executionTime: queryResults.executionTime,
            rowsReturned: queryResults.data.length,
            timestamp: new Date().toISOString(),
          },
        };

        // Calculate metadata size to ensure it's under 10KB
        const metadataSize = new Blob([JSON.stringify(assistantMetadata)]).size;
        logger.trace('[Task 56.1 & 56.5] Metadata size check', {
          requestId,
          metadataSizeBytes: metadataSize,
          metadataSizeKB: (metadataSize / 1024).toFixed(2),
          isUnder10KB: metadataSize < 10000,
          usesExternalStorage: !!(chartMetadata?.externalStorage || tableMetadata?.externalStorage),
        });

        // If metadata is still too large, reduce sample rows
        if (metadataSize > 10000) {
          logger.warn('[Task 56.1 & 56.5] Metadata exceeds 10KB, reducing sample size', {
            requestId,
            originalSize: metadataSize,
          });
          assistantMetadata.queryResultsSummary.sampleRows = queryResults.data.slice(0, 3);
        }

        // Save assistant message to database with pre-generated ID
        await prisma.chatMessage.create({
          data: {
            id: messageId, // Use pre-generated ID for external storage consistency
            pageId: pageId,
            workspaceId: workspaceId,
            userId: user.id,
            role: 'assistant',
            content: responseText,
            metadata: assistantMetadata,
          },
        });

        const saveTime = Date.now() - saveStart;
        logger.trace('[Task 56.1 & 56.5] Assistant message saved with metadata', {
          requestId,
          saveTimeMs: saveTime,
          metadataSizeKB: (metadataSize / 1024).toFixed(2),
          hasChart: !!assistantMetadata.generatedChart,
          hasTable: !!assistantMetadata.generatedTable,
          chartUsesExternalStorage: !!chartMetadata?.externalStorage,
          tableUsesExternalStorage: !!tableMetadata?.externalStorage,
          sampleRowCount: assistantMetadata.queryResultsSummary.sampleRows.length,
        });
      } catch (saveError) {
        // Log error but don't fail the request - user still gets response
        logger.error('[Task 56.1 & 56.5] Failed to save assistant message', {
          requestId,
          error: saveError instanceof Error ? saveError.message : 'Unknown error',
          stack: saveError instanceof Error ? saveError.stack : undefined,
        });
      }
      // ========== END TASK 56.1 & 56.5 ==========

      // Skip to streaming
      const totalProcessingTime = Date.now() - authStart;
      logger.error('[TIMING] ===== REQUEST TIMING BREAKDOWN (Query-First Fast Path) =====', {
        requestId,
        totalProcessingTimeMs: totalProcessingTime,
        totalProcessingTimeSec: (totalProcessingTime / 1000).toFixed(2),
        approach: 'query-first-fast-path'
      });

      // Stream the response
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const streamStart = Date.now();
          let firstTokenSent = false;
          let sentWords = 0;

          const words = responseText.split(/(\s+)/);

          for (const word of words) {
            if (!firstTokenSent && sentWords === 0) {
              const timeToFirstToken = Date.now() - streamStart;
              logger.error('[TIMING] Time to first token (fast path)', {
                requestId,
                timeToFirstTokenMs: timeToFirstToken
              });
              firstTokenSent = true;
            }

            const event = `event: token\ndata: ${JSON.stringify({ content: word })}\n\n`;
            controller.enqueue(encoder.encode(event));
            sentWords++;

            // Small delay between words for streaming effect
            await new Promise(resolve => setTimeout(resolve, 20));
          }

          // Send metadata (including database message ID for block creation)
          const metadataEvent = `event: metadata\ndata: ${JSON.stringify({
            metadata: {
              messageId: messageId, // Task 56.2 fix: Include database UUID for "Add to Page" functionality
              queryFirst: true,
              sql: queryResults.sql,
              rowsAnalyzed: queryResults.data.length,
              executionTime: queryResults.executionTime,
              approach: 'fast-path'
            }
          })}\n\n`;
          controller.enqueue(encoder.encode(metadataEvent));

          // Send done
          const doneEvent = `event: done\ndata: ${JSON.stringify({ complete: true })}\n\n`;
          controller.enqueue(encoder.encode(doneEvent));

          controller.close();

          logger.error('[TIMING] Total streaming time (fast path)', {
            requestId,
            streamingTimeMs: Date.now() - streamStart,
            wordsSent: sentWords
          });
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }
    // ========== END QUERY-FIRST FAST PATH ==========

    // CRITICAL DEBUG: Log prepared file data
    const preparedContentSize = fileData.reduce((sum, f) => {
      const size = typeof f.content === 'string' ? f.content.length :
                   Array.isArray(f.content) ? f.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0;
      return sum + size;
    }, 0);
    
    logger.trace('[Unified] PREPARED FILE DATA DEBUG:', {
      requestId,
      totalPreparedSizeKB: (preparedContentSize / 1024).toFixed(2),
      preparedFiles: fileData.map(file => ({
        filename: file.filename,
        type: file.type,
        hasContent: !!file.content,
        contentType: typeof file.content,
        contentLength: typeof file.content === 'string' ? file.content.length : 
                      Array.isArray(file.content) ? file.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0,
        contentSample: typeof file.content === 'string' ? file.content.slice(0, 500) :
                      Array.isArray(file.content) ? file.content.slice(0, 2).map(item => 
                        typeof item === 'string' ? item : JSON.stringify(item)
                      ).join('\n---\n').slice(0, 500) :
                      'NO PREPARED CONTENT',
        hasData: !!file.data,
        dataLength: Array.isArray(file.data) ? file.data.length : 0,
        hasExtractedContent: !!file.extractedContent,
        extractedContentLength: Array.isArray(file.extractedContent) ? file.extractedContent.length : 0,
        hasSample: !!file.sample,
        sampleLength: file.sample?.length || 0
      }))
    });
    
    // CRITICAL: Validate that we have actual content, not just metadata
    const contentValidation = fileData.map(file => ({
      filename: file.filename,
      type: file.type,
      hasContent: !!file.content,
      contentLength: typeof file.content === 'string' ? file.content.length : 
                     Array.isArray(file.content) ? file.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0,
      hasData: !!file.data,
      dataLength: Array.isArray(file.data) ? file.data.length : 0,
      contentSample: typeof file.content === 'string' ? file.content.slice(0, 200) :
                     Array.isArray(file.content) && file.content[0] ? 
                       (typeof file.content[0] === 'string' ? file.content[0].slice(0, 200) : 
                        file.content[0] ? JSON.stringify(file.content[0]).slice(0, 200) : 'Empty item') : 'NO CONTENT'
    }));
    
    logger.trace('[Unified] Content validation results', {
      fileCount: fileData.length,
      validation: contentValidation,
      totalContentLength: contentValidation.reduce((acc, v) => acc + v.contentLength, 0),
      filesWithContent: contentValidation.filter(v => v.hasContent).length,
      filesWithData: contentValidation.filter(v => v.hasData).length
    });
    
    // Warn if no actual content was extracted
    if (contentValidation.every(v => v.contentLength === 0)) {
      logger.error('[Unified] CRITICAL: No content extracted from any file!', {
        fileData: fileData.map(f => ({ 
          filename: f.filename, 
          type: f.type,
          contentType: typeof f.content,
          dataType: typeof f.data 
        }))
      });
    }
    
    // Perform unified analysis using the correct method name: process
    logger.trace('[Unified] Starting unified analysis...', { requestId });
    const analysisStart = Date.now();
    let analysis;
    
    try {
      // CRITICAL DEBUG: Log what we're sending to the intelligence service
      logger.trace('[Unified] SENDING TO INTELLIGENCE SERVICE:', {
        queryLength: query.length,
        fileDataCount: fileData.length,
        fileDataSummary: fileData.map(f => ({
          filename: f.filename,
          type: f.type,
          hasContent: !!f.content,
          contentLength: typeof f.content === 'string' ? f.content.length : 
                        Array.isArray(f.content) ? f.content.map((item: any) => typeof item === 'string' ? item : JSON.stringify(item)).join('').length : 0,
          actualContentSample: typeof f.content === 'string' ? f.content.slice(0, 300) :
                              Array.isArray(f.content) ? f.content.slice(0, 2).map(item =>
                                typeof item === 'string' ? item : JSON.stringify(item)
                              ).join('\\n').slice(0, 300) :
                              'NO CONTENT FOR INTELLIGENCE SERVICE'
        })),
        intentType: intent.queryType,
        intentFormat: intent.formatPreference,
        hasConversationHistory: safeConversationHistory.length > 0
      });
      
      // Add request ID to track through the pipeline
      analysis = await intelligence.process({
        requestId,
        query,
        files: fileData,
        intent,
        conversationHistory: safeConversationHistory,
        options: {
          includeSQL: true, // Enable SQL generation for data queries
          includeSemantic: true,
          includeInsights: true,
          includeStatistics: true,
          formatPreference: intent.formatPreference
        }
      });
      
      // CRITICAL DEBUG: Log what came back from the intelligence service
      logger.trace('[Unified] RECEIVED FROM INTELLIGENCE SERVICE:', {
        hasAnalysis: !!analysis,
        analysisKeys: analysis ? Object.keys(analysis) : [],
        hasSemantic: !!analysis?.semantic,
        semanticSummaryLength: analysis?.semantic?.summary?.length || 0,
        semanticSummaryPreview: analysis?.semantic?.summary?.slice(0, 200) || 'No summary',
        hasPresentation: !!analysis?.presentation,
        presentationNarrativeLength: analysis?.presentation?.narrative?.length || 0,
        confidence: analysis?.confidence
      });
      
      const analysisTime = Date.now() - analysisStart;
      logger.error('[TIMING] UnifiedIntelligenceService.process()', {
        requestId,
        intelligenceTimeMs: analysisTime,
        intelligenceTimeSec: (analysisTime / 1000).toFixed(2)
      });
    } catch (analysisError) {
      logger.error('[Unified] Analysis failed', {
        error: analysisError,
        stack: analysisError instanceof Error ? analysisError.stack : undefined
      });
      throw new Error(`Analysis failed: ${analysisError instanceof Error ? analysisError.message : 'Unknown error'}`);
    }

    logger.trace('[Unified] Analysis result structure', {
      hasAnalysis: !!analysis,
      hasSemantic: !!analysis?.semantic,
      hasStatistical: !!analysis?.statistical,
      hasPresentation: !!analysis?.presentation,
      keyThemesCount: analysis?.semantic?.keyThemes?.length || 0,
      patternsCount: analysis?.statistical?.patterns?.length || 0
    });

    // Compose natural response using correct parameter structure
    logger.trace('[Unified] Starting response composition...');
    let response;

    const composeStart = Date.now();
    try {
      // CRITICAL DEBUG: Log what we're sending to the response composer
      logger.trace('[Unified] SENDING TO RESPONSE COMPOSER:', {
        hasAnalysis: !!analysis,
        analysisSemanticSummary: analysis?.semantic?.summary || 'No semantic summary',
        analysisPresentationNarrative: analysis?.presentation?.narrative || 'No presentation narrative',
        intentType: intent.queryType,
        intentFormat: intent.formatPreference,
        optionsProvided: {
          prioritizeNarrative: true,
          depth: intent.expectedDepth,
          includeTechnicalDetails: false
        }
      });

      // ResponseComposer.compose expects: (intent, analysis, queryResult?, options?)
      response = await composer.compose(
        intent,
        analysis,
        storedQueryResults, // CRITICAL FIX: Pass query results from query-first path
        {
          prioritizeNarrative: true,
          depth: intent.expectedDepth,
          includeTechnicalDetails: false
        }
      );

      const composeTime = Date.now() - composeStart;
      logger.error('[TIMING] ResponseComposer.compose()', {
        requestId,
        composeTimeMs: composeTime,
        composeTimeSec: (composeTime / 1000).toFixed(2)
      });
      
      // CRITICAL DEBUG: Log the composed response
      logger.trace('[Unified] RESPONSE COMPOSER OUTPUT:', {
        responseLength: response?.length || 0,
        responsePreview: response?.slice(0, 500) || 'No response generated',
        responseIsEmpty: !response || response.trim().length === 0,
        responseContainsActualContent: response && response.length > 50 && !response.includes('Unable to')
      });
      
      logger.trace('[Unified] Response composed successfully', {
        responseLength: response?.length || 0
      });
    } catch (composeError) {
      logger.error('[Unified] Response composition failed', {
        error: composeError,
        stack: composeError instanceof Error ? composeError.stack : undefined
      });
      throw new Error(`Response composition failed: ${composeError instanceof Error ? composeError.message : 'Unknown error'}`);
    }

    // Track token usage and performance
    const totalProcessingTime = Date.now() - startTime;

    // Log comprehensive timing breakdown
    logger.error('[TIMING] ===== REQUEST TIMING BREAKDOWN =====', {
      requestId,
      totalProcessingTimeMs: totalProcessingTime,
      totalProcessingTimeSec: (totalProcessingTime / 1000).toFixed(2),
      approach: queryResults ? 'query-first' : 'traditional'
    });

    // Get the actual model being used
    const modelName = await aiModelConfig.getModelName(user.id);
    
    // Extract prompt and completion tokens if available
    const promptTokens = analysis?.metadata?.promptTokens || analysis?.metadata?.tokensUsed || 0;
    const completionTokens = analysis?.metadata?.completionTokens || 0;
    const totalTokens = analysis?.metadata?.totalTokens || analysis?.metadata?.tokensUsed || promptTokens + completionTokens;
    
    const tokenMetadata = {
      model: modelName,
      contextTokens: promptTokens,
      responseTokens: completionTokens,
      totalTokens: totalTokens,
      intent: intent.formatPreference,
      confidence: intent.confidence,
      requestId,
      processingTimeMs: totalProcessingTime,
      payloadSizeMB: payloadSizeMB.toFixed(2),
      preparedContentSizeKB: (preparedContentSize / 1024).toFixed(2)
    };
    
    // Critical check: If no tokens were used, OpenAI was not called
    if (tokenMetadata.totalTokens === 0) {
      logger.error('[Unified] CRITICAL: OpenAI was not called or failed', {
        requestId,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        analysisHadContent: !!analysis?.semantic?.summary,
        responseLength: response?.length || 0
      });
    }

    logger.trace('[Unified] Response ready', {
      contentLength: response?.length || 0,
      hasMetadata: !!analysis?.metadata,
      processingTime: analysis?.metadata?.processingTime
    });

    // Return the composed response
    const finalResponse = {
      content: response || 'Unable to generate response',
      metadata: {
        ...tokenMetadata,
        files: files.map((f: any) => f.filename),
        queryType: intent.queryType,
        formatPreference: intent.formatPreference,
        processingTime: analysis?.metadata?.processingTime,
        confidence: analysis?.confidence
      }
    };

    logger.trace('[Unified] Sending successful response', {
      requestId,
      responseLength: finalResponse.content.length,
      metadataKeys: Object.keys(finalResponse.metadata),
      totalProcessingTimeMs: totalProcessingTime,
      totalProcessingTimeSec: (totalProcessingTime / 1000).toFixed(2),
      isGenericResponse: finalResponse.content.includes('This The') || 
                        finalResponse.content.includes('Analyzing') ||
                        finalResponse.content.includes('Unable to extract')
    });
    
    // Log performance summary for monitoring
    // Update context with response
    const responseType = files && files.length > 0 ? 'data-query' : 'general-chat';
    ConversationContextManager.updateWithResponse(
      context,
      finalResponse.content,
      responseType,
      totalProcessingTime,
      tokenMetadata?.totalTokens
    );
    
    logger.trace('[Unified] Request completed', {
      requestId,
      userId: user.id,
      pageId,
      filesCount: files?.length || 0,
      queryLength: query?.length || 0,
      requestSizeMB: requestSizeMB.toFixed(2),
      responseLength: finalResponse.content.length,
      totalProcessingTimeMs: totalProcessingTime,
      contextTokens: tokenMetadata.contextTokens,
      totalTokens: tokenMetadata.totalTokens,
      success: true
    });

    // Check if client requested streaming response
    if (stream) {
      const streamStart = Date.now();
      logger.trace('[Unified] Creating streaming response', { requestId });

      return eventStream(request.signal, function setup(send) {
        // Stream response word by word for immediate feedback
        const words = finalResponse.content.split(' ');
        let sentWords = 0;
        let firstTokenSent = false;

        const interval = setInterval(() => {
          if (!firstTokenSent && sentWords === 0) {
            const timeToFirstToken = Date.now() - streamStart;
            logger.error('[TIMING] Time to first token', {
              requestId,
              timeToFirstTokenMs: timeToFirstToken
            });
            firstTokenSent = true;
          }
          if (sentWords < words.length) {
            const chunk = words[sentWords] + (sentWords < words.length - 1 ? ' ' : '');
            send({
              event: 'token',
              data: JSON.stringify({ content: chunk })
            });
            sentWords++;
          } else {
            // Send metadata when done
            send({
              event: 'metadata',
              data: JSON.stringify({
                metadata: finalResponse.metadata,
                sessionId: currentSessionId
              })
            });
            send({
              event: 'done',
              data: JSON.stringify({})
            });
            clearInterval(interval);
          }
        }, 5); // 5ms between chunks for smooth streaming

        return () => {
          clearInterval(interval);
        };
      });
    }

    // Include session ID in response for client continuity (non-streaming fallback)
    return json({ ...finalResponse, sessionId: currentSessionId });

  } catch (error) {
    // Log error with context for monitoring
    QueryErrorRecovery.logError(error, {
      requestId,
      query: query || 'unknown',
      userId: user?.id,
      fileCount: files?.length || 0
    });

    // Generate user-friendly error response with recovery suggestions
    const errorResponse = QueryErrorRecovery.generateErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );

    // Determine HTTP status code based on error category
    const statusCode = errorResponse.metadata.category === 'authentication_error' ? 401 :
                      errorResponse.metadata.category === 'validation_error' ? 400 :
                      500;

    return json(
      {
        content: errorResponse.content,
        metadata: {
          ...errorResponse.metadata,
          stack: process.env.NODE_ENV === 'development' && error instanceof Error ?
            error.stack : undefined
        }
      },
      { status: statusCode }
    );
  }
};

/**
 * Prepare query results for AI analysis (Query-First approach - Task 61.1)
 *
 * Instead of sending full datasets, we send SQL query results.
 * This reduces payload from megabytes to kilobytes.
 */
function prepareQueryResults(
  queryResults: {
    data: any[];
    sql?: string;
    columns?: string[];
    rowCount?: number;
    executionTime?: number;
  },
  fileMetadata?: Array<{
    filename: string;
    type: string;
    rowCount?: number;
    schema?: any[];
  }>,
  requestId?: string
): any[] {
  logger.trace('[prepareQueryResults] START', {
    requestId,
    resultRows: queryResults.data?.length || 0,
    columns: queryResults.columns?.length || 0,
    sql: queryResults.sql?.slice(0, 200),
    hasMetadata: !!fileMetadata
  });

  const results = queryResults.data || [];

  if (results.length === 0) {
    logger.warn('[prepareQueryResults] No results data provided', { requestId });
    return [];
  }

  // Format results as a readable text table
  const headers = queryResults.columns || Object.keys(results[0] || {});

  // Create CSV-like content for AI to analyze
  let content = `SQL Query:\n${queryResults.sql || 'Not provided'}\n\n`;
  content += `Execution Time: ${queryResults.executionTime || 0}ms\n`;
  content += `Total Rows: ${queryResults.rowCount || results.length}\n`;
  content += `Showing: Top ${results.length} rows\n\n`;
  content += `Results:\n`;
  content += `${headers.join(' | ')}\n`;
  content += `${headers.map(() => '---').join(' | ')}\n`;

  results.forEach((row, idx) => {
    const values = headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return val.toFixed(2);
      return String(val).slice(0, 50); // Truncate long strings
    });
    content += `${values.join(' | ')}\n`;
  });

  // Add file context if provided
  let fileContext = '\n\nSource Files:\n';
  if (fileMetadata && fileMetadata.length > 0) {
    fileMetadata.forEach(meta => {
      fileContext += `- ${meta.filename} (${meta.type}, ${meta.rowCount || 0} rows)\n`;
    });
  }

  const preparedFile = {
    id: 'query_results',
    filename: 'Query Results',
    type: 'csv',
    content: content + fileContext,
    data: results,
    schema: headers.map((h: string) => ({
      name: h,
      type: typeof results[0][h] === 'number' ? 'number' : 'text'
    })),
    rowCount: results.length,
    metadata: {
      sql: queryResults.sql,
      executionTime: queryResults.executionTime,
      totalRows: queryResults.rowCount,
      isQueryResult: true
    }
  };

  logger.trace('[prepareQueryResults] COMPLETE', {
    requestId,
    contentLength: content.length,
    contentPreview: content.slice(0, 500),
    headers: headers.length,
    rowsFormatted: results.length
  });

  return [preparedFile];
}

/**
 * Get file type from filename
 */
function getFileType(filename: string): 'pdf' | 'csv' | 'excel' | 'text' | 'markdown' | 'json' | 'xml' | 'unknown' {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'pdf';
    case 'csv':
      return 'csv';
    case 'xlsx':
    case 'xls':
      return 'excel';
    case 'txt':
      return 'text';
    case 'md':
      return 'markdown';
    case 'json':
      return 'json';
    case 'xml':
      return 'xml';
    default:
      return 'unknown';
  }
}
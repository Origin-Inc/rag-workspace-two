import { openai } from './openai.server';
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { documentChunkingService, type DocumentChunk } from './document-chunking.server';
import { DebugLogger } from '~/utils/debug-logger';
import { prisma } from '~/utils/db.server';

interface EmbeddingResult {
  embedding: number[];
  tokens: number;
}

interface DocumentWithEmbedding {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  storage_path?: string;
  source_block_id?: string;
  passage_id: string;
  chunk_index: number;
}

export class EmbeddingGenerationService {
  private readonly supabase = createSupabaseAdmin();
  private readonly logger = new DebugLogger('EmbeddingGeneration');
  
  // OpenAI configuration
  private readonly EMBEDDING_MODEL = 'text-embedding-3-small';
  private readonly EMBEDDING_DIMENSION = 1536;
  private readonly MAX_BATCH_SIZE = 100;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // ms

  /**
   * Generate embeddings for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    this.logger.info('Generating embedding for text', { length: text.length });

    try {
      const response = await openai.embeddings.create({
        model: this.EMBEDDING_MODEL,
        input: text,
        dimensions: this.EMBEDDING_DIMENSION
      });

      const embedding = response.data[0].embedding;
      const tokens = response.usage?.total_tokens || 0;

      this.logger.info('Embedding generated successfully', { 
        dimensions: embedding.length,
        tokens 
      });

      return { embedding, tokens };
    } catch (error) {
      this.logger.error('Failed to generate embedding', error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<EmbeddingResult[]> {
    this.logger.info('Generating embeddings batch', { count: texts.length });

    const results: EmbeddingResult[] = [];
    
    // Process in batches
    for (let i = 0; i < texts.length; i += this.MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + this.MAX_BATCH_SIZE);
      
      try {
        const response = await openai.embeddings.create({
          model: this.EMBEDDING_MODEL,
          input: batch,
          dimensions: this.EMBEDDING_DIMENSION
        });

        const batchResults = response.data.map(item => ({
          embedding: item.embedding,
          tokens: response.usage?.total_tokens || 0
        }));

        results.push(...batchResults);
        
        this.logger.info(`Batch ${i / this.MAX_BATCH_SIZE + 1} processed`, {
          processed: results.length,
          total: texts.length
        });
      } catch (error) {
        this.logger.error(`Batch ${i / this.MAX_BATCH_SIZE + 1} failed`, error);
        
        // Retry logic with exponential backoff
        for (let retry = 0; retry < this.MAX_RETRIES; retry++) {
          await this.delay(this.RETRY_DELAY * Math.pow(2, retry));
          
          try {
            const response = await openai.embeddings.create({
              model: this.EMBEDDING_MODEL,
              input: batch,
              dimensions: this.EMBEDDING_DIMENSION
            });

            const batchResults = response.data.map(item => ({
              embedding: item.embedding,
              tokens: response.usage?.total_tokens || 0
            }));

            results.push(...batchResults);
            break;
          } catch (retryError) {
            if (retry === this.MAX_RETRIES - 1) {
              throw new Error(`Failed after ${this.MAX_RETRIES} retries: ${retryError}`);
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Process a document and generate embeddings with citations
   */
  async processDocument(
    workspaceId: string,
    documentContent: string,
    metadata: {
      filename?: string;
      source_block_id?: string;
      page_name?: string;
      block_type?: string;
      storage_path?: string;
    } = {}
  ): Promise<string[]> {
    this.logger.info('Processing document', { 
      workspaceId,
      contentLength: documentContent.length,
      metadata 
    });

    try {
      // Chunk the document
      const chunks = await documentChunkingService.chunkDocument(documentContent, {
        chunkSize: 1000,
        overlap: 200,
        preserveParagraphs: true,
        preserveCodeBlocks: true
      });

      this.logger.info('Document chunked', { chunkCount: chunks.length });

      // Generate embeddings for each chunk
      const chunkTexts = chunks.map(chunk => chunk.text);
      const embeddings = await this.generateEmbeddingsBatch(chunkTexts);

      // Prepare documents for insertion
      const documents: Omit<DocumentWithEmbedding, 'id'>[] = chunks.map((chunk, index) => ({
        workspace_id: workspaceId,
        content: chunk.text,
        embedding: embeddings[index].embedding,
        metadata: {
          ...metadata,
          ...chunk.metadata,
          chunk_index: index,
          total_chunks: chunks.length,
          start_char: chunk.start_char,
          end_char: chunk.end_char
        },
        storage_path: metadata.storage_path,
        source_block_id: metadata.source_block_id,
        passage_id: this.generatePassageId(metadata.source_block_id, index),
        chunk_index: index
      }));

      // Store documents with embeddings
      const passageIds = await this.storeDocumentsWithEmbeddings(documents);

      this.logger.info('Documents stored with embeddings', { 
        count: passageIds.length 
      });

      return passageIds;
    } catch (error) {
      this.logger.error('Document processing failed', error);
      throw new Error(`Document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a unique passage ID for citations
   */
  private generatePassageId(sourceBlockId?: string, chunkIndex?: number): string {
    const baseId = sourceBlockId || `doc-${Date.now()}`;
    const index = chunkIndex !== undefined ? `-${chunkIndex}` : '';
    return `${baseId}${index}`;
  }

  /**
   * Store documents with embeddings in the database
   */
  private async storeDocumentsWithEmbeddings(
    documents: Omit<DocumentWithEmbedding, 'id'>[]
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('documents')
      .insert(documents)
      .select('passage_id');

    if (error) {
      this.logger.error('Failed to store documents', error);
      throw new Error(`Failed to store documents: ${error.message}`);
    }

    return data.map(doc => doc.passage_id);
  }

  /**
   * Process documents in the embeddings queue
   */
  async processEmbeddingsQueue(): Promise<void> {
    this.logger.info('Processing embeddings queue');

    // Get pending items from queue
    const { data: queueItems, error: queueError } = await this.supabase
      .from('embeddings_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (queueError) {
      this.logger.error('Failed to fetch queue items', queueError);
      throw new Error(`Failed to fetch queue items: ${queueError.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      this.logger.info('No items in queue');
      return;
    }

    this.logger.info('Processing queue items', { count: queueItems.length });

    for (const item of queueItems) {
      try {
        // Update status to processing
        await this.supabase
          .from('embeddings_queue')
          .update({ status: 'processing' })
          .eq('id', item.id);

        // Get the document
        const { data: document, error: docError } = await this.supabase
          .from('documents')
          .select('*')
          .eq('id', item.document_id)
          .single();

        if (docError || !document) {
          throw new Error(`Document not found: ${item.document_id}`);
        }

        // Generate embedding
        const { embedding } = await this.generateEmbedding(document.content);

        // Update document with embedding
        const { error: updateError } = await this.supabase
          .from('documents')
          .update({ embedding })
          .eq('id', document.id);

        if (updateError) {
          throw new Error(`Failed to update document: ${updateError.message}`);
        }

        // Mark as completed
        await this.supabase
          .from('embeddings_queue')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString()
          })
          .eq('id', item.id);

        this.logger.info('Queue item processed successfully', { id: item.id });
      } catch (error) {
        this.logger.error('Queue item processing failed', { id: item.id, error });

        // Update queue item with error
        await this.supabase
          .from('embeddings_queue')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            retry_count: item.retry_count + 1
          })
          .eq('id', item.id);
      }
    }
  }

  /**
   * Search for similar documents using vector similarity
   */
  async searchSimilarDocuments(
    workspaceId: string,
    queryText: string,
    limit: number = 10,
    similarityThreshold: number = 0.7,
    pageId?: string // Optional pageId to scope search to specific page
  ): Promise<DocumentWithEmbedding[]> {
    this.logger.info('🔍 === STARTING SEARCH SIMILAR DOCUMENTS ===', {
      workspaceId,
      pageId,
      queryText: queryText.substring(0, 100),
      queryLength: queryText.length,
      limit,
      similarityThreshold,
      openaiConfigured: !!openai,
      timestamp: new Date().toISOString()
    });

    try {
      let embedding = null;
      
      // Try to generate embedding if OpenAI is configured
      if (openai) {
        try {
          this.logger.info('📊 Generating embedding for query...');
          const result = await this.generateEmbedding(queryText);
          embedding = result.embedding;
          this.logger.info('✅ Embedding generated successfully', {
            embeddingLength: embedding?.length,
            firstValues: embedding?.slice(0, 5)
          });
        } catch (embError) {
          this.logger.warn('⚠️ Failed to generate embedding, falling back to text search', {
            error: embError instanceof Error ? embError.message : embError,
            stack: embError instanceof Error ? embError.stack : undefined
          });
        }
      } else {
        this.logger.warn('⚠️ OpenAI not configured, using text-only search');
      }

      // If we have an embedding, use our new search function
      if (embedding) {
        const vectorString = `[${embedding.join(',')}]`;
        
        this.logger.info('🔎 Executing vector search', {
          vectorStringLength: vectorString.length,
          hasPageId: !!pageId,
          workspaceId,
          pageId
        });
        
        // Use the search_embeddings function from our migration
        // Build the query based on whether pageId is provided
        // Use Prisma.sql for proper type handling
        const results = pageId 
          ? await prisma.$queryRawUnsafe<any[]>(`
              SELECT 
                source_type,
                entity_id,
                page_id,
                chunk_text,
                similarity,
                metadata
              FROM search_embeddings(
                $1::vector,
                $2::uuid,
                $3::uuid,
                $4::integer,
                $5::float
              )
            `, vectorString, workspaceId, pageId, limit, similarityThreshold)
          : await prisma.$queryRawUnsafe<any[]>(`
              SELECT 
                source_type,
                entity_id,
                page_id,
                chunk_text,
                similarity,
                metadata
              FROM search_embeddings(
                $1::vector,
                $2::uuid,
                NULL::uuid,
                $3::integer,
                $4::float
              )
            `, vectorString, workspaceId, limit, similarityThreshold);
        
        this.logger.info('✅ Vector search completed', { 
          resultsCount: results.length,
          results: results.map(r => ({
            source_type: r.source_type,
            entity_id: r.entity_id,
            similarity: r.similarity,
            textPreview: r.chunk_text?.substring(0, 100)
          }))
        });

        // Transform results to match expected format
        return results.map((r: any) => ({
          id: r.entity_id,
          content: r.chunk_text,
          embedding: [], // Don't return full embedding to save bandwidth
          metadata: r.metadata || {},
          passage_id: r.entity_id,
          chunk_index: r.metadata?.chunkIndex || 0,
          similarity: r.similarity,
          rank: r.similarity,
          pageId: r.page_id,
          workspace_id: workspaceId,
          source_type: r.source_type
        })) as DocumentWithEmbedding[];
      } else {
        // Use text-only search on unified view
        this.logger.info('📝 Using text-only search fallback (no embedding)');
        const searchPattern = `%${queryText}%`;
        const results = pageId
          ? await prisma.$queryRawUnsafe<any[]>(`
              SELECT 
                source_type,
                entity_id,
                page_id,
                chunk_text,
                metadata,
                0.5 as similarity
              FROM unified_embeddings
              WHERE 
                workspace_id = $1::uuid
                AND page_id = $2::uuid
                AND chunk_text ILIKE $3
              LIMIT $4
            `, workspaceId, pageId, searchPattern, limit)
          : await prisma.$queryRawUnsafe<any[]>(`
              SELECT 
                source_type,
                entity_id,
                page_id,
                chunk_text,
                metadata,
                0.5 as similarity
              FROM unified_embeddings
              WHERE 
                workspace_id = $1::uuid
                AND chunk_text ILIKE $2
              LIMIT $3
            `, workspaceId, searchPattern, limit);
        
        return results.map((r: any) => ({
          id: r.entity_id,
          content: r.chunk_text,
          embedding: [],
          metadata: r.metadata || {},
          passage_id: r.entity_id,
          chunk_index: r.metadata?.chunkIndex || 0,
          similarity: r.similarity,
          rank: r.similarity,
          pageId: r.page_id,
          workspace_id: workspaceId,
          source_type: r.source_type
        })) as DocumentWithEmbedding[];
      }
    } catch (error) {
      this.logger.error('❌ === SEARCH SIMILAR DOCUMENTS FAILED ===', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        workspaceId,
        pageId,
        queryText: queryText.substring(0, 100)
      });
      throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform text-only search without embeddings
   */
  private async textOnlySearch(
    workspaceId: string,
    queryText: string,
    limit: number
  ): Promise<DocumentWithEmbedding[]> {
    this.logger.info('Using text-only search (no embeddings)', {
      workspaceId,
      queryText,
      limit
    });
    
    // Log the exact workspace ID being used
    console.log('[TEXT_SEARCH] Searching with workspace ID:', workspaceId);
    console.log('[TEXT_SEARCH] Query text:', queryText);
    
    try {
      // First, check if documents table exists and has data
      const { data: checkData, error: checkError } = await this.supabase
        .from('documents')
        .select('count')
        .eq('workspace_id', workspaceId)
        .limit(1);
      
      this.logger.info('Documents table check', {
        hasData: !!checkData,
        error: checkError?.message,
        workspaceId
      });

      // If no documents exist for this workspace, return empty results with explanation
      if (!checkError && (!checkData || checkData.length === 0)) {
        this.logger.warn('No documents found for workspace', { workspaceId });
        
        // Return a helpful message as a document
        return [{
          id: 'no-content',
          content: 'No content has been indexed yet. To use the AI search feature, you need to add content to your pages and databases first. Once you have content, it will be automatically indexed for searching.',
          embedding: [],
          metadata: { type: 'system-message' },
          passage_id: 'system-no-content',
          chunk_index: 0,
          similarity: 1.0,
          rank: 1.0
        } as any];
      }

      // Perform the actual search
      const { data, error } = await this.supabase
        .from('documents')
        .select('*')
        .eq('workspace_id', workspaceId)
        .ilike('content', `%${queryText}%`)
        .limit(limit);

      if (error) {
        this.logger.error('Text search failed', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          workspaceId,
          queryText
        });
        
        // Check if it's a table not found error
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          this.logger.error('Documents table does not exist! Running emergency fix...');
          
          // Return error document
          return [{
            id: 'error',
            content: `Database setup incomplete. The documents table needs to be created. Error: ${error.message}`,
            embedding: [],
            metadata: { type: 'error', error: error.message },
            passage_id: 'system-error',
            chunk_index: 0,
            similarity: 0,
            rank: 0
          } as any];
        }
        
        throw new Error(`Text search failed: ${error.message}`);
      }

      this.logger.info('Text search completed', { 
        resultsCount: data?.length || 0,
        firstResult: data?.[0]?.content?.substring(0, 100)
      });
      
      // If no results, return helpful message
      if (!data || data.length === 0) {
        return [{
          id: 'no-results',
          content: `No content found matching "${queryText}". Try adding more content to your pages or using different search terms.`,
          embedding: [],
          metadata: { type: 'no-results', query: queryText },
          passage_id: 'system-no-results',
          chunk_index: 0,
          similarity: 0.3,
          rank: 0.3
        } as any];
      }
      
      // Format results to match hybrid_search output
      return (data || []).map(doc => ({
        ...doc,
        similarity: 0.5, // Default similarity for text matches
        rank: 0.5
      }));
    } catch (error) {
      this.logger.error('Text search exception', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        workspaceId,
        queryText
      });
      throw error;
    }
  }

  /**
   * Helper function to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const embeddingGenerationService = new EmbeddingGenerationService();
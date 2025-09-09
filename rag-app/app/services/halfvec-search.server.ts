import { prisma } from '~/utils/db.server';
import OpenAI from 'openai';
import { DebugLogger } from '~/utils/debug-logger';
import { ensureVectorSearchPath } from '~/utils/db-vector.server';

const logger = new DebugLogger('HalfvecSearch');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Feature flag to control halfvec usage
const USE_HALFVEC = process.env.USE_HALFVEC === 'true' || false;

/**
 * Enhanced search service supporting both vector and halfvec types
 * Automatically switches between them based on availability and feature flags
 */
export async function searchWithHalfvec(
  workspaceId: string,
  queryText: string,
  options: {
    limit?: number;
    threshold?: number;
    pageId?: string;
    forceVectorType?: 'vector' | 'halfvec' | 'auto';
  } = {}
) {
  const { 
    limit = 10, 
    threshold = 0.3, 
    pageId = null,
    forceVectorType = 'auto' 
  } = options;
  
  logger.info('Starting search', { 
    workspaceId, 
    queryText, 
    useHalfvec: USE_HALFVEC,
    forceVectorType 
  });
  
  try {
    // Generate embedding for the query
    let queryEmbedding: number[] | null = null;
    
    if (process.env.OPENAI_API_KEY) {
      try {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: queryText,
        });
        queryEmbedding = response.data[0].embedding;
        logger.info('Generated query embedding');
      } catch (error) {
        logger.error('Failed to generate embedding', error);
      }
    }
    
    if (queryEmbedding) {
      // Determine which vector type to use
      const useHalfvec = await shouldUseHalfvec(forceVectorType);
      
      if (useHalfvec) {
        return await searchWithHalfvecColumn(
          queryEmbedding, 
          workspaceId, 
          pageId, 
          limit, 
          threshold
        );
      } else {
        return await searchWithVectorColumn(
          queryEmbedding, 
          workspaceId, 
          pageId, 
          limit, 
          threshold
        );
      }
    } else {
      // Fallback to text search
      return await textSearchFallback(workspaceId, queryText, pageId, limit);
    }
  } catch (error) {
    logger.error('Search failed', error);
    throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Search using halfvec columns
 */
async function searchWithHalfvecColumn(
  queryEmbedding: number[],
  workspaceId: string,
  pageId: string | null,
  limit: number,
  threshold: number
) {
  const vectorString = `[${queryEmbedding.join(',')}]`;
  
  // Search across all embedding tables using halfvec
  await ensureVectorSearchPath();
  const results = await prisma.$queryRaw<any[]>`
    WITH all_embeddings AS (
      -- Page embeddings
      SELECT 
        'page' as source_type,
        pe.page_id,
        pe.chunk_text as content,
        pe.metadata,
        1 - (pe.embedding_halfvec <=> ${vectorString}::halfvec) as similarity
      FROM page_embeddings pe
      WHERE 
        pe.workspace_id = ${workspaceId}::uuid
        AND pe.embedding_halfvec IS NOT NULL
        AND (${pageId}::uuid IS NULL OR pe.page_id = ${pageId}::uuid)
        AND 1 - (pe.embedding_halfvec <=> ${vectorString}::halfvec) > ${threshold}
      
      UNION ALL
      
      -- Block embeddings
      SELECT 
        'block' as source_type,
        be.page_id,
        be.chunk_text as content,
        be.metadata,
        1 - (be.embedding_halfvec <=> ${vectorString}::halfvec) as similarity
      FROM block_embeddings be
      WHERE 
        be.workspace_id = ${workspaceId}::uuid
        AND be.embedding_halfvec IS NOT NULL
        AND (${pageId}::uuid IS NULL OR be.page_id = ${pageId}::uuid)
        AND 1 - (be.embedding_halfvec <=> ${vectorString}::halfvec) > ${threshold}
      
      UNION ALL
      
      -- Database row embeddings
      SELECT 
        'database_row' as source_type,
        dre.page_id,
        dre.chunk_text as content,
        dre.metadata,
        1 - (dre.embedding_halfvec <=> ${vectorString}::halfvec) as similarity
      FROM database_row_embeddings dre
      WHERE 
        dre.workspace_id = ${workspaceId}::uuid
        AND dre.embedding_halfvec IS NOT NULL
        AND (${pageId}::uuid IS NULL OR dre.page_id = ${pageId}::uuid)
        AND 1 - (dre.embedding_halfvec <=> ${vectorString}::halfvec) > ${threshold}
      
      UNION ALL
      
      -- Document embeddings
      SELECT 
        'document' as source_type,
        NULL as page_id,
        e.chunk_text as content,
        e.metadata,
        1 - (e.embedding_halfvec <=> ${vectorString}::halfvec) as similarity
      FROM embeddings e
      WHERE 
        (e.metadata->>'workspaceId')::text = ${workspaceId}
        AND e.embedding_halfvec IS NOT NULL
        AND 1 - (e.embedding_halfvec <=> ${vectorString}::halfvec) > ${threshold}
    )
    SELECT * FROM all_embeddings
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
  
  logger.info(`Found ${results.length} results using halfvec`);
  
  return formatSearchResults(results);
}

/**
 * Search using traditional vector columns
 */
async function searchWithVectorColumn(
  queryEmbedding: number[],
  workspaceId: string,
  pageId: string | null,
  limit: number,
  threshold: number
) {
  const vectorString = `[${queryEmbedding.join(',')}]`;
  
  // Search across all embedding tables using vector
  await ensureVectorSearchPath();
  const results = await prisma.$queryRaw<any[]>`
    WITH all_embeddings AS (
      -- Page embeddings
      SELECT 
        'page' as source_type,
        pe.page_id,
        pe.chunk_text as content,
        pe.metadata,
        1 - (pe.embedding <=> ${vectorString}::vector) as similarity
      FROM page_embeddings pe
      WHERE 
        pe.workspace_id = ${workspaceId}::uuid
        AND pe.embedding IS NOT NULL
        AND (${pageId}::uuid IS NULL OR pe.page_id = ${pageId}::uuid)
        AND 1 - (pe.embedding <=> ${vectorString}::vector) > ${threshold}
      
      UNION ALL
      
      -- Block embeddings
      SELECT 
        'block' as source_type,
        be.page_id,
        be.chunk_text as content,
        be.metadata,
        1 - (be.embedding <=> ${vectorString}::vector) as similarity
      FROM block_embeddings be
      WHERE 
        be.workspace_id = ${workspaceId}::uuid
        AND be.embedding IS NOT NULL
        AND (${pageId}::uuid IS NULL OR be.page_id = ${pageId}::uuid)
        AND 1 - (be.embedding <=> ${vectorString}::vector) > ${threshold}
      
      UNION ALL
      
      -- Database row embeddings
      SELECT 
        'database_row' as source_type,
        dre.page_id,
        dre.chunk_text as content,
        dre.metadata,
        1 - (dre.embedding <=> ${vectorString}::vector) as similarity
      FROM database_row_embeddings dre
      WHERE 
        dre.workspace_id = ${workspaceId}::uuid
        AND dre.embedding IS NOT NULL
        AND (${pageId}::uuid IS NULL OR dre.page_id = ${pageId}::uuid)
        AND 1 - (dre.embedding <=> ${vectorString}::vector) > ${threshold}
      
      UNION ALL
      
      -- Document embeddings
      SELECT 
        'document' as source_type,
        NULL as page_id,
        e.chunk_text as content,
        e.metadata,
        1 - (e.embedding <=> ${vectorString}::vector) as similarity
      FROM embeddings e
      WHERE 
        (e.metadata->>'workspaceId')::text = ${workspaceId}
        AND e.embedding IS NOT NULL
        AND 1 - (e.embedding <=> ${vectorString}::vector) > ${threshold}
    )
    SELECT * FROM all_embeddings
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
  
  logger.info(`Found ${results.length} results using vector`);
  
  return formatSearchResults(results);
}

/**
 * Text search fallback when embeddings are not available
 */
async function textSearchFallback(
  workspaceId: string,
  queryText: string,
  pageId: string | null,
  limit: number
) {
  logger.info('Using text search fallback');
  
  const results = await prisma.$queryRaw<any[]>`
    WITH all_text_matches AS (
      -- Page embeddings
      SELECT 
        'page' as source_type,
        pe.page_id,
        pe.chunk_text as content,
        pe.metadata,
        0.5 as similarity
      FROM page_embeddings pe
      WHERE 
        pe.workspace_id = ${workspaceId}::uuid
        AND (${pageId}::uuid IS NULL OR pe.page_id = ${pageId}::uuid)
        AND pe.chunk_text ILIKE ${'%' + queryText + '%'}
      
      UNION ALL
      
      -- Block embeddings
      SELECT 
        'block' as source_type,
        be.page_id,
        be.chunk_text as content,
        be.metadata,
        0.5 as similarity
      FROM block_embeddings be
      WHERE 
        be.workspace_id = ${workspaceId}::uuid
        AND (${pageId}::uuid IS NULL OR be.page_id = ${pageId}::uuid)
        AND be.chunk_text ILIKE ${'%' + queryText + '%'}
      
      UNION ALL
      
      -- Database row embeddings
      SELECT 
        'database_row' as source_type,
        dre.page_id,
        dre.chunk_text as content,
        dre.metadata,
        0.5 as similarity
      FROM database_row_embeddings dre
      WHERE 
        dre.workspace_id = ${workspaceId}::uuid
        AND (${pageId}::uuid IS NULL OR dre.page_id = ${pageId}::uuid)
        AND dre.chunk_text ILIKE ${'%' + queryText + '%'}
    )
    SELECT * FROM all_text_matches
    LIMIT ${limit}
  `;
  
  return formatSearchResults(results);
}

/**
 * Determine whether to use halfvec based on availability and configuration
 */
async function shouldUseHalfvec(forceVectorType: 'vector' | 'halfvec' | 'auto'): Promise<boolean> {
  if (forceVectorType === 'vector') return false;
  if (forceVectorType === 'halfvec') return true;
  
  // Auto mode: check if halfvec columns have data
  if (USE_HALFVEC) {
    try {
      await ensureVectorSearchPath();
      const result = await prisma.$queryRaw<any[]>`
        SELECT EXISTS (
          SELECT 1 FROM page_embeddings 
          WHERE embedding_halfvec IS NOT NULL 
          LIMIT 1
        ) as has_halfvec
      `;
      
      return result[0]?.has_halfvec || false;
    } catch (error) {
      logger.warn('Failed to check halfvec availability', error);
      return false;
    }
  }
  
  return false;
}

/**
 * Format search results for consistent output
 */
function formatSearchResults(results: any[]) {
  return results.map(r => ({
    sourceType: r.source_type,
    pageId: r.page_id,
    content: r.content,
    metadata: r.metadata || {},
    similarity: r.similarity || 0,
    embedding: [] // Don't return full embeddings to save bandwidth
  }));
}

/**
 * Update the search_embeddings database function to support halfvec
 */
export async function updateSearchEmbeddingsFunction() {
  logger.info('Updating search_embeddings function for halfvec support...');
  
  try {
    await ensureVectorSearchPath();
    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION search_embeddings(
        query_embedding vector,
        workspace_uuid uuid,
        page_uuid uuid DEFAULT NULL,
        result_limit integer DEFAULT 10,
        similarity_threshold float DEFAULT 0.5,
        use_halfvec boolean DEFAULT false
      )
      RETURNS TABLE(
        source_type text,
        entity_id uuid,
        page_id uuid,
        chunk_text text,
        similarity float,
        metadata jsonb
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF use_halfvec THEN
          -- Use halfvec columns
          RETURN QUERY
          SELECT 
            ue.source_type,
            ue.entity_id::uuid,
            ue.page_id,
            ue.chunk_text,
            CASE 
              WHEN ue.embedding_halfvec IS NULL THEN 0.0
              ELSE 1 - (ue.embedding_halfvec <=> query_embedding::halfvec)
            END AS similarity,
            ue.metadata
          FROM unified_embeddings_halfvec ue
          WHERE ue.workspace_id = workspace_uuid
            AND (page_uuid IS NULL OR ue.page_id = page_uuid)
            AND (
              ue.embedding_halfvec IS NULL 
              OR (1 - (ue.embedding_halfvec <=> query_embedding::halfvec)) >= similarity_threshold
            )
          ORDER BY 
            CASE 
              WHEN ue.embedding_halfvec IS NULL THEN 1
              ELSE 0 
            END,
            CASE 
              WHEN ue.embedding_halfvec IS NOT NULL THEN ue.embedding_halfvec <=> query_embedding::halfvec
              ELSE NULL
            END
          LIMIT result_limit;
        ELSE
          -- Use traditional vector columns
          RETURN QUERY
          SELECT 
            ue.source_type,
            ue.entity_id::uuid,
            ue.page_id,
            ue.chunk_text,
            CASE 
              WHEN ue.embedding IS NULL THEN 0.0
              ELSE 1 - (ue.embedding <=> query_embedding)
            END AS similarity,
            ue.metadata
          FROM unified_embeddings ue
          WHERE ue.workspace_id = workspace_uuid
            AND (page_uuid IS NULL OR ue.page_id = page_uuid)
            AND (
              ue.embedding IS NULL 
              OR (1 - (ue.embedding <=> query_embedding)) >= similarity_threshold
            )
          ORDER BY 
            CASE 
              WHEN ue.embedding IS NULL THEN 1
              ELSE 0 
            END,
            CASE 
              WHEN ue.embedding IS NOT NULL THEN ue.embedding <=> query_embedding
              ELSE NULL
            END
          LIMIT result_limit;
        END IF;
      END;
      $$;
    `;
    
    logger.info('✅ Updated search_embeddings function');
    
    // Also create the unified_embeddings_halfvec view
    await ensureVectorSearchPath();
    await prisma.$executeRaw`
      CREATE OR REPLACE VIEW unified_embeddings_halfvec AS
        SELECT 
          'page'::text AS source_type,
          id::text AS entity_id,
          page_id,
          workspace_id,
          chunk_text,
          chunk_index,
          embedding_halfvec,
          metadata,
          created_at,
          updated_at,
          'page'::text AS entity_type,
          id::text AS id
        FROM page_embeddings
        WHERE embedding_halfvec IS NOT NULL
        
        UNION ALL
        
        SELECT 
          'block'::text AS source_type,
          id::text AS entity_id,
          page_id,
          workspace_id,
          chunk_text,
          chunk_index,
          embedding_halfvec,
          metadata,
          created_at,
          updated_at,
          'block'::text AS entity_type,
          id::text AS id
        FROM block_embeddings
        WHERE embedding_halfvec IS NOT NULL
        
        UNION ALL
        
        SELECT 
          'database_row'::text AS source_type,
          id::text AS entity_id,
          page_id,
          workspace_id,
          chunk_text,
          NULL::integer AS chunk_index,
          embedding_halfvec,
          metadata,
          created_at,
          updated_at,
          'database_row'::text AS entity_type,
          id::text AS id
        FROM database_row_embeddings
        WHERE embedding_halfvec IS NOT NULL;
    `;
    
    logger.info('✅ Created unified_embeddings_halfvec view');
    
  } catch (error) {
    logger.error('Failed to update database functions', error);
    throw error;
  }
}

// Export for compatibility
export { searchWithHalfvec as searchWithPrisma };
import { prisma } from '~/utils/db.server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function searchWithPrisma(
  workspaceId: string,
  queryText: string,
  limit: number = 10
) {
  console.log('[PRISMA SEARCH] Starting search', { workspaceId, queryText });
  
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
        console.log('[PRISMA SEARCH] Generated query embedding');
      } catch (error) {
        console.error('[PRISMA SEARCH] Failed to generate embedding:', error);
      }
    }
    
    if (queryEmbedding) {
      // Use vector similarity search with raw SQL
      const vectorString = `[${queryEmbedding.join(',')}]`;
      
      const results = await prisma.$queryRaw<any[]>`
        SELECT 
          e.document_id as id,
          e.chunk_text as content,
          e.metadata,
          1 - (e.embedding <=> ${vectorString}::extensions.vector) as similarity
        FROM embeddings e
        WHERE 
          (e.metadata->>'workspaceId')::text = ${workspaceId}
          AND 1 - (e.embedding <=> ${vectorString}::extensions.vector) > 0.3
        ORDER BY e.embedding <=> ${vectorString}::extensions.vector
        LIMIT ${limit}
      `;
      
      console.log('[PRISMA SEARCH] Found', results.length, 'results');
      
      // Format results for compatibility
      return results.map(r => ({
        id: r.id,
        content: r.content,
        embedding: [], // Don't return the full embedding to save bandwidth
        metadata: r.metadata || {},
        similarity: r.similarity
      }));
    } else {
      // Fallback to text search
      console.log('[PRISMA SEARCH] Using text search fallback');
      
      const results = await prisma.$queryRaw<any[]>`
        SELECT 
          e.document_id as id,
          e.chunk_text as content,
          e.metadata
        FROM embeddings e
        WHERE 
          (e.metadata->>'workspaceId')::text = ${workspaceId}
          AND e.chunk_text ILIKE ${'%' + queryText + '%'}
        LIMIT ${limit}
      `;
      
      return results.map(r => ({
        id: r.id,
        content: r.content,
        embedding: [],
        metadata: r.metadata || {},
        similarity: 0.5 // Default similarity for text matches
      }));
    }
  } catch (error) {
    console.error('[PRISMA SEARCH] Search failed:', error);
    throw new Error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
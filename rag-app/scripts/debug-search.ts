#!/usr/bin/env tsx
/**
 * Debug script to test why AI block can't find content
 */

import { prisma } from '../app/utils/db.server';
import { DebugLogger } from '../app/utils/debug-logger';

const logger = new DebugLogger('SearchDebug');

async function debugSearch() {
  const pageId = '8c39d744-7ffc-4251-9d05-8376cc50ef9d';
  const workspaceId = '696a2d66-6eee-4038-a1c6-1fe52a88814f';
  
  logger.info('🔍 Starting search debug for page:', pageId);
  
  try {
    // 1. Check if embeddings exist
    const embeddingCount = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count 
      FROM page_embeddings 
      WHERE page_id = ${pageId}::uuid
    `;
    logger.info('✅ Embeddings in page_embeddings:', embeddingCount[0]?.count);
    
    // 2. Check unified_embeddings view
    const unifiedCount = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count 
      FROM unified_embeddings 
      WHERE page_id = ${pageId}::uuid
    `;
    logger.info('✅ Embeddings in unified_embeddings:', unifiedCount[0]?.count);
    
    // 3. Check workspace_id in unified view
    const workspaceCheck = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT workspace_id 
      FROM unified_embeddings 
      WHERE page_id = ${pageId}::uuid
      LIMIT 1
    `;
    logger.info('✅ Workspace ID in unified view:', workspaceCheck[0]?.workspace_id);
    
    // 4. Test search_embeddings function WITHOUT vector
    logger.info('🔍 Testing search_embeddings function...');
    await prisma.$executeRaw`SET search_path TO public, extensions`;
    
    // Create a dummy vector
    const dummyVector = '[' + Array(1536).fill(0).map(() => Math.random()).join(',') + ']';
    
    const searchResults = await prisma.$queryRawUnsafe<any[]>(`
      SELECT * FROM search_embeddings(
        $1::vector,
        $2::uuid,
        $3::uuid,
        $4::integer,
        $5::float
      )
    `, dummyVector, workspaceId, pageId, 10, 0.05);
    
    logger.info('✅ Search results:', {
      count: searchResults.length,
      firstResult: searchResults[0] ? {
        id: searchResults[0].id,
        contentLength: searchResults[0].content?.length,
        contentPreview: searchResults[0].content?.substring(0, 100),
        similarity: searchResults[0].similarity,
        source_id: searchResults[0].source_id
      } : null
    });
    
    // 5. Direct query on unified_embeddings
    const directQuery = await prisma.$queryRaw<any[]>`
      SELECT 
        id,
        chunk_text,
        page_id,
        workspace_id
      FROM unified_embeddings 
      WHERE page_id = ${pageId}::uuid
        AND workspace_id = ${workspaceId}::uuid
      LIMIT 5
    `;
    
    logger.info('✅ Direct query results:', {
      count: directQuery.length,
      results: directQuery.map(r => ({
        id: r.id,
        textPreview: r.chunk_text?.substring(0, 50),
        page_id: r.page_id,
        workspace_id: r.workspace_id
      }))
    });
    
    // 6. Check for NULL embeddings
    const nullCheck = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as null_count
      FROM unified_embeddings
      WHERE page_id = ${pageId}::uuid
        AND embedding IS NULL
    `;
    logger.info('⚠️ NULL embeddings:', nullCheck[0]?.null_count);
    
    console.log('\n' + '='.repeat(60));
    console.log('SEARCH DEBUG SUMMARY');
    console.log('='.repeat(60));
    console.log('Page ID:', pageId);
    console.log('Workspace ID:', workspaceId);
    console.log('Embeddings exist:', embeddingCount[0]?.count > 0 ? 'YES' : 'NO');
    console.log('Unified view has data:', unifiedCount[0]?.count > 0 ? 'YES' : 'NO');
    console.log('Search function returns results:', searchResults.length > 0 ? 'YES' : 'NO');
    console.log('='.repeat(60));
    
  } catch (error) {
    logger.error('Debug failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugSearch().catch(console.error);
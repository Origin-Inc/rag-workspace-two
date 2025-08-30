import { prisma } from './app/utils/db.server';
import { embeddingGenerationService } from './app/services/embedding-generation.server';

async function testSearch() {
  console.log('🔍 Testing RAG search...\n');
  
  try {
    // First, check what embeddings we have
    const embeddings = await prisma.$queryRaw<any[]>`
      SELECT 
        pe.page_id,
        pe.workspace_id,
        pe.chunk_index,
        LEFT(pe.chunk_text, 100) as preview,
        pe.created_at
      FROM page_embeddings pe
      ORDER BY pe.created_at DESC
      LIMIT 5
    `;
    
    console.log('📦 Recent embeddings:');
    embeddings.forEach(e => {
      console.log(`  Page ${e.page_id.substring(0, 8)}... | Workspace ${e.workspace_id.substring(0, 8)}...`);
      console.log(`    Preview: "${e.preview}..."`);
      console.log(`    Created: ${e.created_at}`);
    });
    
    if (embeddings.length === 0) {
      console.log('❌ No embeddings found in database!');
      process.exit(1);
    }
    
    // Now test search
    const workspaceId = embeddings[0].workspace_id;
    const query = "pier";
    
    console.log(`\n🔎 Searching for "${query}" in workspace ${workspaceId.substring(0, 8)}...`);
    
    const searchResults = await embeddingGenerationService.searchSimilarDocuments(
      workspaceId,
      query,
      5,
      0.3 // Low threshold to get results
    );
    
    console.log(`\n📊 Search results: ${searchResults.length} found`);
    searchResults.forEach((result, i) => {
      console.log(`\n  Result ${i + 1}:`);
      console.log(`    Score: ${result.similarity}`);
      console.log(`    Text: "${result.content.substring(0, 100)}..."`);
      console.log(`    Page ID: ${result.pageId}`);
    });
    
    // Check the unified_embeddings view
    console.log('\n🔍 Checking unified_embeddings view:');
    const viewCheck = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count 
      FROM unified_embeddings
      WHERE workspace_id = ${workspaceId}::uuid
    `;
    console.log(`  Total embeddings in view: ${viewCheck[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testSearch();
import { prisma } from './app/utils/db.server';
import { ragIndexingService } from './app/services/rag/rag-indexing.service';

async function testIndexing() {
  console.log('🔍 Testing RAG indexing...\n');
  
  try {
    // Get a recent page
    const pages = await prisma.page.findMany({
      take: 1,
      orderBy: { updatedAt: 'desc' },
      where: {
        content: { not: null }
      }
    });
    
    if (pages.length === 0) {
      console.log('❌ No pages found with content');
      process.exit(1);
    }
    
    const page = pages[0];
    console.log(`📄 Found page: ${page.title} (ID: ${page.id})`);
    console.log(`📝 Content length: ${JSON.stringify(page.content).length} chars`);
    
    // Check current indexing status
    console.log('\n📊 Current indexing status:');
    const beforeStatus = await ragIndexingService.getIndexingStatus(page.id);
    console.log(`  - Indexed: ${beforeStatus.indexed}`);
    console.log(`  - Chunks: ${beforeStatus.chunkCount}`);
    console.log(`  - Last indexed: ${beforeStatus.lastIndexed || 'Never'}`);
    
    // Force immediate indexing
    console.log('\n⚡ Forcing immediate indexing...');
    await ragIndexingService.processPage(page.id);
    
    // Check updated status
    console.log('\n✅ After indexing:');
    const afterStatus = await ragIndexingService.getIndexingStatus(page.id);
    console.log(`  - Indexed: ${afterStatus.indexed}`);
    console.log(`  - Chunks: ${afterStatus.chunkCount}`);
    console.log(`  - Last indexed: ${afterStatus.lastIndexed}`);
    
    // Get actual embeddings
    const embeddings = await prisma.$queryRaw<any[]>`
      SELECT 
        chunk_index,
        LEFT(chunk_text, 100) as preview,
        created_at
      FROM page_embeddings
      WHERE page_id = ${page.id}::uuid
      ORDER BY chunk_index
      LIMIT 3
    `;
    
    console.log('\n📦 Sample chunks:');
    embeddings.forEach(e => {
      console.log(`  Chunk ${e.chunk_index}: "${e.preview}..."`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testIndexing();
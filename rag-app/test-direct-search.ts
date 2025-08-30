import { prisma } from './app/utils/db.server';
import { openai } from './app/services/openai.server';

async function testDirectSearch() {
  console.log('🔍 Testing direct vector search...\n');
  
  try {
    // Generate embedding for test query
    const query = "pier";
    console.log(`🎯 Query: "${query}"`);
    
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 1536,
    });
    
    const queryEmbedding = embeddingResponse.data[0].embedding;
    const vectorString = `[${queryEmbedding.join(',')}]`;
    
    console.log('📊 Generated embedding, length:', queryEmbedding.length);
    
    // Direct similarity search
    const results = await prisma.$queryRaw<any[]>`
      SELECT 
        pe.page_id,
        pe.chunk_text,
        pe.embedding <-> ${vectorString}::vector as distance,
        1 - (pe.embedding <-> ${vectorString}::vector) as similarity
      FROM page_embeddings pe
      WHERE pe.workspace_id = '090a94d4-ca2f-45ef-a978-9a287d1e8518'::uuid
      ORDER BY pe.embedding <-> ${vectorString}::vector
      LIMIT 5
    `;
    
    console.log('\n📊 Direct search results:');
    results.forEach((r, i) => {
      console.log(`\n  Result ${i + 1}:`);
      console.log(`    Distance: ${r.distance}`);
      console.log(`    Similarity: ${r.similarity}`);
      console.log(`    Text preview: "${r.chunk_text.substring(0, 100)}..."`);
    });
    
    // Now test through the unified_embeddings view
    console.log('\n\n🔍 Testing through unified_embeddings view:');
    
    const viewResults = await prisma.$queryRaw<any[]>`
      SELECT 
        ue.entity_id,
        ue.chunk_text,
        ue.embedding <-> ${vectorString}::vector as distance,
        1 - (ue.embedding <-> ${vectorString}::vector) as similarity
      FROM unified_embeddings ue
      WHERE ue.workspace_id = '090a94d4-ca2f-45ef-a978-9a287d1e8518'::uuid
      ORDER BY ue.embedding <-> ${vectorString}::vector
      LIMIT 5
    `;
    
    console.log('\n📊 View search results:');
    viewResults.forEach((r, i) => {
      console.log(`\n  Result ${i + 1}:`);
      console.log(`    Distance: ${r.distance}`);
      console.log(`    Similarity: ${r.similarity}`);
      console.log(`    Text preview: "${r.chunk_text.substring(0, 100)}..."`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testDirectSearch();
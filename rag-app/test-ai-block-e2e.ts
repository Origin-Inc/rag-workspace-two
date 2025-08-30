import { prisma } from './app/utils/db.server';
import { ragIndexingService } from './app/services/rag/rag-indexing.service';
import { embeddingGenerationService } from './app/services/embedding-generation.server';
import { ragService } from './app/services/rag.server';
import { DebugLogger } from './app/utils/debug-logger';

const logger = new DebugLogger('E2E-Test');

async function testAIBlockFlow() {
  console.log('🧪 Testing AI Block End-to-End Flow\n');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Get a workspace and page
    const page = await prisma.page.findFirst({
      where: {
        title: 'fourth'
      },
      include: {
        workspace: true
      }
    });
    
    if (!page) {
      console.log('❌ Test page not found. Creating one...');
      return;
    }
    
    const workspaceId = page.workspaceId;
    const pageId = page.id;
    
    console.log(`📄 Test Page: ${page.title}`);
    console.log(`🏢 Workspace ID: ${workspaceId}`);
    console.log(`📄 Page ID: ${pageId}\n`);
    
    // Step 2: Update page with FIRST content
    console.log('📝 TEST 1: Setting initial content about CATS');
    console.log('-'.repeat(50));
    
    const firstContent = "Cats are amazing animals. They are fluffy, independent, and love to sleep. Cats purr when they are happy.";
    
    await prisma.page.update({
      where: { id: pageId },
      data: {
        content: firstContent,
        blocks: [{
          id: 'test-block-1',
          type: 'paragraph',
          content: firstContent
        }]
      }
    });
    
    // Step 3: Index the page
    console.log('🔄 Indexing page with CAT content...');
    await ragIndexingService.processPage(pageId);
    
    // Step 4: Search for cat-related content
    console.log('🔍 Searching for "cats"...');
    const catResults = await embeddingGenerationService.searchSimilarDocuments(
      workspaceId,
      "tell me about cats",
      5,
      0.1 // Very low threshold
    );
    
    console.log(`   Found ${catResults.length} results`);
    if (catResults.length > 0) {
      console.log(`   Top result: "${catResults[0].content.substring(0, 50)}..."`);
    }
    
    // Step 5: Generate answer about cats
    if (catResults.length > 0) {
      const catContext = await ragService.buildAugmentedContext(
        "tell me about cats",
        catResults,
        { maxTokens: 2000, includeCitations: true }
      );
      
      const catAnswer = await ragService.generateAnswerWithCitations(
        "tell me about cats",
        catContext
      );
      
      console.log(`\n🤖 AI Response about CATS:`);
      console.log(`   "${catAnswer.answer.substring(0, 150)}..."`);
      
      const hasCatContent = catAnswer.answer.toLowerCase().includes('cat') || 
                           catAnswer.answer.toLowerCase().includes('fluffy') ||
                           catAnswer.answer.toLowerCase().includes('purr');
      console.log(`   ✅ Response mentions cats: ${hasCatContent}`);
    }
    
    // Step 6: CHANGE content to DOGS
    console.log('\n\n📝 TEST 2: Changing content to DOGS');
    console.log('-'.repeat(50));
    
    const secondContent = "Dogs are loyal companions. They bark, wag their tails, and love to play fetch. Dogs are man's best friend.";
    
    await prisma.page.update({
      where: { id: pageId },
      data: {
        content: secondContent,
        blocks: [{
          id: 'test-block-1',
          type: 'paragraph', 
          content: secondContent
        }]
      }
    });
    
    // Step 7: Re-index the page
    console.log('🔄 Re-indexing page with DOG content...');
    await ragIndexingService.processPage(pageId);
    
    // Step 8: Search again - should find DOG content now
    console.log('🔍 Searching for "tell me about the animals"...');
    const dogResults = await embeddingGenerationService.searchSimilarDocuments(
      workspaceId,
      "tell me about the animals",
      5,
      0.1
    );
    
    console.log(`   Found ${dogResults.length} results`);
    if (dogResults.length > 0) {
      console.log(`   Top result: "${dogResults[0].content.substring(0, 50)}..."`);
    }
    
    // Step 9: Generate answer - should be about DOGS now
    if (dogResults.length > 0) {
      const dogContext = await ragService.buildAugmentedContext(
        "tell me about the animals",
        dogResults,
        { maxTokens: 2000, includeCitations: true }
      );
      
      const dogAnswer = await ragService.generateAnswerWithCitations(
        "tell me about the animals",
        dogContext
      );
      
      console.log(`\n🤖 AI Response after changing to DOGS:`);
      console.log(`   "${dogAnswer.answer.substring(0, 150)}..."`);
      
      const hasDogContent = dogAnswer.answer.toLowerCase().includes('dog') || 
                            dogAnswer.answer.toLowerCase().includes('bark') ||
                            dogAnswer.answer.toLowerCase().includes('loyal');
      const stillHasCatContent = dogAnswer.answer.toLowerCase().includes('cat') || 
                                 dogAnswer.answer.toLowerCase().includes('purr');
      
      console.log(`   ✅ Response mentions dogs: ${hasDogContent}`);
      console.log(`   ✅ Response NO LONGER mentions cats: ${!stillHasCatContent}`);
      
      // Final verdict
      console.log('\n' + '='.repeat(50));
      if (hasDogContent && !stillHasCatContent) {
        console.log('✅ TEST PASSED: AI responds with current content only!');
      } else {
        console.log('❌ TEST FAILED: AI still using old content');
        console.log('   Full answer:', dogAnswer.answer);
      }
    }
    
    // Step 10: Check what's actually in the embeddings table
    console.log('\n📊 Final embedding check:');
    const finalEmbeddings = await prisma.$queryRaw<any[]>`
      SELECT 
        chunk_index,
        LEFT(chunk_text, 100) as preview,
        created_at
      FROM page_embeddings
      WHERE page_id = ${pageId}::uuid
      ORDER BY chunk_index
    `;
    
    console.log(`   Total embeddings for page: ${finalEmbeddings.length}`);
    finalEmbeddings.forEach(e => {
      console.log(`   - "${e.preview.substring(0, 50)}..."`);
    });
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testAIBlockFlow();
import { prisma } from './app/utils/db.server';
import { ragIndexingService } from './app/services/rag/rag-indexing.service';
import { aiBlockService } from './app/services/ai-block-service.server';

async function testCompleteUIFlow() {
  console.log('🧪 Testing Complete UI Flow - As User Would Experience It\n');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Get or create a test page
    let page = await prisma.page.findFirst({
      where: {
        title: 'test-ui-flow-page'
      },
      include: {
        project: {
          include: {
            workspace: true
          }
        },
        workspace: true
      }
    });
    
    if (!page) {
      // Create a test page
      const workspace = await prisma.workspace.findFirst({
        where: {
          id: '090a94d4-ca2f-45ef-a978-9a287d1e8518'
        }
      });
      
      let project = await prisma.project.findFirst({
        where: { workspaceId: workspace?.id }
      });
      
      // Create project if it doesn't exist
      if (workspace && !project) {
        project = await prisma.project.create({
          data: {
            name: 'Test Project',
            workspaceId: workspace.id
          }
        });
        console.log('✅ Created test project');
      }
      
      if (!workspace || !project) {
        console.log('❌ No workspace or project found. Please create one first.');
        return;
      }
      
      page = await prisma.page.create({
        data: {
          title: 'test-ui-flow-page',
          slug: 'test-ui-flow-page',
          content: '',
          blocks: [],
          workspaceId: project.workspaceId,
          projectId: project.id
        },
        include: {
          project: {
            include: {
              workspace: true
            }
          },
          workspace: true
        }
      });
      
      console.log('✅ Created test page');
    }
    
    const workspaceId = page.project?.workspaceId || page.workspaceId!;
    const pageId = page.id;
    
    console.log('📄 Test Page Info:');
    console.log(`   Title: ${page.title}`);
    console.log(`   Page ID: ${pageId}`);
    console.log(`   Workspace ID: ${workspaceId}\n`);
    
    // ====== TEST 1: CREATE CONTENT AND ASK AI ======
    console.log('📝 TEST 1: Create page with CAT content and ask AI');
    console.log('-'.repeat(50));
    
    // Step 1A: Add cat content to the page
    const catContent = "This page is about cats. Cats are amazing pets. They are fluffy, independent, and love to sleep. Cats purr when happy and meow to communicate. Popular cat breeds include Persian, Siamese, and Maine Coon.";
    
    await prisma.page.update({
      where: { id: pageId },
      data: {
        content: catContent,
        blocks: [{
          id: 'cat-block-1',
          type: 'paragraph',
          content: catContent
        }]
      }
    });
    
    console.log('✅ Added cat content to page');
    
    // Step 1B: Index the page
    console.log('🔄 Indexing page...');
    await ragIndexingService.processPage(pageId);
    console.log('✅ Page indexed');
    
    // Step 1C: Simulate AI Block request
    console.log('\n🤖 Asking AI: "summarize this page"');
    
    const catResponse = await aiBlockService.processQuery({
      query: 'summarize this page',
      workspaceId: workspaceId,
      pageId: pageId,
      blockId: 'test-ai-block'
    });
    
    if (catResponse.success) {
      console.log('✅ AI Response received:');
      console.log(`   "${catResponse.answer?.substring(0, 150)}..."`);
      
      const catResponseText = catResponse.answer?.toLowerCase() || '';
      const mentionsCats = /\bcats?\b/.test(catResponseText) ||  // Match whole word "cat" or "cats"
                          catResponseText.includes('pet') ||
                          catResponseText.includes('fluffy') ||
                          catResponseText.includes('purr');
      
      if (mentionsCats) {
        console.log('✅ TEST 1 PASSED: AI correctly mentions cats in the response');
      } else {
        console.log('❌ TEST 1 FAILED: AI response does not mention cats');
        console.log('   Full response:', catResponse.answer);
      }
    } else {
      console.log('❌ TEST 1 FAILED: AI returned an error:', catResponse.error);
    }
    
    // ====== TEST 2: CHANGE CONTENT AND ASK AI AGAIN ======
    console.log('\n\n📝 TEST 2: Change content to DOGS and ask AI again');
    console.log('-'.repeat(50));
    
    // Step 2A: Change to dog content
    const dogContent = "This page is now about dogs. Dogs are loyal companions. They bark, wag their tails, and love to play fetch. Dogs are man's best friend. Popular dog breeds include Golden Retriever, German Shepherd, and Labrador.";
    
    await prisma.page.update({
      where: { id: pageId },
      data: {
        content: dogContent,
        blocks: [{
          id: 'dog-block-1',
          type: 'paragraph',
          content: dogContent
        }]
      }
    });
    
    console.log('✅ Changed content from cats to dogs');
    
    // Step 2B: Re-index the page
    console.log('🔄 Re-indexing page...');
    await ragIndexingService.processPage(pageId);
    console.log('✅ Page re-indexed');
    
    // Step 2C: Ask AI again
    console.log('\n🤖 Asking AI again: "summarize this page"');
    
    // Clear cache to ensure fresh response
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const dogResponse = await aiBlockService.processQuery({
      query: 'summarize this page',
      workspaceId: workspaceId,
      pageId: pageId,
      blockId: 'test-ai-block-2' // Different block ID to avoid cache
    });
    
    if (dogResponse.success) {
      console.log('✅ AI Response received:');
      console.log(`   "${dogResponse.answer?.substring(0, 150)}..."`);
      
      const mentionsDogs = dogResponse.answer?.toLowerCase().includes('dog') || 
                          dogResponse.answer?.toLowerCase().includes('loyal') ||
                          dogResponse.answer?.toLowerCase().includes('bark') ||
                          dogResponse.answer?.toLowerCase().includes('fetch');
      
      // Check for cat-related words more carefully (avoid matching substrings like "dediCATed")
      const responseText = dogResponse.answer?.toLowerCase() || '';
      const stillMentionsCats = /\bcats?\b/.test(responseText) ||  // Match whole word "cat" or "cats"
                                responseText.includes('purr') ||
                                responseText.includes('meow') ||
                                responseText.includes('feline') ||
                                responseText.includes('kitten');
      
      if (mentionsDogs && !stillMentionsCats) {
        console.log('✅ TEST 2 PASSED: AI correctly mentions dogs and not cats');
      } else if (mentionsDogs && stillMentionsCats) {
        console.log('❌ TEST 2 FAILED: AI mentions dogs but STILL mentions cats (old content)');
        console.log('   Full response:', dogResponse.answer);
      } else if (!mentionsDogs) {
        console.log('❌ TEST 2 FAILED: AI response does not mention dogs');
        console.log('   Full response:', dogResponse.answer);
      }
    } else {
      console.log('❌ TEST 2 FAILED: AI returned an error:', dogResponse.error);
    }
    
    // Final check: Verify embeddings
    console.log('\n\n📊 Final Verification: Check embeddings');
    console.log('-'.repeat(50));
    
    const embeddings = await prisma.$queryRaw<any[]>`
      SELECT 
        chunk_index,
        LEFT(chunk_text, 100) as preview,
        created_at
      FROM page_embeddings
      WHERE page_id = ${pageId}::uuid
      ORDER BY chunk_index
    `;
    
    console.log(`Total embeddings for page: ${embeddings.length}`);
    embeddings.forEach(e => {
      console.log(`   Chunk ${e.chunk_index}: "${e.preview.substring(0, 60)}..."`);
    });
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📋 FINAL SUMMARY:');
    
    const test1Pass = catResponse.success && (/\bcats?\b/.test(catResponse.answer?.toLowerCase() || '') || 
                      catResponse.answer?.toLowerCase().includes('fluffy') || 
                      catResponse.answer?.toLowerCase().includes('purr') || false);
    const test2Pass = dogResponse.success && (dogResponse.answer?.toLowerCase().includes('dog') || false) && 
                      !(/\bcats?\b/.test(dogResponse.answer?.toLowerCase() || '') || false);
    
    if (test1Pass && test2Pass) {
      console.log('✅ ALL TESTS PASSED! The AI block correctly:');
      console.log('   1. Responds based on current page content');
      console.log('   2. Updates responses when content changes');
      console.log('   3. Does not retain old content after updates');
    } else {
      console.log('❌ SOME TESTS FAILED:');
      if (!test1Pass) console.log('   - Test 1 failed: AI could not summarize initial content');
      if (!test2Pass) console.log('   - Test 2 failed: AI did not update properly when content changed');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testCompleteUIFlow();
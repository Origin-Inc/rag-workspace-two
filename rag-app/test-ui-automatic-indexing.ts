import { prisma } from './app/utils/db.server';
import { aiBlockService } from './app/services/ai-block-service.server';
import { ragIndexingService } from './app/services/rag/rag-indexing.service';

async function testAutomaticIndexing() {
  console.log('🧪 Testing Automatic Indexing from UI Flow\n');
  console.log('=' .repeat(50));
  
  try {
    // Get the test page
    const page = await prisma.page.findFirst({
      where: {
        title: 'fourth'
      },
      include: {
        project: {
          include: {
            workspace: true
          }
        }
      }
    });
    
    if (!page) {
      console.log('❌ Test page not found');
      return;
    }
    
    const workspaceId = page.project?.workspaceId || page.workspaceId!;
    const pageId = page.id;
    
    console.log('📄 Test Page Info:');
    console.log(`   Title: ${page.title}`);
    console.log(`   Page ID: ${pageId}`);
    console.log(`   Workspace ID: ${workspaceId}\n`);
    
    // ====== TEST 1: UPDATE CONTENT AND QUEUE FOR INDEXING ======
    console.log('📝 TEST 1: Update content and queue for indexing (simulating UI save)');
    console.log('-'.repeat(50));
    
    // Step 1: Update page with new content
    const newContent = `This page has been updated at ${new Date().toISOString()}. 
    It contains information about automatic indexing. 
    The system uses BullMQ to process indexing jobs in the background.
    This ensures the UI remains responsive while content is being indexed for AI search.`;
    
    await prisma.page.update({
      where: { id: pageId },
      data: {
        content: newContent,
        blocks: [{
          id: 'auto-index-block',
          type: 'paragraph',
          content: newContent
        }]
      }
    });
    
    console.log('✅ Page content updated');
    
    // Step 2: Queue for indexing (this is what the UI does)
    console.log('📥 Queueing page for indexing (simulating UI save action)...');
    await ragIndexingService.queueForIndexing(pageId);
    console.log('✅ Page queued for indexing');
    
    // Step 3: Wait for worker to process the job
    console.log('⏳ Waiting for worker to process the job (5 seconds)...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Step 4: Check if content was indexed
    console.log('\n🔍 Checking if content was indexed...');
    
    const indexStatus = await ragIndexingService.getIndexingStatus(pageId);
    console.log(`   Indexed: ${indexStatus.indexed}`);
    console.log(`   Chunk count: ${indexStatus.chunkCount}`);
    console.log(`   Last indexed: ${indexStatus.lastIndexed || 'Never'}`);
    
    // ====== TEST 2: VERIFY AI CAN SEE THE NEW CONTENT ======
    console.log('\n\n📝 TEST 2: Verify AI can see the new content');
    console.log('-'.repeat(50));
    
    // Clear cache to ensure fresh response
    aiBlockService.clearCacheForPage(workspaceId, pageId);
    
    const aiResponse = await aiBlockService.processQuery({
      query: 'What does this page say about automatic indexing?',
      workspaceId: workspaceId,
      pageId: pageId,
      blockId: 'test-auto-index'
    });
    
    if (aiResponse.success) {
      console.log('✅ AI Response received:');
      console.log(`   "${aiResponse.answer?.substring(0, 200)}..."`);
      
      const mentionsIndexing = aiResponse.answer?.toLowerCase().includes('indexing') || 
                               aiResponse.answer?.toLowerCase().includes('bullmq') ||
                               aiResponse.answer?.toLowerCase().includes('background');
      
      if (mentionsIndexing) {
        console.log('✅ SUCCESS: AI correctly sees the new content about indexing!');
      } else {
        console.log('❌ FAILED: AI response does not mention indexing');
        console.log('   Full response:', aiResponse.answer);
      }
    } else {
      console.log('❌ AI query failed:', aiResponse.error);
    }
    
    // ====== TEST 3: CHECK WORKER QUEUE STATUS ======
    console.log('\n\n📊 TEST 3: Check BullMQ Queue Status');
    console.log('-'.repeat(50));
    
    // Check the queue directly
    const { Queue } = await import('bullmq');
    const { redis } = await import('./app/utils/redis.server');
    
    if (redis) {
      const queue = new Queue('page-indexing', { connection: redis });
      const jobCounts = await queue.getJobCounts();
      
      console.log('📊 Queue Statistics:');
      console.log(`   Waiting: ${jobCounts.waiting}`);
      console.log(`   Active: ${jobCounts.active}`);
      console.log(`   Completed: ${jobCounts.completed}`);
      console.log(`   Failed: ${jobCounts.failed}`);
      console.log(`   Delayed: ${jobCounts.delayed}`);
      
      await queue.close();
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📋 FINAL SUMMARY:');
    
    if (indexStatus.indexed && aiResponse.success && 
        (aiResponse.answer?.toLowerCase().includes('indexing') || false)) {
      console.log('✅ AUTOMATIC INDEXING IS WORKING!');
      console.log('   1. UI saves queue jobs to BullMQ');
      console.log('   2. Worker processes indexing jobs in background');
      console.log('   3. AI can query the newly indexed content');
      console.log('   4. Cache is cleared after indexing for fresh responses');
    } else {
      console.log('⚠️ ISSUES DETECTED:');
      if (!indexStatus.indexed) console.log('   - Content not indexed');
      if (!aiResponse.success) console.log('   - AI query failed');
      if (aiResponse.success && !aiResponse.answer?.toLowerCase().includes('indexing')) {
        console.log('   - AI not seeing new content (might need more wait time)');
      }
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testAutomaticIndexing();
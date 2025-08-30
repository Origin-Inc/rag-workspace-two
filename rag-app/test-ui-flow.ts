import { prisma } from './app/utils/db.server';
import fetch from 'node-fetch';

async function testUIFlow() {
  console.log('🧪 Testing UI Flow (Simulating AI Block Request)\n');
  console.log('=' .repeat(50));
  
  try {
    // Get a test page
    const page = await prisma.page.findFirst({
      where: {
        title: 'fourth'
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
      console.log('❌ Test page not found');
      return;
    }
    
    // Check which workspace is correct
    console.log('📄 Page Info:');
    console.log(`   Title: ${page.title}`);
    console.log(`   Page ID: ${page.id}`);
    console.log(`   Direct workspace ID: ${page.workspaceId}`);
    console.log(`   Project workspace ID: ${page.project?.workspaceId || 'NO PROJECT'}`);
    console.log('');
    
    // Check embeddings for both workspace IDs
    if (page.workspaceId) {
      const directEmbeddings = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count 
        FROM page_embeddings 
        WHERE workspace_id = ${page.workspaceId}::uuid
      `;
      console.log(`   Embeddings in direct workspace: ${directEmbeddings[0].count}`);
    }
    
    if (page.project?.workspaceId && page.project.workspaceId !== page.workspaceId) {
      const projectEmbeddings = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count 
        FROM page_embeddings 
        WHERE workspace_id = ${page.project.workspaceId}::uuid
      `;
      console.log(`   Embeddings in project workspace: ${projectEmbeddings[0].count}`);
    }
    
    // Simulate what the AI Block would send
    console.log('\n📮 Simulating AI Block Request:');
    
    const formData = new URLSearchParams();
    formData.append('action', 'searchAndAnswer');
    formData.append('query', 'summarize this page');
    formData.append('workspaceId', page.project?.workspaceId || page.workspaceId || '');
    formData.append('pageId', page.id);
    formData.append('blockId', 'test-ai-block');
    
    console.log('   Request params:');
    console.log(`     - workspaceId: ${formData.get('workspaceId')}`);
    console.log(`     - pageId: ${formData.get('pageId')}`);
    console.log(`     - query: ${formData.get('query')}`);
    
    // Make the actual request
    console.log('\n🚀 Making request to /api/rag-search...');
    
    const response = await fetch('http://localhost:3001/api/rag-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Add a fake session cookie (might need adjustment based on your auth)
        'Cookie': '__session=fake-session-for-testing'
      },
      body: formData.toString()
    });
    
    const result = await response.json() as any;
    
    if (result.success) {
      console.log('\n✅ Response received:');
      console.log(`   Answer: "${result.answer?.substring(0, 100)}..."`);
      console.log(`   Citations: ${result.citations?.length || 0}`);
      
      if (result.answer?.includes("couldn't find") || result.answer?.includes("Try adding")) {
        console.log('\n❌ PROBLEM: AI can\'t find content!');
        
        // Debug: Check if embeddings exist for the right workspace
        const workspaceUsed = formData.get('workspaceId');
        const embeddingCheck = await prisma.$queryRaw<any[]>`
          SELECT 
            pe.chunk_text,
            pe.workspace_id
          FROM page_embeddings pe
          WHERE pe.page_id = ${page.id}::uuid
          LIMIT 1
        `;
        
        if (embeddingCheck.length > 0) {
          console.log('\n🔍 Debug Info:');
          console.log(`   Embedding workspace: ${embeddingCheck[0].workspace_id}`);
          console.log(`   Request workspace: ${workspaceUsed}`);
          console.log(`   Match: ${embeddingCheck[0].workspace_id === workspaceUsed ? '✅' : '❌ MISMATCH!'}`);
          
          if (embeddingCheck[0].workspace_id !== workspaceUsed) {
            console.log('\n⚠️ ISSUE FOUND: Workspace mismatch!');
            console.log('   The page is indexed under a different workspace than what the UI is using.');
            console.log('   This happens when pages have direct workspace_id different from project.workspace_id');
          }
        }
      } else {
        console.log('\n✅ SUCCESS: AI found and summarized the content!');
      }
    } else {
      console.log('\n❌ Request failed:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testUIFlow();
import { prisma } from './app/utils/db.server';
import { ragIndexingService } from './app/services/rag/rag-indexing.service';

async function testAndFix() {
  console.log('🔍 Final UI Fix - Checking workspace consistency\n');
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
        },
        workspace: true
      }
    });
    
    if (!page) {
      console.log('❌ Test page not found');
      return;
    }
    
    console.log('📄 Current State:');
    console.log(`   Page Title: ${page.title}`);
    console.log(`   Page ID: ${page.id}`);
    console.log(`   Page.workspaceId: ${page.workspaceId}`);
    console.log(`   Project.workspaceId: ${page.project?.workspaceId || 'NO PROJECT'}`);
    
    // Check if there's a mismatch
    if (page.project && page.workspaceId !== page.project.workspaceId) {
      console.log('\n⚠️ WORKSPACE MISMATCH DETECTED!');
      console.log('   Page is directly linked to a different workspace than its project.');
      console.log('   This causes the AI block to search in the wrong workspace.\n');
      
      console.log('🔧 FIXING: Updating page to use project workspace...');
      
      // Fix the page to use the project's workspace
      await prisma.page.update({
        where: { id: page.id },
        data: {
          workspaceId: page.project.workspaceId
        }
      });
      
      console.log('✅ Page workspace updated to match project workspace');
      
      // Re-index the page with correct workspace
      console.log('🔄 Re-indexing page with correct workspace...');
      await ragIndexingService.processPage(page.id);
      
      console.log('✅ Page re-indexed successfully');
    } else if (!page.project) {
      console.log('\n⚠️ Page has no project! This might cause issues.');
    } else {
      console.log('\n✅ Workspace IDs are consistent');
    }
    
    // Check embeddings count for both workspaces
    if (page.workspaceId) {
      const embeddings = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count 
        FROM page_embeddings 
        WHERE page_id = ${page.id}::uuid
          AND workspace_id = ${page.workspaceId}::uuid
      `;
      console.log(`\n📊 Embeddings for page in workspace: ${embeddings[0].count}`);
    }
    
    // Also fix any other pages with the same issue
    console.log('\n🔍 Checking for other pages with workspace mismatches...');
    
    const mismatchedPages = await prisma.$queryRaw<any[]>`
      SELECT p.id, p.title, p.workspace_id as page_workspace, 
             pr.workspace_id as project_workspace
      FROM pages p
      JOIN projects pr ON p.project_id = pr.id
      WHERE p.workspace_id != pr.workspace_id
    `;
    
    if (mismatchedPages.length > 0) {
      console.log(`   Found ${mismatchedPages.length} pages with mismatches:`);
      
      for (const mp of mismatchedPages) {
        console.log(`   - ${mp.title} (${mp.id})`);
        
        // Fix each page
        await prisma.page.update({
          where: { id: mp.id },
          data: {
            workspaceId: mp.project_workspace
          }
        });
        
        // Re-index
        await ragIndexingService.processPage(mp.id);
      }
      
      console.log(`\n✅ Fixed ${mismatchedPages.length} pages with workspace mismatches`);
    } else {
      console.log('   No other pages with workspace mismatches found');
    }
    
    console.log('\n✅ All workspace consistency issues resolved!');
    console.log('   The AI block should now find content correctly.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

testAndFix();
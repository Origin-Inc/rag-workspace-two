import { prisma } from './app/utils/db.server';

async function checkWorkspaces() {
  console.log('🔍 Checking Workspaces and Pages\n');
  
  const workspaces = await prisma.workspace.findMany({
    include: {
      pages: {
        select: {
          id: true,
          title: true,
          updatedAt: true
        },
        orderBy: {
          updatedAt: 'desc'
        },
        take: 3
      },
      _count: {
        select: {
          pages: true
        }
      }
    }
  });
  
  console.log(`Found ${workspaces.length} workspace(s):\n`);
  
  for (const ws of workspaces) {
    console.log(`📁 Workspace: ${ws.name}`);
    console.log(`   ID: ${ws.id}`);
    console.log(`   Slug: ${ws.slug}`);
    console.log(`   Total pages: ${ws._count.pages}`);
    
    if (ws.pages.length > 0) {
      console.log(`   Recent pages:`);
      ws.pages.forEach(p => {
        console.log(`     - ${p.title} (${p.id})`);
      });
    }
    
    // Check embeddings count for this workspace
    const embeddingCount = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count 
      FROM page_embeddings 
      WHERE workspace_id = ${ws.id}::uuid
    `;
    console.log(`   Indexed chunks: ${embeddingCount[0].count}`);
    console.log('');
  }
  
  // Check for pages without workspace
  const orphanPages = await prisma.page.findMany({
    where: {
      workspaceId: null
    }
  });
  
  if (orphanPages.length > 0) {
    console.log(`⚠️ Found ${orphanPages.length} pages without workspace!`);
  }
  
  await prisma.$disconnect();
}

checkWorkspaces();
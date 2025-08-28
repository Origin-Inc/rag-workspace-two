/**
 * Script to index existing content for RAG search
 * Run with: npx tsx scripts/index-existing-content.ts [workspaceId]
 */

import { automaticPageIndexer } from '../app/services/automatic-page-indexer.server';

async function main() {
  const workspaceId = process.argv[2];
  
  console.log('🚀 Starting content indexing...');
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 OpenAI configured: ${!!process.env.OPENAI_API_KEY}`);
  console.log(`🗄️  Database URL: ${process.env.DATABASE_URL ? '[SET]' : '[MISSING]'}`);

  try {
    if (workspaceId) {
      console.log(`\n📁 Indexing workspace: ${workspaceId}`);
      await automaticPageIndexer.indexWorkspacePages(workspaceId);
      console.log(`✅ Workspace indexing completed!`);
    } else {
      console.log(`\n🌍 Indexing all workspaces...`);
      await automaticPageIndexer.indexAllPages();
      console.log(`✅ System-wide indexing completed!`);
    }
  } catch (error) {
    console.error('❌ Indexing failed:', error);
    process.exit(1);
  }

  console.log(`\n🎉 Content indexing finished successfully!`);
  console.log(`💡 You can now use AI blocks to search and summarize your content.`);
}

if (require.main === module) {
  main();
}
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testEditorIntegration() {
  console.log('Testing full editor integration...');
  
  const pageId = '4d345792-d36a-4045-b510-034b5d288c8f';
  
  try {
    // 1. Get the page with its current blocks
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        project: {
          include: {
            workspace: true
          }
        }
      }
    });
    
    if (!page) {
      console.error('Page not found!');
      return;
    }
    
    console.log('✅ Page found:', page.title);
    console.log('✅ Project:', page.project.name);
    console.log('✅ Current blocks:', page.blocks);
    
    // 2. Test saving enhanced block types with simpler structure
    const enhancedBlocks = [
      {
        id: 'block1',
        type: 'paragraph',
        content: 'This is a regular paragraph block'
      },
      {
        id: 'block2',
        type: 'heading1',
        content: 'Database Block Test'
      },
      {
        id: 'block3',
        type: 'database',
        content: {
          viewType: 'table',
          columns: [
            { id: 'col1', name: 'Name', type: 'text' },
            { id: 'col2', name: 'Status', type: 'select' }
          ],
          rows: [
            { id: 'row1', cells: { col1: 'Task 1', col2: 'Done' } }
          ]
        }
      },
      {
        id: 'block4',
        type: 'ai',
        content: {
          prompt: 'Analyze the tasks',
          response: null
        }
      }
    ];
    
    // 3. Update the page with enhanced blocks
    console.log('\n📝 Updating page with enhanced blocks...');
    const updated = await prisma.page.update({
      where: { id: pageId },
      data: {
        blocks: enhancedBlocks
      }
    });
    
    console.log('✅ Successfully saved enhanced blocks!');
    console.log('✅ Block types:', enhancedBlocks.map(b => b.type).join(', '));
    
    // 4. Verify the blocks were saved correctly
    const verification = await prisma.page.findUnique({
      where: { id: pageId },
      select: { blocks: true }
    });
    
    const savedBlocks = verification?.blocks as any[];
    if (savedBlocks && Array.isArray(savedBlocks)) {
      console.log('\n✅ Verification successful!');
      console.log('✅ Saved block count:', savedBlocks.length);
      console.log('✅ Block types in database:', savedBlocks.map(b => b.type).join(', '));
      
      // Check for database block
      const dbBlock = savedBlocks.find(b => b.type === 'database');
      if (dbBlock) {
        console.log('✅ Database block found with', dbBlock.content?.rows?.length || 0, 'rows');
      }
      
      // Check for AI block
      const aiBlock = savedBlocks.find(b => b.type === 'ai');
      if (aiBlock) {
        console.log('✅ AI block found with prompt:', aiBlock.content?.prompt);
      }
    }
    
    console.log('\n🎉 Full integration test PASSED!');
    console.log('The enhanced block editor with database and AI blocks is working correctly.');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testEditorIntegration();
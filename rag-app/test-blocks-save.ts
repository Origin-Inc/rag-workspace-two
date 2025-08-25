import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testBlocksSave() {
  console.log('Testing blocks save to database...');
  
  // Test data - VERY simple blocks structure
  const testBlocks = [
    {
      id: 'test1',
      type: 'paragraph',
      content: 'Test'
    }
  ];

  try {
    // Use the specific page ID we know exists
    const pageId = '4d345792-d36a-4045-b510-034b5d288c8f';
    
    console.log('Finding page:', pageId);
    const page = await prisma.page.findUnique({
      where: { id: pageId }
    });

    if (!page) {
      console.error('Page not found!');
      return;
    }
    
    console.log('Found page:', page.title);
    console.log('Current blocks:', page.blocks);
    
    // Update with test blocks
    console.log('Updating page with blocks...');
    const updated = await prisma.page.update({
      where: { id: pageId },
      data: {
        blocks: testBlocks
      }
    });
    
    console.log('Updated page with blocks');
    console.log('New blocks:', updated.blocks);
    
    console.log('✅ Blocks save successful!');
  } catch (error) {
    console.error('❌ Failed to save blocks:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testBlocksSave();
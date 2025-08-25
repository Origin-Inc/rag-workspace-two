import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPageSave() {
  try {
    // Find a page to test with
    const page = await prisma.page.findFirst();
    
    if (!page) {
      console.log('No pages found to test with');
      return;
    }
    
    console.log('Testing save for page:', page.id);
    console.log('Current content:', page.content);
    console.log('Current blocks:', page.blocks);
    
    // Test 1: Save with simple content only
    console.log('\n--- Test 1: Simple content update ---');
    const update1 = await prisma.page.update({
      where: { id: page.id },
      data: {
        content: 'Test content ' + new Date().toISOString(),
        updatedAt: new Date()
      }
    });
    console.log('✅ Content update successful');
    
    // Test 2: Save with empty blocks array
    console.log('\n--- Test 2: Empty blocks array ---');
    const update2 = await prisma.page.update({
      where: { id: page.id },
      data: {
        content: 'Test with empty blocks',
        blocks: [],
        updatedAt: new Date()
      }
    });
    console.log('✅ Empty blocks update successful');
    
    // Test 3: Save with simple blocks array
    console.log('\n--- Test 3: Simple blocks array ---');
    const simpleBlocks = [
      { id: '1', type: 'paragraph', content: 'Hello world' }
    ];
    
    const update3 = await prisma.page.update({
      where: { id: page.id },
      data: {
        content: 'Test with blocks',
        blocks: simpleBlocks,
        updatedAt: new Date()
      }
    });
    console.log('✅ Blocks update successful');
    console.log('Saved blocks:', update3.blocks);
    
  } catch (error: any) {
    console.error('❌ Error during test:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPageSave();
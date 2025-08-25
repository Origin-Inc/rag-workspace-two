import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPageContent() {
  try {
    // Get all pages with problematic content
    const pages = await prisma.page.findMany();
    
    console.log(`Found ${pages.length} pages to check`);
    
    for (const page of pages) {
      const needsFix = 
        page.content === '{}' || 
        page.content === '[]' || 
        page.content === 'null' ||
        page.content === null;
      
      if (needsFix) {
        console.log(`Fixing page ${page.id} with content: "${page.content}"`);
        
        // Use raw SQL to bypass Prisma's JSON handling
        await prisma.$executeRaw`
          UPDATE pages 
          SET content = ''
          WHERE id = ${page.id}::uuid
        `;
        
        console.log(`✅ Fixed page ${page.id}`);
      }
    }
    
    console.log('\n✅ All pages fixed!');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPageContent();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSchema() {
  try {
    // Check the actual column types in the database
    const result = await prisma.$queryRaw`
      SELECT 
        column_name, 
        data_type, 
        udt_name
      FROM information_schema.columns 
      WHERE table_name = 'pages' 
      AND column_name IN ('content', 'blocks')
      ORDER BY column_name
    `;
    
    console.log('Database column types:');
    console.log(result);
    
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSchema();
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkTriggers() {
  try {
    // Check for any triggers on the pages table
    const triggers = await prisma.$queryRaw`
      SELECT 
        trigger_name,
        event_manipulation,
        action_statement
      FROM information_schema.triggers 
      WHERE event_object_table = 'pages'
    `;
    
    console.log('Triggers on pages table:');
    console.log(triggers);
    
    // Check for tables with the mentioned columns
    const tables = await prisma.$queryRaw`
      SELECT DISTINCT table_name 
      FROM information_schema.columns 
      WHERE column_name IN ('resource_type', 'resource_id', 'operation', 'status')
      AND table_schema = 'public'
    `;
    
    console.log('\nTables with resource_type/resource_id/operation/status columns:');
    console.log(tables);
    
    // Check the structure of those tables
    for (const table of tables as any[]) {
      const constraints = await prisma.$queryRaw`
        SELECT 
          constraint_name,
          constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = ${table.table_name}
        AND constraint_type = 'UNIQUE'
      `;
      
      console.log(`\nUnique constraints on ${table.table_name}:`);
      console.log(constraints);
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkTriggers();
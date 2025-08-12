const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Read the SQL file
  const sqlPath = path.join(__dirname, 'fix-rag-system.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Running RAG system fix migration...');
  
  // Split SQL into individual statements and execute
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      console.log('Executing:', statement.substring(0, 50) + '...');
      const { error } = await supabase.rpc('exec_sql', { 
        sql_query: statement + ';' 
      }).single();
      
      if (error) {
        // Try direct execution as fallback
        const { data, error: directError } = await supabase
          .from('_sql')
          .insert({ query: statement + ';' })
          .select();
          
        if (directError) {
          console.error('Statement failed:', directError.message);
        }
      }
    } catch (err) {
      console.error('Error executing statement:', err.message);
    }
  }

  console.log('Migration completed!');
  
  // Verify documents table exists
  const { data, error } = await supabase
    .from('documents')
    .select('count')
    .limit(1);
    
  if (error) {
    console.error('Documents table still not accessible:', error.message);
    console.log('\nPlease run the following SQL manually in Supabase SQL Editor:');
    console.log('----------------------------------------');
    console.log(sql);
    console.log('----------------------------------------');
  } else {
    console.log('✓ Documents table verified and accessible');
  }
}

runMigration().catch(console.error);
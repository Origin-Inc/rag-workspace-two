import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(process.cwd(), '.env') });

console.log('\n=== OpenAI Configuration Test ===\n');

// Check OpenAI API key
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log('❌ OPENAI_API_KEY not found in environment');
} else {
  console.log('✅ OPENAI_API_KEY found');
  console.log(`   - Key prefix: ${apiKey.substring(0, 7)}...`);
  console.log(`   - Key length: ${apiKey.length} characters`);
  
  // Check if it's a valid format
  if (apiKey.startsWith('sk-')) {
    console.log('   - Format: Valid OpenAI format (sk-...)');
  } else if (apiKey === 'your-api-key' || apiKey.includes('REPLACE')) {
    console.log('   - ⚠️ WARNING: Placeholder key detected!');
  }
}

// Check organization (optional)
const org = process.env.OPENAI_ORGANIZATION;
if (org) {
  console.log('\n✅ OPENAI_ORGANIZATION found');
  console.log(`   - Organization: ${org}`);
} else {
  console.log('\n📝 OPENAI_ORGANIZATION not set (optional)');
}

// Check other critical environment variables
console.log('\n=== Other Critical Config ===\n');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const databaseUrl = process.env.DATABASE_URL;
const sessionSecret = process.env.SESSION_SECRET;

if (supabaseUrl) {
  console.log('✅ SUPABASE_URL configured');
} else {
  console.log('❌ SUPABASE_URL missing');
}

if (supabaseKey) {
  console.log('✅ SUPABASE_ANON_KEY configured');
} else {
  console.log('❌ SUPABASE_ANON_KEY missing');
}

if (databaseUrl) {
  console.log('✅ DATABASE_URL configured');
} else {
  console.log('❌ DATABASE_URL missing');
}

if (sessionSecret) {
  console.log('✅ SESSION_SECRET configured');
} else {
  console.log('❌ SESSION_SECRET missing');
}

console.log('\n=== Test Complete ===\n');

// Exit
process.exit(0);
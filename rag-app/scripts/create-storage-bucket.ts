/**
 * Script to create storage buckets in Supabase
 * Run with: npx tsx scripts/create-storage-bucket.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function createBuckets() {
  console.log('🚀 Creating storage buckets...\n');

  // Create user-data-files bucket
  console.log('Creating user-data-files bucket...');
  const { data: bucket1, error: error1 } = await supabase.storage.createBucket('user-data-files', {
    public: false,
    fileSizeLimit: 52428800, // 50MB
    allowedMimeTypes: [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ]
  });

  if (error1) {
    if (error1.message.includes('already exists')) {
      console.log('✅ user-data-files bucket already exists');
    } else {
      console.error('❌ Failed to create user-data-files bucket:', error1);
    }
  } else {
    console.log('✅ user-data-files bucket created successfully');
  }

  // Create duckdb-tables bucket
  console.log('\nCreating duckdb-tables bucket...');
  const { data: bucket2, error: error2 } = await supabase.storage.createBucket('duckdb-tables', {
    public: false,
    fileSizeLimit: 104857600 // 100MB
  });

  if (error2) {
    if (error2.message.includes('already exists')) {
      console.log('✅ duckdb-tables bucket already exists');
    } else {
      console.error('❌ Failed to create duckdb-tables bucket:', error2);
    }
  } else {
    console.log('✅ duckdb-tables bucket created successfully');
  }

  // List all buckets to verify
  console.log('\n📋 Listing all buckets:');
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();

  if (listError) {
    console.error('❌ Failed to list buckets:', listError);
  } else {
    buckets?.forEach(bucket => {
      console.log(`  - ${bucket.id} (public: ${bucket.public})`);
    });
  }

  console.log('\n✅ Done!');
}

createBuckets().catch(console.error);

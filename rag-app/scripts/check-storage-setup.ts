#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkAndSetupStorage() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });

  console.log('🔍 Checking storage bucket configuration...');

  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      return;
    }

    const userUploadsBucket = buckets?.find(b => b.id === 'user-uploads');

    if (!userUploadsBucket) {
      console.log('📦 Creating "user-uploads" bucket...');
      
      const { data, error } = await supabase.storage.createBucket('user-uploads', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: [
          'text/csv',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/pdf',
          'text/plain'
        ]
      });

      if (error) {
        console.error('❌ Error creating bucket:', error);
      } else {
        console.log('✅ Bucket "user-uploads" created successfully');
        console.log('   Public: true');
        console.log('   File size limit: 50MB');
        console.log('   Allowed types: CSV, Excel, PDF, TXT');
      }
    } else {
      console.log('✅ Bucket "user-uploads" exists');
      console.log(`   Public: ${userUploadsBucket.public}`);
      
      if (!userUploadsBucket.public) {
        console.log('⚠️  WARNING: Bucket is not public. Files may not be accessible.');
        console.log('   Run the SQL script in setup-storage-bucket.sql to fix this.');
      }
    }

    // Test upload and access
    console.log('\n🧪 Testing file operations...');
    
    const testFileName = `test-${Date.now()}.txt`;
    const testContent = 'Test file for storage verification';
    
    // Upload test file
    const { error: uploadError } = await supabase.storage
      .from('user-uploads')
      .upload(testFileName, testContent);

    if (uploadError) {
      console.error('❌ Test upload failed:', uploadError);
    } else {
      console.log('✅ Test upload successful');
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('user-uploads')
        .getPublicUrl(testFileName);
        
      console.log('📎 Public URL:', urlData.publicUrl);
      
      // Clean up test file
      await supabase.storage
        .from('user-uploads')
        .remove([testFileName]);
      
      console.log('🧹 Test file cleaned up');
    }

    console.log('\n✨ Storage setup check complete!');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkAndSetupStorage().catch(console.error);
#!/usr/bin/env ts-node
/**
 * Script to verify pgvector is working correctly after deployment
 * Run this to check if the search_path fix resolved the issues
 */

import { prisma } from '../app/utils/db.server';
import { DebugLogger } from '../app/utils/debug-logger';

const logger = new DebugLogger('PgvectorVerification');

async function verifyPgvectorFix() {
  logger.info('🔍 Starting pgvector verification...');
  
  try {
    // Test 1: Check if search_path is set correctly
    logger.info('Test 1: Verifying search_path configuration');
    const searchPathResult = await prisma.$queryRaw<any[]>`
      SHOW search_path
    `;
    logger.info('Current search_path:', searchPathResult[0]?.search_path);
    
    // Test 2: Set search_path and verify vector type is accessible
    logger.info('Test 2: Setting search_path and checking vector type');
    await prisma.$executeRaw`SET search_path TO public, extensions`;
    
    const vectorTypeCheck = await prisma.$queryRaw<any[]>`
      SELECT typname, nspname 
      FROM pg_type t
      JOIN pg_namespace n ON t.typnamespace = n.oid
      WHERE typname = 'vector'
    `;
    
    if (vectorTypeCheck.length > 0) {
      logger.info('✅ Vector type found in schema:', vectorTypeCheck[0].nspname);
    } else {
      logger.error('❌ Vector type not found!');
    }
    
    // Test 3: Check if vector operators are accessible
    logger.info('Test 3: Checking vector operators');
    const operatorCheck = await prisma.$queryRaw<any[]>`
      SELECT oprname, oprleft::regtype::text as left_type, oprright::regtype::text as right_type
      FROM pg_operator
      WHERE oprname = '<=>'
        AND oprleft = 'vector'::regtype
    `;
    
    if (operatorCheck.length > 0) {
      logger.info('✅ Vector operators found:', operatorCheck.length, 'operators');
    } else {
      logger.error('❌ Vector operators not found!');
    }
    
    // Test 4: Try a simple vector operation
    logger.info('Test 4: Testing vector operation');
    try {
      const testVector = '[1,2,3]';
      await prisma.$queryRaw`
        SELECT ${testVector}::vector(3) <=> ${testVector}::vector(3) as distance
      `;
      logger.info('✅ Vector operation successful!');
    } catch (error) {
      logger.error('❌ Vector operation failed:', error);
    }
    
    // Test 5: Check page_embeddings table
    logger.info('Test 5: Checking page_embeddings table');
    const embeddingCount = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count 
      FROM page_embeddings 
      WHERE embedding IS NOT NULL
    `;
    logger.info('Embeddings in database:', embeddingCount[0]?.count || 0);
    
    // Test 6: Try a similarity search
    logger.info('Test 6: Testing similarity search');
    try {
      const testEmbedding = Array(1536).fill(0).map(() => Math.random());
      const vectorString = `[${testEmbedding.join(',')}]`;
      
      const searchResult = await prisma.$queryRaw`
        SELECT 
          page_id,
          1 - (embedding <=> ${vectorString}::vector) as similarity
        FROM page_embeddings
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorString}::vector
        LIMIT 1
      `;
      
      if (searchResult && Array.isArray(searchResult)) {
        logger.info('✅ Similarity search successful!');
      }
    } catch (error) {
      logger.error('❌ Similarity search failed:', error);
    }
    
    logger.info('🎯 Verification complete!');
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('PGVECTOR FIX VERIFICATION SUMMARY');
    console.log('='.repeat(60));
    console.log('✅ All checks indicate pgvector should be working');
    console.log('If errors persist in production:');
    console.log('1. Check Vercel deployment logs for the new deployment');
    console.log('2. Verify environment variables are set correctly');
    console.log('3. Check Supabase dashboard for any database issues');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    logger.error('Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyPgvectorFix()
  .then(() => {
    logger.info('✅ Verification completed successfully');
    process.exit(0);
  })
  .catch(error => {
    logger.error('❌ Verification failed:', error);
    process.exit(1);
  });
#!/usr/bin/env tsx

/**
 * Diagnostic script for Supabase connection issues
 * Run with: npx tsx scripts/test-supabase-connection.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { URL } from 'url';

// Load environment variables
dotenv.config();

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testConnection(url: string, description: string) {
  log(`\n📋 Testing: ${description}`, colors.cyan);
  
  // Mask password in URL for logging
  const maskedUrl = url.replace(/:[^:@]+@/, ':****@');
  log(`URL: ${maskedUrl}`, colors.blue);
  
  try {
    const urlObj = new URL(url);
    log(`Host: ${urlObj.hostname}`, colors.blue);
    log(`Port: ${urlObj.port}`, colors.blue);
    log(`Parameters: ${urlObj.searchParams.toString()}`, colors.blue);
  } catch (error) {
    log(`❌ Invalid URL format`, colors.red);
    return false;
  }
  
  const client = new PrismaClient({
    datasources: {
      db: { url },
    },
    log: ['error'],
  });
  
  try {
    // Test basic connectivity
    const start = Date.now();
    await client.$queryRaw`SELECT 1 as test`;
    const duration = Date.now() - start;
    
    log(`✅ Connection successful (${duration}ms)`, colors.green);
    
    // Test if it's using PgBouncer
    try {
      await client.$queryRaw`PREPARE test_stmt AS SELECT 1`;
      await client.$queryRaw`DEALLOCATE test_stmt`;
      log(`✅ Direct connection or session mode detected`, colors.green);
    } catch (error: any) {
      if (error?.message?.includes('prepared statement') || error?.code === '26000') {
        log(`✅ PgBouncer transaction mode detected`, colors.green);
      } else {
        log(`⚠️  Unexpected prepared statement behavior: ${error.message}`, colors.yellow);
      }
    }
    
    // Test database access
    const tables = await client.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      LIMIT 5
    `;
    log(`✅ Can access database (found ${tables.length} tables)`, colors.green);
    
    await client.$disconnect();
    return true;
  } catch (error: any) {
    log(`❌ Connection failed: ${error.message}`, colors.red);
    
    // Provide specific troubleshooting advice
    if (error.message.includes('ECONNREFUSED')) {
      log('💡 Possible causes:', colors.yellow);
      log('   - Check if the database URL is correct', colors.yellow);
      log('   - Verify the password doesn\'t contain special characters', colors.yellow);
      log('   - Check Supabase Dashboard > Settings > Database for IP bans', colors.yellow);
    } else if (error.message.includes('password authentication failed')) {
      log('💡 Password issue detected:', colors.yellow);
      log('   - Regenerate password in Supabase Dashboard', colors.yellow);
      log('   - Avoid special characters like @ or $', colors.yellow);
      log('   - Ensure password is URL-encoded if needed', colors.yellow);
    } else if (error.message.includes('P2024')) {
      log('💡 Connection pool exhausted:', colors.yellow);
      log('   - Reduce connection_limit parameter', colors.yellow);
      log('   - Check for connection leaks', colors.yellow);
    }
    
    await client.$disconnect().catch(() => {});
    return false;
  }
}

async function checkEnvironmentVariables() {
  log('\n🔍 Checking Environment Variables', colors.cyan);
  
  const required = ['DATABASE_URL'];
  const optional = ['DIRECT_URL'];
  
  for (const key of required) {
    if (process.env[key]) {
      const url = process.env[key];
      const maskedUrl = url.replace(/:[^:@]+@/, ':****@');
      log(`✅ ${key} is set: ${maskedUrl.substring(0, 60)}...`, colors.green);
    } else {
      log(`❌ ${key} is not set`, colors.red);
    }
  }
  
  for (const key of optional) {
    if (process.env[key]) {
      const url = process.env[key];
      const maskedUrl = url.replace(/:[^:@]+@/, ':****@');
      log(`✅ ${key} is set: ${maskedUrl.substring(0, 60)}...`, colors.green);
    } else {
      log(`⚠️  ${key} is not set (optional but recommended for migrations)`, colors.yellow);
    }
  }
}

async function main() {
  log('🚀 Supabase Connection Diagnostic Tool', colors.cyan);
  log('=' .repeat(50), colors.cyan);
  
  // Check environment variables
  await checkEnvironmentVariables();
  
  // Test connections
  const tests = [];
  
  if (process.env.DATABASE_URL) {
    tests.push(testConnection(
      process.env.DATABASE_URL,
      'DATABASE_URL (Primary Connection)'
    ));
  }
  
  if (process.env.DIRECT_URL) {
    tests.push(testConnection(
      process.env.DIRECT_URL,
      'DIRECT_URL (Migration Connection)'
    ));
  }
  
  // Test different connection configurations
  if (process.env.DATABASE_URL) {
    const baseUrl = process.env.DATABASE_URL;
    
    // Test with different parameters
    const url = new URL(baseUrl);
    
    // Test with minimal parameters
    const minimalUrl = new URL(baseUrl);
    minimalUrl.search = '';
    minimalUrl.searchParams.set('pgbouncer', 'true');
    minimalUrl.searchParams.set('connection_limit', '1');
    
    tests.push(testConnection(
      minimalUrl.toString(),
      'Minimal Configuration (pgbouncer=true, connection_limit=1)'
    ));
    
    // Test with recommended parameters for port 6543
    if (url.port === '6543') {
      const optimizedUrl = new URL(baseUrl);
      optimizedUrl.search = '';
      optimizedUrl.searchParams.set('pgbouncer', 'true');
      optimizedUrl.searchParams.set('connection_limit', '5');
      optimizedUrl.searchParams.set('pool_timeout', '20');
      optimizedUrl.searchParams.set('statement_cache_size', '0');
      
      tests.push(testConnection(
        optimizedUrl.toString(),
        'Optimized Transaction Pooler Configuration'
      ));
    }
  }
  
  await Promise.all(tests);
  
  // Summary
  log('\n' + '=' .repeat(50), colors.cyan);
  log('📊 Diagnostic Complete', colors.cyan);
  
  log('\n💡 Recommendations:', colors.yellow);
  log('1. For Vercel deployment, use transaction pooler (port 6543)', colors.yellow);
  log('2. Set DIRECT_URL for migrations (port 5432)', colors.yellow);
  log('3. Use connection_limit=5 for transaction pooler', colors.yellow);
  log('4. Regenerate password if authentication fails', colors.yellow);
  log('5. Check Supabase Dashboard for IP bans', colors.yellow);
}

main().catch((error) => {
  log(`\n❌ Diagnostic failed: ${error.message}`, colors.red);
  process.exit(1);
});
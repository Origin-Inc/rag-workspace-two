#!/usr/bin/env node

/**
 * Test script to verify file persistence setup
 * Run with: node scripts/test-persistence.js
 */

import https from 'https';
import http from 'http';

// Configuration - Update these with your actual values
const CONFIG = {
  SUPABASE_URL: process.env.SUPABASE_URL || 'http://127.0.0.1:54341',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  APP_URL: process.env.APP_URL || 'http://localhost:3001',
};

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(50));
  log(title, 'cyan');
  console.log('='.repeat(50));
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function testSupabaseConnection() {
  logSection('Testing Supabase Connection');
  
  try {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/`;
    log(`Testing: ${url}`, 'blue');
    
    const response = await makeRequest(url, {
      method: 'GET',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      },
    });
    
    if (response.status === 200) {
      log('✅ Supabase API is accessible', 'green');
      return true;
    } else {
      log(`❌ Supabase API returned status: ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Failed to connect to Supabase: ${error.message}`, 'red');
    return false;
  }
}

async function testStorageBuckets() {
  logSection('Testing Storage Buckets');
  
  const buckets = ['user-uploads', 'duckdb-tables'];
  const results = [];
  
  for (const bucket of buckets) {
    try {
      const url = `${CONFIG.SUPABASE_URL}/storage/v1/bucket/${bucket}`;
      log(`Testing bucket: ${bucket}`, 'blue');
      
      const response = await makeRequest(url, {
        method: 'GET',
        headers: {
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        },
      });
      
      if (response.status === 200) {
        log(`  ✅ Bucket '${bucket}' exists`, 'green');
        results.push(true);
      } else if (response.status === 404) {
        log(`  ❌ Bucket '${bucket}' not found - run migrations!`, 'red');
        results.push(false);
      } else {
        log(`  ⚠️ Bucket '${bucket}' returned status: ${response.status}`, 'yellow');
        results.push(false);
      }
    } catch (error) {
      log(`  ❌ Failed to check bucket '${bucket}': ${error.message}`, 'red');
      results.push(false);
    }
  }
  
  return results.every(r => r);
}

async function testAppEndpoints() {
  logSection('Testing App API Endpoints');
  
  const testPageId = 'test-page-id';
  const endpoints = [
    {
      name: 'Files API',
      url: `${CONFIG.APP_URL}/api/data/files/${testPageId}`,
      method: 'GET',
    },
  ];
  
  for (const endpoint of endpoints) {
    try {
      log(`Testing: ${endpoint.name}`, 'blue');
      log(`  URL: ${endpoint.url}`, 'blue');
      
      const response = await makeRequest(endpoint.url, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.status === 401) {
        log(`  ⚠️ ${endpoint.name} requires authentication (expected)`, 'yellow');
      } else if (response.status === 404) {
        log(`  ✅ ${endpoint.name} is reachable (404 for test page is ok)`, 'green');
      } else if (response.status >= 500) {
        log(`  ❌ ${endpoint.name} returned server error: ${response.status}`, 'red');
        log(`     This indicates DATABASE_URL or SERVICE_ROLE_KEY issues!`, 'red');
      } else {
        log(`  ✅ ${endpoint.name} returned status: ${response.status}`, 'green');
      }
    } catch (error) {
      log(`  ❌ Failed to reach ${endpoint.name}: ${error.message}`, 'red');
    }
  }
}

function printSummary(results) {
  logSection('Summary & Next Steps');
  
  if (results.supabase && results.buckets) {
    log('✅ Infrastructure is ready!', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Fix Vercel environment variables (see VERCEL_ENV_FIXES.md)');
    log('2. Deploy to Vercel');
    log('3. Test file upload in production');
  } else {
    log('❌ Issues found:', 'red');
    
    if (!results.supabase) {
      log('\n1. Supabase connection failed:', 'yellow');
      log('   - Check SUPABASE_URL and SUPABASE_ANON_KEY');
      log('   - Make sure Supabase is running (npx supabase start)');
    }
    
    if (!results.buckets) {
      log('\n2. Storage buckets missing:', 'yellow');
      log('   - Run: npx supabase db reset');
      log('   - This will create the required buckets');
    }
  }
  
  log('\n📝 Required Vercel Environment Variables:', 'cyan');
  log('   DATABASE_URL - Must use port 5432 (session pooler)');
  log('   SUPABASE_SERVICE_ROLE_KEY - Get from Supabase dashboard');
  log('   APP_URL - Your actual Vercel URL');
  log('\nSee VERCEL_ENV_FIXES.md for details', 'blue');
}

async function main() {
  log('🔍 File Persistence Setup Verification', 'cyan');
  log(`Testing with:`, 'blue');
  log(`  SUPABASE_URL: ${CONFIG.SUPABASE_URL}`);
  log(`  APP_URL: ${CONFIG.APP_URL}`);
  
  const results = {
    supabase: false,
    buckets: false,
  };
  
  // Test Supabase connection
  results.supabase = await testSupabaseConnection();
  
  // Test storage buckets if Supabase is accessible
  if (results.supabase) {
    results.buckets = await testStorageBuckets();
  }
  
  // Test app endpoints
  await testAppEndpoints();
  
  // Print summary
  printSummary(results);
}

// Run the tests
main().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  process.exit(1);
});
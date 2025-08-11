#!/usr/bin/env node

/**
 * Test script for AI Controller question handling
 */

const fetch = require('node-fetch');

// Configuration
const BASE_URL = 'http://localhost:5173';
const TEST_COMMANDS = [
  'summarize this page',
  'what databases are in my workspace?',
  'list all the important items',
  'create a task tracker database', // This should be handled as action
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function login() {
  console.log(`${colors.cyan}Logging in...${colors.reset}`);
  
  const response = await fetch(`${BASE_URL}/auth/login-simple`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      email: 'test@example.com',
      password: 'testpassword123',
    }),
    redirect: 'manual',
  });

  const cookies = response.headers.raw()['set-cookie'];
  if (!cookies) {
    throw new Error('No cookies received from login');
  }

  console.log(`${colors.green}✓ Logged in successfully${colors.reset}`);
  return cookies.join('; ');
}

async function getWorkspaceId(cookies) {
  console.log(`${colors.cyan}Getting workspace ID...${colors.reset}`);
  
  // First get user info
  const response = await fetch(`${BASE_URL}/api/debug-database`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookies,
    },
    body: new URLSearchParams({
      action: 'testConnection',
    }),
  });

  const data = await response.json();
  
  // For testing, we'll use a default workspace ID
  // In production, you'd fetch this from the actual workspace
  const workspaceId = '550e8400-e29b-41d4-a716-446655440000'; // Demo workspace
  
  console.log(`${colors.green}✓ Using workspace ID: ${workspaceId}${colors.reset}`);
  return workspaceId;
}

async function testCommand(command, workspaceId, cookies) {
  console.log(`\n${colors.bright}Testing command: "${command}"${colors.reset}`);
  
  try {
    const response = await fetch(`${BASE_URL}/api/ai-controller`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
      },
      body: new URLSearchParams({
        action: 'parse',
        command: command,
        workspaceId: workspaceId,
        userId: 'test-user',
      }),
    });

    const data = await response.json();
    
    console.log(`${colors.blue}Response status: ${response.status}${colors.reset}`);
    
    if (data.isQuestion) {
      console.log(`${colors.green}✓ Detected as QUESTION${colors.reset}`);
      console.log(`${colors.cyan}Answer:${colors.reset}`);
      console.log(data.answer ? data.answer.substring(0, 200) + '...' : 'No answer provided');
      
      if (data.citations && data.citations.length > 0) {
        console.log(`${colors.cyan}Citations: ${data.citations.length} sources${colors.reset}`);
      }
      
      if (data.confidence) {
        console.log(`${colors.cyan}Confidence: ${(data.confidence * 100).toFixed(1)}%${colors.reset}`);
      }
    } else if (data.preview) {
      console.log(`${colors.yellow}✓ Detected as ACTION${colors.reset}`);
      console.log(`${colors.cyan}Preview actions: ${data.preview.length}${colors.reset}`);
      
      if (data.parseResult) {
        console.log(`${colors.cyan}Action count: ${data.parseResult.actions?.length || 0}${colors.reset}`);
      }
    } else if (data.error) {
      console.log(`${colors.red}✗ Error: ${data.error}${colors.reset}`);
    } else {
      console.log(`${colors.yellow}Unexpected response format:${colors.reset}`);
      console.log(JSON.stringify(data, null, 2));
    }
    
    // Log debug info
    if (data.parseResult?.reasoning) {
      console.log(`${colors.cyan}Reasoning: ${data.parseResult.reasoning}${colors.reset}`);
    }
    
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    console.error(error);
  }
}

async function main() {
  console.log(`${colors.bright}AI Controller Question Detection Test${colors.reset}`);
  console.log('=====================================\n');
  
  try {
    // Login
    const cookies = await login();
    
    // Get workspace ID
    const workspaceId = await getWorkspaceId(cookies);
    
    // Test each command
    for (const command of TEST_COMMANDS) {
      await testCommand(command, workspaceId, cookies);
      
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`\n${colors.green}${colors.bright}Test completed!${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Test failed: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);
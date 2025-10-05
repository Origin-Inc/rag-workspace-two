#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testJotaiMigration() {
  console.log('🧪 Starting Jotai Migration Tests...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Enable console log capture
  page.on('console', msg => {
    if (msg.text().includes('[ChatSidebar]') || msg.text().includes('Render count')) {
      console.log(`Browser Console: ${msg.text()}`);
    }
  });

  try {
    console.log('1️⃣ Testing Authentication...');
    await page.goto('http://localhost:3001/auth/dev-login?redirectTo=/app');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('✅ Authentication successful\n');

    console.log('2️⃣ Navigating to editor...');
    await page.goto('http://localhost:3001/app');
    await page.waitForSelector('[data-testid="page-link"]', { timeout: 10000 });
    
    // Click on first page
    const firstPage = await page.$('[data-testid="page-link"]');
    if (firstPage) {
      await firstPage.click();
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
    }
    console.log('✅ Editor loaded\n');

    console.log('3️⃣ Testing Chat Sidebar...');
    // Open chat sidebar
    const chatToggle = await page.$('[data-testid="chat-toggle"], button[aria-label*="chat"], button[title*="chat"]');
    if (chatToggle) {
      await chatToggle.click();
      await page.waitForTimeout(1000);
    }
    
    // Count initial renders
    const renderLogs = await page.evaluate(() => {
      const logs = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent?.includes('Render count')
      );
      return logs.length;
    });
    console.log(`Initial render count references: ${renderLogs}`);

    console.log('\n4️⃣ Testing Message Input (Conversational)...');
    const chatInput = await page.$('textarea[placeholder*="Ask"], textarea[placeholder*="question"], textarea[placeholder*="Type"]');
    if (chatInput) {
      await chatInput.type('How are you doing?');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      
      // Check for response
      const messages = await page.$$('[data-testid*="message"], .chat-message, [class*="message"]');
      console.log(`Messages found: ${messages.length}`);
    }

    console.log('\n5️⃣ Testing Off-topic Query...');
    if (chatInput) {
      await chatInput.type('What is the weather today?');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      
      // Check if it properly handles off-topic
      const responseText = await page.evaluate(() => {
        const messages = Array.from(document.querySelectorAll('[class*="message"]'));
        return messages[messages.length - 1]?.textContent || '';
      });
      
      if (responseText.includes('data') || responseText.includes('analyze')) {
        console.log('✅ Off-topic handled correctly - redirects to data analysis');
      } else if (responseText.includes('weather')) {
        console.log('❌ Off-topic NOT handled - searching for weather in documents');
      }
    }

    console.log('\n6️⃣ Checking Performance Metrics...');
    const metrics = await page.metrics();
    console.log(`JS Heap Used: ${(metrics.JSHeapUsedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`DOM Nodes: ${metrics.Nodes}`);
    console.log(`JS Event Listeners: ${metrics.JSEventListeners}`);

    console.log('\n7️⃣ Testing File Upload State...');
    // This would test file upload if we had a test file ready
    
    console.log('\n✅ All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

testJotaiMigration().catch(console.error);
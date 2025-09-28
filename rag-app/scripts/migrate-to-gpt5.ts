#!/usr/bin/env node
/**
 * Migration script to update all services from GPT-4-turbo-preview to GPT-5-mini
 * This script updates all hardcoded model references to use the new configuration
 */

import fs from 'fs';
import path from 'path';

const servicesToUpdate = [
  'app/services/rag.server.ts',
  'app/services/llm-orchestration/intent-classifier.server.ts',
  'app/services/llm-orchestration/structured-output.server.ts',
  'app/services/streaming/ai-streaming.server.ts',
  'app/services/ai/chart-generator.server.ts',
  'app/services/ai/ai-feedback.server.ts',
  'app/services/ai/block-commands.server.ts',
  'app/services/ai/block-transformer.server.ts',
  'app/services/openai.server.ts'
];

const updates = [
  {
    // Replace hardcoded model with config
    pattern: /model:\s*['"]gpt-4-turbo-preview['"]/g,
    replacement: "model: (await aiModelConfig.getModelName(userId))"
  },
  {
    // Replace default model in function parameters
    pattern: /model\s*=\s*['"]gpt-4-turbo-preview['"]/g,
    replacement: "model = aiModelConfig.getConfig().model"
  },
  {
    // Update max_tokens from 3000 to 8000
    pattern: /max_tokens:\s*3000/g,
    replacement: "max_tokens: 8000"
  },
  {
    // Add import for model config if not present
    checkImport: true,
    import: "import { aiModelConfig } from '~/services/ai-model-config.server';"
  },
  {
    // Add import for cost tracker if not present
    checkImport: true,
    import: "import { costTracker } from '~/services/cost-tracker.server';"
  }
];

function updateFile(filePath: string): boolean {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf-8');
  let modified = false;
  
  // Check and add imports
  const hasModelConfigImport = content.includes('ai-model-config.server');
  const hasCostTrackerImport = content.includes('cost-tracker.server');
  
  if (!hasModelConfigImport) {
    // Add import after other imports
    const importMatch = content.match(/import.*from.*['"].*\.server['"];/);
    if (importMatch) {
      const lastImportIndex = content.lastIndexOf(importMatch[0]) + importMatch[0].length;
      content = content.slice(0, lastImportIndex) + 
                "\nimport { aiModelConfig } from '~/services/ai-model-config.server';" +
                content.slice(lastImportIndex);
      modified = true;
    }
  }
  
  if (!hasCostTrackerImport && filePath.includes('rag.server')) {
    // Add cost tracker import for main services
    const importMatch = content.match(/import.*from.*['"].*\.server['"];/);
    if (importMatch) {
      const lastImportIndex = content.lastIndexOf(importMatch[0]) + importMatch[0].length;
      content = content.slice(0, lastImportIndex) + 
                "\nimport { costTracker } from '~/services/cost-tracker.server';" +
                content.slice(lastImportIndex);
      modified = true;
    }
  }
  
  // Apply pattern replacements
  for (const update of updates) {
    if (update.pattern) {
      const matches = content.match(update.pattern);
      if (matches) {
        content = content.replace(update.pattern, update.replacement);
        modified = true;
        console.log(`  ✓ Updated ${matches.length} occurrence(s) of: ${update.pattern.source}`);
      }
    }
  }
  
  // Add cost tracking after OpenAI calls (for main services)
  if (filePath.includes('rag.server') || filePath.includes('intent-classifier')) {
    const completionPattern = /const\s+(\w+)\s*=\s*await\s+openai\.chat\.completions\.create\(/g;
    let match;
    while ((match = completionPattern.exec(content)) !== null) {
      const varName = match[1];
      const trackingCode = `\n      // Track cost\n      await costTracker.trackUsage(${varName}, model, userId);`;
      
      // Find the end of the completion call
      const startIndex = match.index;
      let braceCount = 0;
      let endIndex = startIndex;
      let foundStart = false;
      
      for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '(') {
          if (!foundStart) foundStart = true;
          braceCount++;
        } else if (content[i] === ')') {
          braceCount--;
          if (braceCount === 0 && foundStart) {
            endIndex = i + 1;
            break;
          }
        }
      }
      
      // Insert tracking code after the completion call
      if (endIndex > startIndex && !content.slice(endIndex, endIndex + 50).includes('costTracker')) {
        content = content.slice(0, endIndex) + ';' + trackingCode + content.slice(endIndex + 1);
        modified = true;
        console.log(`  ✓ Added cost tracking for ${varName}`);
      }
    }
  }
  
  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✅ Updated: ${filePath}`);
    return true;
  }
  
  console.log(`⏭️  No changes needed: ${filePath}`);
  return false;
}

console.log('🚀 Starting GPT-5-mini migration...\n');

let updatedCount = 0;
for (const service of servicesToUpdate) {
  if (updateFile(service)) {
    updatedCount++;
  }
}

console.log(`\n✨ Migration complete! Updated ${updatedCount} files.`);
console.log('\n📋 Next steps:');
console.log('1. Review the changes in each file');
console.log('2. Run tests to ensure everything works');
console.log('3. Update environment variables:');
console.log('   - Set OPENAI_MODEL=gpt-5-mini');
console.log('   - Set GPT5_ROLLOUT_PERCENTAGE=10 (for gradual rollout)');
console.log('4. Apply the database migration:');
console.log('   - npx prisma migrate deploy');
console.log('5. Monitor costs and performance');
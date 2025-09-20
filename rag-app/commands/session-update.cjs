#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function getGitDiff() {
  try {
    const { stdout: staged } = await execAsync('git diff --staged --stat');
    const { stdout: unstaged } = await execAsync('git diff --stat');
    const { stdout: untracked } = await execAsync('git ls-files --others --exclude-standard');
    
    return {
      staged: staged || 'No staged changes',
      unstaged: unstaged || 'No unstaged changes',
      untracked: untracked ? untracked.split('\n').filter(f => f).length : 0
    };
  } catch (error) {
    return {
      staged: 'Git diff unavailable',
      unstaged: 'Git diff unavailable',
      untracked: 0
    };
  }
}

async function getCurrentSession() {
  const currentSessionPath = path.join(process.cwd(), 'sessions', '.current-session');
  
  try {
    const sessionFile = await fs.readFile(currentSessionPath, 'utf-8');
    return sessionFile.trim();
  } catch (error) {
    throw new Error('No active session. Run session-start first.');
  }
}

async function updateSession(notes = '') {
  const sessionFile = await getCurrentSession();
  const sessionPath = path.join(process.cwd(), 'sessions', sessionFile);
  
  // Read existing session
  const sessionContent = await fs.readFile(sessionPath, 'utf-8');
  
  // Get git status
  const git = await getGitDiff();
  const timestamp = new Date();
  
  // Generate auto-summary if no notes provided
  let updateNotes = notes;
  if (!notes) {
    const recentTasks = [];
    if (git.staged !== 'No staged changes') recentTasks.push('Staged changes for commit');
    if (git.unstaged !== 'No unstaged changes') recentTasks.push('Made file modifications');
    if (git.untracked > 0) recentTasks.push(`Added ${git.untracked} new file(s)`);
    
    updateNotes = recentTasks.length > 0 
      ? `Progress update: ${recentTasks.join(', ')}`
      : 'Session checkpoint';
  }
  
  // Create update entry
  const updateEntry = `
### ${timestamp.toLocaleTimeString()} - Update
${updateNotes}

**Git Status:**
- Staged: ${git.staged.split('\n')[0] || 'None'}
- Unstaged: ${git.unstaged.split('\n')[0] || 'None'}
- Untracked files: ${git.untracked}

`;

  // Append to session file
  const updatedContent = sessionContent + updateEntry;
  await fs.writeFile(sessionPath, updatedContent);
  
  console.log(`✅ Session updated: ${sessionFile}`);
  console.log(`📝 Note: ${updateNotes}`);
  console.log(`⏰ Time: ${timestamp.toLocaleTimeString()}`);
  
  return sessionFile;
}

// Handle command line arguments
const notes = process.argv.slice(2).join(' ');
updateSession(notes).catch(console.error);
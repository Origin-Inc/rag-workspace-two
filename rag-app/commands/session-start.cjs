#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function getGitStatus() {
  try {
    const { stdout: status } = await execAsync('git status --porcelain');
    const { stdout: branch } = await execAsync('git branch --show-current');
    const { stdout: lastCommit } = await execAsync('git log -1 --oneline');
    
    return {
      branch: branch.trim(),
      lastCommit: lastCommit.trim(),
      changedFiles: status.split('\n').filter(line => line.trim()).length,
      status: status || 'Working tree clean'
    };
  } catch (error) {
    return {
      branch: 'unknown',
      lastCommit: 'Git not initialized',
      changedFiles: 0,
      status: 'Git status unavailable'
    };
  }
}

async function startSession(sessionName = '') {
  const timestamp = new Date();
  const dateStr = timestamp.toISOString().split('T')[0];
  const timeStr = timestamp.toTimeString().split(' ')[0].replace(/:/g, '');
  
  // Create session filename
  const baseFilename = `${dateStr}-${timeStr}`;
  const filename = sessionName 
    ? `${baseFilename}-${sessionName.toLowerCase().replace(/\s+/g, '-')}.md`
    : `${baseFilename}.md`;
  
  const sessionPath = path.join(process.cwd(), 'sessions', filename);
  const currentSessionPath = path.join(process.cwd(), 'sessions', '.current-session');
  
  // Get git status
  const git = await getGitStatus();
  
  // Create session content
  const sessionContent = `# Development Session: ${sessionName || 'Unnamed Session'}

**Started:** ${timestamp.toLocaleString()}  
**Branch:** ${git.branch}  
**Last Commit:** ${git.lastCommit}  

## Session Context

### Initial State
- Changed Files: ${git.changedFiles}
- Git Status:
\`\`\`
${git.status}
\`\`\`

### Objectives
- [ ] _To be defined_

---

## Session Log

### ${timestamp.toLocaleTimeString()} - Session Started
- Session initialized with name: ${sessionName || 'Unnamed'}
- Current working directory: ${process.cwd()}

`;

  // Ensure sessions directory exists
  await fs.mkdir(path.join(process.cwd(), 'sessions'), { recursive: true });
  
  // Write session file
  await fs.writeFile(sessionPath, sessionContent);
  
  // Save current session reference
  await fs.writeFile(currentSessionPath, filename);
  
  console.log(`✅ Session started: ${filename}`);
  console.log(`📁 Session file: sessions/${filename}`);
  console.log(`🌿 Branch: ${git.branch}`);
  console.log(`📝 Changed files: ${git.changedFiles}`);
  
  return filename;
}

// Handle command line arguments
const sessionName = process.argv.slice(2).join(' ');
startSession(sessionName).catch(console.error);
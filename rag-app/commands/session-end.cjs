#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function getGitSummary() {
  try {
    // Get commits made during session
    const { stdout: commits } = await execAsync('git log --oneline -10');
    const { stdout: stats } = await execAsync('git diff --stat HEAD~1 2>/dev/null || echo "No commits in session"');
    
    return {
      recentCommits: commits.split('\n').slice(0, 5).filter(c => c),
      stats: stats
    };
  } catch (error) {
    return {
      recentCommits: [],
      stats: 'No git statistics available'
    };
  }
}

async function getCurrentSession() {
  const currentSessionPath = path.join(process.cwd(), 'sessions', '.current-session');
  
  try {
    const sessionFile = await fs.readFile(currentSessionPath, 'utf-8');
    return sessionFile.trim();
  } catch (error) {
    throw new Error('No active session to end.');
  }
}

async function endSession() {
  const sessionFile = await getCurrentSession();
  const sessionPath = path.join(process.cwd(), 'sessions', sessionFile);
  const currentSessionPath = path.join(process.cwd(), 'sessions', '.current-session');
  
  // Read existing session
  const sessionContent = await fs.readFile(sessionPath, 'utf-8');
  
  // Parse session start time from content
  const startMatch = sessionContent.match(/\*\*Started:\*\* (.+)/);
  const startTime = startMatch ? new Date(startMatch[1]) : new Date();
  const endTime = new Date();
  
  // Calculate duration
  const duration = endTime - startTime;
  const hours = Math.floor(duration / 3600000);
  const minutes = Math.floor((duration % 3600000) / 60000);
  
  // Get git summary
  const git = await getGitSummary();
  
  // Extract completed tasks from session log
  const taskMatches = sessionContent.match(/- \[x\] .+/g) || [];
  const completedTasks = taskMatches.map(task => task.replace('- [x] ', ''));
  
  // Count updates
  const updateCount = (sessionContent.match(/### .+ - Update/g) || []).length;
  
  // Create session summary
  const summary = `

---

## Session Summary

**Ended:** ${endTime.toLocaleString()}  
**Duration:** ${hours}h ${minutes}m  
**Total Updates:** ${updateCount}  

### Completed Tasks
${completedTasks.length > 0 
  ? completedTasks.map(task => `- ✅ ${task}`).join('\n')
  : '- No tasks marked as completed'}

### Git Activity
${git.recentCommits.length > 0
  ? '**Recent Commits:**\n' + git.recentCommits.map(c => `- ${c}`).join('\n')
  : 'No commits made during session'}

### Final Statistics
\`\`\`
${git.stats}
\`\`\`

### Key Accomplishments
_[AI: Summarize the main achievements from this session based on the updates above]_

### Next Steps
_[AI: Suggest logical next steps based on the session progress]_

---
*Session completed successfully*
`;

  // Append summary to session file
  const finalContent = sessionContent + summary;
  await fs.writeFile(sessionPath, finalContent);
  
  // Remove current session file
  await fs.unlink(currentSessionPath);
  
  console.log(`✅ Session ended: ${sessionFile}`);
  console.log(`⏱️  Duration: ${hours}h ${minutes}m`);
  console.log(`📊 Updates made: ${updateCount}`);
  console.log(`✔️  Tasks completed: ${completedTasks.length}`);
  console.log(`💾 Session saved to: sessions/${sessionFile}`);
  
  return sessionFile;
}

// Execute
endSession().catch(console.error);
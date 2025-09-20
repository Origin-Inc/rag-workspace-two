#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function getCurrentSession() {
  const currentSessionPath = path.join(process.cwd(), 'sessions', '.current-session');
  
  try {
    const sessionFile = await fs.readFile(currentSessionPath, 'utf-8');
    return sessionFile.trim();
  } catch (error) {
    return null;
  }
}

async function listSessions() {
  const sessionsDir = path.join(process.cwd(), 'sessions');
  
  try {
    const files = await fs.readdir(sessionsDir);
    const sessions = files
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
    
    return sessions;
  } catch (error) {
    return [];
  }
}

async function viewSession(sessionName) {
  const sessionPath = sessionName 
    ? path.join(process.cwd(), 'sessions', sessionName)
    : null;
  
  if (sessionName && sessionPath) {
    // View specific session
    try {
      const content = await fs.readFile(sessionPath, 'utf-8');
      console.log(content);
    } catch (error) {
      console.error(`Session not found: ${sessionName}`);
    }
  } else {
    // List all sessions
    const currentSession = await getCurrentSession();
    const sessions = await listSessions();
    
    console.log('📚 Development Sessions\n');
    
    if (currentSession) {
      console.log(`🟢 Active Session: ${currentSession}\n`);
    }
    
    if (sessions.length === 0) {
      console.log('No sessions found.');
    } else {
      console.log('Recent sessions:');
      sessions.slice(0, 10).forEach(session => {
        const isCurrent = session === currentSession;
        const marker = isCurrent ? '→ ' : '  ';
        console.log(`${marker}${session}`);
      });
      
      if (sessions.length > 10) {
        console.log(`\n...and ${sessions.length - 10} more`);
      }
    }
    
    console.log('\nUsage:');
    console.log('  session-view [filename]  - View specific session');
    console.log('  session-view            - List all sessions');
  }
}

// Handle command line arguments
const sessionName = process.argv[2];
viewSession(sessionName).catch(console.error);
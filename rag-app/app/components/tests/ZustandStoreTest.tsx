import { useState, useEffect } from 'react';
import { useChatStore, useChatMessages, useChatDataFiles, useChatSidebar } from '~/stores/chat-store';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  error?: string;
}

export function ZustandStoreTest() {
  const [tests, setTests] = useState<TestResult[]>([
    { name: 'Add message to store', status: 'pending' },
    { name: 'Update message', status: 'pending' },
    { name: 'Delete message', status: 'pending' },
    { name: 'Clear messages', status: 'pending' },
    { name: 'Add data file', status: 'pending' },
    { name: 'Remove data file', status: 'pending' },
    { name: 'Toggle sidebar', status: 'pending' },
    { name: 'Set active page', status: 'pending' },
    { name: 'Test localStorage persistence', status: 'pending' },
    { name: 'Test multiple pages', status: 'pending' },
  ]);

  const testPageId = 'test-page-123';
  const { messages, addMessage, updateMessage, deleteMessage, clearMessages } = useChatMessages(testPageId);
  const { dataFiles, addDataFile, removeDataFile } = useChatDataFiles(testPageId);
  const { isSidebarOpen, toggleSidebar, setSidebarOpen } = useChatSidebar();
  const store = useChatStore();

  const updateTest = (name: string, updates: Partial<TestResult>) => {
    setTests(prev => prev.map(test => 
      test.name === name ? { ...test, ...updates } : test
    ));
  };

  const runTests = async () => {
    // Clear everything before testing
    clearMessages();
    
    // Test 1: Add message to store
    updateTest('Add message to store', { status: 'running' });
    try {
      const initialCount = messages.length;
      addMessage({ role: 'user', content: 'Test message 1' });
      
      // Wait for state update
      await new Promise(resolve => setTimeout(resolve, 100));
      const newMessages = store.getMessagesForPage(testPageId);
      
      if (newMessages.length === initialCount + 1) {
        updateTest('Add message to store', { 
          status: 'passed', 
          message: `Added message successfully. Count: ${newMessages.length}` 
        });
      } else {
        throw new Error('Message not added');
      }
    } catch (error) {
      updateTest('Add message to store', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 2: Update message
    updateTest('Update message', { status: 'running' });
    try {
      const msgs = store.getMessagesForPage(testPageId);
      if (msgs.length > 0) {
        const messageId = msgs[0].id;
        updateMessage(messageId, { content: 'Updated content' });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const updatedMessages = store.getMessagesForPage(testPageId);
        const updatedMsg = updatedMessages.find(m => m.id === messageId);
        
        if (updatedMsg?.content === 'Updated content') {
          updateTest('Update message', { 
            status: 'passed', 
            message: 'Message updated successfully' 
          });
        } else {
          throw new Error('Message not updated');
        }
      } else {
        throw new Error('No messages to update');
      }
    } catch (error) {
      updateTest('Update message', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 3: Delete message
    updateTest('Delete message', { status: 'running' });
    try {
      addMessage({ role: 'assistant', content: 'Message to delete' });
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const msgs = store.getMessagesForPage(testPageId);
      const toDelete = msgs.find(m => m.content === 'Message to delete');
      
      if (toDelete) {
        const countBefore = msgs.length;
        deleteMessage(toDelete.id);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const msgsAfter = store.getMessagesForPage(testPageId);
        
        if (msgsAfter.length === countBefore - 1) {
          updateTest('Delete message', { 
            status: 'passed', 
            message: 'Message deleted successfully' 
          });
        } else {
          throw new Error('Message not deleted');
        }
      } else {
        throw new Error('Message to delete not found');
      }
    } catch (error) {
      updateTest('Delete message', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 4: Clear messages
    updateTest('Clear messages', { status: 'running' });
    try {
      addMessage({ role: 'user', content: 'Message 1' });
      addMessage({ role: 'assistant', content: 'Message 2' });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      clearMessages();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const msgs = store.getMessagesForPage(testPageId);
      
      if (msgs.length === 0) {
        updateTest('Clear messages', { 
          status: 'passed', 
          message: 'All messages cleared' 
        });
      } else {
        throw new Error('Messages not cleared');
      }
    } catch (error) {
      updateTest('Clear messages', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 5: Add data file
    updateTest('Add data file', { status: 'running' });
    try {
      const initialCount = dataFiles.length;
      addDataFile({
        filename: 'test.csv',
        tableName: 'test_table',
        schema: [{ name: 'column1', type: 'string' }],
        rowCount: 100,
        sizeBytes: 1024,
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const files = store.getDataFilesForPage(testPageId);
      
      if (files.length === initialCount + 1) {
        updateTest('Add data file', { 
          status: 'passed', 
          message: `File added. Count: ${files.length}` 
        });
      } else {
        throw new Error('File not added');
      }
    } catch (error) {
      updateTest('Add data file', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 6: Remove data file
    updateTest('Remove data file', { status: 'running' });
    try {
      const files = store.getDataFilesForPage(testPageId);
      if (files.length > 0) {
        const fileId = files[0].id;
        const countBefore = files.length;
        removeDataFile(fileId);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        const filesAfter = store.getDataFilesForPage(testPageId);
        
        if (filesAfter.length === countBefore - 1) {
          updateTest('Remove data file', { 
            status: 'passed', 
            message: 'File removed successfully' 
          });
        } else {
          throw new Error('File not removed');
        }
      } else {
        throw new Error('No files to remove');
      }
    } catch (error) {
      updateTest('Remove data file', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 7: Toggle sidebar
    updateTest('Toggle sidebar', { status: 'running' });
    try {
      const initialState = isSidebarOpen;
      toggleSidebar();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const newState = store.getState().isSidebarOpen;
      
      if (newState !== initialState) {
        setSidebarOpen(false); // Reset
        updateTest('Toggle sidebar', { 
          status: 'passed', 
          message: `Toggled from ${initialState} to ${newState}` 
        });
      } else {
        throw new Error('Sidebar state not toggled');
      }
    } catch (error) {
      updateTest('Toggle sidebar', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 8: Set active page
    updateTest('Set active page', { status: 'running' });
    try {
      store.setActivePageId('page-456');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (store.getState().activePageId === 'page-456') {
        store.setActivePageId(testPageId); // Reset
        updateTest('Set active page', { 
          status: 'passed', 
          message: 'Active page ID set correctly' 
        });
      } else {
        throw new Error('Active page ID not set');
      }
    } catch (error) {
      updateTest('Set active page', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 9: Test localStorage persistence
    updateTest('Test localStorage persistence', { status: 'running' });
    try {
      store.setDraftMessage('Test draft message');
      setSidebarOpen(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check localStorage
      const stored = localStorage.getItem('chat-storage');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.state?.draftMessage === 'Test draft message' && 
            parsed.state?.isSidebarOpen === true) {
          updateTest('Test localStorage persistence', { 
            status: 'passed', 
            message: 'State persisted to localStorage' 
          });
        } else {
          throw new Error('State not properly persisted');
        }
      } else {
        throw new Error('Nothing in localStorage');
      }
    } catch (error) {
      updateTest('Test localStorage persistence', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 10: Test multiple pages
    updateTest('Test multiple pages', { status: 'running' });
    try {
      const page1 = 'page-1';
      const page2 = 'page-2';
      
      store.addMessage(page1, { role: 'user', content: 'Page 1 message' });
      store.addMessage(page2, { role: 'user', content: 'Page 2 message' });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const msgs1 = store.getMessagesForPage(page1);
      const msgs2 = store.getMessagesForPage(page2);
      
      if (msgs1.length === 1 && msgs2.length === 1 && 
          msgs1[0].content === 'Page 1 message' && 
          msgs2[0].content === 'Page 2 message') {
        updateTest('Test multiple pages', { 
          status: 'passed', 
          message: 'Multiple pages handled correctly' 
        });
      } else {
        throw new Error('Multiple pages not handled correctly');
      }
    } catch (error) {
      updateTest('Test multiple pages', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-500';
      case 'running': return 'text-yellow-500';
      case 'passed': return 'text-green-500';
      case 'failed': return 'text-red-500';
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'passed': return '✅';
      case 'failed': return '❌';
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Zustand Store Test Suite</h2>
      
      <div className="space-y-3">
        {tests.map((test) => (
          <div key={test.name} className="border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">{getStatusIcon(test.status)}</span>
              <div className="flex-1">
                <div className={`font-medium ${getStatusColor(test.status)}`}>
                  {test.name}
                </div>
                {test.message && (
                  <div className="text-sm text-gray-600 mt-1">{test.message}</div>
                )}
                {test.error && (
                  <div className="text-sm text-red-600 mt-1">Error: {test.error}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={runTests}
        className="mt-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Rerun Tests
      </button>
    </div>
  );
}
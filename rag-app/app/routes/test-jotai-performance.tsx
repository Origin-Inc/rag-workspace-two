import { useState, useRef, useEffect } from 'react';
import { useChatMessages, useChatDataFiles, useChatState } from '~/hooks/use-chat-atoms';
import type { DataFile } from '~/atoms/chat-atoms';

export default function TestJotaiPerformance() {
  const pageId = 'test-page-performance';
  
  // Track render counts for each hook
  const renderCountMessages = useRef(0);
  const renderCountFiles = useRef(0);
  const renderCountState = useRef(0);
  const renderCountTotal = useRef(0);
  
  renderCountTotal.current += 1;
  
  const [testResults, setTestResults] = useState<string[]>([]);
  
  // Use the hooks
  const { messages, addMessage, updateMessage, deleteMessage, clearMessages } = useChatMessages(pageId);
  const { dataFiles, addDataFile, removeDataFile, setDataFiles } = useChatDataFiles(pageId);
  const { isLoading, setLoading, activePageId, setActivePageId } = useChatState();
  
  useEffect(() => {
    renderCountMessages.current += 1;
  }, [messages]);
  
  useEffect(() => {
    renderCountFiles.current += 1;
  }, [dataFiles]);
  
  useEffect(() => {
    renderCountState.current += 1;
  }, [isLoading, activePageId]);
  
  const runTest = async (testName: string, action: () => void | Promise<void>) => {
    const beforeTotal = renderCountTotal.current;
    const beforeMessages = renderCountMessages.current;
    const beforeFiles = renderCountFiles.current;
    const beforeState = renderCountState.current;
    
    await action();
    
    // Allow React to complete renders
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const result = `${testName}:
      Total renders: ${renderCountTotal.current - beforeTotal}
      Message hook renders: ${renderCountMessages.current - beforeMessages}
      Files hook renders: ${renderCountFiles.current - beforeFiles}
      State hook renders: ${renderCountState.current - beforeState}`;
    
    setTestResults(prev => [...prev, result]);
  };
  
  const runAllTests = async () => {
    setTestResults(['Starting tests...']);
    
    // Test 1: Add a message
    await runTest('Add single message', () => {
      addMessage({
        role: 'user',
        content: 'Test message',
        pageId
      });
    });
    
    // Test 2: Add multiple messages
    await runTest('Add 5 messages rapidly', () => {
      for (let i = 0; i < 5; i++) {
        addMessage({
          role: 'user',
          content: `Message ${i}`,
          pageId
        });
      }
    });
    
    // Test 3: Update a message
    await runTest('Update a message', () => {
      const firstMessage = messages[0];
      if (firstMessage) {
        updateMessage(firstMessage.id, {
          content: 'Updated content'
        });
      }
    });
    
    // Test 4: Delete a message
    await runTest('Delete a message', () => {
      const firstMessage = messages[0];
      if (firstMessage) {
        deleteMessage(firstMessage.id);
      }
    });
    
    // Test 5: Add a data file
    await runTest('Add data file', () => {
      addDataFile({
        pageId,
        filename: 'test.csv',
        tableName: 'test_table',
        schema: [],
        rowCount: 100,
        sizeBytes: 1024,
        syncStatus: 'synced'
      });
    });
    
    // Test 6: Batch update files
    await runTest('Batch update 10 files', () => {
      const files: DataFile[] = Array.from({ length: 10 }, (_, i) => ({
        id: `file-${i}`,
        pageId,
        filename: `file${i}.csv`,
        tableName: `table_${i}`,
        schema: [],
        rowCount: 100 * i,
        sizeBytes: 1024 * i,
        uploadedAt: new Date(),
        syncStatus: i % 2 === 0 ? 'synced' : 'syncing' as const
      }));
      
      setDataFiles(files);
    });
    
    // Test 7: Update loading state
    await runTest('Toggle loading state', () => {
      setLoading(true);
      setTimeout(() => setLoading(false), 50);
    });
    
    // Test 8: Clear all messages
    await runTest('Clear all messages', () => {
      clearMessages();
    });
    
    setTestResults(prev => [...prev, '✅ All tests completed!']);
  };
  
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Jotai Performance Test</h1>
      
      <div className="mb-8 p-4 bg-gray-100 rounded">
        <h2 className="font-semibold mb-2">Current State:</h2>
        <p>Total Renders: {renderCountTotal.current}</p>
        <p>Messages: {messages.length}</p>
        <p>Files: {dataFiles.length}</p>
        <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
      </div>
      
      <button
        onClick={runAllTests}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mb-4"
      >
        Run Performance Tests
      </button>
      
      <div className="space-y-4">
        {testResults.map((result, i) => (
          <div key={i} className="p-3 bg-gray-50 rounded font-mono text-sm whitespace-pre">
            {result}
          </div>
        ))}
      </div>
      
      <div className="mt-8 p-4 bg-yellow-50 rounded">
        <h3 className="font-semibold mb-2">Expected Results:</h3>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Single state update should cause 1-2 renders max</li>
          <li>Multiple rapid updates should batch to 2-3 renders</li>
          <li>Unrelated state changes should not trigger renders</li>
          <li>File updates should not affect message renders</li>
        </ul>
      </div>
    </div>
  );
}
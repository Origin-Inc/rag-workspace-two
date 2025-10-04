import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { createStore } from 'jotai';
import React from 'react';
import {
  useChatMessages,
  useChatDataFiles,
  useChatState,
  useChat,
} from '../use-chat-atoms';

describe('useChat Hooks', () => {
  let store: ReturnType<typeof createStore>;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    store = createStore();
    wrapper = ({ children }) => (
      <JotaiProvider store={store}>{children}</JotaiProvider>
    );
  });

  describe('useChatMessages', () => {
    it('should provide message operations for a specific page', () => {
      const pageId = 'test-page-1';
      const { result } = renderHook(() => useChatMessages(pageId), { wrapper });

      expect(result.current.messages).toEqual([]);

      // Add a message
      act(() => {
        result.current.addMessage({
          role: 'user',
          content: 'Test message',
          pageId,
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Test message');
    });

    it('should batch add messages efficiently', () => {
      const pageId = 'test-page-1';
      let renderCount = 0;
      
      const { result } = renderHook(() => {
        renderCount++;
        return useChatMessages(pageId);
      }, { wrapper });
      
      // Reset count after initial render
      renderCount = 0;

      const messages = [
        { role: 'user' as const, content: 'Message 1', pageId },
        { role: 'assistant' as const, content: 'Message 2', pageId },
        { role: 'user' as const, content: 'Message 3', pageId },
      ];

      act(() => {
        result.current.batchAddMessages(messages);
      });

      // Should trigger only one re-render
      expect(renderCount).toBe(1);
      
      // Should update in one batch
      expect(result.current.messages).toHaveLength(3);
      expect(result.current.messages[0].content).toBe('Message 1');
      expect(result.current.messages[2].content).toBe('Message 3');
    });

    it('should clear messages for a page', () => {
      const pageId = 'test-page-1';
      const { result } = renderHook(() => useChatMessages(pageId), { wrapper });

      // Add messages
      act(() => {
        result.current.addMessage({
          role: 'user',
          content: 'Message 1',
          pageId,
        });
        result.current.addMessage({
          role: 'assistant',
          content: 'Message 2',
          pageId,
        });
      });

      expect(result.current.messages).toHaveLength(2);

      // Clear messages
      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
    });

    it('should update a specific message', () => {
      const pageId = 'test-page-1';
      const { result } = renderHook(() => useChatMessages(pageId), { wrapper });

      // Add a message
      let messageId: string;
      act(() => {
        const message = result.current.addMessage({
          role: 'user',
          content: 'Original content',
          pageId,
        });
        messageId = message!.id;
      });

      // Update the message
      act(() => {
        result.current.updateMessage(messageId!, {
          content: 'Updated content',
          isStreaming: true,
        });
      });

      expect(result.current.messages[0].content).toBe('Updated content');
      expect(result.current.messages[0].isStreaming).toBe(true);
    });
  });

  describe('useChatDataFiles', () => {
    it('should provide file operations for a specific page', () => {
      const pageId = 'test-page-1';
      const { result } = renderHook(() => useChatDataFiles(pageId), { wrapper });

      expect(result.current.dataFiles).toEqual([]);

      // Add a file
      act(() => {
        result.current.addDataFile({
          pageId,
          filename: 'test.csv',
          tableName: 'test_table',
          schema: [],
          rowCount: 100,
          sizeBytes: 1024,
        });
      });

      expect(result.current.dataFiles).toHaveLength(1);
      expect(result.current.dataFiles[0].filename).toBe('test.csv');
    });

    it('should batch set files efficiently', () => {
      const pageId = 'test-page-1';
      const { result } = renderHook(() => useChatDataFiles(pageId), { wrapper });

      const files = [
        {
          id: 'file-1',
          pageId,
          filename: 'data1.csv',
          tableName: 'table1',
          schema: [],
          rowCount: 100,
          sizeBytes: 1024,
          uploadedAt: new Date(),
        },
        {
          id: 'file-2',
          pageId,
          filename: 'data2.csv',
          tableName: 'table2',
          schema: [],
          rowCount: 200,
          sizeBytes: 2048,
          uploadedAt: new Date(),
        },
      ];

      act(() => {
        result.current.setDataFiles(files);
      });

      expect(result.current.dataFiles).toHaveLength(2);
      expect(result.current.dataFiles[0].filename).toBe('data1.csv');
      expect(result.current.dataFiles[1].filename).toBe('data2.csv');
    });

    it('should remove a specific file', () => {
      const pageId = 'test-page-1';
      const { result } = renderHook(() => useChatDataFiles(pageId), { wrapper });

      // Add a file
      let fileId: string;
      act(() => {
        const file = result.current.addDataFile({
          pageId,
          filename: 'test.csv',
          tableName: 'test_table',
          schema: [],
          rowCount: 100,
          sizeBytes: 1024,
        });
        fileId = file!.id;
      });

      expect(result.current.dataFiles).toHaveLength(1);

      // Remove the file
      act(() => {
        result.current.removeDataFile(fileId!);
      });

      expect(result.current.dataFiles).toEqual([]);
    });
  });

  describe('useChatState', () => {
    it('should manage global chat state', () => {
      const { result } = renderHook(() => useChatState(), { wrapper });

      // Test activePageId
      expect(result.current.activePageId).toBeNull();
      act(() => {
        result.current.setActivePageId('page-1');
      });
      expect(result.current.activePageId).toBe('page-1');

      // Test sidebar state
      expect(result.current.isSidebarOpen).toBe(false);
      act(() => {
        result.current.toggleSidebar();
      });
      expect(result.current.isSidebarOpen).toBe(true);
      act(() => {
        result.current.setSidebarOpen(false);
      });
      expect(result.current.isSidebarOpen).toBe(false);

      // Test loading state
      expect(result.current.isLoading).toBe(false);
      act(() => {
        result.current.setLoading(true);
      });
      expect(result.current.isLoading).toBe(true);

      // Test connection status
      expect(result.current.connectionStatus).toBe('disconnected');
      act(() => {
        result.current.setConnectionStatus('connected');
      });
      expect(result.current.connectionStatus).toBe('connected');
    });

    it('should reset page data', () => {
      const pageId = 'test-page-1';
      const { result: chatResult } = renderHook(() => useChat(pageId), { wrapper });
      const { result: stateResult } = renderHook(() => useChatState(), { wrapper });

      // Add data
      act(() => {
        chatResult.current.addMessage({
          role: 'user',
          content: 'Test message',
          pageId,
        });
        chatResult.current.addDataFile({
          pageId,
          filename: 'test.csv',
          tableName: 'test_table',
          schema: [],
          rowCount: 100,
          sizeBytes: 1024,
        });
      });

      expect(chatResult.current.messages).toHaveLength(1);
      expect(chatResult.current.dataFiles).toHaveLength(1);

      // Reset page data
      act(() => {
        stateResult.current.resetPageData(pageId);
      });

      expect(chatResult.current.messages).toEqual([]);
      expect(chatResult.current.dataFiles).toEqual([]);
    });
  });

  describe('useChat (combined)', () => {
    it('should provide all chat functionality', () => {
      const pageId = 'test-page-1';
      const { result } = renderHook(() => useChat(pageId), { wrapper });

      // Test messages
      act(() => {
        result.current.addMessage({
          role: 'user',
          content: 'Test message',
          pageId,
        });
      });
      expect(result.current.messages).toHaveLength(1);

      // Test files
      act(() => {
        result.current.addDataFile({
          pageId,
          filename: 'test.csv',
          tableName: 'test_table',
          schema: [],
          rowCount: 100,
          sizeBytes: 1024,
        });
      });
      expect(result.current.dataFiles).toHaveLength(1);

      // Test state
      act(() => {
        result.current.setLoading(true);
        result.current.setActivePageId(pageId);
      });
      expect(result.current.isLoading).toBe(true);
      expect(result.current.activePageId).toBe(pageId);
    });
  });

  describe('Performance Tests', () => {
    it('should not re-render when unrelated state changes', () => {
      const pageId1 = 'page-1';
      const pageId2 = 'page-2';
      
      let renderCount1 = 0;
      let renderCount2 = 0;

      const { result: result1 } = renderHook(() => {
        renderCount1++;
        return useChatMessages(pageId1);
      }, { wrapper });

      const { result: result2 } = renderHook(() => {
        renderCount2++;
        return useChatMessages(pageId2);
      }, { wrapper });

      // Reset counts after initial renders
      renderCount1 = 0;
      renderCount2 = 0;

      // Add message to page1
      act(() => {
        result1.current.addMessage({
          role: 'user',
          content: 'Page 1 message',
          pageId: pageId1,
        });
      });

      // Only page1 hook should re-render
      expect(renderCount1).toBe(1);
      expect(renderCount2).toBe(0);

      // Add message to page2
      act(() => {
        result2.current.addMessage({
          role: 'user',
          content: 'Page 2 message',
          pageId: pageId2,
        });
      });

      // Only page2 hook should re-render  
      expect(renderCount1).toBe(1);
      expect(renderCount2).toBe(1);
    });

    it('should batch multiple state updates efficiently', async () => {
      const pageId = 'test-page';
      const { result } = renderHook(() => useChat(pageId), { wrapper });
      
      let renderCount = 0;
      renderHook(() => {
        renderCount++;
        return useChatMessages(pageId);
      }, { wrapper });

      // Reset count after initial render
      renderCount = 0;

      // Perform multiple updates in one act
      act(() => {
        // These should batch together
        result.current.batchAddMessages([
          { role: 'user' as const, content: 'Message 1', pageId },
          { role: 'assistant' as const, content: 'Message 2', pageId },
        ]);
        result.current.setDataFiles([
          {
            id: 'file-1',
            pageId,
            filename: 'data.csv',
            tableName: 'table',
            schema: [],
            rowCount: 100,
            sizeBytes: 1024,
            uploadedAt: new Date(),
          },
        ]);
        result.current.setLoading(true);
      });

      // Should trigger minimal re-renders
      await waitFor(() => {
        expect(renderCount).toBeLessThanOrEqual(3); // One per atom update
      });
    });
  });
});
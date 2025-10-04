import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';
import {
  messagesAtom,
  dataFilesAtom,
  activePageIdAtom,
  isSidebarOpenAtom,
  isLoadingAtom,
  streamingMessageIdAtom,
  draftMessageAtom,
  connectionStatusAtom,
  currentPageMessagesAtom,
  currentPageDataFilesAtom,
  addMessageAtom,
  updateMessageAtom,
  clearMessagesAtom,
  batchAddMessagesAtom,
  addDataFileAtom,
  removeDataFileAtom,
  clearDataFilesAtom,
  batchSetDataFilesAtom,
  resetPageDataAtom,
  type ChatMessage,
  type DataFile,
} from '../chat-atoms';

describe('Chat Atoms', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  describe('Message Atoms', () => {
    it('should add a message to a page', () => {
      const pageId = 'test-page-1';
      const message = {
        role: 'user' as const,
        content: 'Test message',
        pageId,
      };

      const result = store.set(addMessageAtom, { pageId, message });
      
      expect(result).toBeDefined();
      expect(result?.id).toMatch(/^msg-\d+-/);
      expect(result?.content).toBe('Test message');
      expect(result?.role).toBe('user');
      expect(result?.pageId).toBe(pageId);
      expect(result?.timestamp).toBeInstanceOf(Date);

      const messages = store.get(messagesAtom);
      expect(messages[pageId]).toHaveLength(1);
      expect(messages[pageId][0]).toEqual(result);
    });

    it('should update an existing message', () => {
      const pageId = 'test-page-1';
      const message = {
        role: 'user' as const,
        content: 'Original message',
        pageId,
      };

      const added = store.set(addMessageAtom, { pageId, message });
      
      store.set(updateMessageAtom, {
        pageId,
        messageId: added!.id,
        updates: { content: 'Updated message', isStreaming: true },
      });

      const messages = store.get(messagesAtom);
      expect(messages[pageId][0].content).toBe('Updated message');
      expect(messages[pageId][0].isStreaming).toBe(true);
      expect(messages[pageId][0].id).toBe(added!.id); // ID should not change
    });

    it('should clear messages for a page', () => {
      const pageId = 'test-page-1';
      
      // Add multiple messages
      store.set(addMessageAtom, {
        pageId,
        message: { role: 'user', content: 'Message 1', pageId },
      });
      store.set(addMessageAtom, {
        pageId,
        message: { role: 'assistant', content: 'Message 2', pageId },
      });

      let messages = store.get(messagesAtom);
      expect(messages[pageId]).toHaveLength(2);

      // Clear messages
      store.set(clearMessagesAtom, pageId);
      
      messages = store.get(messagesAtom);
      expect(messages[pageId]).toEqual([]);
    });

    it('should batch add multiple messages in one operation', () => {
      const pageId = 'test-page-1';
      const renderSpy = vi.fn();
      
      // Subscribe to changes
      store.sub(messagesAtom, renderSpy);
      
      const messagesToAdd = [
        { role: 'user' as const, content: 'Message 1', pageId },
        { role: 'assistant' as const, content: 'Message 2', pageId },
        { role: 'user' as const, content: 'Message 3', pageId },
      ];

      const results = store.set(batchAddMessagesAtom, {
        pageId,
        messages: messagesToAdd,
      });

      // Should only trigger one update
      expect(renderSpy).toHaveBeenCalledTimes(1);
      
      expect(results).toHaveLength(3);
      const messages = store.get(messagesAtom);
      expect(messages[pageId]).toHaveLength(3);
      expect(messages[pageId][0].content).toBe('Message 1');
      expect(messages[pageId][2].content).toBe('Message 3');
    });
  });

  describe('DataFile Atoms', () => {
    it('should add a data file to a page', () => {
      const pageId = 'test-page-1';
      const file = {
        pageId,
        filename: 'test.csv',
        tableName: 'test_table',
        schema: [{ name: 'id', type: 'number' }],
        rowCount: 100,
        sizeBytes: 1024,
      };

      const result = store.set(addDataFileAtom, { pageId, file });
      
      expect(result).toBeDefined();
      expect(result?.id).toMatch(/^file-\d+-/);
      expect(result?.filename).toBe('test.csv');
      expect(result?.uploadedAt).toBeInstanceOf(Date);

      const files = store.get(dataFilesAtom);
      expect(files[pageId]).toHaveLength(1);
      expect(files[pageId][0]).toEqual(result);
    });

    it('should remove a data file from a page', () => {
      const pageId = 'test-page-1';
      const file = {
        pageId,
        filename: 'test.csv',
        tableName: 'test_table',
        schema: [],
        rowCount: 100,
        sizeBytes: 1024,
      };

      const added = store.set(addDataFileAtom, { pageId, file });
      
      let files = store.get(dataFilesAtom);
      expect(files[pageId]).toHaveLength(1);

      store.set(removeDataFileAtom, { pageId, fileId: added!.id });
      
      files = store.get(dataFilesAtom);
      expect(files[pageId]).toHaveLength(0);
    });

    it('should batch set all data files in one operation', () => {
      const pageId = 'test-page-1';
      const renderSpy = vi.fn();
      
      // Subscribe to changes
      store.sub(dataFilesAtom, renderSpy);
      
      const filesToSet: DataFile[] = [
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

      store.set(batchSetDataFilesAtom, { pageId, files: filesToSet });

      // Should only trigger one update
      expect(renderSpy).toHaveBeenCalledTimes(1);
      
      const files = store.get(dataFilesAtom);
      expect(files[pageId]).toHaveLength(2);
      expect(files[pageId][0].filename).toBe('data1.csv');
      expect(files[pageId][1].filename).toBe('data2.csv');
    });
  });

  describe('Derived Atoms', () => {
    it('should get current page messages based on activePageId', () => {
      const pageId = 'test-page-1';
      
      // Set active page
      store.set(activePageIdAtom, pageId);
      
      // Add messages to the page
      store.set(addMessageAtom, {
        pageId,
        message: { role: 'user', content: 'Test message', pageId },
      });

      const currentMessages = store.get(currentPageMessagesAtom);
      expect(currentMessages).toHaveLength(1);
      expect(currentMessages[0].content).toBe('Test message');

      // Change active page
      store.set(activePageIdAtom, 'different-page');
      const newMessages = store.get(currentPageMessagesAtom);
      expect(newMessages).toHaveLength(0);
    });

    it('should get current page data files based on activePageId', () => {
      const pageId = 'test-page-1';
      
      // Set active page
      store.set(activePageIdAtom, pageId);
      
      // Add file to the page
      store.set(addDataFileAtom, {
        pageId,
        file: {
          pageId,
          filename: 'test.csv',
          tableName: 'test_table',
          schema: [],
          rowCount: 100,
          sizeBytes: 1024,
        },
      });

      const currentFiles = store.get(currentPageDataFilesAtom);
      expect(currentFiles).toHaveLength(1);
      expect(currentFiles[0].filename).toBe('test.csv');
    });
  });

  describe('Compound Operations', () => {
    it('should reset all page data in one operation', () => {
      const pageId = 'test-page-1';
      const messageRenderSpy = vi.fn();
      const fileRenderSpy = vi.fn();
      
      // Subscribe to changes
      store.sub(messagesAtom, messageRenderSpy);
      store.sub(dataFilesAtom, fileRenderSpy);
      
      // Add data
      store.set(addMessageAtom, {
        pageId,
        message: { role: 'user', content: 'Test', pageId },
      });
      store.set(addDataFileAtom, {
        pageId,
        file: {
          pageId,
          filename: 'test.csv',
          tableName: 'test_table',
          schema: [],
          rowCount: 100,
          sizeBytes: 1024,
        },
      });

      // Reset render spy counts
      messageRenderSpy.mockClear();
      fileRenderSpy.mockClear();

      // Reset all data
      store.set(resetPageDataAtom, pageId);

      // Should trigger one update for each atom
      expect(messageRenderSpy).toHaveBeenCalledTimes(1);
      expect(fileRenderSpy).toHaveBeenCalledTimes(1);

      const messages = store.get(messagesAtom);
      const files = store.get(dataFilesAtom);
      
      expect(messages[pageId]).toEqual([]);
      expect(files[pageId]).toEqual([]);
    });
  });

  describe('UI State Atoms', () => {
    it('should manage sidebar open state', () => {
      // Default should be false (from storage)
      expect(store.get(isSidebarOpenAtom)).toBe(false);
      
      store.set(isSidebarOpenAtom, true);
      expect(store.get(isSidebarOpenAtom)).toBe(true);
      
      store.set(isSidebarOpenAtom, false);
      expect(store.get(isSidebarOpenAtom)).toBe(false);
    });

    it('should manage loading state', () => {
      expect(store.get(isLoadingAtom)).toBe(false);
      
      store.set(isLoadingAtom, true);
      expect(store.get(isLoadingAtom)).toBe(true);
    });

    it('should manage connection status', () => {
      expect(store.get(connectionStatusAtom)).toBe('disconnected');
      
      store.set(connectionStatusAtom, 'connecting');
      expect(store.get(connectionStatusAtom)).toBe('connecting');
      
      store.set(connectionStatusAtom, 'connected');
      expect(store.get(connectionStatusAtom)).toBe('connected');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large batch operations efficiently', () => {
      const pageId = 'test-page-1';
      const renderSpy = vi.fn();
      
      store.sub(messagesAtom, renderSpy);
      
      // Create 100 messages
      const messages = Array.from({ length: 100 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
        pageId,
      }));

      const start = performance.now();
      store.set(batchAddMessagesAtom, { pageId, messages });
      const end = performance.now();

      // Should be fast (under 50ms for 100 messages)
      expect(end - start).toBeLessThan(50);
      
      // Should only trigger one render
      expect(renderSpy).toHaveBeenCalledTimes(1);
      
      const storedMessages = store.get(messagesAtom);
      expect(storedMessages[pageId]).toHaveLength(100);
    });

    it('should not cause re-renders when updating unrelated pages', () => {
      const page1 = 'page-1';
      const page2 = 'page-2';
      const renderSpy = vi.fn();
      
      // Set active page and subscribe to current page messages
      store.set(activePageIdAtom, page1);
      store.sub(currentPageMessagesAtom, renderSpy);
      
      // Add message to page1 (should trigger render)
      store.set(addMessageAtom, {
        pageId: page1,
        message: { role: 'user', content: 'Page 1 message', pageId: page1 },
      });
      
      expect(renderSpy).toHaveBeenCalledTimes(1);
      renderSpy.mockClear();
      
      // Add message to page2 (should NOT trigger render)
      store.set(addMessageAtom, {
        pageId: page2,
        message: { role: 'user', content: 'Page 2 message', pageId: page2 },
      });
      
      expect(renderSpy).toHaveBeenCalledTimes(0);
    });
  });
});
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'jotai';
import {
  messagesAtom,
  dataFilesAtom,
  addMessageAtom,
  deleteMessageAtom,
  updateMessageAtom,
  addDataFileAtom,
  batchSetDataFilesAtom,
  type ChatMessage,
  type DataFile,
} from '../chat-atoms';

describe('Jotai Migration Verification', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  describe('ChatMessage Interface Completeness', () => {
    it('should support all role types including clarification and not-found', () => {
      const pageId = 'test-page';
      
      const roles: ChatMessage['role'][] = ['user', 'assistant', 'system', 'clarification', 'not-found'];
      
      roles.forEach(role => {
        const message = {
          role,
          content: `Test message with role ${role}`,
          pageId,
        };
        
        const result = store.set(addMessageAtom, { pageId, message });
        expect(result?.role).toBe(role);
      });
      
      const messages = store.get(messagesAtom);
      expect(messages[pageId]).toHaveLength(5);
    });

    it('should support clarification metadata', () => {
      const pageId = 'test-page';
      const message = {
        role: 'clarification' as const,
        content: 'Did you mean this file?',
        pageId,
        metadata: {
          clarificationData: {
            query: 'sales data',
            pendingMessage: 'Analyze the sales data',
            match: { file: {}, score: 0.7, confidence: 0.7 }
          }
        }
      };
      
      const result = store.set(addMessageAtom, { pageId, message });
      expect(result?.metadata?.clarificationData).toBeDefined();
      expect(result?.metadata?.clarificationData?.query).toBe('sales data');
    });

    it('should support not-found metadata', () => {
      const pageId = 'test-page';
      const testFile: DataFile = {
        id: 'file-1',
        pageId,
        filename: 'test.csv',
        tableName: 'test_table',
        schema: [],
        rowCount: 100,
        sizeBytes: 1024,
        uploadedAt: new Date(),
      };
      
      const message = {
        role: 'not-found' as const,
        content: 'Could not find the file',
        pageId,
        metadata: {
          notFoundData: {
            query: 'weather data',
            availableFiles: [testFile],
            suggestions: []
          }
        }
      };
      
      const result = store.set(addMessageAtom, { pageId, message });
      expect(result?.metadata?.notFoundData).toBeDefined();
      expect(result?.metadata?.notFoundData?.availableFiles).toHaveLength(1);
    });
  });

  describe('DataFile Interface Completeness', () => {
    it('should support all sync status properties', () => {
      const pageId = 'test-page';
      const file: Omit<DataFile, 'id' | 'uploadedAt'> = {
        pageId,
        filename: 'data.csv',
        tableName: 'data_table',
        schema: [{ name: 'col1', type: 'string' }],
        rowCount: 1000,
        sizeBytes: 10240,
        databaseId: 'db-123',
        syncStatus: 'syncing',
        storageUrl: 'https://storage.example.com/data.csv',
        parquetUrl: 'https://storage.example.com/data.parquet',
        source: 'cloud',
        cloudSyncFailed: false,
        restoreFailed: false,
      };
      
      const result = store.set(addDataFileAtom, { pageId, file });
      
      expect(result?.databaseId).toBe('db-123');
      expect(result?.syncStatus).toBe('syncing');
      expect(result?.source).toBe('cloud');
      expect(result?.cloudSyncFailed).toBe(false);
      expect(result?.restoreFailed).toBe(false);
    });

    it('should handle batch file updates', () => {
      const pageId = 'test-page';
      const files: DataFile[] = [
        {
          id: 'file-1',
          pageId,
          filename: 'file1.csv',
          tableName: 'table1',
          schema: [],
          rowCount: 100,
          sizeBytes: 1024,
          uploadedAt: new Date(),
          syncStatus: 'synced',
        },
        {
          id: 'file-2',
          pageId,
          filename: 'file2.csv',
          tableName: 'table2',
          schema: [],
          rowCount: 200,
          sizeBytes: 2048,
          uploadedAt: new Date(),
          syncStatus: 'failed',
        },
      ];
      
      store.set(batchSetDataFilesAtom, { pageId, files });
      
      const storedFiles = store.get(dataFilesAtom);
      expect(storedFiles[pageId]).toHaveLength(2);
      expect(storedFiles[pageId][0].syncStatus).toBe('synced');
      expect(storedFiles[pageId][1].syncStatus).toBe('failed');
    });
  });

  describe('New Actions', () => {
    it('should delete messages correctly', () => {
      const pageId = 'test-page';
      
      // Add multiple messages
      const msg1 = store.set(addMessageAtom, {
        pageId,
        message: { role: 'user', content: 'Message 1', pageId }
      });
      const msg2 = store.set(addMessageAtom, {
        pageId,
        message: { role: 'assistant', content: 'Message 2', pageId }
      });
      const msg3 = store.set(addMessageAtom, {
        pageId,
        message: { role: 'user', content: 'Message 3', pageId }
      });
      
      expect(store.get(messagesAtom)[pageId]).toHaveLength(3);
      
      // Delete middle message
      store.set(deleteMessageAtom, { pageId, messageId: msg2!.id });
      
      const remaining = store.get(messagesAtom)[pageId];
      expect(remaining).toHaveLength(2);
      expect(remaining[0].content).toBe('Message 1');
      expect(remaining[1].content).toBe('Message 3');
    });

    it('should handle update with new metadata types', () => {
      const pageId = 'test-page';
      
      const msg = store.set(addMessageAtom, {
        pageId,
        message: { role: 'user', content: 'Original', pageId }
      });
      
      store.set(updateMessageAtom, {
        pageId,
        messageId: msg!.id,
        updates: {
          role: 'clarification',
          metadata: {
            smartClarification: {
              message: 'Did you mean to analyze the sales data?',
              suggestions: ['Show sales by region', 'Show sales by month']
            }
          }
        }
      });
      
      const updated = store.get(messagesAtom)[pageId][0];
      expect(updated.role).toBe('clarification');
      expect(updated.metadata?.smartClarification).toBeDefined();
      expect(updated.metadata?.smartClarification?.suggestions).toHaveLength(2);
    });
  });

  describe('Performance: Batch Operations', () => {
    it('should handle large batch operations efficiently', () => {
      const pageId = 'test-page';
      const messageCount = 100;
      
      const messages = Array.from({ length: messageCount }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`,
        pageId,
      }));
      
      const start = performance.now();
      store.set(addMessageAtom, { pageId, message: messages[0] });
      const singleTime = performance.now() - start;
      
      const batchStart = performance.now();
      // This would use batchAddMessages in real scenario
      messages.slice(1).forEach(msg => {
        store.set(addMessageAtom, { pageId, message: msg });
      });
      const batchTime = performance.now() - batchStart;
      
      const stored = store.get(messagesAtom)[pageId];
      expect(stored).toHaveLength(messageCount);
      
      // Batch should not be significantly slower than single * count
      const expectedMaxTime = singleTime * messageCount * 2; // Allow 2x overhead
      expect(batchTime).toBeLessThan(expectedMaxTime);
    });
  });

  describe('Backward Compatibility', () => {
    it('should work with components expecting old interface', () => {
      const pageId = 'test-page';
      
      // Simulate old component passing minimal data
      const oldStyleMessage = {
        role: 'user' as const,
        content: 'Old style message',
        pageId,
      };
      
      const result = store.set(addMessageAtom, { pageId, message: oldStyleMessage });
      
      // Should add default id and timestamp
      expect(result?.id).toBeDefined();
      expect(result?.timestamp).toBeInstanceOf(Date);
      expect(result?.content).toBe('Old style message');
    });
    
    it('should handle files without new properties', () => {
      const pageId = 'test-page';
      
      // Old style file without sync properties
      const oldStyleFile = {
        pageId,
        filename: 'old.csv',
        tableName: 'old_table',
        schema: [],
        rowCount: 50,
        sizeBytes: 512,
      };
      
      const result = store.set(addDataFileAtom, { pageId, file: oldStyleFile });
      
      // Should work without sync properties
      expect(result?.filename).toBe('old.csv');
      expect(result?.syncStatus).toBeUndefined();
      expect(result?.databaseId).toBeUndefined();
    });
  });
});
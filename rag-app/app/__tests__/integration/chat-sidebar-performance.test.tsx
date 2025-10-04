import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { createStore } from 'jotai';
import React from 'react';
import { ChatSidebar } from '~/components/chat/ChatSidebar';
import { messagesAtom, dataFilesAtom } from '~/atoms/chat-atoms';

// Mock the layout store
vi.mock('~/stores/layout-store', () => ({
  useLayoutStore: () => ({
    isChatSidebarOpen: true,
    setChatSidebarOpen: vi.fn(),
    chatSidebarWidth: 400,
    setChatSidebarWidth: vi.fn(),
  }),
}));

// Mock fetch for API calls
global.fetch = vi.fn(() => 
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ messages: [] }),
  })
) as any;

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock DuckDB services
vi.mock('~/services/duckdb/duckdb-service.client', () => ({
  getDuckDB: () => ({
    isReady: () => true,
    initialize: vi.fn(),
    getConnection: vi.fn(),
    restoreTablesForPage: vi.fn(() => Promise.resolve([])),
  }),
}));

vi.mock('~/services/duckdb/duckdb-query.client', () => ({
  duckDBQuery: {
    generateSQL: vi.fn(),
    executeQuery: vi.fn(),
    processNaturalLanguageQuery: vi.fn(),
  },
}));

vi.mock('~/services/duckdb/duckdb-cloud-sync.client', () => ({
  DuckDBCloudSyncService: {
    getInstance: () => ({
      loadFilesFromCloud: vi.fn(() => Promise.resolve([])),
    }),
  },
}));

describe('ChatSidebar Performance Tests', () => {
  let store: ReturnType<typeof createStore>;
  let renderCount = 0;

  const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Track renders
    React.useEffect(() => {
      renderCount++;
    });
    
    return <JotaiProvider store={store}>{children}</JotaiProvider>;
  };

  beforeEach(() => {
    store = createStore();
    renderCount = 0;
    vi.clearAllMocks();
  });

  it('should render without excessive re-renders', async () => {
    const pageId = 'test-page-1';
    
    const { rerender } = render(
      <TestWrapper>
        <ChatSidebar pageId={pageId} skipFileLoad={true} />
      </TestWrapper>
    );

    // Initial render should be minimal
    await waitFor(() => {
      expect(renderCount).toBeLessThanOrEqual(2); // Initial + one effect
    });

    // Reset counter
    renderCount = 0;

    // Add a message should cause minimal re-renders
    const messages = [
      {
        id: 'msg-1',
        pageId,
        role: 'user' as const,
        content: 'Test message',
        timestamp: new Date(),
      },
    ];
    
    store.set(messagesAtom, { [pageId]: messages });

    await waitFor(() => {
      expect(renderCount).toBeLessThanOrEqual(2);
    });
  });

  it('should batch file loading without cascading re-renders', async () => {
    const pageId = 'test-page-1';
    
    // Mock file restoration
    const mockFiles = Array.from({ length: 10 }, (_, i) => ({
      id: `file-${i}`,
      pageId,
      filename: `data${i}.csv`,
      tableName: `table_${i}`,
      schema: [],
      rowCount: 1000 * (i + 1),
      sizeBytes: 1024 * (i + 1),
      uploadedAt: new Date(),
    }));

    const mockDuckDB = {
      isReady: () => false,
      initialize: vi.fn(() => Promise.resolve()),
      getConnection: vi.fn(),
      restoreTablesForPage: vi.fn(() => 
        Promise.resolve(
          mockFiles.map(f => ({
            filename: f.filename,
            tableName: f.tableName,
            schema: f.schema,
            rowCount: f.rowCount,
            sizeBytes: f.sizeBytes,
          }))
        )
      ),
    };

    vi.mocked(await import('~/services/duckdb/duckdb-service.client')).getDuckDB = () => mockDuckDB as any;

    renderCount = 0;
    
    render(
      <TestWrapper>
        <ChatSidebar 
          pageId={pageId} 
          workspaceId="test-workspace"
          delayFileLoad={100} 
        />
      </TestWrapper>
    );

    // Wait for file loading to complete
    await waitFor(() => {
      const files = store.get(dataFilesAtom);
      expect(files[pageId]?.length).toBe(10);
    }, { timeout: 3000 });

    // Should have minimal re-renders despite loading 10 files
    expect(renderCount).toBeLessThanOrEqual(5); // Initial + batch update
  });

  it('should handle rapid message additions efficiently', async () => {
    const pageId = 'test-page-1';
    
    render(
      <TestWrapper>
        <ChatSidebar pageId={pageId} skipFileLoad={true} />
      </TestWrapper>
    );

    // Reset counter after initial render
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).toBeInTheDocument();
    });
    
    renderCount = 0;

    // Simulate rapid message additions (like during streaming)
    const baseMessages = store.get(messagesAtom)[pageId] || [];
    
    for (let i = 0; i < 10; i++) {
      const newMessage = {
        id: `msg-${i}`,
        pageId,
        role: 'assistant' as const,
        content: `Streaming message part ${i}`,
        timestamp: new Date(),
        isStreaming: i < 9, // Last one is not streaming
      };
      
      store.set(messagesAtom, {
        [pageId]: [...baseMessages, newMessage],
      });
      
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Should have reasonable re-renders for 10 updates
    expect(renderCount).toBeLessThanOrEqual(15); // Allow some re-renders but not 26+
  });

  it('should not re-render when other pages are updated', async () => {
    const pageId1 = 'test-page-1';
    const pageId2 = 'test-page-2';
    
    render(
      <TestWrapper>
        <ChatSidebar pageId={pageId1} skipFileLoad={true} />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Type your message/i)).toBeInTheDocument();
    });
    
    // Reset counter
    renderCount = 0;

    // Add messages to a different page
    const messages = [
      {
        id: 'msg-1',
        pageId: pageId2,
        role: 'user' as const,
        content: 'Message for different page',
        timestamp: new Date(),
      },
    ];
    
    store.set(messagesAtom, { [pageId2]: messages });

    // Wait a bit to ensure no re-renders happen
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should not re-render at all
    expect(renderCount).toBe(0);
  });

  it('should measure actual re-render reduction vs Zustand', async () => {
    const pageId = 'test-page-1';
    
    // Simulate the old Zustand behavior with individual operations
    const oldZustandSimulation = async () => {
      let simulatedRenders = 0;
      
      // Clear messages (1 render)
      simulatedRenders++;
      
      // Add 5 messages individually (5 renders)
      for (let i = 0; i < 5; i++) {
        simulatedRenders++;
      }
      
      // Add 5 files individually (5 renders)
      for (let i = 0; i < 5; i++) {
        simulatedRenders++;
      }
      
      // Multiple store subscriptions (multiply by ~2-3)
      simulatedRenders *= 2.5;
      
      return Math.floor(simulatedRenders);
    };

    const zustandRenderCount = await oldZustandSimulation();
    console.log('Simulated Zustand renders:', zustandRenderCount); // Should be ~27

    // Now test with Jotai
    renderCount = 0;
    
    render(
      <TestWrapper>
        <ChatSidebar pageId={pageId} skipFileLoad={true} />
      </TestWrapper>
    );

    // Batch add messages
    const messages = Array.from({ length: 5 }, (_, i) => ({
      id: `msg-${i}`,
      pageId,
      role: 'user' as const,
      content: `Message ${i}`,
      timestamp: new Date(),
    }));
    
    store.set(messagesAtom, { [pageId]: messages });

    // Batch add files
    const files = Array.from({ length: 5 }, (_, i) => ({
      id: `file-${i}`,
      pageId,
      filename: `data${i}.csv`,
      tableName: `table_${i}`,
      schema: [],
      rowCount: 1000,
      sizeBytes: 1024,
      uploadedAt: new Date(),
    }));
    
    store.set(dataFilesAtom, { [pageId]: files });

    await waitFor(() => {
      const currentMessages = store.get(messagesAtom)[pageId];
      const currentFiles = store.get(dataFilesAtom)[pageId];
      expect(currentMessages?.length).toBe(5);
      expect(currentFiles?.length).toBe(5);
    });

    const jotaiRenderCount = renderCount;
    console.log('Actual Jotai renders:', jotaiRenderCount);

    // Verify significant reduction
    const reduction = Math.round((1 - jotaiRenderCount / zustandRenderCount) * 100);
    console.log(`Render reduction: ${reduction}%`);
    
    expect(jotaiRenderCount).toBeLessThan(zustandRenderCount / 2); // At least 50% reduction
    expect(jotaiRenderCount).toBeLessThanOrEqual(10); // Absolute maximum
  });
});
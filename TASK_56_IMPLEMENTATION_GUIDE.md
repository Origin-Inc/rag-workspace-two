# Task 56: Implementation Guide

## 1. Phase 1: Populate ChatMessage.metadata

### 1.1 Extend Chat Query Handler
**File**: `/app/routes/api.chat-query.tsx`

Current State:
- Executes SQL queries
- Formats results as markdown tables
- Returns response with query results

Changes Needed:
1. After query execution, store results in ChatMessage object
2. Call chart generator to check if visualization needed
3. Populate metadata field with:
   - queryIntent
   - generatedSQL
   - queryResults
   - generatedChart (if applicable)

**Example Code Pattern**:
```typescript
// In api.chat-query.tsx action function, after query execution:

const message = await prisma.chatMessage.create({
  data: {
    pageId,
    workspaceId,
    userId: user.id,
    role: 'assistant',
    content: formatQueryResultsAsMarkdown(queryResults),
    metadata: {
      queryIntent: 'data_visualization', // or from intent analyzer
      generatedSQL: sql,
      queryResults: {
        data: queryResults.rows,
        columns: queryResults.columns,
        rowCount: queryResults.rowCount
      },
      // Add chart generation result if applicable
      ...(shouldGenerateChart && {
        generatedChart: {
          type: chartResult.chartType,
          shouldChart: true,
          data: chartResult.chartData,
          title: chartResult.chartTitle,
          confidence: chartResult.confidence
        }
      })
    }
  }
});
```

### 1.2 Add Type Definitions
**File**: `/app/types/chat-metadata.ts` (new file)

```typescript
export interface ChatMessageMetadata {
  queryIntent?: 'data_visualization' | 'general_chat' | 'analysis' | 'rag_search';
  generatedSQL?: string;
  queryResults?: {
    data: any[];
    columns: string[];
    rowCount: number;
  };
  generatedChart?: {
    shouldChart: boolean;
    type?: 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'radar';
    data?: any;
    title?: string;
    description?: string;
    confidence?: number;
    reasoning?: string;
  };
  generatedTable?: {
    shouldTable: boolean;
    columns?: TableColumn[];
    rows?: any[];
    title?: string;
  };
  citations?: any[];
  sourceFiles?: string[];
}
```

---

## 2. Phase 2: Create Block Creation Endpoint

### 2.1 New API Route
**File**: `/app/routes/api.chat-message.$messageId.create-block.tsx`

Purpose: Convert ChatMessage with chart/table data into a Page block

```typescript
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { prisma } from '~/utils/db.server';
import { requireUser } from '~/services/auth/auth.server';
import { v4 as uuidv4 } from 'uuid';

export async function action({ request, params }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const user = await requireUser(request);
  const { messageId } = params;
  const { pageId } = await request.json();

  // 1. Get chat message with metadata
  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    include: { page: true }
  });

  if (!message || !message.metadata) {
    return json({ error: 'Message or metadata not found' }, { status: 404 });
  }

  // 2. Extract chart or table data from metadata
  const metadata = message.metadata as any;
  let blockType = 'text';
  let blockContent = { text: message.content };
  let blockHeight = 2;

  if (metadata.generatedChart?.shouldChart) {
    blockType = 'chart';
    blockContent = {
      chartType: metadata.generatedChart.type,
      data: metadata.generatedChart.data,
      title: metadata.generatedChart.title,
      description: metadata.generatedChart.description
    };
    blockHeight = 5;
  } else if (metadata.generatedTable?.shouldTable) {
    blockType = 'table';
    blockContent = {
      columns: metadata.generatedTable.columns,
      rows: metadata.generatedTable.rows,
      title: metadata.generatedTable.title
    };
    blockHeight = 6;
  }

  // 3. Calculate position (append to existing blocks)
  const page = await prisma.page.findUnique({
    where: { id: pageId }
  });

  let nextY = 0;
  if (page?.blocks && Array.isArray(page.blocks)) {
    const blocks = page.blocks as any[];
    if (blocks.length > 0) {
      nextY = Math.max(
        ...blocks.map(b => (b.position?.y || 0) + (b.position?.height || 1))
      ) + 1;
    }
  }

  // 4. Create block object
  const blockId = uuidv4();
  const newBlock = {
    id: blockId,
    type: blockType,
    content: blockContent,
    position: {
      x: 0,
      y: nextY,
      width: 12,
      height: blockHeight
    },
    metadata: {
      sourceMessageId: message.id,
      generatedAt: new Date().toISOString(),
      provenance: {
        isAIGenerated: true,
        confidence: metadata.generatedChart?.confidence || 
                   metadata.generatedTable?.confidence || 0.8,
        source: 'chat_query',
        query: message.content
      }
    }
  };

  // 5. Add block to page
  const currentBlocks = (page?.blocks || []) as any[];
  const updatedBlocks = [...currentBlocks, newBlock];

  const updatedPage = await prisma.page.update({
    where: { id: pageId },
    data: {
      blocks: updatedBlocks,
      updatedAt: new Date()
    }
  });

  return json({
    success: true,
    block: newBlock,
    page: updatedPage
  });
}
```

### 2.2 Update ChatMessage Record
Add field to track which block was created from message:

Consider adding to ChatMessage model (optional, for tracing):
```prisma
model ChatMessage {
  // ... existing fields
  generatedBlockId  String?     @map("generated_block_id") // Reference to block ID
}
```

Or just use metadata for simpler approach (recommended).

---

## 3. Phase 3: Connect UI Components

### 3.1 Update ChatMessage Component
**File**: `/app/components/chat/ChatMessage.tsx`

Add "Add to Page" button when message has chart/table:

```typescript
// Around line 100-150 in ChatMessage.tsx

// Modify the message rendering to add insert buttons:
function renderMessageContent(message: ChatMessageType) {
  const metadata = message.metadata as any;
  
  if (metadata?.generatedChart?.shouldChart) {
    return (
      <>
        <ChartOutputBlock
          type={metadata.generatedChart.type}
          data={metadata.generatedChart.data}
          title={metadata.generatedChart.title}
          onInsert={async () => {
            await handleAddToPage(message);
          }}
        />
      </>
    );
  }
  
  if (metadata?.generatedTable?.shouldTable) {
    return (
      <>
        <TableOutputBlock
          columns={metadata.generatedTable.columns}
          rows={metadata.generatedTable.rows}
          title={metadata.generatedTable.title}
          onInsert={async () => {
            await handleAddToPage(message);
          }}
        />
      </>
    );
  }
  
  // Default text rendering
  return <p>{message.content}</p>;
}

// Add handler function
async function handleAddToPage(message: ChatMessageType) {
  try {
    const response = await fetch(
      `/api/chat-message/${message.id}/create-block`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: currentPageId })
      }
    );

    if (!response.ok) {
      throw new Error('Failed to create block');
    }

    const { block } = await response.json();
    
    // Notify editor to refresh blocks
    onBlockCreated?.(block);
    
    // Show success message
    showNotification('Block added to page', 'success');
  } catch (error) {
    showNotification('Failed to add block', 'error');
  }
}
```

### 3.2 Refresh Editor After Block Creation
**File**: `/app/routes/editor.$pageId.tsx`

Add callback to reload blocks after creation:

```typescript
// In the editor component, add state management:

const [blocks, setBlocks] = useState<Block[]>([]);

// When block is created from chat, update state:
const handleBlockCreated = useCallback((newBlock: Block) => {
  setBlocks(prev => [...prev, newBlock]);
  
  // Optional: scroll editor to new block
  const blockElement = document.getElementById(`block-${newBlock.id}`);
  blockElement?.scrollIntoView({ behavior: 'smooth' });
}, []);

// Pass to ChatSidebar:
<ChatSidebar 
  onBlockCreated={handleBlockCreated}
  // ... other props
/>
```

---

## 4. Phase 4: Editor Integration

### 4.1 Load Chat-Generated Blocks
**File**: `/app/components/editor/EnhancedBlockEditor.tsx`

Ensure blocks from chat load correctly:

```typescript
// In useEffect that loads initial blocks:
useEffect(() => {
  if (page?.blocks) {
    // Initialize blocks from page.blocks JSON field
    const loadedBlocks = (page.blocks as any[]).map(block => ({
      id: block.id,
      type: block.type,
      content: block.content,
      position: block.position,
      metadata: block.metadata
    }));
    setBlocks(loadedBlocks);
  }
}, [page?.blocks]);
```

### 4.2 Handle Block Operations
Already exists in EnhancedBlockEditor, ensure it works with chat blocks:

- Edit block content
- Move block (drag-drop)
- Delete block
- Duplicate block

### 4.3 Persist Changes Back to Page
**File**: `/app/routes/editor.$pageId.tsx`

When blocks change, persist back to database:

```typescript
// Debounced save function
const debouncedSave = useCallback(
  debounce(async (updatedBlocks: Block[]) => {
    await fetch(`/api/pages/${pageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: updatedBlocks
      })
    });
  }, 1000),
  [pageId]
);

// In onChange handler:
<EnhancedBlockEditor
  initialBlocks={blocks}
  onChange={(updatedBlocks) => {
    setBlocks(updatedBlocks);
    debouncedSave(updatedBlocks);
  }}
/>
```

---

## 5. Testing Checklist

### Unit Tests
- [ ] ChatMessage.metadata populated correctly
- [ ] Block position calculation correct
- [ ] Block creation from metadata works
- [ ] Chart/table data formatting correct

### Integration Tests
- [ ] Chat query → metadata population → block creation flow
- [ ] Block appears in editor after creation
- [ ] Block position doesn't overlap existing blocks
- [ ] Multiple blocks can be created sequentially

### Manual Testing
- [ ] Execute data query in chat
- [ ] Click "Add to Page" on chart
- [ ] Verify block appears in editor at correct position
- [ ] Edit/move/delete block in editor
- [ ] Refresh page - block persists
- [ ] Test with different chart types
- [ ] Test with table output
- [ ] Test edge cases (empty results, large datasets, etc.)

---

## 6. Error Handling

### Key Error Cases to Handle

1. **No metadata on message**
   - Return error: "This message doesn't have data to add"

2. **Block position calculation fails**
   - Default to y: 0 and notify user of potential overlap

3. **Failed to create block**
   - Rollback, show error message, retry option

4. **Page not found**
   - Return 404, show user "Page was deleted"

5. **Concurrent block creation**
   - Use transaction to ensure position consistency

Example error handler:
```typescript
try {
  // block creation logic
} catch (error) {
  if (error.code === 'P2025') {
    return json({ error: 'Page not found' }, { status: 404 });
  }
  if (error.message.includes('position')) {
    // Position calculation error, use default
    newBlock.position = { x: 0, y: 0, width: 12, height: 5 };
  } else {
    return json({ error: 'Failed to create block' }, { status: 500 });
  }
}
```

---

## 7. Performance Considerations

### Optimization Points

1. **Large Query Results**
   - Limit displayed rows in chat (show first 10, indicate more available)
   - Store full dataset in block for export
   - Use pagination when rendering in editor

2. **Block Position Calculation**
   - Cache current max Y position
   - Use index instead of scanning all blocks

3. **Metadata Storage**
   - Consider compression for large datasets
   - Archive old messages periodically

4. **Editor Refresh**
   - Use optimistic updates
   - Batch multiple block operations
   - Use React.memo for block components

---

## 8. Type Safety

### Ensure Proper TypeScript Coverage

```typescript
// types/chat-message.ts
import type { Block } from '~/types/blocks';

export interface ChatMessageType {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  metadata?: ChatMessageMetadata;
  createdAt: Date;
}

export interface ChatMessageMetadata {
  queryIntent?: string;
  generatedSQL?: string;
  queryResults?: QueryResults;
  generatedChart?: GeneratedChart;
  generatedTable?: GeneratedTable;
}

export interface QueryResults {
  data: any[];
  columns: string[];
  rowCount: number;
}

export interface GeneratedChart {
  shouldChart: boolean;
  type?: ChartType;
  data?: ChartData;
  title?: string;
  confidence?: number;
}

// Then use these types in components and handlers
```

---

## 9. Documentation Updates Needed

1. **README**: Add section on block generation from chat
2. **API Docs**: Document new endpoints and data structures
3. **User Guide**: How to add chat results to page
4. **Developer Guide**: Architecture and data flow

---

## 10. Rollout Plan

### Week 1: Foundation
- [ ] Add type definitions
- [ ] Extend chat query handler to populate metadata
- [ ] Create block creation endpoint
- [ ] Unit tests for metadata and positioning

### Week 2: Integration
- [ ] Wire UI buttons in ChatMessage
- [ ] Integrate with EnhancedBlockEditor
- [ ] Add persist-to-database logic
- [ ] Integration tests

### Week 3: Polish & Testing
- [ ] Manual testing across scenarios
- [ ] Performance optimization
- [ ] Error handling edge cases
- [ ] Documentation

### Week 4: Deployment
- [ ] Code review
- [ ] Staging environment validation
- [ ] Production rollout
- [ ] User training


# ADR-003: Context Persistence Strategy

**Status**: Accepted
**Date**: 2025-10-07
**Authors**: Development Team
**Related Tasks**: #67, #72, #73, #74

---

## Context

### Problem Statement

The chat system currently lacks conversation memory, causing poor user experience:

1. **No Context Persistence**:
   - Conversation context stored in React state (`ConversationContextManager`)
   - Lost on page reload or browser refresh
   - No cross-session memory

2. **User Experience Issues**:
   - Users must re-reference files explicitly in every query
   - Cannot resume conversations after closing browser
   - No understanding of conversation history
   - **Example**: User asks "What's the revenue?" then "Show me the top 5" - system has no context that "top 5" relates to previous revenue query

3. **Missing Features**:
   - No conversation history
   - No active file tracking
   - No entity/topic recognition
   - No user preferences storage

4. **Current Implementation**:
   ```typescript
   // conversation-context-manager.ts (IN-MEMORY ONLY)
   export class ConversationContextManager {
     private context: ConversationContext = {
       activeFile: null,
       currentTopic: null,
       entities: {},
       queryHistory: []
     };
     // Lost on page reload!
   }
   ```

### Research Findings

**LangGraph Memory (2025)**: "LangGraph manages short-term memory as part of the agent's state, persisted via thread-scoped checkpoints, with state persisted to a database using a checkpointer so the thread can be resumed at any time."

**Spring AI (2025)**: "By default, Spring AI uses an in-memory repository to store messages (InMemoryChatMemoryRepository), which provides fast access but lacks persistence across sessions. If a different repository is already configured (e.g., Cassandra, JDBC, or Neo4j), Spring AI will use that instead."

**Context Window Management**: "A full history may not fit inside an LLM's context window, resulting in an irrecoverable error. Smart memory systems like Mem0 cut token costs by 80-90% while improving response quality by 26% vs basic chat history management."

**Industry Trend (2025)**: "Hybrid approaches combining database persistence with intelligent memory management strategies like summarization and selective fact extraction rather than simple in-memory or full database storage."

---

## Decision

We will implement **Database-Backed Context Persistence** with intelligent memory management, replacing the current in-memory-only approach.

### Architecture

```
┌────────────────────────────────────────┐
│   ChatSidebarPerformant (React)        │
│                                        │
│  1. Load context on mount              │
│  2. Update context on user interaction │
│  3. Save context on changes            │
└──────────────┬─────────────────────────┘
               │
┌──────────────▼─────────────────────────┐
│  ContextPersistenceService             │
│                                        │
│  - loadContext(pageId)                 │
│  - saveContext(pageId, context)        │
│  - updateActiveFile(pageId, fileId)    │
│  - addToHistory(pageId, query)         │
└──────────────┬─────────────────────────┘
               │
┌──────────────▼─────────────────────────┐
│        PostgreSQL Database             │
│                                        │
│  chat_contexts table                   │
│  query_history table                   │
└────────────────────────────────────────┘
```

### Database Schema (Task #72)

```sql
-- Chat context per page
CREATE TABLE chat_contexts (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,

  -- Active file tracking
  active_file_id TEXT,

  -- Conversation state
  current_topic TEXT,
  entities JSONB DEFAULT '{}',       -- {person: ["John", "Mary"], company: ["Acme"]}
  preferences JSONB DEFAULT '{}',    -- {display: "table", timezone: "UTC"}

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (active_file_id) REFERENCES data_files(id) ON DELETE SET NULL
);

-- Query history for U-shaped attention
CREATE TABLE query_history (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,

  -- Query details
  query TEXT NOT NULL,
  intent TEXT NOT NULL,           -- general_chat, data_query, hybrid
  sql TEXT,                        -- Generated SQL if data_query
  results JSONB,                   -- Query results

  -- Response
  response TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (page_id) REFERENCES pages(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_chat_contexts_page_id ON chat_contexts(page_id);
CREATE INDEX idx_query_history_page_id ON query_history(page_id);
CREATE INDEX idx_query_history_created_at ON query_history(created_at DESC);
```

### Context Management Strategy

#### 1. Short-Term Memory (Thread-Scoped)

Stored in `chat_contexts` table, includes:
- **Active File**: Currently referenced file
- **Current Topic**: What conversation is about
- **Entities**: Recognized people, companies, products
- **Preferences**: User's display/format preferences

#### 2. Query History (U-Shaped Attention Pattern)

Stored in `query_history` table:
- **Recent Queries**: Last 5-10 queries (recency bias)
- **Important Queries**: Flagged queries from earlier in conversation
- **Selective Retrieval**: Don't send all history, just relevant parts

**U-Shaped Pattern**:
```
[First 2 queries] + [Last 5 queries] + [Relevant middle queries]
```

This prevents context window overflow while maintaining conversation coherence.

### Implementation Components

#### 1. Database Schema (Task #72)

Create Prisma models and migration:

```prisma
model ChatContext {
  id            String   @id @default(cuid())
  pageId        String   @unique @map("page_id")
  workspaceId   String   @map("workspace_id")
  activeFileId  String?  @map("active_file_id")
  currentTopic  String?  @map("current_topic")
  entities      Json     @default("{}")
  preferences   Json     @default("{}")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  page          Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  activeFile    DataFile? @relation(fields: [activeFileId], references: [id], onDelete: SetNull)

  @@index([pageId])
  @@map("chat_contexts")
}

model QueryHistory {
  id        String   @id @default(cuid())
  pageId    String   @map("page_id")
  query     String
  intent    String
  sql       String?
  results   Json?
  response  String?
  createdAt DateTime @default(now()) @map("created_at")

  page      Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId])
  @@index([createdAt(sort: Desc)])
  @@map("query_history")
}
```

#### 2. ContextPersistenceService (Task #67)

```typescript
export class ContextPersistenceService {
  /**
   * Load context for a page (or create if doesn't exist)
   */
  async loadContext(pageId: string): Promise<ChatContext> {
    const context = await prisma.chatContext.findUnique({
      where: { pageId },
      include: { activeFile: true }
    });

    if (!context) {
      return this.createContext(pageId);
    }

    return {
      activeFile: context.activeFile,
      currentTopic: context.currentTopic,
      entities: context.entities as Record<string, string[]>,
      preferences: context.preferences as Record<string, any>
    };
  }

  /**
   * Save context updates
   */
  async saveContext(pageId: string, context: Partial<ChatContext>): Promise<void> {
    await prisma.chatContext.upsert({
      where: { pageId },
      update: {
        activeFileId: context.activeFile?.id,
        currentTopic: context.currentTopic,
        entities: context.entities,
        preferences: context.preferences,
        updatedAt: new Date()
      },
      create: {
        pageId,
        workspaceId: context.workspaceId!,
        activeFileId: context.activeFile?.id,
        currentTopic: context.currentTopic,
        entities: context.entities,
        preferences: context.preferences
      }
    });
  }

  /**
   * Add query to history
   */
  async addToHistory(
    pageId: string,
    query: string,
    intent: string,
    sql?: string,
    results?: any,
    response?: string
  ): Promise<void> {
    await prisma.queryHistory.create({
      data: {
        pageId,
        query,
        intent,
        sql,
        results,
        response
      }
    });
  }

  /**
   * Get recent query history (U-shaped pattern)
   */
  async getRecentHistory(pageId: string, limit: number = 10): Promise<QueryHistory[]> {
    return prisma.queryHistory.findMany({
      where: { pageId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}
```

#### 3. API Endpoints (Task #73)

```typescript
// GET /api/context/:pageId
export async function loader({ params }: LoaderFunctionArgs) {
  const context = await contextService.loadContext(params.pageId);
  return json({ context });
}

// POST /api/context/:pageId
export async function action({ request, params }: ActionFunctionArgs) {
  const updates = await request.json();
  await contextService.saveContext(params.pageId, updates);
  return json({ success: true });
}
```

#### 4. Chat Component Integration (Task #74)

```typescript
// ChatSidebarPerformant.tsx
function ChatSidebarPerformant({ pageId }: Props) {
  const [context, setContext] = useState<ChatContext | null>(null);

  // Load context on mount
  useEffect(() => {
    async function loadContext() {
      const response = await fetch(`/api/context/${pageId}`);
      const data = await response.json();
      setContext(data.context);
    }
    loadContext();
  }, [pageId]);

  // Save context on changes
  const saveContext = useCallback(async (updates: Partial<ChatContext>) => {
    await fetch(`/api/context/${pageId}`, {
      method: 'POST',
      body: JSON.stringify(updates)
    });
    setContext(prev => ({ ...prev, ...updates }));
  }, [pageId]);

  // Update active file when user uploads
  const handleFileUpload = async (file: File) => {
    const result = await uploadFile(file);
    await saveContext({ activeFile: result.dataFile });
  };
}
```

---

## Consequences

### Positive

1. **Persistent Conversations**
   - Users can close browser and resume later
   - Context survives page reloads
   - Cross-session memory

2. **Improved User Experience**
   - No need to re-reference files
   - Natural conversation flow
   - System "remembers" context
   - **Example**: "Show top 5" after "What's the revenue?" works correctly

3. **Intelligent Context Management**
   - U-shaped attention pattern prevents context overflow
   - Selective history reduces token costs
   - 80-90% cost reduction (research-backed)

4. **Audit Trail**
   - Full query history in database
   - Can analyze user patterns
   - Debug conversation issues

5. **Scalability**
   - Database handles large history
   - Efficient indexed queries
   - No memory leaks

### Negative

1. **Database Load**
   - Additional database writes
   - *Mitigation*: Debounced saves, only save on meaningful changes

2. **Increased Complexity**
   - More moving parts
   - *Mitigation*: Well-tested service, clear API

3. **Privacy Concerns**
   - Conversation history persisted
   - *Mitigation*: User controls, data retention policies

### Risks

1. **Context Staleness**
   - Database context might not match UI state
   - *Mitigation*: Optimistic UI updates, eventual consistency

2. **Performance**
   - Loading context on every page mount
   - *Mitigation*: Fast queries (<10ms), caching

3. **Data Migration**
   - Existing in-memory contexts will be lost
   - *Mitigation*: This is acceptable - no persistent contexts exist yet

---

## Alternatives Considered

### Alternative 1: LocalStorage Persistence

**Approach**: Store context in browser localStorage instead of database

**Pros**:
- No database overhead
- Fast access
- No backend changes needed

**Cons**:
- Not accessible across devices
- Size limits (5-10MB)
- No server-side access
- Can't analyze patterns
- **Rejected**: Doesn't support multi-device, no audit trail

### Alternative 2: Redis Cache Only

**Approach**: Store context in Redis with TTL

**Pros**:
- Very fast access
- Built-in expiration
- Simple implementation

**Cons**:
- Volatile storage
- Lost on Redis restart
- No permanent history
- **Rejected**: Need permanent persistence

### Alternative 3: Hybrid Redis + Database

**Approach**: Redis for hot data, database for cold storage

**Pros**:
- Fast reads from Redis
- Permanent storage in database
- Best of both worlds

**Cons**:
- Complex synchronization
- Cache invalidation complexity
- Over-engineering for MVP
- **Rejected**: Too complex for current needs, can add later

---

## Implementation Plan

### Phase 3 Tasks (Context Persistence)

1. **Task 72**: Create database schema
   - Add Prisma models
   - Generate migration
   - Add indexes

2. **Task 73**: Build API endpoints
   - GET /api/context/:pageId
   - POST /api/context/:pageId
   - Query history endpoints

3. **Task 74**: Update ChatSidebarPerformant
   - Load context on mount
   - Save context on changes
   - Wire active file tracking

4. **Task 67**: Build ContextPersistenceService
   - Database CRUD operations
   - U-shaped history retrieval
   - Entity extraction

### Success Criteria

- [ ] Context persists across page reloads
- [ ] Active file tracked correctly
- [ ] Query history stored in database
- [ ] U-shaped attention pattern implemented
- [ ] Context loads in <100ms
- [ ] No memory leaks from in-memory storage

---

## References

- [LangGraph Memory Management](https://langchain-ai.github.io/langgraph/concepts/memory/)
- [LLM Chat Memory Best Practices](https://www.vellum.ai/blog/how-should-i-manage-memory-for-my-llm-chatbot)
- [Chat History Summarization 2025](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)
- [Spring AI Chat Memory](https://docs.spring.io/spring-ai/reference/api/chat-memory.html)
- CHAT_REQUIREMENTS.md - Feature 4: Smart Context Management
- ARCHITECTURAL_ANALYSIS.md - Section 1.3: Missing Context Persistence

---

## Notes

This decision addresses a critical user pain point: "the chat now doesn't have context of the chat itself so when i am querying things i have to constantly keep explicitly reference a file, or context to get the response I want." Database-backed persistence enables the chat to maintain context across sessions, creating a much better user experience.

The U-shaped attention pattern and selective history retrieval are informed by 2025 research showing 80-90% token cost reductions while improving response quality.

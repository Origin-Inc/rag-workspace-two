# MVP Pivot Development Document
## Minimal Viable Product - Data Analytics Chat Interface

---

# Executive Summary

This document defines the **4-week MVP** for pivoting our RAG application into a data analytics platform. We focus exclusively on the core workflow: **upload data → ask questions → get analysis → add to page**.

**Core Value Proposition**: Users can upload CSV/Excel files, ask questions in natural language, and get instant analysis with visualizations - all through a chat interface that integrates with our block editor.

---

# 1. MVP Scope Definition

## What We're Building (4 Weeks)

✅ **INCLUDED**:
1. AI Chat Sidebar (single chat per page)
2. CSV/Excel file upload through chat
3. Natural language to SQL queries (DuckDB)
4. Basic data visualizations (Plotly.js)
5. Add results to page as blocks

❌ **NOT INCLUDED** (Future Releases):
- Multiple chat threads
- Python/ML predictions
- Document processing (PDFs)
- Web research
- Collaboration features
- Report templates
- Multi-agent orchestration
- Authentication improvements

---

# 2. Core User Workflow

## The ONE Workflow We Must Nail

```
1. User opens page with chat sidebar
2. Drags 3 CSV files into chat
3. Types: "Which product will sell most?"
4. AI analyzes data and shows result in chat
5. User clicks "Add to Page" 
6. Analysis appears as block on page
7. User asks: "Create a chart"
8. Chart appears in chat → Added to page
```

**Success Metric**: User can go from files to insights in under 2 minutes.

---

# 3. Technical Architecture (Simplified)

## MVP Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                   Browser                           │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│    Page Editor       │      AI Chat Sidebar        │
│                      │                              │
│  ┌──────────────┐   │   ┌────────────────────┐    │
│  │ Text Block   │   │   │  Chat Messages     │    │
│  ├──────────────┤   │   │  ┌──────────────┐  │    │
│  │ Data Block   │◄──┼───┤  │ AI: Results  │  │    │
│  ├──────────────┤   │   │  │ [Add to Page]│  │    │
│  │ Chart Block  │   │   │  └──────────────┘  │    │
│  └──────────────┘   │   ├────────────────────┤    │
│                      │   │  File Drop Zone    │    │
│  [+ Add Block]       │   ├────────────────────┤    │
│                      │   │  Chat Input        │    │
│                      │   └────────────────────┘    │
│                      │                              │
├──────────────────────┴──────────────────────────────┤
│                 DuckDB WASM Layer                   │
│         (SQL Processing - No Server Required)       │
└──────────────────────────────────────────────────────┘
                           │
                           ▼
              OpenAI API (Analysis & SQL Gen)
```

## Core Technologies (MVP Only)

| Component | Technology | Why |
|-----------|------------|-----|
| **Data Engine** | DuckDB WASM | SQL in browser, no backend |
| **Visualization** | Plotly.js | Interactive charts, easy integration |
| **AI** | OpenAI GPT-4 | Natural language → SQL |
| **Frontend** | React + Remix | Existing stack |
| **File Parsing** | PapaParse | Simple CSV parsing |

**Removed for MVP**: Pyodide, LangChain, Tavily, LlamaParse, AutoML

---

# 4. Data Flow

```typescript
// Simplified data flow
interface MVPDataFlow {
  // 1. File Upload
  uploadFile(file: File) → DuckDB Table
  
  // 2. User Query
  userQuestion: "Which product will sell most?"
  
  // 3. AI Processing
  OpenAI: question → SQL query
  DuckDB: execute SQL → results
  
  // 4. Response
  formatResults() → Chat Message
  
  // 5. Block Creation
  createBlock(results) → Page Block
}
```

---

# 5. MVP User Stories

## Story 1: Chat Sidebar
**As a** user  
**I want** a chat sidebar on my page  
**So that** I can interact with AI while seeing my content  

**Acceptance Criteria:**
- Sidebar opens/closes on right side
- Single chat per page
- Messages persist on page

**Tasks (3 days):**
- [ ] Create sidebar component
- [ ] Add message list UI
- [ ] Implement chat input
- [ ] Connect to OpenAI API

## Story 2: File Upload in Chat
**As a** user  
**I want to** upload CSV files in chat  
**So that** I can analyze my data  

**Acceptance Criteria:**
- Drag & drop CSV/Excel files
- Show file preview in chat
- Load into DuckDB automatically
- Display success message

**Tasks (2 days):**
- [ ] Add dropzone to chat
- [ ] Parse CSV with PapaParse
- [ ] Load into DuckDB WASM
- [ ] Show data preview

## Story 3: Natural Language Queries
**As a** user  
**I want to** ask questions in plain English  
**So that** I don't need to know SQL  

**Acceptance Criteria:**
- Type question in chat
- AI converts to SQL
- Execute query on uploaded data
- Show results in chat

**Tasks (3 days):**
- [ ] Create prompt for SQL generation
- [ ] Execute DuckDB queries
- [ ] Format results for display
- [ ] Handle errors gracefully

## Story 4: Basic Visualizations
**As a** user  
**I want to** see charts of my data  
**So that** I can understand patterns  

**Acceptance Criteria:**
- Request chart in chat
- AI picks appropriate chart type
- Display interactive Plotly chart
- Resize and interact with chart

**Tasks (2 days):**
- [ ] Integrate Plotly.js
- [ ] Create chart type selector
- [ ] Generate chart config from data
- [ ] Display in chat message

## Story 5: Add to Page
**As a** user  
**I want to** add AI results to my page  
**So that** I can build documents  

**Acceptance Criteria:**
- "Add to Page" button on results
- Creates appropriate block type
- Maintains formatting
- Can edit after adding

**Tasks (2 days):**
- [ ] Create block generation logic
- [ ] Add insertion UI
- [ ] Map chat content to blocks
- [ ] Enable block editing

---

# 6. Implementation Plan (4 Weeks)

## Week 1: Foundation
**Goal**: Basic chat sidebar with DuckDB

Day 1-2: Setup
- [ ] Install DuckDB WASM
- [ ] Create chat sidebar component
- [ ] Setup OpenAI integration

Day 3-5: File Upload
- [ ] Implement file upload UI
- [ ] CSV parsing with PapaParse
- [ ] Load data into DuckDB
- [ ] Display data preview

## Week 2: AI Analysis
**Goal**: Natural language queries working

Day 1-2: SQL Generation
- [ ] Create SQL generation prompts
- [ ] Test with sample queries
- [ ] Handle multiple tables

Day 3-5: Query Execution
- [ ] Execute DuckDB queries
- [ ] Format results
- [ ] Error handling
- [ ] Display in chat

## Week 3: Visualizations
**Goal**: Charts from data

Day 1-2: Plotly Integration
- [ ] Setup Plotly.js
- [ ] Create chart components
- [ ] Basic chart types (bar, line, scatter)

Day 3-5: AI Chart Selection
- [ ] Auto-select chart type
- [ ] Generate chart config
- [ ] Display in chat
- [ ] Interactive features

## Week 4: Polish & Integration
**Goal**: Complete flow working smoothly

Day 1-2: Add to Page
- [ ] Block generation from chat
- [ ] Insert into page editor
- [ ] Block editing

Day 3-4: Testing
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Bug fixes

Day 5: Launch Prep
- [ ] Documentation
- [ ] Deployment setup
- [ ] User guide

---

# 7. MVP Data Models

```prisma
// Minimal models for MVP

model ChatMessage {
  id        String   @id @default(cuid())
  pageId    String
  role      String   // user, assistant
  content   String   @db.Text
  metadata  Json?    // For block generation
  createdAt DateTime @default(now())
  
  @@index([pageId])
}

model DataFile {
  id        String   @id @default(cuid())
  pageId    String
  filename  String
  tableName String   // DuckDB table name
  rowCount  Int
  columns   Json     // Column names and types
  createdAt DateTime @default(now())
  
  @@index([pageId])
}

// Existing Block model extended
model Block {
  // ... existing fields
  generatedFromChat Boolean @default(false)
  chatMessageId     String?
}
```

---

# 8. API Endpoints (Minimal)

```typescript
// Only essential endpoints for MVP

// Chat
POST /api/chat/message     // Send message, get response
GET  /api/chat/:pageId     // Get chat history

// Data
POST /api/data/upload      // Upload file, create DuckDB table
POST /api/data/query       // Execute SQL query

// Blocks
POST /api/blocks/from-chat // Create block from chat message
```

---

# 9. Sample Implementation

## Core Chat Component

```typescript
export function ChatSidebar({ pageId }: { pageId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<DataFile[]>([]);
  
  const handleFileUpload = async (file: File) => {
    // 1. Parse CSV
    const data = await parseCSV(file);
    
    // 2. Load into DuckDB
    const table = await loadIntoDuckDB(data, file.name);
    
    // 3. Add to chat
    addMessage({
      role: 'system',
      content: `Loaded ${file.name}: ${data.length} rows, ${Object.keys(data[0]).length} columns`
    });
  };
  
  const handleQuery = async (question: string) => {
    // 1. Generate SQL with OpenAI
    const sql = await generateSQL(question, files);
    
    // 2. Execute query
    const results = await duckdb.query(sql);
    
    // 3. Display results
    addMessage({
      role: 'assistant',
      content: formatResults(results),
      metadata: { 
        type: 'data',
        sql,
        results,
        canAddToPage: true
      }
    });
  };
  
  const addToPage = (message: Message) => {
    const block = createBlockFromMessage(message);
    insertBlock(pageId, block);
  };
  
  return (
    <div className="w-96 h-full border-l">
      <FileDropzone onUpload={handleFileUpload} />
      <MessageList messages={messages} onAddToPage={addToPage} />
      <ChatInput onSubmit={handleQuery} />
    </div>
  );
}
```

## DuckDB Integration

```typescript
class DuckDBService {
  private db: Database;
  
  async initialize() {
    const DUCKDB_CONFIG = {
      query: { castBigIntToDouble: true }
    };
    
    const bundle = await duckdb.selectBundle(DUCKDB_CONFIG);
    const worker = new Worker(bundle.mainWorker);
    this.db = new duckdb.Database(new duckdb.ConsoleLogger(), worker);
  }
  
  async loadCSV(data: any[], tableName: string) {
    const conn = await this.db.connect();
    
    // Create table from JSON data
    await conn.insertJSONFromPath(tableName, data);
    
    // Return schema
    const schema = await conn.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = '${tableName}'`
    );
    
    return { tableName, schema };
  }
  
  async query(sql: string) {
    const conn = await this.db.connect();
    const result = await conn.query(sql);
    return result.toArray();
  }
}
```

---

# 10. Success Criteria

## MVP Launch Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first insight | <2 min | User testing |
| File upload success | >95% | Error tracking |
| Query success rate | >80% | Log analysis |
| Add to page success | 100% | User feedback |

## User Feedback Goals
- 10 beta users testing the workflow
- 80% can complete the core workflow
- Average satisfaction score >7/10
- Clear list of next features to build

---

# 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| DuckDB browser limits | High | Test with large files early, set limits |
| SQL generation accuracy | Medium | Provide query preview, allow editing |
| Complex data relationships | Medium | Start with single table queries |
| Browser memory | Low | Limit file size to 50MB initially |

---

# 12. Post-MVP Roadmap

**Month 2**: Enhanced Analysis
- Multiple chat threads
- Python support (Pyodide)
- Advanced visualizations
- Join detection

**Month 3**: Intelligence Layer
- Multi-agent system
- Predictive analytics
- Report generation
- Web research

**Month 4**: Enterprise Features
- Collaboration
- Scheduled reports
- API connections
- Security features

---

# 13. Development Checklist

## Pre-Development
- [ ] Set up DuckDB WASM build
- [ ] Test Plotly.js integration
- [ ] Verify OpenAI API access
- [ ] Create test datasets

## Week 1 Deliverables
- [ ] Working chat sidebar
- [ ] File upload functional
- [ ] Data preview in chat
- [ ] DuckDB queries working

## Week 2 Deliverables
- [ ] Natural language → SQL
- [ ] Query results display
- [ ] Error handling
- [ ] Multiple file support

## Week 3 Deliverables
- [ ] Chart generation
- [ ] 3+ chart types
- [ ] Interactive features
- [ ] Chart in chat display

## Week 4 Deliverables
- [ ] Add to page working
- [ ] Full workflow tested
- [ ] Performance acceptable
- [ ] Ready for beta users

---

# 14. Technical Decisions

## Why These Choices

**DuckDB WASM vs Server-side**
- ✅ No infrastructure needed
- ✅ Instant queries (no network)
- ✅ Data privacy (stays in browser)
- ✅ Scales with users automatically

**Single Chat vs Multiple**
- ✅ Simpler state management
- ✅ Faster to implement
- ✅ Less confusing for users
- ✅ Can add multiple threads later

**Plotly.js vs D3.js**
- ✅ Faster implementation
- ✅ Built-in interactivity
- ✅ Good React integration
- ✅ Professional appearance

---

# Conclusion

This MVP focuses on **one workflow done exceptionally well**. In 4 weeks, users will be able to upload data, ask questions, and get insights - all through a familiar chat interface that integrates seamlessly with our block editor.

**The goal is not features, but a smooth, delightful experience that validates our pivot direction.**

---

**Document Version**: MVP-1.0  
**Timeline**: 4 Weeks  
**Team Size**: 1-2 Developers  
**Budget**: ~$15,000  
**Status**: READY TO START
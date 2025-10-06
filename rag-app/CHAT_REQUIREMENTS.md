# Chat System Requirements

## Core Features

### 1. Data Analysis on CSV/Excel (BROKEN - Priority 1)
**Status**: Currently broken, used to work

**Requirements**:
- Upload CSV/Excel files with full validation
- Run queries and analysis operations:
  - **Summaries**: Basic stats (count, min, max, mean, median, mode, std dev)
  - **Column averages**: Numeric column aggregations (SUM, AVG, COUNT)
  - **Aggregations**: GROUP BY operations (sum by category, count by region, etc.)
  - **Filtering**: WHERE clauses (records where revenue > 50000)
  - **Sorting**: ORDER BY operations (top 10 customers by sales)
  - **SQL-like operations**: Full DuckDB SQL support
- Previously implemented with DuckDB running in browser via WASM
- Must be fixed immediately

**Detailed User Flows**:

#### Flow 1: Basic Analysis
1. User clicks upload button (Plus icon in chat input)
2. File picker opens, shows only CSV/Excel files (others greyed out)
3. User selects `sales_2024.csv`
4. System validates file:
   - Check file size (< 50MB)
   - Check file type (CSV or Excel only)
   - Parse headers and sample data
5. System loads file into DuckDB in-browser
6. System creates table with proper schema inference
7. Upload success message: "File 'sales_2024.csv' uploaded successfully! (1,250 rows, 8 columns)"
8. File appears in chat sidebar file list
9. User asks: "What's the average revenue?"
10. System:
    - Recognizes this is a data query
    - Identifies column 'revenue' in sales_2024.csv
    - Generates SQL: `SELECT AVG(revenue) FROM sales_2024`
    - Executes via DuckDB
    - Gets result: `45230.50`
    - Sends to OpenAI: "The average revenue is $45,230.50"
11. Response displayed in chat with context about the data source

#### Flow 2: Complex Multi-Step Analysis
1. User uploads `sales_2024.csv` (has columns: date, region, product, revenue, units)
2. User asks: "Show me total sales by region"
3. System generates SQL:
   ```sql
   SELECT region,
          SUM(revenue) as total_revenue,
          SUM(units) as total_units
   FROM sales_2024
   GROUP BY region
   ORDER BY total_revenue DESC
   ```
4. Executes and returns tabular results
5. User follows up: "Which region had the most growth?"
6. System:
   - Remembers we're analyzing sales_2024
   - Needs to compare time periods
   - Generates SQL with date filtering
   - Calculates growth percentages
   - Returns analysis with reasoning

#### Flow 3: Error Handling
1. User asks: "What's the average price?"
2. No files uploaded yet
3. System recognizes data query but no data available
4. Response: "I don't have any data to analyze yet. Please upload a CSV or Excel file first."
5. User uploads file with no 'price' column
6. User asks: "What's the average price?"
7. System:
   - Checks schema, no 'price' column found
   - Available columns: date, region, revenue, units
   - Response: "I don't see a 'price' column in your data. The available columns are: date, region, revenue, units. Did you mean 'revenue'?"

**Technical Implementation Details**:
- **DuckDB WASM**: Client-side query execution (no backend needed for queries)
- **Schema Inference**: Auto-detect column types from sample data
- **Query Generation**: LLM generates SQL from natural language
- **Result Streaming**: For large result sets, stream results back
- **Error Recovery**: Graceful handling of malformed queries, missing columns
- **Performance**: Query timeout (10 seconds max), row limit (10,000 rows max for display)

**Data Types Supported**:
- Text/String columns
- Numeric columns (integers, decimals)
- Date/DateTime columns (parsed from various formats)
- Boolean columns
- NULL handling

**Query Capabilities**:
- SELECT with multiple columns
- WHERE filtering (AND, OR, NOT, IN, BETWEEN, LIKE)
- GROUP BY aggregations
- ORDER BY sorting
- LIMIT/OFFSET pagination
- JOIN operations (if multiple files uploaded)
- Subqueries
- CASE WHEN conditional logic
- Window functions (ROW_NUMBER, RANK, etc.)

---

### 2. Graph Generation (Future Feature)
**Status**: Not yet implemented

**Requirements**:
- Create visualizations from data analysis results
- Generate charts and graphs from query results
- Intelligent chart type selection based on data
- Interactive and customizable visualizations
- Export capabilities (PNG, SVG, PDF)

**Supported Chart Types**:

#### Basic Charts
- **Bar Charts**: Categorical comparisons (sales by region, products by category)
- **Line Graphs**: Time series data (revenue over months, user growth)
- **Pie Charts**: Percentage breakdowns (market share, budget allocation)
- **Scatter Plots**: Correlation analysis (price vs sales, age vs income)

#### Advanced Charts
- **Stacked Bar Charts**: Multi-category comparisons
- **Grouped Bar Charts**: Side-by-side comparisons
- **Area Charts**: Cumulative trends over time
- **Heatmaps**: Two-dimensional data density
- **Box Plots**: Distribution and outliers
- **Histograms**: Frequency distributions
- **Bubble Charts**: Three-variable relationships

**Detailed User Flows**:

#### Flow 1: Automatic Chart Generation
1. User uploads sales data
2. User asks: "Show me sales by region"
3. System executes query, gets results:
   ```
   North: $125,000
   South: $98,000
   East: $142,000
   West: $111,000
   ```
4. System recognizes this is categorical comparison data
5. Automatically suggests: "I'll show this as a bar chart"
6. Generates interactive bar chart
7. Chart displays in chat with:
   - Title: "Sales by Region"
   - Axis labels
   - Value tooltips on hover
   - Legend
   - Export button

#### Flow 2: Explicit Chart Request
1. User has query results displayed as table
2. User asks: "Show this as a line graph"
3. System:
   - Checks if data is suitable for line graph (needs time/ordered axis)
   - If suitable: generates line graph
   - If not suitable: suggests alternative: "This data works better as a bar chart. Would you like to see it that way?"
4. User can confirm or request different chart type

#### Flow 3: Chart Customization
1. User generates bar chart
2. User asks: "Make the bars blue and add a trend line"
3. System updates chart styling
4. User asks: "Sort by highest to lowest"
5. System re-queries data with ORDER BY DESC
6. Updates chart with new ordering

#### Flow 4: Multiple Charts from Same Data
1. User uploads monthly sales data
2. User asks: "Show me sales trends and product breakdown"
3. System generates TWO charts:
   - Line graph: Sales over time
   - Pie chart: Sales by product category
4. Both charts displayed as separate blocks
5. User can drag either into editor independently

**Technical Implementation Details**:

**Chart Library Selection** (to be decided):
- **Option 1: Chart.js** - Simple, lightweight, good for basic charts
- **Option 2: Recharts** - React-native, composable, good for interactive charts
- **Option 3: D3.js** - Maximum flexibility, steeper learning curve
- **Option 4: Plotly.js** - Professional quality, rich interactions

**Data Processing Pipeline**:
```
Query Results
    ↓
Data Transformer (format for charting library)
    ↓
Chart Type Selector (analyze data shape, user preference)
    ↓
Chart Generator (create visualization)
    ↓
Chart Renderer (display in chat as block)
    ↓
Export Handler (PNG, SVG, PDF download)
```

**Chart Configuration**:
- **Auto-generated titles** from query context
- **Smart axis labels** from column names
- **Color schemes** matching app theme (light/dark mode)
- **Responsive sizing** adapts to container
- **Accessibility** keyboard navigation, screen reader support

**Interactive Features**:
- **Tooltips**: Hover to see exact values
- **Zoom**: Pan and zoom on large datasets
- **Legend**: Click to show/hide series
- **Export**: Download as image or PDF
- **Data Table Toggle**: Switch between chart and raw data view

**Error Handling**:
- Insufficient data points (< 2 data points for most charts)
- Mismatched data types (trying to chart text fields)
- Too many categories (> 50 categories clutters charts)
- Missing required fields (time series without dates)

**Performance Considerations**:
- **Data point limits**: Max 1,000 points rendered at once
- **Aggregation for large datasets**: Auto-aggregate if > 1,000 points
- **Lazy loading**: Only render chart when scrolled into view
- **Caching**: Cache rendered charts to avoid re-computation

---

### 3. Block-Based Responses (Future Feature)
**Status**: Not yet implemented

**Requirements**:
- Chat responses structured as blocks matching editor block system
- Each response is draggable/droppable
- Seamless integration between chat and editor
- Maintain formatting, data, and interactivity when dragged
- Support all block types: text, tables, charts, code, images

**Block Types for Chat Responses**:

#### Text Blocks
- **Markdown text**: Formatted with headings, lists, emphasis
- **Code blocks**: Syntax-highlighted code snippets
- **Quote blocks**: Highlighted insights or key findings
- **Callout blocks**: Warnings, tips, important notes

#### Data Blocks
- **Table blocks**: Query results as editable tables
- **Chart blocks**: Interactive visualizations
- **Stat blocks**: Key metrics (cards showing single values)
- **Comparison blocks**: Side-by-side data comparisons

#### Interactive Blocks
- **Query blocks**: Re-runnable SQL queries
- **Filter blocks**: Data filters that update visualizations
- **Formula blocks**: Calculated fields and expressions

**Detailed User Flows**:

#### Flow 1: Basic Text Response Drag
1. User asks: "Explain what a JOIN is in SQL"
2. Chat generates markdown response with code examples
3. Response renders as a text block in chat (with drag handle icon)
4. User hovers over block → drag handle appears
5. User drags block to editor
6. Visual feedback: drag preview, drop zones highlight
7. User drops into editor between existing blocks
8. Block inserted at drop location
9. Block maintains all formatting (markdown, code highlighting)
10. User can now edit, format, or delete like any editor block

#### Flow 2: Data Table Drag
1. User asks: "Show me top 10 customers by revenue"
2. System executes query, returns 10 rows
3. Response renders as interactive table block in chat:
   - Sortable columns
   - Scrollable if needed
   - Drag handle visible
4. User drags table to editor
5. Table drops into editor with:
   - All data preserved
   - Sorting/filtering still works
   - Can add formulas or new columns
   - Can re-query to refresh data
6. Table becomes live document data that can be referenced

#### Flow 3: Chart Drag
1. User asks: "Show sales trends over time"
2. System generates line chart block
3. Chart displayed in chat with:
   - Interactive tooltips
   - Legend
   - Zoom controls
   - Drag handle
4. User drags chart to editor
5. Chart drops as fully interactive block:
   - Still zoomable/interactive
   - Can be resized in editor
   - Can be edited (change colors, labels)
   - Data source linked (updates if data changes)
6. Chart becomes part of the document

#### Flow 4: Multiple Block Drag
1. User asks complex question: "Analyze sales data and compare regions"
2. System generates multi-block response:
   - Text block: Executive summary
   - Table block: Raw data by region
   - Chart block: Visual comparison
   - Text block: Key insights
3. Each block has individual drag handle
4. User can drag:
   - All blocks together (drag the parent container)
   - Individual blocks separately
5. Blocks maintain relationships (chart linked to table data)

#### Flow 5: Block Reference (Advanced)
1. User drags table block from chat to editor
2. Table gets unique ID: `block_abc123`
3. Later, user asks in chat: "Create a chart from block_abc123"
4. System:
   - Recognizes reference to existing editor block
   - Reads data from that block
   - Generates chart using that data
5. Chart can reference the table block
6. If table data changes, chart can auto-update

**Technical Implementation Details**:

**Block Schema Integration**:
```typescript
interface ChatBlock {
  id: string;
  type: 'text' | 'table' | 'chart' | 'code' | 'stat' | 'query';
  content: BlockContent;
  metadata: {
    source: 'chat' | 'user';
    query?: string;          // Original query that generated this
    timestamp: Date;
    dataSource?: string[];   // File IDs used for this block
  };
  editorCompatible: true;    // Can be dragged to editor
  interactive?: boolean;     // Has interactive features
  draggable: boolean;
}
```

**Drag-and-Drop Implementation**:

Using HTML5 Drag and Drop API:
```typescript
// Chat block (draggable)
<div
  draggable={true}
  onDragStart={(e) => {
    e.dataTransfer.setData('application/x-chat-block', JSON.stringify(block));
    e.dataTransfer.effectAllowed = 'copy';
  }}
>
  {/* Block content */}
</div>

// Editor drop zone (accepts blocks)
<div
  onDragOver={(e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }}
  onDrop={(e) => {
    const blockData = e.dataTransfer.getData('application/x-chat-block');
    const block = JSON.parse(blockData);
    insertBlockAtPosition(block, dropPosition);
  }}
>
  {/* Editor content */}
</div>
```

**Visual Feedback**:
- **Drag Handle**: Icon appears on hover (⋮⋮ or ⠿)
- **Drag Preview**: Semi-transparent copy follows cursor
- **Drop Zones**: Highlight valid drop locations in editor
- **Drop Indicator**: Blue line showing exact insertion point
- **Invalid Drop**: Red indicator if drop location not allowed

**Block Conversion**:
When dragging from chat to editor:
1. Serialize chat block to JSON
2. Validate block type supported by editor
3. Convert any chat-specific properties to editor schema
4. Generate new block ID for editor
5. Preserve data references and relationships
6. Insert at drop location
7. Update editor state
8. Persist to database

**Data Synchronization**:
- **One-way sync**: Chat blocks are snapshots (don't update if source data changes)
- **Two-way sync** (optional): Blocks can reference live data
- **Reference tracking**: Know which editor blocks came from which queries
- **Refresh capability**: Re-run original query to update block

**Performance Considerations**:
- **Large tables**: Only drag schema + sample rows, lazy-load full data
- **Complex charts**: Serialize as configuration + data references
- **Memory**: Limit number of draggable blocks in chat history
- **Persistence**: Save dragged blocks to database immediately

**Accessibility**:
- **Keyboard navigation**: Tab to focus blocks, Space to start drag
- **Screen readers**: Announce drag start/end, drop locations
- **Visual indicators**: High contrast drag handles and drop zones
- **Alternative**: "Copy to editor" button as fallback

**Error Handling**:
- **Failed drag**: If drop fails, show error and keep block in chat
- **Invalid block type**: Warn user that block type not supported in editor
- **Data too large**: Offer to summarize or filter before drag
- **Network error**: Cache block locally for retry

---

### 4. Smart Context Management (BROKEN - Priority 1)
**Status**: Currently broken

**Problems**:
- Chat has NO context memory between queries
- Users must explicitly reference files in every query
- No conversation continuity
- Every query treated as completely isolated
- Context lost on page reload
- Multiple chats interfere with each other

**Requirements**:
- Maintain conversation context across queries
- Remember uploaded files and previous analysis
- Understand implicit references
- Persist context to database (survives page reload)
- Isolate context per chat/page
- Track query history for better understanding
- Smart reference resolution

**Context Components to Track**:

#### File Context
- **Uploaded files**: Which files available in this chat
- **Active file**: Last file referenced or uploaded
- **File metadata**: Schemas, row counts, column names
- **File relationships**: If user uploaded related files (2023 vs 2024 data)

#### Conversation Context
- **Query history**: Last N queries and responses
- **Current topic**: What the user is analyzing
- **Named entities**: Companies, products, regions mentioned
- **Temporal context**: Time periods being discussed

#### Analysis Context
- **Last query result**: Previous SQL query and results
- **Computed values**: Derived metrics or calculations
- **Visualizations**: Charts or tables generated
- **User preferences**: Chart types, formatting choices

**Detailed User Flows**:

#### Flow 1: Multi-Turn Data Analysis (Should Work)
```
User: [uploads sales_2024.csv with columns: date, region, product, revenue, units]
System: "File uploaded successfully! (1,250 rows, 5 columns: date, region, product, revenue, units)"

Context stored:
{
  files: [{ id: 'file123', name: 'sales_2024.csv', schema: [...] }],
  activeFile: 'file123',
  queryHistory: [],
  topic: null
}

User: "What's the average revenue?"
System processes:
  1. Checks context → activeFile is sales_2024.csv
  2. Knows to query this file even though not explicitly named
  3. Generates SQL: SELECT AVG(revenue) FROM sales_2024
  4. Returns: "The average revenue is $45,230.50"

Context updated:
{
  files: [...],
  activeFile: 'file123',
  queryHistory: [
    { query: "What's the average revenue?", sql: "SELECT AVG...", result: 45230.50 }
  ],
  topic: 'revenue_analysis'
}

User: "What about by region?"
System processes:
  1. Checks context → last query was about revenue
  2. Understands "what about" means extend previous query
  3. Knows to GROUP BY region based on file schema
  4. Generates SQL: SELECT region, AVG(revenue) FROM sales_2024 GROUP BY region
  5. Returns table of regions with average revenue

Context updated:
{
  queryHistory: [
    { query: "What's the average revenue?", ... },
    { query: "What about by region?", sql: "SELECT region...", result: [...] }
  ],
  topic: 'revenue_by_region'
}

User: "Show me only the top 3"
System processes:
  1. Checks context → last query returned regions
  2. Understands "top 3" means highest values
  3. Adds ORDER BY revenue DESC LIMIT 3 to previous query
  4. Returns: Top 3 regions by revenue

User: "Compare that to last year"
System processes:
  1. Checks context → currently analyzing sales_2024.csv
  2. Understands "last year" means 2023 data
  3. Checks files → no 2023 file uploaded
  4. Response: "I don't have 2023 data yet. Would you like to upload sales_2023.csv to compare?"

User: [uploads sales_2023.csv]
System processes:
  1. Loads file
  2. Recognizes similar schema to sales_2024.csv
  3. Auto-detects this is related historical data
  4. Response: "Great! I can now compare 2024 vs 2023. The 2024 average revenue is $45,230 vs $41,800 in 2023, a 8.2% increase."

Context updated:
{
  files: [
    { id: 'file123', name: 'sales_2024.csv', timePeriod: '2024' },
    { id: 'file124', name: 'sales_2023.csv', timePeriod: '2023' }
  ],
  relationships: [
    { type: 'temporal_comparison', files: ['file123', 'file124'] }
  ],
  topic: 'year_over_year_comparison'
}
```

#### Flow 2: Current Broken Behavior
```
User: [uploads sales_2024.csv]
System: "File uploaded successfully!"

Context: {} // EMPTY - NOT STORED

User: "What's the average revenue?"
System processes:
  1. Checks context → EMPTY
  2. Doesn't know what file to query
  3. Returns: "I don't have any data to analyze yet. Please upload a file."

// This is WRONG - file was just uploaded!

User: "What's the average revenue in sales_2024.csv?"
System processes:
  1. Explicit file name mentioned
  2. Might work IF system can find file by name
  3. Returns result

User: "What about by region?"
System processes:
  1. Checks context → STILL EMPTY
  2. Doesn't know "what" refers to revenue analysis
  3. Doesn't know which file to query
  4. Returns: "What would you like to know about by region?"

// User has to start over every time
```

#### Flow 3: Context Persistence Across Page Reloads
```
Session 1:
User: [uploads data, runs 5 queries, gets insights]
Context stored: { files: [...], queryHistory: [...], topic: 'sales_trends' }

User: [closes browser]

Session 2 (hours later):
User: [returns to same page/chat]
System: [loads context from database]
  - Restores file references
  - Restores query history
  - Knows previous topic
System: "Welcome back! You were analyzing sales trends. Would you like to continue?"

User: "Yes, show me the chart again"
System: [knows which chart from context, regenerates it]
```

**Technical Implementation**:

**Context Storage Schema**:
```typescript
interface ChatContext {
  id: string;
  pageId: string;                    // Which page/chat this belongs to
  userId: string;

  // File context
  files: Array<{
    id: string;
    filename: string;
    uploadedAt: Date;
    schema: ColumnSchema[];
    rowCount: number;
    sampleData?: any[];
  }>;

  activeFileId?: string;              // Currently focused file

  // Conversation context
  queryHistory: Array<{
    query: string;
    timestamp: Date;
    intent: 'data_analysis' | 'general' | 'visualization';
    sql?: string;
    results?: any;
    responseId: string;
  }>;

  // Topic tracking
  currentTopic?: string;              // 'revenue_analysis', 'customer_segmentation'
  topicStartedAt?: Date;

  // Entity extraction
  entities: {
    companies?: string[];
    products?: string[];
    regions?: string[];
    dates?: string[];
  };

  // Relationships
  fileRelationships?: Array<{
    type: 'temporal' | 'category' | 'related';
    fileIds: string[];
  }>;

  // User preferences
  preferences: {
    defaultChartType?: 'bar' | 'line' | 'pie';
    dateFormat?: string;
    numberFormat?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}
```

**Context Persistence**:
```typescript
// Database table
CREATE TABLE chat_contexts (
  id UUID PRIMARY KEY,
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),

  -- Stored as JSONB for flexibility
  files JSONB NOT NULL DEFAULT '[]',
  active_file_id UUID,
  query_history JSONB NOT NULL DEFAULT '[]',
  current_topic TEXT,
  topic_started_at TIMESTAMP,
  entities JSONB NOT NULL DEFAULT '{}',
  file_relationships JSONB NOT NULL DEFAULT '[]',
  preferences JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  UNIQUE(page_id)  -- One context per page
);

-- Index for fast lookups
CREATE INDEX idx_chat_contexts_page_id ON chat_contexts(page_id);
CREATE INDEX idx_chat_contexts_user_id ON chat_contexts(user_id);
```

**Context Management Service**:
```typescript
class ContextManagementService {
  // Load context when chat initializes
  async loadContext(pageId: string): Promise<ChatContext> {
    const context = await db.chatContext.findUnique({ where: { pageId } });
    return context || this.createEmptyContext(pageId);
  }

  // Update context after each interaction
  async updateContext(pageId: string, updates: Partial<ChatContext>): Promise<void> {
    await db.chatContext.upsert({
      where: { pageId },
      update: { ...updates, updatedAt: new Date() },
      create: { pageId, ...updates }
    });
  }

  // Add query to history
  async addQueryToHistory(pageId: string, query: QueryRecord): Promise<void> {
    const context = await this.loadContext(pageId);
    const updatedHistory = [...context.queryHistory, query];

    // Keep only last 20 queries to limit size
    if (updatedHistory.length > 20) {
      updatedHistory.shift();
    }

    await this.updateContext(pageId, { queryHistory: updatedHistory });
  }

  // Register file upload
  async addFile(pageId: string, file: FileMetadata): Promise<void> {
    const context = await this.loadContext(pageId);
    await this.updateContext(pageId, {
      files: [...context.files, file],
      activeFileId: file.id  // New upload becomes active
    });
  }

  // Resolve implicit file references
  resolveFileReference(query: string, context: ChatContext): string | null {
    // If query doesn't mention file name, use activeFile
    if (!this.mentionsFileName(query) && context.activeFileId) {
      return context.activeFileId;
    }

    // Try to extract file name from query
    const mentionedFile = this.extractFileName(query, context.files);
    if (mentionedFile) {
      return mentionedFile.id;
    }

    // Default to active file
    return context.activeFileId || null;
  }

  // Extract topic from conversation
  async updateTopic(pageId: string, query: string, response: string): Promise<void> {
    // Use LLM to extract topic
    const topic = await this.extractTopic(query, response);
    await this.updateContext(pageId, {
      currentTopic: topic,
      topicStartedAt: new Date()
    });
  }

  // Clear context (user requests fresh start)
  async clearContext(pageId: string): Promise<void> {
    await db.chatContext.delete({ where: { pageId } });
  }
}
```

**Smart Reference Resolution**:
```typescript
class ReferenceResolver {
  // Resolve pronouns and implicit references
  resolveReferences(query: string, context: ChatContext): ResolvedQuery {
    // "it" "that" "this" → refer to last mentioned entity
    // "the file" → activeFile
    // "the data" → last queried file
    // "last year" → temporal reference

    return {
      originalQuery: query,
      resolvedQuery: this.substituteReferences(query, context),
      resolvedEntities: {
        files: this.resolveFileReferences(query, context),
        columns: this.resolveColumnReferences(query, context),
        values: this.resolveValueReferences(query, context)
      }
    };
  }
}
```

**Performance Optimization**:
- **Context caching**: Keep hot contexts in Redis
- **Lazy loading**: Load full query history only when needed
- **Compression**: Compress old query results
- **Pruning**: Auto-delete contexts older than 30 days with no activity

---

### 5. Intelligent Query Routing (MISSING - Priority 2)
**Status**: Not implemented

**Requirements**:
- System must intelligently determine query intent
- Route to appropriate handler based on query type
- Don't force data analysis on general questions
- Graceful fallback when routing is uncertain
- Learn from user corrections

**Query Intent Categories**:

#### 1. General Conversation (OpenAI Direct)
**Characteristics**:
- No mention of data, files, or analysis
- Conversational queries
- Knowledge questions
- Creative requests
- Personal interaction

**Examples**:
- "How are you doing?"
- "Tell me a scary story"
- "What's the weather like in Tokyo?"
- "Explain quantum physics to a 10-year-old"
- "Write me a poem about AI"
- "What's the capital of France?"
- "Help me brainstorm marketing ideas"

**Handler**: Direct OpenAI API call
- No data context needed
- Full conversational ability
- No file access
- General knowledge base

**Response Format**: Conversational text block

#### 2. Data Analysis (DuckDB + OpenAI)
**Characteristics**:
- References data, files, columns
- Uses analysis keywords (average, sum, filter, show, calculate)
- Asks about uploaded files
- Requests computations or queries

**Examples**:
- "What's the average price?"
- "Show me sales trends over time"
- "Filter records where revenue > 50000"
- "Compare Q1 vs Q2 performance"
- "Summarize this data"
- "How many customers are there?"
- "Group sales by region"

**Handler**: DuckDB Query Pipeline
1. Check context for available files
2. Generate SQL query from natural language
3. Execute query in DuckDB
4. Format results
5. Send to OpenAI for interpretation
6. Return formatted response with data

**Response Format**: Table or stat block + interpretation

#### 3. Visualization Requests (DuckDB + Chart Generation)
**Characteristics**:
- Asks for charts, graphs, or visual representation
- Uses visualization keywords (show, chart, graph, plot, visualize)
- May follow data analysis query

**Examples**:
- "Show me a chart of sales by month"
- "Visualize the revenue distribution"
- "Graph the growth trends"
- "Plot price vs quantity"
- "Create a pie chart of market share"

**Handler**: Query + Visualization Pipeline
1. Execute data query (if needed)
2. Analyze data shape for appropriate chart type
3. Generate chart configuration
4. Render interactive visualization
5. Optionally add AI interpretation

**Response Format**: Chart block + optional description

#### 4. Hybrid Queries (Analysis + Deep Reasoning)
**Characteristics**:
- Asks "why" or "how" about data
- Requests patterns, insights, or explanations
- Combines computation with interpretation

**Examples**:
- "Explain why sales dropped in March"
- "What patterns do you see in this data?"
- "Why are customers churning?"
- "How can we improve conversion rates based on this data?"
- "What factors correlate with high revenue?"

**Handler**: Enhanced Analysis Pipeline
1. Execute multiple queries to gather evidence
2. Perform statistical analysis
3. Identify correlations and patterns
4. Send comprehensive results to OpenAI
5. Request deeper reasoning and insights

**Response Format**: Multi-block response (data + charts + insights)

#### 5. Meta/System Queries (Context Management)
**Characteristics**:
- Asks about available data or system state
- Requests file information or status
- System configuration questions

**Examples**:
- "What files do I have uploaded?"
- "Show me the columns in this dataset"
- "What can I analyze?"
- "Clear my conversation history"
- "What data types are supported?"

**Handler**: System Information
- Query chat context
- Return file metadata
- Provide system capabilities

**Response Format**: Informational text

**Detailed User Flows**:

#### Flow 1: General Conversation (No Data)
```
User: "Tell me a joke about programmers"

System:
  1. Classify intent → GENERAL_CONVERSATION
  2. Check for data references → NONE
  3. Route to → OpenAI Direct Handler
  4. No context needed except conversation history

Response: [conversational text]
"Why do programmers prefer dark mode? Because light attracts bugs! 🐛"
```

#### Flow 2: Data Analysis Query
```
User: "What's the average revenue?"

System:
  1. Classify intent → DATA_ANALYSIS
  2. Check context → Has files: [sales_2024.csv]
  3. Identify entities:
     - Metric: "average"
     - Column: "revenue"
     - File: sales_2024.csv (from context)
  4. Route to → DuckDB Query Handler
  5. Generate SQL: SELECT AVG(revenue) FROM sales_2024
  6. Execute query → Result: 45230.50
  7. Send to OpenAI with context:
     "The user asked about average revenue.
      Query result: 45230.50
      Provide a clear answer."

Response: [stat block + text]
"The average revenue is $45,230.50 across 1,250 transactions."
```

#### Flow 3: Mixed Intent (Starts General, Then Data)
```
User: "Good morning! Can you help me analyze my sales data?"

System:
  1. Classify intent → MIXED (greeting + data analysis intent)
  2. Detect intent transition
  3. Route to → Hybrid Handler
     - Respond to greeting (general)
     - Prompt for specific analysis (data awareness)

Response:
"Good morning! I'd be happy to help analyze your sales data. You have sales_2024.csv uploaded with 1,250 rows. What would you like to know? For example, I can show you:
  - Sales trends over time
  - Top performing products
  - Regional breakdowns
  - Revenue summaries"

User: "Show me sales trends"

System:
  1. Context: User wants trends from sales_2024.csv
  2. Classify → VISUALIZATION
  3. Route to → Query + Chart Handler
  ...
```

#### Flow 4: Ambiguous Query Resolution
```
User: "What's the total?"

System:
  1. Classify intent → DATA_ANALYSIS (probably)
  2. But query is AMBIGUOUS:
     - Total of what column?
     - Which file?
  3. Check context:
     - Last query was about revenue
     - Active file: sales_2024.csv
  4. Infer: User probably means "total revenue"
  5. Confirm with user:

Response:
"I'll calculate the total revenue from sales_2024.csv. Is that correct?"

[Shows result but offers to clarify if wrong]

OR if context is insufficient:

Response:
"I can calculate totals, but I need to know:
  - Which column? (revenue, units, etc.)
  - From which file? (sales_2024.csv)"
```

#### Flow 5: Intent Correction
```
User: "Show me everything about machine learning"

System:
  1. Classify intent → DATA_ANALYSIS (keyword "show me")
  2. Check context → Has files uploaded
  3. Route to → Data Handler
  4. Searches for "machine learning" column → NOT FOUND

Response:
"I don't see 'machine learning' in your data. Available columns are: date, region, product, revenue, units.

Did you mean to ask a general question about machine learning? I can answer that too!"

User: "Yes, explain machine learning"

System:
  1. Re-classify → GENERAL_CONVERSATION
  2. Route to → OpenAI Direct
  3. Provide educational response about ML
```

**Technical Implementation**:

**Intent Classifier Service**:
```typescript
class IntentClassifier {
  async classifyQuery(
    query: string,
    context: ChatContext
  ): Promise<QueryIntent> {
    // Multi-stage classification

    // Stage 1: Rule-based quick classification
    const rulesResult = this.applyRules(query, context);
    if (rulesResult.confidence > 0.9) {
      return rulesResult.intent;
    }

    // Stage 2: LLM-based classification for ambiguous cases
    const llmResult = await this.llmClassify(query, context);
    return llmResult.intent;
  }

  private applyRules(query: string, context: ChatContext): ClassificationResult {
    // Data analysis keywords
    const dataKeywords = [
      'average', 'sum', 'total', 'count', 'filter', 'show',
      'group', 'sort', 'calculate', 'find', 'how many'
    ];

    // Visualization keywords
    const vizKeywords = [
      'chart', 'graph', 'plot', 'visualize', 'show me a'
    ];

    // General conversation indicators
    const generalIndicators = [
      'how are you', 'tell me', 'explain', 'what is',
      'write', 'create', 'help me brainstorm'
    ];

    // Check for file references
    const mentionsFile = context.files.some(f =>
      query.toLowerCase().includes(f.filename.toLowerCase())
    );

    // Check for column references
    const mentionsColumn = context.files.some(f =>
      f.schema.some(col =>
        query.toLowerCase().includes(col.name.toLowerCase())
      )
    );

    // Rule logic
    if (mentionsFile || mentionsColumn) {
      if (vizKeywords.some(kw => query.toLowerCase().includes(kw))) {
        return { intent: 'VISUALIZATION', confidence: 0.95 };
      }
      return { intent: 'DATA_ANALYSIS', confidence: 0.9 };
    }

    if (vizKeywords.some(kw => query.toLowerCase().includes(kw)) && context.files.length > 0) {
      return { intent: 'VISUALIZATION', confidence: 0.85 };
    }

    if (dataKeywords.some(kw => query.toLowerCase().includes(kw)) && context.files.length > 0) {
      return { intent: 'DATA_ANALYSIS', confidence: 0.8 };
    }

    if (generalIndicators.some(ind => query.toLowerCase().startsWith(ind))) {
      return { intent: 'GENERAL', confidence: 0.85 };
    }

    // Default to general if no files uploaded
    if (context.files.length === 0) {
      return { intent: 'GENERAL', confidence: 0.7 };
    }

    // Ambiguous - use LLM
    return { intent: 'UNKNOWN', confidence: 0.5 };
  }

  private async llmClassify(
    query: string,
    context: ChatContext
  ): Promise<ClassificationResult> {
    const prompt = `Classify this query into one of these intents:
    - GENERAL: General conversation, no data analysis needed
    - DATA_ANALYSIS: Querying or analyzing uploaded data
    - VISUALIZATION: Requesting a chart or graph
    - HYBRID: Asking "why" or "how" about data patterns
    - META: System information request

    User query: "${query}"

    Available files: ${context.files.map(f => f.filename).join(', ')}
    Recent queries: ${context.queryHistory.slice(-3).map(q => q.query).join('; ')}

    Respond with JSON: { "intent": "...", "confidence": 0.0-1.0, "reasoning": "..." }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    });

    return JSON.parse(response.choices[0].message.content);
  }
}
```

**Query Router**:
```typescript
class QueryRouter {
  constructor(
    private intentClassifier: IntentClassifier,
    private generalHandler: GeneralChatHandler,
    private dataAnalysisHandler: DataAnalysisHandler,
    private visualizationHandler: VisualizationHandler,
    private hybridHandler: HybridAnalysisHandler
  ) {}

  async route(query: string, context: ChatContext): Promise<Response> {
    // Classify intent
    const { intent, confidence } = await this.intentClassifier.classifyQuery(query, context);

    // Log for monitoring
    console.log(`[QueryRouter] Intent: ${intent}, Confidence: ${confidence}`);

    // Route to appropriate handler
    switch (intent) {
      case 'GENERAL':
        return this.generalHandler.handle(query, context);

      case 'DATA_ANALYSIS':
        if (context.files.length === 0) {
          return this.handleNoData(query);
        }
        return this.dataAnalysisHandler.handle(query, context);

      case 'VISUALIZATION':
        return this.visualizationHandler.handle(query, context);

      case 'HYBRID':
        return this.hybridHandler.handle(query, context);

      case 'META':
        return this.handleMeta(query, context);

      default:
        // Low confidence - ask user to clarify
        return this.requestClarification(query, confidence);
    }
  }

  private handleNoData(query: string): Response {
    return {
      role: 'assistant',
      content: "I don't have any data to analyze yet. Please upload a CSV or Excel file first, and I'll help you analyze it!"
    };
  }

  private requestClarification(query: string, confidence: number): Response {
    return {
      role: 'assistant',
      content: `I'm not sure if you want me to:
        1. Analyze your uploaded data
        2. Just chat generally

        Can you clarify what you'd like me to help with?`
    };
  }
}
```

**Performance Optimization**:
- **Rule-based first**: 90% of queries classified instantly
- **LLM fallback**: Only for ambiguous cases
- **Caching**: Cache intent classifications for similar queries
- **Learning**: Track user corrections to improve rules

**User Experience**:
- **Transparent routing**: Show user which handler was used (in debug mode)
- **Easy correction**: "Actually, I meant..." re-routes query
- **Confidence threshold**: If confidence < 0.7, ask user to clarify
- **Graceful degradation**: If routing fails, default to general chat

---

## Architectural Constraints

### Must Support All Features Without Major Rewrites
- Design system to be extensible
- Clear separation of concerns
- Plugin-like architecture for new features

### Clear Separation: General Chat vs Data Analysis
- Separate handlers for different query types
- Don't mix concerns
- Data analysis should be optional, not forced

### Maintain Conversation Context/Memory
- Persistent context store per chat session
- Track uploaded files
- Remember previous queries and results
- Context should survive page reloads

### Route Intelligently Based on Query Type
- Intent classification before processing
- Graceful fallback if routing fails
- User can override routing if needed

### Generate Responses as Structured Blocks
- All responses should have block structure
- Even simple text responses should be blocks
- Enables future drag-and-drop functionality

---

## Current Problems Summary

### Priority 1 (Broken - Must Fix Immediately)
1. **Data analysis not working** - DuckDB integration broken
2. **No conversation context** - Every query is isolated
3. **File upload validation issues** - PDF removal incomplete

### Priority 2 (Missing - Should Implement Soon)
1. **Intelligent routing** - All queries treated as data queries
2. **Context persistence** - Context lost on page reload
3. **Error handling** - Poor UX when things fail

### Priority 3 (Future Features)
1. **Graph generation** - Visualizations not yet implemented
2. **Block-based responses** - Drag-and-drop not yet implemented
3. **Advanced analysis** - Joins, complex queries, etc.

---

## Success Criteria

### Data Analysis Working
- [ ] Upload CSV/Excel file successfully
- [ ] Query: "What's the average of column X?" returns correct result
- [ ] Query: "Show me records where Y > 100" returns filtered data
- [ ] Query: "Summarize this data" provides statistical summary
- [ ] No errors in console or Vercel logs

### Context Management Working
- [ ] Upload file once, reference it in multiple queries
- [ ] Follow-up questions work without re-stating context
- [ ] Context persists across page reloads (saved to database)
- [ ] User can ask "what files do I have?" and get accurate list

### Intelligent Routing Working
- [ ] "Tell me a joke" → Gets general AI response (no data analysis attempted)
- [ ] "What's the average price?" → Runs data analysis (if file uploaded)
- [ ] System doesn't error on general questions
- [ ] System doesn't try to analyze data that doesn't exist

### Block-Based Responses Working (Future)
- [ ] Chat responses render as editor blocks
- [ ] Can drag response from chat to editor
- [ ] Dropped blocks integrate with editor seamlessly
- [ ] Block types: text, table, graph, code

### Graph Generation Working (Future)
- [ ] Query results can be visualized
- [ ] "Show this as a bar chart" generates chart
- [ ] Charts are interactive
- [ ] Charts can be dragged to editor as blocks

---

## Technical Architecture Notes

### Current State Issues
- **File upload scattered across 3 components** (ChatInput, ChatSidebarPerformant, FileUploadZone)
- **No shared services** - Every component reimplements upload logic
- **DuckDB integration exists but broken** - Not properly connected to chat flow
- **No context persistence layer** - Context only in React state, lost on reload
- **No routing logic** - All queries go through same path

### Required Architecture Components

#### 1. Shared Services Layer
- **FileUploadService** - Single source of truth for file uploads
- **FileValidationService** - Validation logic used everywhere
- **DuckDBService** - Data query execution
- **ContextManagementService** - Conversation context persistence
- **QueryRoutingService** - Intent classification and routing

#### 2. Chat Message Pipeline
```
User Query
    ↓
QueryRoutingService.classify()
    ↓
    ├→ General Chat → OpenAI Direct
    ├→ Data Query → DuckDBService → OpenAI Interpretation
    └→ Hybrid → DuckDB + Deep Reasoning
    ↓
Response Formatting (as Block)
    ↓
Context Update (persist conversation state)
    ↓
Display to User
```

#### 3. Context Persistence
- Store conversation context in database
- Schema: `chat_contexts` table
  - pageId
  - conversationHistory
  - uploadedFiles
  - queryHistory
  - lastUpdated
- Load context on chat init
- Update context after each interaction

#### 4. Block Response Format
- All responses use editor block schema
- Types: text, table, graph, code, analysis
- Metadata: source query, timestamp, data references
- Enables future drag-and-drop

---

## Implementation Priority

### Phase 0: Fix Current Broken Features
1. Fix file upload validation (PDF removal)
2. Fix DuckDB data analysis integration
3. Restore basic query functionality

### Phase 1: Context Management
1. Create ContextManagementService
2. Implement conversation persistence
3. Update chat to use context

### Phase 2: Intelligent Routing
1. Create QueryRoutingService
2. Implement intent classification
3. Route general vs data queries

### Phase 3: Architectural Refactor
1. Create shared services layer
2. Refactor components to use shared services
3. Remove duplicate implementations

### Phase 4: Block-Based Responses
1. Update response format to blocks
2. Implement drag-and-drop
3. Integration with editor

### Phase 5: Graph Generation
1. Choose charting library
2. Implement graph generation from query results
3. Add graph blocks to response types

---

## Open Questions

1. **Context Storage**: Database vs Redis vs Local Storage?
2. **Intent Classification**: Rule-based vs ML vs LLM?
3. **Block Schema**: Extend existing editor blocks or new schema?
4. **Graph Library**: Chart.js vs D3.js vs Recharts?
5. **DuckDB Location**: Browser WASM vs Server-side?

---

## Notes

- This document defines the WHAT, not the HOW
- Architecture must be designed to support all features
- Refactoring should happen BEFORE adding new features
- Proper architecture prevents duplicate implementations
- Context management is critical to good UX

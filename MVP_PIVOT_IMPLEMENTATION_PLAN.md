# MVP PIVOT IMPLEMENTATION PLAN
## Decision-First Collaborative RAG Workspace

### Executive Summary
Based on comprehensive research and analysis, this plan restructures the existing tasks to deliver a focused MVP that demonstrates collaborative, RAG-grounded AI within editable blocks. The pivot leverages 65% of existing code while adding critical new components.

## Research-Based Technology Decisions

### 1. File Ingestion: Papa Parse (CSV) + SheetJS (Excel)
- **CSV:** Papa Parse - industry leader with 700k weekly downloads, handles gigabyte files
- **Excel:** SheetJS - 3x faster than ExcelJS for parsing, evaluates formulas to values
- **Implementation:** Web workers for both, unified processing pipeline
- **Performance:** Papa Parse 2x faster for CSV, SheetJS 3x faster for Excel

### 2. AI Block Architecture: Coda-Style Context References
- **Pattern:** @-reference any page/table for context (proven by Coda AI)
- **Implementation:** Inline chat with Space hotkey activation
- **Scope Management:** Page (default) or @global for workspace context

### 3. LLM Orchestration: OpenAI Structured Outputs
- **Reliability:** 100% JSON schema compliance with strict mode (vs 35.9% with prompting)
- **Pattern:** Two-tier approach - Planner LLM → Analytics/RAG → Generator LLM
- **Implementation:** Constrained decoding with deterministic output

### 4. Provenance System: Evidence-First Design
- **Approach:** Every AI output includes top-N retrieved references
- **Storage:** Dedicated provenance tables with passage IDs and excerpts
- **UI:** Small provenance indicators on generated blocks with expandable details

## Phase-Based Implementation (8 Weeks Total)

### PHASE 1: Foundation & Simplification (Weeks 1-2)
**Goal:** Simplify existing components and prepare foundation

#### Week 1: Core Simplifications
1. **Simplify Database Block → Dataset Block**
   - Remove complex views (Kanban, Calendar, Timeline)
   - Keep only table preview (10 rows max)
   - Add "Analyze" button that prefills AI block
   - Make read-only (no editing capabilities)

2. **Strip Formula Engine**
   - Remove all formula-related code
   - Simplify column system to basic types only
   - Remove virtual scrolling (not needed for 10 rows)

3. **Create Dataset Schema**
   ```sql
   CREATE TABLE datasets (
     id UUID PRIMARY KEY,
     workspace_id UUID REFERENCES workspaces(id),
     page_id UUID REFERENCES pages(id),
     name TEXT NOT NULL,
     source_type TEXT CHECK (source_type IN ('csv', 'gsheet')),
     schema JSONB NOT NULL,
     stats JSONB,
     sample_rows JSONB,
     row_count INTEGER,
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

#### Week 2: File Ingestion Infrastructure
4. **Implement Dual-Format File Ingestion**
   ```typescript
   // app/services/file-ingestion.server.ts
   class FileIngestionService {
     async ingestFile(file: File, options: IngestOptions) {
       const fileType = this.detectFileType(file);
       
       if (fileType === 'csv') {
         return this.ingestCSV(file, options);
       } else if (fileType === 'xlsx') {
         return this.ingestExcel(file, options);
       }
     }
     
     private async ingestCSV(file: File, options: IngestOptions) {
       return new Promise((resolve) => {
         Papa.parse(file, {
           worker: true,
           streaming: true,
           chunk: (results) => this.processChunk(results),
           complete: (results) => resolve(this.finalizeIngestion())
         });
       });
     }
     
     private async ingestExcel(file: File, options: IngestOptions) {
       const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
       const sheets = workbook.SheetNames;
       
       // Handle multi-sheet selection
       const selectedSheet = await this.promptSheetSelection(sheets);
       const data = XLSX.utils.sheet_to_json(workbook.Sheets[selectedSheet]);
       
       return this.processData(data);
     }
   }
   ```

5. **Build Schema Inference**
   - Type detection (number, date, text)
   - Null rate calculation
   - Basic statistics computation

6. **Create Sample Generator**
   - First 100 rows for preview
   - Random sampling for large files
   - Maintain statistical representation

### PHASE 2: AI Block Core (Weeks 3-4)
**Goal:** Build the centerpiece AI block with inline chat

#### Week 3: AI Block Component
7. **Create AI Block UI**
   ```typescript
   // app/components/blocks/AIBlock.tsx
   interface AIBlockProps {
     blockId: string;
     pageContext: PageContent[];
     onInsertBlocks: (blocks: GeneratedBlock[]) => void;
   }
   
   export function AIBlock({ blockId, pageContext, onInsertBlocks }: AIBlockProps) {
     const [showChat, setShowChat] = useState(false);
     const [scope, setScope] = useState<'page' | 'workspace'>('page');
     
     // Space hotkey to open chat
     useHotkeys('space', () => {
       if (isEmpty) setShowChat(true);
     });
   }
   ```

8. **Implement Inline Chat Interface**
   - Floating chat overlay within block
   - Scope pill with @global detection
   - Preview area for AI responses
   - Insert/Dismiss buttons

9. **Build Scope Management**
   - Parse @global mentions
   - Context collection based on scope
   - Efficient context trimming

#### Week 4: LLM Orchestration
10. **Create Planner LLM Service**
    ```typescript
    // app/services/llm-planner.server.ts
    async function planOperations(intent: string, context: Context) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { 
          type: "json_schema",
          json_schema: PLANNER_SCHEMA 
        },
        messages: [
          { role: "system", content: PLANNER_PROMPT },
          { role: "user", content: JSON.stringify({ intent, context }) }
        ]
      });
      return JSON.parse(response.choices[0].message.content);
    }
    ```

11. **Build Analytics Engine**
    - SQL query builder for aggregations
    - Group-by operations
    - Statistical computations
    - Caching with Redis

12. **Implement Generator LLM**
    - Structured output for blocks
    - Provenance extraction
    - Confidence scoring

### PHASE 3: Data & Analytics (Weeks 5-6)
**Goal:** Complete data processing and chart generation

#### Week 5: Analytics & Retrieval
13. **Build Numeric Analytics Service**
    ```typescript
    // app/services/analytics-engine.server.ts
    class AnalyticsEngine {
      async executeAggregation(datasetId: string, query: AggregationQuery) {
        // Direct SQL for exact numeric answers
        const result = await db.raw(`
          SELECT ${query.groupBy}, 
                 ${query.aggregations}
          FROM dataset_rows
          WHERE dataset_id = ?
          GROUP BY ${query.groupBy}
        `, [datasetId]);
        return result;
      }
    }
    ```

14. **Enhance RAG for Mixed Queries**
    - Detect numeric vs text intent
    - Route to appropriate engine
    - Combine results for context

15. **Implement Provenance Tracking**
    ```typescript
    interface ProvenanceRef {
      source_type: 'dataset' | 'page' | 'block';
      source_id: string;
      excerpt: string;
      confidence: number;
      timestamp: Date;
    }
    ```

#### Week 6: Output Generation
16. **Create Chart Block Component**
    ```typescript
    // app/components/blocks/ChartBlock.tsx
    import { LineChart, BarChart, FunnelChart } from 'recharts';
    
    export function ChartBlock({ type, data, provenance }: ChartBlockProps) {
      return (
        <div className="chart-block">
          {renderChart(type, data)}
          <ProvenanceIndicator refs={provenance} />
        </div>
      );
    }
    ```

17. **Build Table Block Component**
    - Simple data table rendering
    - Sortable columns
    - Provenance per row

18. **Implement Block Insertion Flow**
    - Preview → Confirm → Insert
    - Maintain block order
    - Update page state

### PHASE 4: Integration & Polish (Weeks 7-8)
**Goal:** Complete integration and production readiness

#### Week 7: System Integration
19. **Wire AI Block to Backend**
    - Connect to orchestrator
    - Handle async operations
    - Error boundaries

20. **Implement Run History**
    ```sql
    CREATE TABLE ai_runs (
      id UUID PRIMARY KEY,
      page_id UUID REFERENCES pages(id),
      prompt TEXT NOT NULL,
      scope TEXT,
      retrieved_refs JSONB,
      outputs JSONB,
      model_version TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    ```

21. **Add Google Sheets Integration**
    - OAuth flow
    - Snapshot capture
    - Schema mapping

#### Week 8: Production Readiness
22. **Performance Optimization**
    - Response caching
    - Lazy loading
    - Bundle optimization

23. **Security Hardening**
    - Input sanitization
    - Rate limiting
    - Token validation

24. **Testing & Documentation**
    - E2E test scenarios
    - Load testing
    - API documentation

## Critical Success Factors

### 1. Performance Targets
- **AI Response:** Median ≤ 45s, fast-mode ≤ 20s
- **CSV Upload:** 10MB in ≤ 5s
- **Page Load:** ≤ 2s initial render
- **Block Operations:** ≤ 50ms response

### 2. Reliability Requirements
- **JSON Schema Compliance:** 100% with strict mode
- **Provenance Coverage:** ≥ 1 reference per claim
- **Uptime:** 99.9% availability
- **Data Integrity:** Zero data loss

### 3. User Experience Metrics
- **Time to First AI Response:** ≤ 10s perceived
- **Learning Curve:** ≤ 5 min to first success
- **Error Recovery:** Clear messages, graceful degradation
- **Mobile Support:** Full functionality on tablets

## Risk Mitigation Strategies

### High Risks
1. **LLM Latency**
   - Mitigation: Progressive loading, optimistic UI
   - Fallback: Cached responses for common queries

2. **Large CSV Processing**
   - Mitigation: Web workers, streaming, sampling
   - Fallback: Server-side processing for >10MB

3. **Context Window Limits**
   - Mitigation: Smart truncation, relevance ranking
   - Fallback: Multi-step processing

### Medium Risks
1. **Browser Compatibility**
   - Mitigation: Progressive enhancement
   - Testing: BrowserStack automation

2. **Cost Control**
   - Mitigation: Request batching, caching
   - Monitoring: Real-time usage tracking

## Development Team Structure

### Recommended Team (3 developers)
1. **Frontend Lead**
   - AI Block implementation
   - Chart/Table blocks
   - UI/UX refinement

2. **Backend Lead**
   - LLM orchestration
   - Analytics engine
   - Provenance system

3. **Full-Stack Developer**
   - CSV ingestion
   - Dataset blocks
   - Integration testing

## Monitoring & Success Metrics

### Technical Metrics
- API response times (p50, p95, p99)
- Error rates by component
- Cache hit rates
- Token usage per operation

### Business Metrics
- User activation (first AI query)
- Feature adoption rates
- Session duration
- Return user rate

### Quality Metrics
- Provenance accuracy
- AI response relevance
- System uptime
- Bug escape rate

## Go-Live Checklist

### Week 8 Final Validation
- [ ] All performance targets met
- [ ] Security audit completed
- [ ] Load testing passed (100 concurrent users)
- [ ] Documentation complete
- [ ] Monitoring dashboards active
- [ ] Rollback plan tested
- [ ] Customer support trained
- [ ] Beta feedback incorporated

## Post-MVP Roadmap

### Phase 5 (Weeks 9-10): Enhanced Collaboration
- Real-time cursor tracking
- Comment threads on AI outputs
- Shared AI conversations
- Team templates

### Phase 6 (Weeks 11-12): Advanced Features
- Workflow automation
- External integrations
- Advanced visualizations
- API access

## Conclusion

This implementation plan provides a clear, research-backed path to delivering the MVP in 8 weeks. By focusing on the core value proposition—collaborative RAG-grounded AI in familiar blocks—and leveraging existing infrastructure, we can achieve a production-ready system that demonstrates clear value while maintaining flexibility for future expansion.
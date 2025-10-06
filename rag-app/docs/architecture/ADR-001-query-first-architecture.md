# ADR-001: Query-First Architecture for Data Analysis

**Status**: Accepted
**Date**: 2025-10-07
**Authors**: Development Team
**Related Tasks**: #61, #68, #69, #70, #71

---

## Context

### Problem Statement

The current data analysis chat system is completely broken due to architectural issues:

1. **DuckDB exists but isn't used**: Tasks 52-53 implemented DuckDB WASM with full client-side SQL capabilities, but the chat query pipeline (`/api/chat-query`) doesn't leverage it
2. **Full datasets sent to LLM**: The `prepareFileData()` function fetches ALL rows from uploaded files and sends 50+ rows per file to OpenAI (3.5MB payloads)
3. **LLM cannot execute SQL**: OpenAI receives raw data and attempts analysis without query execution capabilities
4. **Performance degradation**: Large payloads approach Vercel's 4.5MB limit, causing timeouts and failures
5. **Scalability failure**: Cannot handle datasets > 50K rows due to memory and payload constraints

### Current Flow (Broken)

```
User: "What's the average revenue?"
    ↓
ChatSidebarPerformant.tsx
    ↓
POST /api/chat-query
    ↓
prepareFileData() - Fetches ENTIRE dataset from DuckDB
    ↓
Sends 50+ rows × N files to OpenAI (3.5MB payload)
    ↓
OpenAI attempts analysis on RAW DATA
    ↓
Poor results or failure
```

### Research Findings

**DuckDB-NSQL (2025)**: Text-to-SQL models that convert natural language to DuckDB queries, enabling AI assistants to see and fix their own SQL mistakes while working with latest DuckDB capabilities.

**MotherDuck Blog (2025)**: "Combining current documentation access with isolated execution environments eliminates traditional AI-SQL debugging cycles."

**Industry Pattern**: Modern data analytics applications execute queries locally first, then send only the RESULTS to LLMs for interpretation - reducing payloads by 97% (3.5MB → <100KB).

---

## Decision

We will implement a **Query-First Architecture** where SQL queries are executed locally in DuckDB WASM BEFORE sending any data to the LLM.

### New Flow

```
User: "What's the average revenue?"
    ↓
1. Load conversation context from database
2. Identify active file (revenue.csv)
3. Classify intent → DATA_ANALYSIS
    ↓
4. Generate SQL from natural language (LLM)
   → SELECT AVG(revenue) as avg_revenue FROM revenue
    ↓
5. Execute SQL in DuckDB (browser)
   → Result: { avg_revenue: 45000 }
    ↓
6. Send query + results to /api/chat-query-v2
   Payload: {
     query: "What's the average revenue?",
     sql: "SELECT AVG(revenue)...",
     results: [{ avg_revenue: 45000 }]
   }
    ↓
7. OpenAI interprets results (not raw data)
   → "The average revenue is $45,000"
    ↓
8. Save query to history
9. Update context
```

### Implementation Components

1. **SQLGeneratorService** (Task #68)
   - Converts natural language to DuckDB SQL
   - Uses GPT-4o with schema introspection
   - Validates queries before execution

2. **useDataQuery Hook** (Task #69)
   - React hook for client-side query execution
   - Integrates with existing DuckDB service
   - Handles loading, error states

3. **New API Endpoint**: `/api/chat-query-v2` (Task #70)
   - Accepts query RESULTS instead of raw data
   - Payload: `<100KB` vs current `3.5MB`
   - Interprets results, not raw data

4. **Integration** (Task #71)
   - Update `ChatSidebarPerformant.tsx`
   - Replace `prepareFileData()` calls
   - Wire query-first flow

---

## Consequences

### Positive

1. **97% Payload Reduction**: 3.5MB → <100KB
   - Eliminates Vercel payload limit issues
   - Dramatically reduces API costs
   - Faster response times

2. **Scalability**: Can handle datasets with millions of rows
   - Query execution time: ~0.8s for 3.2M rows (DuckDB WASM benchmark)
   - Only final results sent to LLM
   - Memory usage limited to result set size

3. **Accuracy**: LLM receives precise query results
   - No hallucination from incomplete data
   - No "distraction" from irrelevant rows
   - Cleaner interpretation

4. **Performance**: Sub-second query execution
   - DuckDB WASM: 10-100x faster than alternatives
   - Local execution eliminates network latency
   - Progressive loading prevents UI blocking

5. **Cost Reduction**: 80-90% token reduction
   - Research: Smart memory systems cut costs 80-90%
   - Only results sent, not full datasets
   - Fewer tokens per query

### Negative

1. **Increased Client-Side Processing**
   - SQL generation requires LLM call
   - Query execution happens in browser
   - *Mitigation*: DuckDB WASM is highly optimized, sub-second execution

2. **SQL Generation Errors**
   - LLM might generate invalid SQL
   - *Mitigation*: Validation layer, error recovery with re-prompting

3. **Additional Complexity**
   - More moving parts in pipeline
   - *Mitigation*: Well-tested components, clear separation of concerns

### Risks

1. **DuckDB WASM Memory Limits**: 4GB per browser tab
   - *Mitigation*: Progressive loading for large files (Task #80)

2. **SQL Injection**: User queries could inject malicious SQL
   - *Mitigation*: Parameterized queries, SQL validation

3. **Browser Compatibility**: Older browsers may not support WASM
   - *Mitigation*: Feature detection, graceful degradation

---

## Alternatives Considered

### Alternative 1: Server-Side DuckDB

**Approach**: Execute queries on server instead of client

**Pros**:
- More control over query execution
- No browser memory limits
- Can use native DuckDB (slightly faster)

**Cons**:
- File upload/download overhead
- Server resource consumption
- Latency for every query
- **Rejected**: Tasks 52-53 already implemented client-side DuckDB

### Alternative 2: Smart Sampling

**Approach**: Send representative sample of data to LLM

**Pros**:
- Simpler implementation
- No SQL generation needed

**Cons**:
- Sampling may miss important data
- Still sends large payloads (sample + schema)
- Accuracy issues with aggregations
- **Rejected**: Doesn't solve root cause

### Alternative 3: Hybrid Approach

**Approach**: Use query-first for aggregations, full data for exploration

**Pros**:
- Flexibility for different query types

**Cons**:
- Complex routing logic
- Still has payload issues for exploration queries
- **Rejected**: Adds unnecessary complexity

---

## Implementation Plan

See Tasks #68-71 for detailed implementation breakdown.

### Phase 2 Tasks (Query-First Pipeline)

1. **Task 68**: Build SQLGeneratorService
   - OpenAI integration for SQL generation
   - Schema introspection from DuckDB
   - Query validation and sanitization

2. **Task 69**: Create useDataQuery hook
   - Client-side query execution
   - Loading/error state management
   - Integration with DuckDB service

3. **Task 70**: Build /api/chat-query-v2 endpoint
   - Accept query results instead of raw data
   - Payload validation (<100KB)
   - Result interpretation with LLM

4. **Task 71**: Integrate in ChatSidebarPerformant
   - Replace prepareFileData() calls
   - Wire query-first flow
   - Update UI for SQL display

### Success Criteria

- [ ] Average payload size < 100KB
- [ ] Query execution < 1 second for datasets up to 1M rows
- [ ] Data analysis queries work correctly
- [ ] No Vercel payload limit errors
- [ ] 80%+ reduction in OpenAI token usage

---

## References

- [DuckDB-NSQL: LLM for DuckDB SQL](https://motherduck.com/blog/duckdb-text2sql-llm/) - MotherDuck Blog 2025
- [DuckDB WASM Performance](https://duckdb.org/2021/10/29/duckdb-wasm.html) - 0.8s for 3.2M rows
- [LLM Chat History Management](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) - 80-90% cost reduction
- ARCHITECTURAL_ANALYSIS.md - Section 3.1: Why Data Analysis is Broken
- CHAT_REQUIREMENTS.md - Feature 1: Data Analysis on CSV/Excel

---

## Notes

This decision directly addresses the root cause identified in the architectural analysis: "DuckDB exists but NOT used in query pipeline". The query-first pattern is an established industry best practice for LLM-powered data analytics applications in 2025.

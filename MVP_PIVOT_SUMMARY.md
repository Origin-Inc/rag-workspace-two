# MVP PIVOT SUMMARY: Ready for Implementation

## What We've Accomplished

### 1. Research & Analysis ✅
- **AI Block Best Practices**: Analyzed Notion/Coda implementations, identified @-reference pattern for context
- **CSV Ingestion**: Selected Papa Parse for reliability (handles GB files, 2x faster than alternatives)
- **LLM Orchestration**: Chose OpenAI Structured Outputs for 100% JSON compliance
- **Provenance System**: Designed evidence-first citation tracking with passage IDs

### 2. Gap Analysis ✅
- **65% Code Reusability**: Identified exact components to keep vs rebuild
- **Key New Components**: AI Block, Chart Block, Analytics Engine, LLM Orchestrator
- **Simplifications**: Database blocks → Dataset previews, Remove formula engine

### 3. Implementation Plan ✅
- **8-Week Timeline**: 4 phases with clear deliverables
- **324 Development Hours**: Detailed breakdown by component
- **Team Structure**: 3 developers with defined roles

## Updated Task Management

### New MVP Tasks Added (IDs 21-30)
1. **Task 21**: Simplify Database Block to Dataset Preview
2. **Task 22**: Implement CSV/Excel Ingestion with Papa Parse + SheetJS  
3. **Task 23**: Build AI Block with Inline Chat
4. **Task 24**: Implement LLM Orchestration Layer
5. **Task 25**: Build Numeric Analytics Engine
6. **Task 26**: Implement Chart and Table Output Blocks
7. **Task 27**: Create Provenance and Citation System
8. **Task 28**: Google Sheets Snapshot Integration
9. **Task 29**: Performance Optimization and Testing
10. **Task 30**: Production Deployment Preparation

### Tasks to Deprioritize
- **Task 7**: Real-time Collaboration (defer post-MVP)
- **Task 8**: Background Workers (simplify for MVP)
- **Task 9**: Formula Engine (remove entirely)
- **Task 15**: Enhanced Block System (defer)
- **Task 17**: Content Generation Engine (defer)
- **Task 18**: Context-Aware Response (simplify)

## Immediate Next Steps

### Week 1 Actions
1. **Start Task 21**: Begin simplifying database blocks
   - Remove complex views
   - Create DatasetBlock component
   - Add Analyze button

2. **Start Task 22**: Set up file ingestion infrastructure
   - Install Papa Parse (CSV) and SheetJS (Excel)
   - Create unified ingestion service
   - Build schema inference for both formats
   - Handle multi-sheet Excel files

3. **Database Migration**: Create new tables
   ```sql
   -- datasets, dataset_rows, ai_runs, provenance_refs
   ```

### Development Priorities
1. **Critical Path**: Tasks 20 → 23 → 24 → 26 → 27
2. **Parallel Work**: Tasks 21, 22, 25 can proceed independently
3. **Block Dependencies**: Don't start Task 23 until Task 20 is stable

## Key Technology Decisions

### Frontend
- **CSV Parser**: Papa Parse with web workers
- **Excel Parser**: SheetJS (3x faster than ExcelJS)
- **Charts**: Recharts for visualizations
- **Editor**: Keep existing Tiptap implementation
- **UI Framework**: Continue with Remix + React

### Backend
- **LLM**: OpenAI with Structured Outputs
- **Analytics**: Direct SQL for numeric operations
- **Storage**: PostgreSQL for datasets
- **Caching**: Redis for performance

### Architecture Patterns
- **Two-tier LLM**: Planner → Generator
- **Mixed Processing**: LLM for text, SQL for numbers
- **Evidence-first**: Every output has provenance
- **Progressive Loading**: Optimize perceived performance

## Success Metrics

### Technical
- AI response: ≤45s median
- File upload: ≤5s for 10MB (CSV or Excel)
- Page load: ≤2s
- Provenance: 100% coverage

### Business
- Time to first AI query: ≤10 min
- Feature adoption: >70% users
- Error rate: <1%
- Uptime: 99.9%

## Risk Mitigations

### Addressed Risks
- **LLM Latency**: Progressive loading, caching
- **Large Files**: Streaming (CSV), efficient parsing (Excel)
- **Cost Control**: Two-tier models, batching
- **Provenance Accuracy**: Structured outputs

### Remaining Concerns
- **Browser Compatibility**: Need testing
- **Mobile Experience**: Tablet-first approach
- **Scale Testing**: 100 concurrent users target

## Files to Modify

### Simplify
- `app/components/database-block/DatabaseBlock.tsx` → DatasetBlock.tsx
- Remove: `DatabaseKanban.tsx`, `DatabaseCalendar.tsx`, `DatabaseTimeline.tsx`
- Remove: `formula-engine.server.ts`, `formula-engine-core.server.ts`

### Create New
- `app/components/blocks/AIBlock.tsx`
- `app/components/blocks/ChartBlock.tsx`
- `app/services/file-ingestion.server.ts`
- `app/services/analytics-engine.server.ts`
- `app/services/llm-orchestrator.server.ts`
- `app/services/provenance.server.ts`

### Enhance
- `app/services/rag.server.ts` (add numeric support)
- `app/components/editor/EnhancedBlockEditor.tsx` (add AI block type)

## Team Assignments

### Frontend Developer
- Week 1-2: Simplify database blocks (Task 21)
- Week 3-4: Build AI Block UI (Task 23)
- Week 5-6: Chart/Table blocks (Task 26)
- Week 7-8: Integration & Polish

### Backend Developer
- Week 1-2: CSV/Excel ingestion (Task 22)
- Week 3-4: LLM orchestration (Task 24)
- Week 5-6: Analytics engine (Task 25)
- Week 7-8: Performance optimization

### Full-Stack Developer
- Week 1-2: Database schema & APIs
- Week 3-4: Provenance system (Task 27)
- Week 5-6: Google Sheets integration (Task 28)
- Week 7-8: Testing & Deployment (Tasks 29-30)

## Go/No-Go Checklist

### Week 4 Checkpoint
- [ ] Dataset preview working
- [ ] CSV/Excel upload functional
- [ ] AI block opens with Space
- [ ] Basic LLM responses working

### Week 6 Checkpoint
- [ ] Analytics returning accurate results
- [ ] Charts rendering correctly
- [ ] Provenance displayed on outputs
- [ ] Performance within targets

### Week 8 Final
- [ ] All acceptance criteria met
- [ ] Load testing passed
- [ ] Documentation complete
- [ ] Production deployment ready

## Conclusion

The pivot is well-researched, thoroughly planned, and ready for implementation. The existing codebase provides a strong foundation (65% reusable), and the new components are clearly defined with proven technology choices.

**Recommendation**: Begin implementation immediately with Week 1 tasks. The simplified approach focusing on collaborative RAG-grounded AI will deliver a production-ready MVP in 8 weeks that demonstrates clear value while maintaining flexibility for future expansion.

## Commands to Get Started

```bash
# Install new dependencies
npm install papaparse @types/papaparse
npm install xlsx
npm install recharts @types/recharts
npm install lru-cache

# Create new directories
mkdir -p app/components/blocks
mkdir -p app/services/analytics

# Start development on Task 21
git checkout -b feature/mvp-pivot-dataset-block
```
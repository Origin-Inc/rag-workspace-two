# Notion-Style Block Editor Rebuild - Product Requirements Document

## Priority: CRITICAL - Editor Currently Broken

The current drag-and-drop editor is non-functional. This rebuild is blocking all content creation and must be completed before Task 16 (RAG Infrastructure) since the RAG system requires content to index.

## Core Requirements

### Phase 1: Foundation Architecture (Week 1)
- Replace current PageEditor.tsx with Tiptap-based block editor foundation
- Implement hierarchical block data structure with JSONB storage optimization
- Set up virtual scrolling using @tanstack/react-virtual for handling 1000+ blocks
- Create centralized block state management with Zustand or Redux Toolkit
- Implement command pattern for undo/redo with operation coalescing (200ms debounce)
- Build block rendering pipeline with memoization for performance
- Create base block component architecture with plugin system

### Phase 2: Core Editing Features (Week 2)
- Implement slash command system with fuzzy search using Fuse.js
- Add keyboard navigation between blocks (arrow keys, Tab, Shift+Tab)
- Build inline rich text editing within blocks using contentEditable
- Create multi-block selection system (Shift+Click, Cmd+A)
- Implement block manipulation operations (move, duplicate, delete)
- Add block transformation system (text to heading, list, code block)
- Build focus management and cursor positioning system

### Phase 3: Block Types & Extensions (Week 3)
- Implement core block types: paragraph, headings (h1-h6), lists (ordered/unordered)
- Add code blocks with syntax highlighting using Prism.js
- Create table blocks with cell editing
- Implement quote and callout blocks
- Add image and video blocks with upload support
- Build toggle/collapsible blocks
- Create math/equation blocks with KaTeX rendering

### Phase 4: Performance Optimization (Week 4)
- Optimize database queries with GIN indexes on JSONB content
- Implement client-side block caching with IndexedDB
- Add progressive loading for nested block structures
- Set up performance monitoring with Web Vitals
- Implement debounced auto-save with diff detection (500ms)
- Add background sync for offline support
- Create memory management for long editing sessions

### Phase 5: Advanced Features (Week 5)
- Build extensible block plugin system for custom blocks
- Add real-time collaboration using Supabase Realtime
- Implement block templates and quick insert menu
- Create mobile touch interactions and gestures
- Add comprehensive keyboard shortcuts (Cmd+B, Cmd+I, etc.)
- Build block comments and annotations system
- Implement version history with diff visualization

### Phase 6: Testing & Migration (Week 6)
- Create comprehensive test suite (unit, integration, e2e with Playwright)
- Build content migration tool for existing pages
- Performance testing with 10,000+ blocks documents
- Cross-browser compatibility testing (Chrome, Firefox, Safari, Edge)
- Mobile responsiveness testing (iOS, Android)
- Accessibility testing (WCAG 2.1 AA compliance)
- Production deployment with feature flags

## Technical Specifications

### Performance Requirements
- Initial page load: < 1 second for documents with < 1000 blocks
- Typing latency: < 50ms
- Block operations: < 100ms
- Virtual scrolling: 60fps smooth scrolling
- Memory usage: < 100MB for 10,000 blocks
- Auto-save latency: < 500ms

### Database Schema
```sql
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  properties JSONB DEFAULT '{}',
  position INTEGER NOT NULL,
  depth INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Performance indexes
  INDEX idx_blocks_page_position ON blocks(page_id, position),
  INDEX idx_blocks_parent ON blocks(parent_id),
  INDEX idx_blocks_content_gin ON blocks USING GIN(content)
);
```

### Technology Stack
- Editor Framework: Tiptap (built on ProseMirror)
- State Management: Zustand or Redux Toolkit
- Virtual Scrolling: @tanstack/react-virtual
- Search: Fuse.js for fuzzy matching
- Syntax Highlighting: Prism.js
- Math Rendering: KaTeX
- Testing: Vitest + Playwright
- Performance: Web Vitals + custom metrics

## Success Criteria
1. Users can create and edit content without errors
2. Editor handles 10,000+ blocks without performance degradation
3. All keyboard shortcuts work consistently
4. Slash commands appear within 50ms
5. Auto-save works reliably with conflict resolution
6. Virtual scrolling maintains 60fps
7. Mobile editing works smoothly
8. Accessibility passes WCAG 2.1 AA
9. Migration preserves all existing content
10. Zero data loss during editing sessions

## Dependencies
- Must be completed before Task 16 (RAG Infrastructure)
- Requires Task 6 (RAG System) for content indexing hooks
- Requires Task 14 (Page Editor) completion for migration source
- Requires Task 15 (Block System) for type definitions

## Risk Mitigation
- Use feature flags for gradual rollout
- Maintain backward compatibility during migration
- Implement comprehensive error recovery
- Add telemetry for production monitoring
- Create rollback plan if issues occur
- Test with real user content before full deployment
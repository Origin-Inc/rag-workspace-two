# ADR-002: Shared Services Layer Architecture

**Status**: Accepted
**Date**: 2025-10-07
**Authors**: Development Team
**Related Tasks**: #65, #66, #67, #75, #76, #78

---

## Context

### Problem Statement

The codebase suffers from severe code duplication causing maintenance nightmares and architectural fragmentation:

1. **File Upload Logic Duplicated 3x**:
   - `ChatInput.tsx` (lines 143-160)
   - `ChatSidebarPerformant.tsx` (lines 637-649)
   - `FileUploadZone.tsx` (lines 88-97)

2. **Recent Bug Demonstrates Impact**:
   - PDF removal required fixes in 3 separate files
   - User reported bug persisted after "fix" because only 1 of 3 locations was updated
   - Required 3 commits to fully resolve

3. **No Architectural Boundaries**:
   - No enforced patterns for shared functionality
   - Each component implements features independently
   - No code review catching duplication
   - No shared component library

4. **Maintainability Crisis**:
   - Simple changes require multiple file edits
   - High risk of inconsistent behavior
   - New developers duplicate code unknowingly
   - Technical debt accumulating rapidly

### Research Findings

**React Architecture 2025**: "Abstracting API calls into a services directory keeps your logic clean and maintainable. The recommended folder structure includes `/services/` for API calls and business logic."

**Services Layer Approach**: "The proposal is to encapsulate data fetching in a collection of functions that receive arguments if necessary and return the needed data."

**Key Principles (2025)**:
- **Separation of Concerns**: Divide UI, state, logic, and side effects into their own layers
- **Reusability**: Reuse components, hooks, and utilities across the app
- **Maintainability**: Make it easy to debug, test, and scale the application

**TypeScript + React (2025)**: "TypeScript has become the gold standard for React development in 2025, practically a requirement for professional projects."

---

## Decision

We will implement a **Shared Services Layer** architecture to eliminate code duplication and establish single sources of truth for common functionality.

### Architecture Layers

```
┌─────────────────────────────────────┐
│     UI Components (React)           │
│  ChatSidebar, ChatInput, Editor     │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│      Custom Hooks Layer             │
│  useFileUpload, useDataQuery        │
│  useContextPersistence              │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│    Shared Services Layer            │
│  (Single Source of Truth)           │
│                                     │
│  FileUploadService                  │
│  ContextPersistenceService          │
│  SQLGeneratorService                │
│  QueryCacheService                  │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│    External Dependencies            │
│  DuckDB, Supabase, OpenAI, Redis    │
└─────────────────────────────────────┘
```

### Implementation Components

#### 1. FileUploadService (Task #65)

**Location**: `/app/services/shared/file-upload.server.ts`

```typescript
export class FileUploadService {
  /**
   * Validate file type and size
   */
  validateFile(file: File): ValidationResult {
    // Single validation logic for ALL uploads
    const allowedTypes = ['.csv', '.xlsx', '.xls'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!allowedTypes.some(type => file.name.endsWith(type))) {
      return { valid: false, error: 'Invalid file type' };
    }

    if (file.size > maxSize) {
      return { valid: false, error: 'File too large' };
    }

    return { valid: true };
  }

  /**
   * Upload file and process
   */
  async upload(file: File, pageId: string): Promise<UploadResult> {
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Parse based on type
    const data = file.name.endsWith('.csv')
      ? await this.parseCSV(file)
      : await this.parseExcel(file);

    // Store metadata in database
    // Load into DuckDB
    // Return result
  }

  private async parseCSV(file: File): Promise<any[]> {
    // PapaParse integration
  }

  private async parseExcel(file: File): Promise<any[]> {
    // SheetJS integration
  }
}
```

**Benefits**:
- ✅ Single validation logic
- ✅ Single parsing implementation
- ✅ Consistent error handling
- ✅ Easy to test
- ✅ Easy to modify (change once, works everywhere)

#### 2. FileUploadButton Component (Task #66)

**Location**: `/app/components/shared/FileUploadButton.tsx`

```typescript
interface FileUploadButtonProps {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
}

export function FileUploadButton({
  onUpload,
  accept = '.csv,.xlsx,.xls',
  multiple = false,
  disabled = false,
  className
}: FileUploadButtonProps) {
  // Single reusable UI component
  // Replaces 3 inline implementations
}
```

**Usage**:
```typescript
// ChatInput.tsx
<FileUploadButton onUpload={handleUpload} />

// ChatSidebarPerformant.tsx
<FileUploadButton onUpload={handleUpload} multiple />

// FileUploadZone.tsx (wraps with drag-drop)
<div onDrop={handleDrop}>
  <FileUploadButton onUpload={handleUpload} />
</div>
```

#### 3. ContextPersistenceService (Task #67)

**Location**: `/app/services/shared/context-persistence.server.ts`

```typescript
export class ContextPersistenceService {
  /**
   * Load conversation context from database
   */
  async loadContext(pageId: string): Promise<ChatContext> {
    // Load from database
    // Return structured context
  }

  /**
   * Save conversation context to database
   */
  async saveContext(pageId: string, context: ChatContext): Promise<void> {
    // Persist to database
  }

  /**
   * Update active file reference
   */
  async updateActiveFile(pageId: string, fileId: string): Promise<void> {
    // Update context
  }
}
```

### Directory Structure

```
/app
  /services
    /shared              # ← NEW: Shared services layer
      file-upload.server.ts
      context-persistence.server.ts
      query-cache.server.ts
      progressive-loader.server.ts
      performance-monitor.server.ts

  /components
    /shared              # ← NEW: Shared components
      FileUploadButton.tsx
      VirtualTable.tsx

  /hooks                 # ← NEW: Custom hooks
    use-file-upload.ts
    use-data-query.ts
    use-context-persistence.ts
```

---

## Consequences

### Positive

1. **DRY Principle Enforced**
   - Single source of truth for each feature
   - Changes propagate automatically
   - No duplicate code

2. **Maintainability Improved**
   - Bug fixes in one place
   - Feature additions simpler
   - Easier onboarding for new developers

3. **Consistency Guaranteed**
   - Same behavior across all components
   - Unified error handling
   - Predictable user experience

4. **Testing Simplified**
   - Test service once
   - Components become simpler to test
   - Higher test coverage achievable

5. **Performance Benefits**
   - Services can be optimized independently
   - Caching at service layer
   - Easier to identify bottlenecks

### Negative

1. **Initial Refactor Required**
   - Must update all existing components
   - Temporary increase in work
   - *Mitigation*: Phased migration (Tasks 75-78)

2. **Learning Curve**
   - Team must understand service layer pattern
   - *Mitigation*: Clear documentation, examples

3. **Abstraction Overhead**
   - Additional layer of indirection
   - *Mitigation*: Services are simple, focused, well-documented

### Risks

1. **Over-Abstraction**
   - Risk of creating unnecessary abstractions
   - *Mitigation*: Only create services for truly shared functionality

2. **Breaking Changes**
   - Refactor might introduce bugs
   - *Mitigation*: Comprehensive testing, phased rollout

---

## Alternatives Considered

### Alternative 1: Keep Duplication, Add Code Review

**Approach**: Maintain current structure but enforce code review to catch duplication

**Pros**:
- No refactor needed
- No learning curve

**Cons**:
- Doesn't fix existing duplication
- Relies on human vigilance
- Duplication will still happen
- **Rejected**: Doesn't solve root cause

### Alternative 2: Monolithic Service Class

**Approach**: Single large service class for all shared logic

**Pros**:
- Simple to understand
- One place to look

**Cons**:
- God object anti-pattern
- Difficult to test
- Tight coupling
- **Rejected**: Poor separation of concerns

### Alternative 3: Utility Functions Only

**Approach**: Use simple exported functions instead of service classes

**Pros**:
- Simpler than classes
- Functional programming style

**Cons**:
- No state management
- Harder to mock in tests
- Less organized
- **Rejected**: Services need state (e.g., database connections)

---

## Implementation Plan

### Phase 1: Create Shared Services (Tasks 65-67)

1. **Task 65**: Build FileUploadService
   - Validation logic
   - CSV/Excel parsing
   - Database integration
   - DuckDB integration

2. **Task 66**: Build FileUploadButton component
   - Reusable UI component
   - Props for customization
   - Accessibility support

3. **Task 67**: Build ContextPersistenceService
   - Database CRUD operations
   - Context loading/saving
   - Active file management

### Phase 4: Migration & Cleanup (Tasks 75-78)

4. **Task 75**: Consolidate file upload components
   - Update ChatInput.tsx
   - Update ChatSidebarPerformant.tsx
   - Update FileUploadZone.tsx
   - Delete inline implementations

5. **Task 76**: Delete duplicate chat sidebars
   - Remove ChatSidebar.tsx
   - Remove ChatSidebarOptimized.tsx
   - Remove ChatSidebarStable.tsx
   - Remove ChatSidebarSimple.tsx

6. **Task 77**: Remove prepareFileData function
   - Delete from api.chat-query.tsx
   - Verify no remaining calls

7. **Task 78**: Verification audit
   - Check all components use shared services
   - Verify no inline implementations remain
   - Test coverage >80%

### Success Criteria

- [ ] Zero duplicate file upload implementations
- [ ] All components use FileUploadService
- [ ] All components use FileUploadButton
- [ ] Context persisted to database
- [ ] Test coverage >80% for shared services
- [ ] No regressions in functionality

---

## References

- [React Architecture Patterns 2025](https://www.geeksforgeeks.org/reactjs/react-architecture-pattern-and-best-practices/)
- [Services Layer in React](https://dev.to/chema/services-layer-approach-in-reactjs-1eo2)
- [React Project Structure for Scale](https://www.developerway.com/posts/react-project-structure)
- ARCHITECTURAL_ANALYSIS.md - Section 1.2: Code Duplication Analysis
- Recent bug: PDF removal required 3 commits across 3 files

---

## Notes

This architectural decision directly addresses the "disease not symptoms" problem identified by the user. Instead of repeatedly fixing bugs in multiple places, we create a single source of truth that all components use. This is a foundational pattern in professional React development as of 2025.

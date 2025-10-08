# ADR-004: Component Composition Patterns

**Status**: Accepted
**Date**: 2025-10-07
**Authors**: Development Team
**Related Tasks**: #66, #75, #76, #78

---

## Context

### Problem Statement

The React component architecture lacks consistent patterns, leading to anti-patterns and poor reusability:

1. **Inline Implementations Everywhere**:
   - File upload logic duplicated in 3 components
   - Each component reinvents the wheel
   - No reusable building blocks

2. **Anti-Patterns Observed**:
   - **Prop Drilling**: Passing props through many levels
   - **God Components**: Components doing too much
   - **Tight Coupling**: Components depend on specific implementations
   - **No Composition**: Components can't be easily combined

3. **Missing Patterns**:
   - No custom hooks for shared logic
   - No compound components
   - No render props pattern
   - No proper component abstraction

4. **Maintainability Issues**:
   - Hard to test components
   - Hard to reuse components
   - Hard to modify components
   - Inconsistent UX across similar features

### Research Findings

**React Best Practices 2025**: "Key architectural principles include separation of concerns (dividing UI, state, logic, and side effects into their own layers), reusability (reusing components, hooks, and utilities across the app), and maintainability (making it easy to debug, test, and scale the application)."

**Component Patterns**: "Custom Hooks for Shared Logic - Shared validation, upload logic. Use in multiple components."

**Services Layer**: "Abstracting API calls into a services directory keeps your logic clean and maintainable."

**Anti-Patterns to Avoid**:
1. **No Shared Components**: File upload in 3 components
2. **Context API Overuse**: Multiple nested contexts
3. **HOC Wrapper Hell**: Multiple nested HOCs
4. **Inline Logic**: Business logic mixed with UI

**Best Practices**:
1. **Custom Hooks**: Extract shared stateful logic
2. **Service Layer**: Single source of truth for business logic
3. **Component Composition**: Build complex UIs from simple components
4. **Separation of Concerns**: UI, state, logic in separate layers

---

## Decision

We will adopt a **Component Composition Architecture** based on React 2025 best practices, emphasizing custom hooks, shared components, and clear separation of concerns.

### Architecture Layers

```
┌─────────────────────────────────────────────┐
│         Page Components                     │
│  (ChatSidebar, Editor, Dashboard)           │
│                                             │
│  - Coordinate child components              │
│  - Manage page-level state                  │
│  - Handle routing                           │
└───────────────┬─────────────────────────────┘
                │
┌───────────────▼─────────────────────────────┐
│      Feature Components                     │
│  (FileUploadButton, DataTable, Chart)       │
│                                             │
│  - Reusable UI components                   │
│  - Use custom hooks for logic               │
│  - Props for customization                  │
└───────────────┬─────────────────────────────┘
                │
┌───────────────▼─────────────────────────────┐
│         Custom Hooks                        │
│  (useFileUpload, useDataQuery)              │
│                                             │
│  - Extract shared stateful logic            │
│  - No UI, only behavior                     │
│  - Composable and testable                  │
└───────────────┬─────────────────────────────┘
                │
┌───────────────▼─────────────────────────────┐
│      Shared Services                        │
│  (FileUploadService, ContextService)        │
│                                             │
│  - Business logic                           │
│  - API calls                                │
│  - Data transformations                     │
└─────────────────────────────────────────────┘
```

### Core Patterns

#### 1. Custom Hooks for Stateful Logic

**Pattern**: Extract shared stateful logic into custom hooks

**Example**: File Upload Hook
```typescript
// app/hooks/use-file-upload.ts
export function useFileUpload(pageId: string) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      // Use shared service
      const service = new FileUploadService();
      const result = await service.upload(file, pageId);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setUploading(false);
    }
  }, [pageId]);

  return { upload, uploading, error };
}
```

**Usage in Components**:
```typescript
// ChatInput.tsx
function ChatInput({ pageId }: Props) {
  const { upload, uploading, error } = useFileUpload(pageId);

  return (
    <FileUploadButton
      onUpload={upload}
      disabled={uploading}
    />
  );
}

// ChatSidebarPerformant.tsx
function ChatSidebarPerformant({ pageId }: Props) {
  const { upload, uploading, error } = useFileUpload(pageId);

  return (
    <FileUploadButton
      onUpload={upload}
      multiple
    />
  );
}
```

**Benefits**:
- ✅ Logic reused across components
- ✅ Easy to test in isolation
- ✅ Consistent behavior
- ✅ No duplication

#### 2. Compound Components Pattern

**Pattern**: Related components that work together

**Example**: File Upload with Drag-and-Drop
```typescript
// app/components/shared/FileUpload.tsx
export function FileUpload({ children, ...props }: FileUploadProps) {
  return (
    <FileUploadContext.Provider value={props}>
      {children}
    </FileUploadContext.Provider>
  );
}

FileUpload.Button = FileUploadButton;
FileUpload.DropZone = FileUploadDropZone;
FileUpload.Progress = FileUploadProgress;
```

**Usage**:
```typescript
// Flexible composition
<FileUpload pageId={pageId}>
  <FileUpload.DropZone>
    <FileUpload.Button />
    <FileUpload.Progress />
  </FileUpload.DropZone>
</FileUpload>
```

#### 3. Render Props Pattern (When Needed)

**Pattern**: Share code between components using a prop whose value is a function

**Example**: Data Query with Custom Rendering
```typescript
// app/components/shared/DataQuery.tsx
interface DataQueryProps {
  query: string;
  render: (data: any[], loading: boolean, error: Error | null) => ReactNode;
}

export function DataQuery({ query, render }: DataQueryProps) {
  const { data, loading, error } = useDataQuery(query);
  return <>{render(data, loading, error)}</>;
}
```

**Usage**:
```typescript
<DataQuery
  query="SELECT * FROM sales"
  render={(data, loading, error) => {
    if (loading) return <Spinner />;
    if (error) return <Error message={error.message} />;
    return <DataTable data={data} />;
  }}
/>
```

#### 4. Service Layer Integration

**Pattern**: Components use services through hooks, never directly

**Bad (Direct Service Usage)**:
```typescript
// ❌ Component tightly coupled to service
function ChatInput() {
  const handleUpload = async (file: File) => {
    const service = new FileUploadService();
    await service.upload(file);
  };
}
```

**Good (Via Custom Hook)**:
```typescript
// ✅ Component uses hook, hook uses service
function ChatInput() {
  const { upload } = useFileUpload(pageId);

  return <FileUploadButton onUpload={upload} />;
}
```

**Benefits**:
- ✅ Easy to mock for testing
- ✅ Loose coupling
- ✅ Service implementation can change without component changes

### Component Guidelines

#### 1. Single Responsibility

Each component should do ONE thing well:

```typescript
// ✅ Good - Single responsibility
function FileUploadButton({ onUpload, disabled }: Props) {
  return <button onClick={handleClick}>Upload</button>;
}

function FileUploadProgress({ progress }: Props) {
  return <progress value={progress} max={100} />;
}

// ❌ Bad - Multiple responsibilities
function FileUpload() {
  // Handles upload, progress, errors, drag-drop, validation...
  // 500 lines of code
}
```

#### 2. Props for Customization

Components should be flexible through props:

```typescript
interface FileUploadButtonProps {
  onUpload: (file: File) => Promise<void>;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;  // Allow custom content
}
```

#### 3. Composition Over Inheritance

Build complex components from simple ones:

```typescript
// ✅ Good - Composition
<ChatInterface>
  <ChatHeader />
  <ChatMessages />
  <ChatInput>
    <FileUploadButton />
  </ChatInput>
</ChatInterface>

// ❌ Bad - Inheritance
class ChatWithFileUpload extends ChatBase {
  // Complex inheritance hierarchy
}
```

#### 4. Controlled Components

Let parent control state when needed:

```typescript
interface FileUploadButtonProps {
  // Controlled
  value?: File | null;
  onChange?: (file: File) => void;

  // Uncontrolled
  onUpload?: (file: File) => Promise<void>;
}
```

---

## Consequences

### Positive

1. **Reusability**
   - Components can be used anywhere
   - Hooks can be used in any component
   - No code duplication

2. **Testability**
   - Hooks tested independently
   - Components tested with mock hooks
   - Services tested in isolation

3. **Maintainability**
   - Changes in one place
   - Clear separation of concerns
   - Easy to understand

4. **Consistency**
   - Same patterns everywhere
   - Predictable behavior
   - Unified UX

5. **Developer Experience**
   - Clear patterns to follow
   - Easy to onboard new developers
   - TypeScript provides guidance

### Negative

1. **Learning Curve**
   - Team must learn patterns
   - More upfront design needed
   - *Mitigation*: Documentation, code reviews, examples

2. **Initial Overhead**
   - Takes time to extract hooks and components
   - *Mitigation*: Phased migration, prioritize high-value extractions

3. **Abstraction Cost**
   - Additional layers of indirection
   - *Mitigation*: Keep abstractions simple and focused

### Risks

1. **Over-Abstraction**
   - Risk of creating unnecessary abstractions
   - *Mitigation*: "Rule of Three" - extract only after 3rd duplication

2. **Pattern Inconsistency**
   - Team might not follow patterns consistently
   - *Mitigation*: Code reviews, linting rules, documentation

---

## Alternatives Considered

### Alternative 1: Keep Current Ad-Hoc Approach

**Approach**: No enforced patterns, developers choose their own approach

**Pros**:
- No refactor needed
- Maximum flexibility
- No learning curve

**Cons**:
- Continued duplication
- Inconsistent UX
- Maintenance nightmare
- **Rejected**: This is what caused the current problems

### Alternative 2: Class Components with HOCs

**Approach**: Use class components and Higher-Order Components for reuse

**Pros**:
- Traditional React pattern
- Well-understood

**Cons**:
- Deprecated in React 2025
- "Wrapper hell" problem
- Hard to compose
- **Rejected**: Hooks are the modern standard

### Alternative 3: Render Props Only

**Approach**: Use render props pattern for all shared logic

**Pros**:
- Flexible pattern
- Good for complex scenarios

**Cons**:
- Verbose syntax
- Nesting issues
- Hooks are simpler for most cases
- **Rejected**: Hooks are preferred, render props for edge cases only

---

## Implementation Plan

### Phase 1: Create Foundation (Tasks 66)

1. **Task 66**: Build FileUploadButton component
   - Reusable shared component
   - Props for customization
   - TypeScript types

### Phase 4: Migration (Tasks 75-76)

2. **Task 75**: Create custom hooks
   - `useFileUpload` hook
   - `useDataQuery` hook
   - `useContextPersistence` hook

3. **Task 75**: Consolidate components
   - Update ChatInput.tsx to use shared component
   - Update ChatSidebarPerformant.tsx to use shared component
   - Update FileUploadZone.tsx to use shared component

4. **Task 76**: Delete duplicates
   - Remove inline file input implementations
   - Remove duplicate chat sidebars
   - Verify all use shared components

5. **Task 78**: Verification
   - Audit all components
   - Check pattern consistency
   - Verify no inline implementations

### Success Criteria

- [ ] All file uploads use shared FileUploadButton
- [ ] All file upload logic uses useFileUpload hook
- [ ] Zero inline implementations
- [ ] Components follow single responsibility
- [ ] Hooks tested independently
- [ ] TypeScript types for all props

---

## References

- [React Architecture Patterns 2025](https://www.geeksforgeeks.org/reactjs/react-architecture-pattern-and-best-practices/)
- [React Best Practices 2025](https://medium.com/front-end-weekly/top-react-best-practices-in-2025-a06cb92def81)
- [React Project Structure for Scale](https://www.developerway.com/posts/react-project-structure)
- [TypeScript in React 2025](https://medium.com/@theNewGenCoder/typescript-in-react-advancements-and-best-practices-in-2025-c856f1564935)
- ARCHITECTURAL_ANALYSIS.md - Section 2.4: React Anti-Patterns

---

## Notes

This ADR establishes the foundational patterns for React component development in the application. It directly addresses the code duplication issues that led to the PDF removal bug requiring 3 separate commits.

The patterns chosen (custom hooks, composition, service layer integration) are all established React best practices as of 2025, ensuring the codebase follows modern standards.

The "Rule of Three" prevents over-abstraction: only extract shared logic after seeing it duplicated 3 times. This balances DRY principles with pragmatism.

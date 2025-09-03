# Deprecated Routes - Project Structure Migration

As of the subpage hierarchy migration (Task #34), the following routes are deprecated and will be removed in a future release:

## Deprecated Project Routes

### UI Routes
- `/app/routes/app.project.$projectId.tsx` - Project detail page
- `/app/routes/app.projects._index.tsx` - Project listing page  
- `/app/routes/app.projects.new.tsx` - Create new project page
- `/app/routes/projects.$projectId.tsx` - Legacy project view
- `/app/routes/projects.tsx` - Legacy projects listing

### API Routes
- `/app/routes/api.projects.tsx` - Project CRUD API
- `/app/routes/api.projects.search.tsx` - Project search API
- `/app/routes/api.projects.$projectId.pages.tsx` - Project pages API
- `/app/routes/api.projects.$projectId.collaborators.tsx` - Project collaborators API

## Migration Notes

These routes are being replaced by the new page hierarchy structure where:
- Pages belong directly to workspaces (no project intermediary)
- Pages can have infinite nested subpages
- Permissions flow through the page tree

## Temporary Backward Compatibility

The database schema maintains an optional `projectId` field on pages for backward compatibility during the migration period. This will be removed in a future release once all data has been migrated.

## New Routes

- `/app/routes/app.pages.new.tsx` - Create new page (with optional parent)
- `/app/routes/api.pages.$pageId.tsx` - Page operations (move, delete)
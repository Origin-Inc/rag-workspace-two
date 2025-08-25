# Production Improvements for Page Saving

## Critical Issues to Address

### 1. Queue Processing System
Currently, the indexing queue accumulates entries but has no processor. Need:
- Background worker to process queue entries (Redis/BullMQ already in stack)
- Dead letter queue for failed items
- Monitoring and alerting

### 2. Rate Limiting
Implement per-user rate limiting:
```typescript
// Example middleware
const saveRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 saves per minute max
  keyGenerator: (req) => req.user.id
});
```

### 3. Differential Updates
Instead of saving entire block array:
```typescript
// Track changes client-side
const changes = {
  added: [...newBlocks],
  updated: [...modifiedBlocks],
  deleted: [...deletedBlockIds]
};
// Send only changes to server
```

### 4. Optimistic Locking
Prevent concurrent edit conflicts:
```prisma
model Page {
  version Int @default(0)
  // ... other fields
}
```
Check version on update, increment on save.

### 5. Queue Cleanup Strategy
```sql
-- Add TTL to queue entries
ALTER TABLE indexing_queue 
ADD COLUMN expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days');

-- Regular cleanup job
DELETE FROM indexing_queue 
WHERE status IN ('completed', 'failed') 
AND expires_at < NOW();
```

### 6. Performance Optimizations
- **Pagination**: Load blocks in chunks for large documents
- **Virtual Scrolling**: Already implemented in UI
- **Compression**: Compress large JSONB payloads
- **CDN**: Cache read-heavy content

### 7. Monitoring Requirements
```typescript
// Add metrics
const metrics = {
  saveDuration: histogram('page_save_duration_ms'),
  saveErrors: counter('page_save_errors_total'),
  queueDepth: gauge('indexing_queue_depth'),
  blockCount: histogram('page_block_count')
};
```

## Recommended Architecture

```
Client (Debounced) 
    ↓
Rate Limiter
    ↓
API Endpoint
    ↓
Optimistic Lock Check
    ↓
Save to DB (with version++)
    ↓
Queue Indexing Task (async)
    ↓
Background Worker (processes queue)
    ↓
Update Search Index
```

## Database Optimizations

1. **Partial Indexes**:
```sql
CREATE INDEX idx_pages_updated_recently 
ON pages(updated_at) 
WHERE updated_at > NOW() - INTERVAL '7 days';
```

2. **JSONB Indexing**:
```sql
CREATE INDEX idx_page_blocks_gin ON pages USING GIN (blocks);
```

3. **Connection Pooling**: Configure Prisma connection pool
```typescript
datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
  connectionLimit = 10
}
```

## Load Testing Recommendations

Before production:
1. Test with 1000+ concurrent users
2. Pages with 10,000+ blocks
3. Sustained save rate of 100 saves/second
4. Monitor: CPU, Memory, DB connections, Queue depth

## Estimated Capacity (Current Implementation)

With current implementation:
- **Small Scale** (< 100 concurrent users): ✅ Should work fine
- **Medium Scale** (100-1000 users): ⚠️ Need queue processor
- **Large Scale** (1000+ users): ❌ Need all improvements

## Priority Fixes for Production

1. **HIGH**: Implement queue processor (prevents unbounded growth)
2. **HIGH**: Add rate limiting (prevents abuse)
3. **MEDIUM**: Add optimistic locking (prevents data loss)
4. **MEDIUM**: Implement differential updates (reduces bandwidth)
5. **LOW**: Add monitoring/metrics (observability)
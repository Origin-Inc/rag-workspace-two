# LLM Orchestration Layer

Production-ready AI-powered query processing system that understands natural language queries about user data and generates accurate, structured responses with visualizations.

## Overview

The LLM Orchestration Layer is a sophisticated pipeline that processes natural language queries through multiple stages:

1. **Intent Classification** - Determines what the user is asking for
2. **Context Extraction** - Gathers relevant workspace, database, and user context
3. **Query Routing** - Routes to appropriate handler based on intent and context
4. **Query Execution** - Executes the query against databases, RAG, or analytics engines
5. **Structured Output** - Formats responses into rich blocks (tables, charts, text, etc.)

## Architecture

```
User Query
    ↓
IntentClassifier
    ↓
ContextExtractor
    ↓
QueryRouter
    ↓
RouteHandlers → [Database | RAG | Analytics | Hybrid | Action | Fallback]
    ↓
StructuredOutputGenerator
    ↓
Response (Blocks + Metadata)
```

## Key Features

- **Sub-2 second response times** for standard queries
- **Smart caching** with TTL and size limits
- **OpenAI Structured Outputs** for reliable JSON responses
- **Multi-source data fusion** (databases, content, analytics)
- **Rich response formats** (tables, charts, text, insights, actions)
- **Production-ready** with comprehensive error handling
- **Fully tested** with unit, integration, E2E, and performance tests

## API Usage

### REST Endpoint

```typescript
POST /api/llm-orchestration

// Request body
{
  "query": "show my pending tasks from this week",
  "workspaceId": "550e8400-e29b-41d4-a716-446655440000",
  "options": {
    "bypassCache": false,
    "includeDebug": true,
    "maxResponseTime": 5000
  }
}

// Response
{
  "success": true,
  "response": {
    "blocks": [
      {
        "type": "table",
        "columns": [...],
        "rows": [...]
      }
    ],
    "metadata": {
      "confidence": 0.95,
      "dataSources": ["database"],
      "suggestions": [...],
      "followUpQuestions": [...]
    }
  },
  "performance": {
    "totalTime": 1234,
    "intentClassificationTime": 200,
    "contextExtractionTime": 150,
    "routingTime": 50,
    "executionTime": 600,
    "structuringTime": 234
  },
  "debug": {
    "intent": "data_query",
    "confidence": 0.95,
    "routingDecision": "database_query"
  }
}
```

### Programmatic Usage

```typescript
import { LLMOrchestrator } from '~/services/llm-orchestration/orchestrator.server';

const orchestrator = new LLMOrchestrator({
  enabled: true,
  ttl: 300, // 5 minutes
  maxSize: 100
});

const result = await orchestrator.processQuery(
  'show revenue trends for last quarter',
  workspaceId,
  userId,
  {
    bypassCache: false,
    includeDebug: true
  }
);
```

## Query Types Supported

### Data Queries
- "show my tasks"
- "list pending items with high priority"
- "display all projects created this month"

### Content Search
- "find documentation about authentication"
- "search for API reference"
- "locate the setup guide"

### Analytics
- "show revenue trends"
- "analyze task completion rates"
- "compare this quarter to last quarter"

### Summaries
- "summarize project status"
- "what happened this week?"
- "give me an overview"

### Actions
- "create a new task"
- "update project description"
- "delete completed items"

### Navigation
- "go to settings"
- "open dashboard"
- "show workspace"

## Response Block Types

### Table Block
```typescript
{
  type: 'table',
  columns: [
    { id: 'id', name: 'ID', type: 'text' },
    { id: 'title', name: 'Title', type: 'text' },
    { id: 'status', name: 'Status', type: 'select' }
  ],
  rows: [...]
}
```

### Chart Block
```typescript
{
  type: 'chart',
  chartType: 'line' | 'bar' | 'pie' | 'scatter',
  data: {
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [...]
  },
  options: {...}
}
```

### Text Block
```typescript
{
  type: 'text',
  content: 'Formatted text content',
  formatting: {
    style: 'paragraph' | 'heading' | 'code'
  }
}
```

### Insight Block
```typescript
{
  type: 'insight',
  title: 'Key Finding',
  content: 'Description of insight',
  severity: 'info' | 'success' | 'warning' | 'error'
}
```

### Action Confirmation Block
```typescript
{
  type: 'action_confirmation',
  action: 'create_task',
  description: 'Create a new task with...',
  parameters: {...},
  confirmButton: 'Create',
  cancelButton: 'Cancel'
}
```

## Performance Characteristics

- **Intent Classification**: ~200ms
- **Context Extraction**: ~150ms  
- **Query Routing**: ~50ms
- **Query Execution**: 200-1000ms (depends on complexity)
- **Output Structuring**: ~200ms
- **Total Pipeline**: <2000ms for 95% of queries

### Caching Performance
- Cache hit ratio: >80% for repeated queries
- Cache speedup: 10-50x faster
- TTL: Configurable (default 5 minutes)
- Max size: Configurable (default 100 entries)

### Concurrent Request Handling
- 10 concurrent: <5s total
- 50 concurrent: <10s total  
- 100 concurrent: >80% success rate

## Testing

```bash
# Run all tests
npm test app/services/llm-orchestration/__tests__

# Run specific test suites
npm test intent-classifier.test.ts
npm test context-extractor.test.ts
npm test query-router.test.ts
npm test route-handlers.test.ts
npm test structured-output.test.ts
npm test orchestrator.integration.test.ts
npm test api.e2e.test.ts
npm test performance.benchmark.ts
```

### Test Coverage
- Unit tests: All individual components
- Integration tests: Complete pipeline flow
- E2E tests: API endpoint testing
- Performance benchmarks: Load and response time testing

## Configuration

### Environment Variables
```env
# Required
OPENAI_API_KEY=sk-...

# Optional
LLM_CACHE_ENABLED=true
LLM_CACHE_TTL=300
LLM_CACHE_MAX_SIZE=100
LLM_MAX_RESPONSE_TIME=5000
```

### Orchestrator Options
```typescript
{
  enabled: boolean,        // Enable/disable caching
  ttl: number,            // Cache TTL in seconds
  maxSize: number,        // Max cache entries
  debugMode: boolean      // Enable debug logging
}
```

## Error Handling

The system handles various error scenarios gracefully:

- **Invalid workspace**: Returns error message
- **OpenAI failures**: Falls back to basic classification
- **Database errors**: Returns partial results when possible
- **Timeout**: Respects maxResponseTime parameter
- **Rate limiting**: Queues requests appropriately

## Monitoring

The system tracks comprehensive metrics:

- Query volume and types
- Response times per stage
- Cache hit/miss rates
- Error rates and types
- Resource usage

## Development

### Adding New Intent Types

1. Update `QueryIntent` enum in `intent-classifier.server.ts`
2. Add classification logic to prompt
3. Create new route handler if needed
4. Update router logic
5. Add tests

### Adding New Block Types

1. Define block schema in `structured-output.server.ts`
2. Update output generation logic
3. Add frontend rendering component
4. Add tests

### Extending Context

1. Add new context source to `context-extractor.server.ts`
2. Update relevance scoring logic
3. Update enrichment logic
4. Add tests

## Production Checklist

- ✅ OpenAI API key configured
- ✅ Supabase connection established
- ✅ Redis cache available
- ✅ Authentication integrated
- ✅ Rate limiting configured
- ✅ Monitoring enabled
- ✅ Error tracking setup
- ✅ Performance benchmarks passing

## Troubleshooting

### Slow Responses
- Check OpenAI API latency
- Verify database indexes
- Review cache configuration
- Check for N+1 queries

### High Error Rates
- Verify API keys are valid
- Check database connectivity
- Review error logs
- Test with debug mode enabled

### Cache Issues
- Verify Redis connection
- Check TTL configuration
- Monitor memory usage
- Review cache key generation

## Future Enhancements

- [ ] Streaming responses for long queries
- [ ] Multi-language support
- [ ] Custom model fine-tuning
- [ ] Query history and learning
- [ ] Advanced analytics visualizations
- [ ] Collaborative query building
- [ ] Export functionality
- [ ] Webhook integration
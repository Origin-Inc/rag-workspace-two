// Test file for the analytics query system
import { QueryParser } from './app/services/analytics/query-parser.server';
import { QueryExecutor } from './app/services/analytics/query-executor.server';

// Test data
const testColumns = [
  { id: 'col1', name: 'Product Name', type: 'text' },
  { id: 'col2', name: 'Revenue', type: 'currency' },
  { id: 'col3', name: 'Units Sold', type: 'number' },
  { id: 'col4', name: 'Sale Date', type: 'date' },
  { id: 'col5', name: 'Category', type: 'select' }
];

const testQueries = [
  "What is the total revenue?",
  "Show me the average units sold",
  "How many products do we have?",
  "What are the top 5 products by revenue?",
  "Show sales from this month",
  "Compare revenue by category",
  "What's the trend of sales over time?",
  "List products with revenue over 1000",
  "Show me the highest revenue product"
];

console.log('Testing Natural Language Query Parser\n');
console.log('=' .repeat(50));

testQueries.forEach((query, index) => {
  console.log(`\n${index + 1}. Query: "${query}"`);
  
  const parsed = QueryParser.parse(query, testColumns);
  
  console.log('   Intent:', parsed.intent);
  console.log('   Confidence:', `${parsed.confidence}%`);
  
  if (parsed.aggregation) {
    console.log('   Aggregation:', parsed.aggregation);
  }
  
  if (parsed.column) {
    const col = testColumns.find(c => c.id === parsed.column);
    console.log('   Target Column:', col?.name || parsed.column);
  }
  
  if (parsed.filters && parsed.filters.length > 0) {
    console.log('   Filters:', parsed.filters);
  }
  
  if (parsed.dateRange) {
    console.log('   Date Range:', parsed.dateRange.type);
  }
  
  if (parsed.limit) {
    console.log('   Limit:', parsed.limit);
  }
  
  if (parsed.orderBy) {
    console.log('   Order By:', parsed.orderBy);
  }
});

console.log('\n' + '=' .repeat(50));
console.log('✅ Query parsing test complete!');
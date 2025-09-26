// Import the matcher
import { FuzzyFileMatcherClient } from './app/services/fuzzy-file-matcher.client.ts';

const mockFiles = [
  {
    id: '1',
    filename: 'sales_data_2024.csv',
    tableName: 'sales_data_2024',
    uploadedAt: new Date().toISOString(),
    schema: [],
    rowCount: 100,
    sizeBytes: 5000,
    status: 'ready'
  }
];

console.log("Testing 'summarize' with mockFiles:", mockFiles);
const results = FuzzyFileMatcherClient.matchFiles('summarize', mockFiles, {
  confidenceThreshold: 0,
  maxResults: 10
});

console.log("Results:", results);
console.log("Results length:", results.length);
import { useState, useEffect } from 'react';
import { getDuckDB } from '~/services/duckdb/duckdb-service.client';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  error?: string;
  duration?: number;
}

export function DuckDBComprehensiveTest() {
  const [tests, setTests] = useState<TestResult[]>([
    { name: 'Initialize DuckDB', status: 'pending' },
    { name: 'Create table from CSV', status: 'pending' },
    { name: 'Create table from JSON', status: 'pending' },
    { name: 'Execute SELECT query', status: 'pending' },
    { name: 'Execute aggregation query', status: 'pending' },
    { name: 'Handle large dataset', status: 'pending' },
    { name: 'Test error handling', status: 'pending' },
    { name: 'Test cleanup', status: 'pending' },
  ]);

  const updateTest = (name: string, updates: Partial<TestResult>) => {
    setTests(prev => prev.map(test => 
      test.name === name ? { ...test, ...updates } : test
    ));
  };

  const runTests = async () => {
    const duckdb = getDuckDB();
    const startTime = Date.now();

    // Test 1: Initialize DuckDB
    updateTest('Initialize DuckDB', { status: 'running' });
    try {
      await duckdb.initialize();
      updateTest('Initialize DuckDB', { 
        status: 'passed', 
        message: 'DuckDB initialized successfully',
        duration: Date.now() - startTime 
      });
    } catch (error) {
      updateTest('Initialize DuckDB', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return;
    }

    // Test 2: Create table from CSV
    updateTest('Create table from CSV', { status: 'running' });
    try {
      const csvData = `id,name,age,city
1,John Doe,30,New York
2,Jane Smith,25,Los Angeles
3,Bob Johnson,35,Chicago
4,Alice Brown,28,Houston
5,Charlie Wilson,32,Phoenix`;
      
      await duckdb.createTableFromCSV('test_users', csvData);
      const count = await duckdb.getTableRowCount('test_users');
      updateTest('Create table from CSV', { 
        status: 'passed', 
        message: `Table created with ${count} rows`,
        duration: Date.now() - startTime 
      });
    } catch (error) {
      updateTest('Create table from CSV', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 3: Create table from JSON
    updateTest('Create table from JSON', { status: 'running' });
    try {
      const jsonData = [
        { product_id: 1, name: 'Laptop', price: 999.99, category: 'Electronics' },
        { product_id: 2, name: 'Mouse', price: 29.99, category: 'Electronics' },
        { product_id: 3, name: 'Desk', price: 299.99, category: 'Furniture' },
        { product_id: 4, name: 'Chair', price: 199.99, category: 'Furniture' },
      ];
      
      await duckdb.createTableFromJSON('products', jsonData);
      const count = await duckdb.getTableRowCount('products');
      updateTest('Create table from JSON', { 
        status: 'passed', 
        message: `Table created with ${count} rows`,
        duration: Date.now() - startTime 
      });
    } catch (error) {
      updateTest('Create table from JSON', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 4: Execute SELECT query
    updateTest('Execute SELECT query', { status: 'running' });
    try {
      const result = await duckdb.executeQuery('SELECT * FROM test_users WHERE age > 28');
      updateTest('Execute SELECT query', { 
        status: 'passed', 
        message: `Query returned ${result.length} rows`,
        duration: Date.now() - startTime 
      });
    } catch (error) {
      updateTest('Execute SELECT query', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 5: Execute aggregation query
    updateTest('Execute aggregation query', { status: 'running' });
    try {
      const result = await duckdb.executeQuery(`
        SELECT 
          category,
          COUNT(*) as count,
          AVG(price) as avg_price,
          MIN(price) as min_price,
          MAX(price) as max_price
        FROM products
        GROUP BY category
        ORDER BY avg_price DESC
      `);
      updateTest('Execute aggregation query', { 
        status: 'passed', 
        message: `Aggregation successful: ${result.length} categories`,
        duration: Date.now() - startTime 
      });
    } catch (error) {
      updateTest('Execute aggregation query', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 6: Handle large dataset
    updateTest('Handle large dataset', { status: 'running' });
    try {
      // Generate larger dataset
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        value: Math.random() * 1000,
        category: `Category ${(i % 10) + 1}`,
        timestamp: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
      }));
      
      await duckdb.createTableFromJSON('large_dataset', largeData);
      const result = await duckdb.executeQuery(`
        SELECT 
          category,
          COUNT(*) as count,
          AVG(value) as avg_value
        FROM large_dataset
        GROUP BY category
        HAVING COUNT(*) > 50
      `);
      
      updateTest('Handle large dataset', { 
        status: 'passed', 
        message: `Processed 1000 rows, ${result.length} groups found`,
        duration: Date.now() - startTime 
      });
    } catch (error) {
      updateTest('Handle large dataset', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }

    // Test 7: Test error handling
    updateTest('Test error handling', { status: 'running' });
    try {
      // This should fail
      await duckdb.executeQuery('SELECT * FROM non_existent_table');
      updateTest('Test error handling', { 
        status: 'failed', 
        error: 'Should have thrown an error for non-existent table' 
      });
    } catch (error) {
      updateTest('Test error handling', { 
        status: 'passed', 
        message: 'Error handling works correctly',
        duration: Date.now() - startTime 
      });
    }

    // Test 8: Test cleanup
    updateTest('Test cleanup', { status: 'running' });
    try {
      await duckdb.dropTable('test_users');
      await duckdb.dropTable('products');
      await duckdb.dropTable('large_dataset');
      
      const tables = await duckdb.getTables();
      updateTest('Test cleanup', { 
        status: 'passed', 
        message: `Cleanup successful, ${tables.length} tables remaining`,
        duration: Date.now() - startTime 
      });
    } catch (error) {
      updateTest('Test cleanup', { 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-500';
      case 'running': return 'text-yellow-500';
      case 'passed': return 'text-green-500';
      case 'failed': return 'text-red-500';
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'passed': return '✅';
      case 'failed': return '❌';
    }
  };

  const totalTests = tests.length;
  const passedTests = tests.filter(t => t.status === 'passed').length;
  const failedTests = tests.filter(t => t.status === 'failed').length;
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">DuckDB WASM Comprehensive Test Suite</h2>
      
      {/* Summary */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{totalTests}</div>
            <div className="text-sm text-gray-600">Total Tests</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-500">{passedTests}</div>
            <div className="text-sm text-gray-600">Passed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-500">{failedTests}</div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-500">{passRate}%</div>
            <div className="text-sm text-gray-600">Pass Rate</div>
          </div>
        </div>
      </div>

      {/* Test Results */}
      <div className="space-y-3">
        {tests.map((test) => (
          <div key={test.name} className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{getStatusIcon(test.status)}</span>
                <div>
                  <div className={`font-medium ${getStatusColor(test.status)}`}>
                    {test.name}
                  </div>
                  {test.message && (
                    <div className="text-sm text-gray-600 mt-1">{test.message}</div>
                  )}
                  {test.error && (
                    <div className="text-sm text-red-600 mt-1">Error: {test.error}</div>
                  )}
                </div>
              </div>
              {test.duration && (
                <div className="text-sm text-gray-500">
                  {test.duration}ms
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rerun Button */}
      <button
        onClick={runTests}
        className="mt-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Rerun Tests
      </button>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { getDuckDB } from '~/services/duckdb/duckdb-service.client';

export function DuckDBTest() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    const initDuckDB = async () => {
      setStatus('loading');
      setMessage('Initializing DuckDB...');
      
      try {
        const duckdb = getDuckDB();
        await duckdb.initialize();
        
        setMessage('DuckDB initialized! Running test query...');
        
        // Run a simple test query
        const result = await duckdb.executeQuery('SELECT 42 as answer, current_date as date');
        setTestResult(result);
        
        setStatus('success');
        setMessage('DuckDB is working correctly!');
      } catch (error) {
        setStatus('error');
        setMessage(`Error: ${error}`);
        console.error('DuckDB initialization failed:', error);
      }
    };

    initDuckDB();
  }, []);

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-2">DuckDB WASM Test</h3>
      
      <div className="mb-2">
        <span className="font-medium">Status: </span>
        <span className={`
          ${status === 'loading' ? 'text-yellow-600' : ''}
          ${status === 'success' ? 'text-green-600' : ''}
          ${status === 'error' ? 'text-red-600' : ''}
        `}>
          {status}
        </span>
      </div>
      
      <div className="mb-2">
        <span className="font-medium">Message: </span>
        <span>{message}</span>
      </div>
      
      {testResult && (
        <div className="mt-4 p-2 bg-gray-50 rounded">
          <div className="font-medium mb-1">Test Query Result:</div>
          <pre className="text-sm">{JSON.stringify(testResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
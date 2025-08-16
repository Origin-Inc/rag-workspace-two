import { useState } from 'react';
import { json } from '@remix-run/node';
import { useFetcher } from '@remix-run/react';

export async function action() {
  // Simulate API delay for testing
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000));
  
  // Randomly fail sometimes to test error tracking
  if (Math.random() > 0.8) {
    throw new Response('Simulated error for testing', { status: 500 });
  }
  
  return json({ 
    success: true, 
    timestamp: Date.now(),
    responseTime: Math.random() * 1000 
  });
}

export default function TestMonitoring() {
  const [renderCount, setRenderCount] = useState(0);
  const [throwError, setThrowError] = useState(false);
  const fetcher = useFetcher();

  // Test error boundary
  if (throwError) {
    throw new Error('Test error for monitoring!');
  }

  // Force re-render to test component tracking
  const forceRerender = () => {
    setRenderCount(prev => prev + 1);
  };

  // Test API monitoring
  const testAPI = () => {
    fetcher.submit({}, { method: 'post' });
  };

  // Test slow operation
  const testSlowOperation = () => {
    const start = Date.now();
    // Block main thread briefly
    while (Date.now() - start < 100) {
      // Intentionally blocking
    }
    console.log('Slow operation completed');
  };

  // Test memory allocation
  const testMemory = () => {
    const bigArray = new Array(1000000).fill('test data for memory monitoring');
    console.log('Allocated large array:', bigArray.length);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
          Monitoring System Test Page
        </h1>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">How to Verify Monitoring:</h2>
          
          <ol className="space-y-4 text-gray-700 dark:text-gray-300">
            <li className="flex gap-2">
              <span className="font-bold">1.</span>
              <div>
                <p className="font-medium">Open Browser Console (F12)</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  You should see: "✅ Performance monitoring initialized"
                </p>
              </div>
            </li>
            
            <li className="flex gap-2">
              <span className="font-bold">2.</span>
              <div>
                <p className="font-medium">Check Console Commands</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Run in console: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">window.performanceMonitor.getMetrics()</code>
                </p>
              </div>
            </li>
            
            <li className="flex gap-2">
              <span className="font-bold">3.</span>
              <div>
                <p className="font-medium">Open Metrics Dashboard</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <a href="/dev/metrics" className="text-blue-600 hover:underline" target="_blank">
                    Open /dev/metrics in new tab
                  </a>
                </p>
              </div>
            </li>
          </ol>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Test Monitoring Features:</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={testAPI}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Test API Call (20% error rate)
            </button>
            
            <button
              onClick={forceRerender}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              Force Re-render ({renderCount} times)
            </button>
            
            <button
              onClick={testSlowOperation}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
            >
              Test Slow Operation (100ms block)
            </button>
            
            <button
              onClick={testMemory}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
            >
              Test Memory Allocation
            </button>
            
            <button
              onClick={() => setThrowError(true)}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Trigger Error (Test Error Boundary)
            </button>
            
            <button
              onClick={() => {
                console.log('=== Current Metrics ===');
                console.log('Web Vitals:', window.performanceMonitor?.getCurrentMetrics());
                console.log('API Stats:', window.apiMonitor?.getStats());
                console.log('Component Metrics:', window.componentTracker?.getMetrics());
                alert('Check console for metrics!');
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Log All Metrics to Console
            </button>
          </div>
          
          {fetcher.data && (
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded">
              <p className="text-sm font-mono">
                API Response: {JSON.stringify(fetcher.data)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
            What to Look For:
          </h3>
          <ul className="text-sm space-y-1 text-blue-800 dark:text-blue-400">
            <li>• After clicking buttons, check /dev/metrics for updated stats</li>
            <li>• API calls should appear in the "API Performance" section</li>
            <li>• Component renders should show in "Component Render Performance"</li>
            <li>• Web Vitals should show actual values (not just "-")</li>
            <li>• Memory usage bar should show current heap usage</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
/**
 * Virtual Table Test Route
 * Task #81: Testing virtual scrolling implementation
 *
 * Temporary test route to verify VirtualTable performance with 10,000 rows.
 * Access at: /app/test-virtual-table
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { requireUser } from '~/services/auth/auth.server';
import { VirtualTable } from '~/components/shared/VirtualTable';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json({ user });
}

export default function TestVirtualTable() {
  // Generate large mock dataset (10,000 rows)
  const mockData = Array.from({ length: 10000 }, (_, i) => ({
    id: String(i),
    name: `Person ${i}`,
    email: `person${i}@example.com`,
    age: Math.floor(Math.random() * 80) + 18,
    salary: Math.floor(Math.random() * 150000) + 30000,
    department: ['Engineering', 'Sales', 'Marketing', 'HR'][Math.floor(Math.random() * 4)],
    joinDate: new Date(
      2020 + Math.floor(Math.random() * 4),
      Math.floor(Math.random() * 12),
      Math.floor(Math.random() * 28)
    ).toISOString(),
  }));

  const columns = [
    { id: 'name', name: 'Name', width: 150 },
    { id: 'email', name: 'Email', width: 200 },
    { id: 'age', name: 'Age', type: 'number' as const, width: 80 },
    { id: 'salary', name: 'Salary', type: 'currency' as const, width: 120 },
    { id: 'department', name: 'Department', width: 120 },
    { id: 'joinDate', name: 'Join Date', type: 'date' as const, width: 120 },
  ];

  return (
    <div className="min-h-screen bg-theme-bg-primary p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-theme-text-primary mb-2">
            Virtual Table Test
          </h1>
          <p className="text-sm text-theme-text-secondary">
            Testing virtual scrolling with 10,000 rows. Scroll rapidly to test performance.
          </p>
        </div>

        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Performance Targets:
          </h2>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>✓ Smooth 60fps scrolling</li>
            <li>✓ Less than 16ms per frame</li>
            <li>✓ Only 20-30 rows rendered at once</li>
            <li>✓ Instant jump scrolling to any position</li>
          </ul>
        </div>

        <VirtualTable
          columns={columns}
          data={mockData}
          height={600}
          showRowNumbers={true}
          striped={true}
          hoverable={true}
          onRowClick={(row, index) => {
            console.log('Row clicked:', { row, index });
          }}
        />

        <div className="mt-4 p-4 bg-theme-bg-secondary border border-theme-border rounded-lg">
          <h3 className="text-sm font-semibold text-theme-text-primary mb-2">
            How to Test:
          </h3>
          <ol className="text-sm text-theme-text-secondary space-y-1 list-decimal list-inside">
            <li>Scroll rapidly up and down - should feel smooth</li>
            <li>Jump to bottom using scrollbar - should be instant</li>
            <li>Open Chrome DevTools → Performance tab</li>
            <li>Record while scrolling - check for 60fps (green bars, &lt;16ms frames)</li>
            <li>Click rows to test interaction (check console)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

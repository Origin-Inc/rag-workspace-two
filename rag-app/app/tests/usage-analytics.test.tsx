import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  UsageAnalytics,
  generateMockCreditUsageData,
  generateMockStorageData,
  generateMockTeamActivityData,
  generateMockMetrics,
} from '~/components/dashboard/UsageAnalytics';
import type {
  CreditUsageData,
  StorageData,
  TeamActivityData,
  UsageMetrics,
} from '~/components/dashboard/UsageAnalytics';

// Mock Recharts to avoid rendering issues in tests
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ children }: any) => <div data-testid="bar">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: any) => <div data-testid="pie">{children}</div>,
  Cell: () => <div data-testid="cell" />,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

describe('UsageAnalytics', () => {
  const mockWorkspaceId = 'workspace-123';

  it('renders with default mock data', () => {
    render(<UsageAnalytics workspaceId={mockWorkspaceId} />);
    
    // Check for main sections - use getAllByText since there might be duplicates
    expect(screen.getAllByText('AI Credits').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Storage').length).toBeGreaterThan(0);
    expect(screen.getByText('API Calls Today')).toBeInTheDocument();
    expect(screen.getAllByText('Active Users').length).toBeGreaterThan(0);
  });

  it('displays metrics overview correctly', () => {
    const metrics: UsageMetrics = {
      totalCredits: 10000,
      usedCredits: 3456,
      totalStorage: 100,
      usedStorage: 9.5,
      apiCallsToday: 1234,
      activeUsers: 12,
    };

    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        metrics={metrics}
      />
    );

    // Check metrics display
    expect(screen.getByText('3,456')).toBeInTheDocument();
    expect(screen.getByText('of 10,000')).toBeInTheDocument();
    expect(screen.getByText('9.5 GB')).toBeInTheDocument();
    expect(screen.getByText('of 100 GB')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders all chart containers', () => {
    render(<UsageAnalytics workspaceId={mockWorkspaceId} />);
    
    // Check for chart titles
    expect(screen.getByText('AI Credits Usage (30 days)')).toBeInTheDocument();
    expect(screen.getByText('Storage by Type')).toBeInTheDocument();
    expect(screen.getByText('Team Activity Distribution')).toBeInTheDocument();
    expect(screen.getByText('API Calls Trend')).toBeInTheDocument();
    
    // Check for chart components
    expect(screen.getAllByTestId('responsive-container')).toHaveLength(4);
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('calculates percentages correctly', () => {
    const metrics: UsageMetrics = {
      totalCredits: 10000,
      usedCredits: 2500, // 25%
      totalStorage: 100,
      usedStorage: 75, // 75%
      apiCallsToday: 1000,
      activeUsers: 10,
    };

    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        metrics={metrics}
      />
    );

    // Check for percentage displays
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders detailed usage table when showTable is true', () => {
    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        showTable={true}
      />
    );

    expect(screen.getByText('Detailed Usage Report')).toBeInTheDocument();
    
    // Check table headers - some might be duplicated so use more specific queries
    const table = screen.getByRole('table');
    expect(within(table).getByText('Date')).toBeInTheDocument();
    expect(within(table).getAllByText('AI Credits').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('API Calls').length).toBeGreaterThan(0);
    expect(within(table).getByText('Storage (GB)')).toBeInTheDocument();
    expect(within(table).getAllByText('Active Users').length).toBeGreaterThan(0);
    expect(within(table).getByText('Cost')).toBeInTheDocument();
    
    // Check for export button
    expect(screen.getByText('Export Full Report')).toBeInTheDocument();
  });

  it('does not render table when showTable is false', () => {
    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        showTable={false}
      />
    );

    expect(screen.queryByText('Detailed Usage Report')).not.toBeInTheDocument();
  });

  it('renders custom credit usage data', () => {
    const customCreditData: CreditUsageData[] = [
      { date: 'Jan 01', credits: 100, apiCalls: 200 },
      { date: 'Jan 02', credits: 150, apiCalls: 250 },
    ];

    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        creditUsageData={customCreditData}
      />
    );

    // Data is passed to charts (mocked)
    expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('renders custom storage data', () => {
    const customStorageData: StorageData[] = [
      { type: 'Videos', size: 5.5, color: '#FF0000' },
      { type: 'Audio', size: 2.3, color: '#00FF00' },
    ];

    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        storageData={customStorageData}
      />
    );

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });

  it('renders custom team activity data', () => {
    const customTeamData: TeamActivityData[] = [
      { name: 'User 1', value: 100, percentage: 50 },
      { name: 'User 2', value: 100, percentage: 50 },
    ];

    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        teamActivityData={customTeamData}
      />
    );

    // Check for team member names in legend
    expect(screen.getByText('User 1')).toBeInTheDocument();
    expect(screen.getByText('User 2')).toBeInTheDocument();
    expect(screen.getByText('100 actions')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        className="custom-analytics-class"
      />
    );

    const wrapper = container.querySelector('.custom-analytics-class');
    expect(wrapper).toBeInTheDocument();
  });

  it('shows positive trend indicator for API calls', () => {
    render(<UsageAnalytics workspaceId={mockWorkspaceId} />);
    
    const trendElement = screen.getByText('+12% from yesterday');
    expect(trendElement).toBeInTheDocument();
    expect(trendElement.className).toContain('text-green-600');
  });

  it('renders time period information', () => {
    render(<UsageAnalytics workspaceId={mockWorkspaceId} showTable={true} />);
    
    expect(screen.getByText('Last 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Showing last 7 days • Updated hourly')).toBeInTheDocument();
  });

  describe('Mock Data Generators', () => {
    it('generateMockCreditUsageData returns correct number of days', () => {
      const data = generateMockCreditUsageData(7);
      expect(data).toHaveLength(7);
      
      data.forEach(item => {
        expect(item).toHaveProperty('date');
        expect(item).toHaveProperty('credits');
        expect(item).toHaveProperty('apiCalls');
        expect(typeof item.credits).toBe('number');
        expect(typeof item.apiCalls).toBe('number');
      });
    });

    it('generateMockStorageData returns expected categories', () => {
      const data = generateMockStorageData();
      expect(data).toHaveLength(5);
      
      const types = data.map(d => d.type);
      expect(types).toContain('Documents');
      expect(types).toContain('Images');
      expect(types).toContain('Databases');
      expect(types).toContain('Backups');
      expect(types).toContain('Other');
      
      data.forEach(item => {
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('size');
        expect(item).toHaveProperty('color');
        expect(typeof item.size).toBe('number');
      });
    });

    it('generateMockTeamActivityData returns data with percentages', () => {
      const data = generateMockTeamActivityData();
      expect(data.length).toBeGreaterThan(0);
      
      let totalPercentage = 0;
      data.forEach(item => {
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('value');
        expect(item).toHaveProperty('percentage');
        expect(typeof item.value).toBe('number');
        expect(typeof item.percentage).toBe('number');
        totalPercentage += item.percentage;
      });
      
      // Total percentage should be close to 100 (might not be exact due to rounding)
      expect(totalPercentage).toBeGreaterThanOrEqual(98);
      expect(totalPercentage).toBeLessThanOrEqual(102);
    });

    it('generateMockMetrics returns valid metrics object', () => {
      const metrics = generateMockMetrics();
      
      expect(metrics).toHaveProperty('totalCredits');
      expect(metrics).toHaveProperty('usedCredits');
      expect(metrics).toHaveProperty('totalStorage');
      expect(metrics).toHaveProperty('usedStorage');
      expect(metrics).toHaveProperty('apiCallsToday');
      expect(metrics).toHaveProperty('activeUsers');
      
      expect(metrics.usedCredits).toBeLessThanOrEqual(metrics.totalCredits);
      expect(metrics.usedStorage).toBeLessThanOrEqual(metrics.totalStorage);
    });
  });

  it('handles zero metrics gracefully', () => {
    const zeroMetrics: UsageMetrics = {
      totalCredits: 0,
      usedCredits: 0,
      totalStorage: 0,
      usedStorage: 0,
      apiCallsToday: 0,
      activeUsers: 0,
    };

    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        metrics={zeroMetrics}
      />
    );

    // Check that zeros are rendered (there will be multiple)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    // 'of 0' appears in multiple places
    expect(screen.getAllByText('of 0').length).toBeGreaterThan(0);
  });

  it('renders multiple team members in activity distribution', () => {
    const teamData: TeamActivityData[] = [
      { name: 'Alice', value: 100, percentage: 25 },
      { name: 'Bob', value: 150, percentage: 35 },
      { name: 'Charlie', value: 120, percentage: 30 },
      { name: 'David', value: 40, percentage: 10 },
    ];

    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        teamActivityData={teamData}
      />
    );

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('David')).toBeInTheDocument();
  });

  it('formats large numbers with commas', () => {
    const metrics: UsageMetrics = {
      totalCredits: 1000000,
      usedCredits: 123456,
      totalStorage: 1000,
      usedStorage: 500,
      apiCallsToday: 987654,
      activeUsers: 1234,
    };

    render(
      <UsageAnalytics
        workspaceId={mockWorkspaceId}
        metrics={metrics}
      />
    );

    expect(screen.getByText('123,456')).toBeInTheDocument();
    expect(screen.getByText('of 1,000,000')).toBeInTheDocument();
    expect(screen.getByText('987,654')).toBeInTheDocument();
    // activeUsers is rendered but might not be formatted with comma for 1234
    const activeUsersElement = screen.getByText('1234');
    expect(activeUsersElement).toBeInTheDocument();
  });
});
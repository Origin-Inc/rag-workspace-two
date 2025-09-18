import { useEffect, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ChartBlockProps {
  id: string;
  content: {
    title?: string;
    config?: {
      type: 'bar' | 'line' | 'pie' | 'doughnut' | 'scatter';
      data: {
        labels: string[];
        datasets: Array<{
          label?: string;
          data: number[];
          backgroundColor?: string[];
          borderColor?: string;
        }>;
      };
      options?: any;
    };
  };
  onUpdate?: (content: any) => void;
  onDelete?: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

// Dark mode colors for better contrast
const DARK_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#6ee7b7'];

export function ChartBlock({ id, content, onUpdate, onDelete }: ChartBlockProps) {
  // Check if dark mode is active
  const isDarkMode = typeof window !== 'undefined' && document.documentElement.classList.contains('dark');
  const chartColors = isDarkMode ? DARK_COLORS : COLORS;
  
  if (!content?.config?.data) {
    return (
      <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">No chart data available</p>
      </div>
    );
  }

  const { title, config } = content;
  const { type = 'bar', data } = config || {};
  
  // Validate data structure
  if (!data || !data.labels || !Array.isArray(data.labels)) {
    console.error('[ChartBlock] Invalid data structure:', data);
    return (
      <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">Invalid chart data structure</p>
      </div>
    );
  }
  
  // Transform data for recharts format
  const chartData = data.labels.map((label, index) => {
    const point: any = { name: label };
    if (data.datasets && Array.isArray(data.datasets)) {
      data.datasets.forEach((dataset, datasetIndex) => {
        if (dataset && dataset.data && Array.isArray(dataset.data)) {
          point[`value${datasetIndex}`] = dataset.data[index] || 0;
        }
      });
    }
    return point;
  });

  const renderChart = () => {
    switch (type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="name" stroke={isDarkMode ? '#9ca3af' : '#4b5563'} />
              <YAxis stroke={isDarkMode ? '#9ca3af' : '#4b5563'} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                  border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.375rem'
                }}
                labelStyle={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}
              />
              <Legend 
                wrapperStyle={{ color: isDarkMode ? '#9ca3af' : '#4b5563' }}
              />
              {data.datasets.map((dataset, index) => (
                <Bar 
                  key={index}
                  dataKey={`value${index}`}
                  fill={chartColors[index % chartColors.length]}
                  name={dataset.label || `Series ${index + 1}`}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
              <XAxis dataKey="name" stroke={isDarkMode ? '#9ca3af' : '#4b5563'} />
              <YAxis stroke={isDarkMode ? '#9ca3af' : '#4b5563'} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                  border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.375rem'
                }}
                labelStyle={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}
              />
              <Legend 
                wrapperStyle={{ color: isDarkMode ? '#9ca3af' : '#4b5563' }}
              />
              {data.datasets.map((dataset, index) => (
                <Line
                  key={index}
                  type="monotone"
                  dataKey={`value${index}`}
                  stroke={chartColors[index % chartColors.length]}
                  name={dataset.label || `Series ${index + 1}`}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );
      
      case 'pie':
      case 'doughnut':
        const pieData = chartData.map((item, index) => ({
          name: item.name,
          value: item.value0
        }));
        
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                labelStyle={{ fill: isDarkMode ? '#f3f4f6' : '#111827' }}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                  border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
                  borderRadius: '0.375rem'
                }}
                labelStyle={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      
      default:
        return (
          <div className="p-4 text-gray-500">
            Unsupported chart type: {type}
          </div>
        );
    }
  };

  return (
    <div className="my-4 p-4 rounded-lg bg-white dark:bg-dark-primary">
      {title && (
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">{title}</h3>
      )}
      <div className="relative">
        {renderChart()}
        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onDelete?.()}
            className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
            title="Delete chart"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
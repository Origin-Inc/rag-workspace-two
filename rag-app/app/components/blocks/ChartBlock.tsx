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

export function ChartBlock({ id, content, onUpdate, onDelete }: ChartBlockProps) {
  if (!content?.config?.data) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
        <p className="text-gray-500">No chart data available</p>
      </div>
    );
  }

  const { title, config } = content;
  const { type = 'bar', data } = config || {};
  
  // Validate data structure
  if (!data || !data.labels || !Array.isArray(data.labels)) {
    console.error('[ChartBlock] Invalid data structure:', data);
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
        <p className="text-gray-500">Invalid chart data structure</p>
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
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              {data.datasets.map((dataset, index) => (
                <Bar 
                  key={index}
                  dataKey={`value${index}`}
                  fill={COLORS[index % COLORS.length]}
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
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              {data.datasets.map((dataset, index) => (
                <Line
                  key={index}
                  type="monotone"
                  dataKey={`value${index}`}
                  stroke={COLORS[index % COLORS.length]}
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
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
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
    <div className="my-4 p-4 border border-gray-200 rounded-lg bg-white">
      {title && (
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
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
import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from 'recharts';
import { Download, Maximize2, Info, Sparkles, Copy, Check } from 'lucide-react';

export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'radar' | 'mixed';

export interface ChartData {
  labels?: string[];
  datasets: Array<{
    label: string;
    data: number[] | Array<{ name: string; value: number; [key: string]: any }>;
    backgroundColor?: string | string[];
    borderColor?: string;
    borderWidth?: number;
    fill?: boolean;
    tension?: number;
    type?: ChartType;
  }>;
}

export interface ChartOutputBlockProps {
  id?: string;
  type: ChartType;
  data: ChartData | any;
  title?: string;
  description?: string;
  options?: {
    responsive?: boolean;
    maintainAspectRatio?: boolean;
    plugins?: {
      legend?: {
        display?: boolean;
        position?: 'top' | 'bottom' | 'left' | 'right';
      };
      title?: {
        display?: boolean;
        text?: string;
      };
    };
    scales?: any;
    animations?: boolean;
    interactive?: boolean;
  };
  provenance?: {
    isAIGenerated?: boolean;
    confidence?: number;
    source?: string;
    timestamp?: string;
  };
  onInsert?: (blockData: any) => void;
  className?: string;
  theme?: 'light' | 'dark';
}

// Modern color palette with gradients
const CHART_COLORS = {
  primary: ['#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
  secondary: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ede9fe'],
  success: ['#10b981', '#34d399', '#6ee7b7', '#d1fae5'],
  warning: ['#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7'],
  danger: ['#ef4444', '#f87171', '#fca5a5', '#fee2e2'],
  gradient: [
    'url(#gradient-1)',
    'url(#gradient-2)',
    'url(#gradient-3)',
    'url(#gradient-4)',
  ],
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
          {label}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{entry.value.toLocaleString()}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Format data for Recharts
const formatDataForRecharts = (data: ChartData | any, type: ChartType) => {
  if (type === 'pie') {
    // If data is already in pie chart format
    if (Array.isArray(data)) {
      return data;
    }
    // For pie charts, expect data in the format: [{ name: string, value: number }]
    if (data.datasets && Array.isArray(data.datasets[0]?.data) && typeof data.datasets[0].data[0] === 'object') {
      return data.datasets[0].data;
    }
    // Convert from labels + values format
    if (data.labels && data.datasets && data.datasets[0]?.data) {
      return data.labels.map((label, index) => ({
        name: label,
        value: data.datasets[0].data[index],
      }));
    }
  }
  
  // For other charts, format as array of objects with keys for each dataset
  if (data.labels) {
    return data.labels.map((label, index) => {
      const point: any = { name: label };
      data.datasets.forEach((dataset) => {
        point[dataset.label] = Array.isArray(dataset.data) 
          ? dataset.data[index] 
          : dataset.data;
      });
      return point;
    });
  }
  
  // If data is already in the right format
  return data;
};

export const ChartOutputBlock: React.FC<ChartOutputBlockProps> = ({
  id,
  type,
  data,
  title,
  description,
  options = {},
  provenance,
  onInsert,
  className = '',
  theme = 'light',
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  const formattedData = useMemo(() => formatDataForRecharts(data, type), [data, type]);
  
  const chartColors = useMemo(() => {
    const colorSet = CHART_COLORS.primary;
    return data.datasets?.map((_, index) => colorSet[index % colorSet.length]) || colorSet;
  }, [data]);
  
  const handleExport = useCallback((format: 'csv' | 'json' | 'png') => {
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chart-data-${Date.now()}.json`;
      a.click();
    } else if (format === 'csv') {
      // Convert to CSV
      const headers = ['Label', ...data.datasets.map((d: any) => d.label)].join(',');
      const rows = data.labels?.map((label: string, index: number) => {
        return [label, ...data.datasets.map((d: any) => d.data[index])].join(',');
      }).join('\n');
      const csv = `${headers}\n${rows}`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chart-data-${Date.now()}.csv`;
      a.click();
    }
  }, [data]);
  
  const handleCopyData = useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);
  
  const renderChart = () => {
    const commonProps = {
      data: formattedData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 },
    };
    
    switch (type) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <defs>
              {chartColors.map((color, index) => (
                <linearGradient key={index} id={`gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.3} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {data.datasets?.map((dataset: any, index: number) => (
              <Bar
                key={dataset.label}
                dataKey={dataset.label}
                fill={`url(#gradient-${index})`}
                animationDuration={1000}
                radius={[8, 8, 0, 0]}
              />
            ))}
          </BarChart>
        );
        
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {data.datasets?.map((dataset: any, index: number) => (
              <Line
                key={dataset.label}
                type="monotone"
                dataKey={dataset.label}
                stroke={chartColors[index]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
                animationDuration={1500}
              />
            ))}
          </LineChart>
        );
        
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              {chartColors.map((color, index) => (
                <linearGradient key={index} id={`area-gradient-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {data.datasets?.map((dataset: any, index: number) => (
              <Area
                key={dataset.label}
                type="monotone"
                dataKey={dataset.label}
                stroke={chartColors[index]}
                fill={`url(#area-gradient-${index})`}
                strokeWidth={2}
                animationDuration={1500}
              />
            ))}
          </AreaChart>
        );
        
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={formattedData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={(entry) => `${entry.name}: ${entry.value}`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              animationBegin={0}
              animationDuration={1500}
              onMouseEnter={(_, index) => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {formattedData.map((entry: any, index: number) => (
                <Cell
                  key={`cell-${index}`}
                  fill={chartColors[index % chartColors.length]}
                  style={{
                    filter: hoveredIndex === index ? 'brightness(1.1)' : 'none',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend />
          </PieChart>
        );
        
      case 'scatter':
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="x" tick={{ fontSize: 12 }} />
            <YAxis dataKey="y" tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {data.datasets?.map((dataset: any, index: number) => (
              <Scatter
                key={dataset.label}
                name={dataset.label}
                data={dataset.data}
                fill={chartColors[index]}
              />
            ))}
          </ScatterChart>
        );
        
      case 'radar':
        return (
          <RadarChart data={formattedData}>
            <PolarGrid strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="name" tick={{ fontSize: 12 }} />
            <PolarRadiusAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {data.datasets?.map((dataset: any, index: number) => (
              <Radar
                key={dataset.label}
                name={dataset.label}
                dataKey={dataset.label}
                stroke={chartColors[index]}
                fill={chartColors[index]}
                fillOpacity={0.6}
              />
            ))}
          </RadarChart>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div
      className={`
        chart-output-block rounded-xl border bg-white dark:bg-gray-900 shadow-sm
        ${isFullscreen ? 'fixed inset-4 z-50' : ''}
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b dark:border-gray-800">
        <div className="flex-1">
          {title && (
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          {/* AI Generated Badge */}
          {provenance?.isAIGenerated && (
            <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded-full">
              <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                AI Generated
              </span>
              {provenance.confidence && (
                <span className="text-xs text-purple-500 dark:text-purple-500">
                  {Math.round(provenance.confidence * 100)}%
                </span>
              )}
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleExport('json')}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Export as JSON"
            >
              <Download className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            
            <button
              onClick={handleCopyData}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Copy data"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              )}
            </button>
            
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Toggle fullscreen"
            >
              <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            
            {provenance?.source && (
              <button
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={`Source: ${provenance.source}`}
              >
                <Info className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Chart Container */}
      <div className="p-6">
        <ResponsiveContainer width="100%" height={isFullscreen ? 500 : 400}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
      
      {/* Footer with Insert Button */}
      {onInsert && (
        <div className="px-4 py-3 border-t dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl">
          <button
            onClick={() => onInsert({ type: 'chart', data, chartType: type, title, description })}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Insert into Page
          </button>
        </div>
      )}
    </div>
  );
};
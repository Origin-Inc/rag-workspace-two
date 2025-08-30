import { useState } from 'react';
import { AIOutputBlock } from '~/components/blocks/AIOutputBlock';
import { CitationWrapper, type CitationData } from '~/components/citations/CitationWrapper';
import { ProvenanceBadge } from '~/components/citations/ProvenanceBadge';
import { ConfidenceIndicator, ConfidenceBar, TrustScore } from '~/components/citations/ConfidenceIndicator';
import type { StructuredResponse } from '~/services/llm-orchestration/structured-output.server';
import type { SourceDocument } from '~/components/citations/SourceDetailsPanel';
import { FileText, Database, Brain, Sparkles } from 'lucide-react';

export default function CitationsDemo() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [selectedDemo, setSelectedDemo] = useState<'workspace' | 'mixed' | 'general' | 'database'>('workspace');
  
  // Demo citations for workspace data query
  const workspaceCitations: CitationData = {
    sources: [
      {
        id: '1',
        type: 'document',
        title: 'Q4 2024 Revenue Report',
        excerpt: 'Total revenue for Q4 2024 reached $438,000, representing a 23% increase from Q3...',
        relevanceScore: 0.95,
        confidence: 0.92,
        url: '/app/projects/123/pages/revenue-report',
        pageNumber: 3,
        section: 'Executive Summary',
        lastModified: '2024-12-15',
        wordCount: 2450,
        highlightedText: [
          'Total revenue for Q4 2024 reached $438,000',
          '23% increase from Q3, driven primarily by enterprise sales',
          'December showed the strongest performance with $168,000'
        ],
        metadata: {
          author: 'Finance Team',
          department: 'Finance',
          documentType: 'Report'
        }
      },
      {
        id: '2',
        type: 'database',
        title: 'Sales Database - Enterprise Deals',
        excerpt: 'Enterprise plan sales data showing 45 closed deals in December 2024...',
        relevanceScore: 0.88,
        confidence: 0.85,
        url: '/app/databases/sales-tracking',
        section: 'Enterprise Sales Table',
        lastModified: '2024-12-31',
        highlightedText: [
          '45 enterprise deals closed in December',
          'Average deal size: $1,978',
          'Total enterprise revenue: $89,000'
        ],
        metadata: {
          tableRows: 145,
          lastUpdated: '2024-12-31',
          dataSource: 'CRM Integration'
        }
      },
      {
        id: '3',
        type: 'page',
        title: 'Sales Team Meeting Notes - December',
        excerpt: 'Discussion of Q4 performance and key wins...',
        relevanceScore: 0.72,
        confidence: 0.78,
        url: '/app/projects/123/pages/meeting-notes-dec',
        lastModified: '2024-12-20',
        highlightedText: [
          'Record-breaking month with highest revenue in company history',
          'Enterprise segment exceeded targets by 15%'
        ]
      }
    ],
    overallConfidence: 0.85,
    isWorkspaceData: true,
    retrievalMetrics: {
      totalDocumentsSearched: 247,
      timeMs: 145,
      queryEmbeddingSimilarity: 0.89
    }
  };
  
  // Demo citations for mixed sources
  const mixedCitations: CitationData = {
    sources: [
      {
        id: '4',
        type: 'workspace',
        title: 'Product Roadmap 2025',
        excerpt: 'AI-powered features planned for Q1 2025 release...',
        relevanceScore: 0.91,
        confidence: 0.88,
        url: '/app/projects/456/pages/roadmap',
        section: 'Q1 Priorities',
        lastModified: '2024-12-10'
      },
      {
        id: '5',
        type: 'general',
        title: 'General AI Knowledge',
        excerpt: 'Based on general understanding of AI implementation best practices...',
        relevanceScore: 0.75,
        confidence: 0.70,
        metadata: {
          knowledgeType: 'Training Data',
          domain: 'Software Development'
        }
      },
      {
        id: '6',
        type: 'document',
        title: 'Technical Architecture Document',
        excerpt: 'Current system architecture supports horizontal scaling...',
        relevanceScore: 0.83,
        confidence: 0.81,
        url: '/app/projects/456/pages/architecture',
        pageNumber: 12
      }
    ],
    overallConfidence: 0.80,
    isWorkspaceData: true,
    retrievalMetrics: {
      totalDocumentsSearched: 89,
      timeMs: 98,
      queryEmbeddingSimilarity: 0.82
    }
  };
  
  // Demo citations for general knowledge only
  const generalCitations: CitationData = {
    sources: [
      {
        id: '7',
        type: 'general',
        title: 'General Business Knowledge',
        excerpt: 'Based on common business practices and industry standards...',
        relevanceScore: 0.70,
        confidence: 0.65,
        metadata: {
          knowledgeType: 'Training Data',
          domain: 'Business Strategy'
        }
      }
    ],
    overallConfidence: 0.65,
    isWorkspaceData: false
  };
  
  // Demo citations for database query
  const databaseCitations: CitationData = {
    sources: [
      {
        id: '8',
        type: 'database',
        title: 'Customer Database',
        excerpt: 'Active customers segmented by subscription tier...',
        relevanceScore: 0.93,
        confidence: 0.90,
        url: '/app/databases/customers',
        highlightedText: [
          '312 Starter Plan customers',
          '128 Professional Plan customers',
          '45 Enterprise Plan customers'
        ],
        metadata: {
          queryExecutionTime: '23ms',
          rowsReturned: 485,
          lastSync: '2024-12-31T23:45:00Z'
        }
      },
      {
        id: '9',
        type: 'database',
        title: 'Analytics Database',
        excerpt: 'User engagement metrics and retention data...',
        relevanceScore: 0.87,
        confidence: 0.84,
        url: '/app/databases/analytics',
        metadata: {
          dataFreshness: 'Real-time',
          aggregationType: 'Daily'
        }
      }
    ],
    overallConfidence: 0.87,
    isWorkspaceData: true,
    retrievalMetrics: {
      totalDocumentsSearched: 5,
      timeMs: 67,
      queryEmbeddingSimilarity: 0.91
    }
  };
  
  // Demo response with revenue data
  const revenueResponse: StructuredResponse = {
    blocks: [
      {
        type: 'text',
        content: 'Based on your workspace data, here\'s the Q4 2024 revenue analysis:',
        formatting: { style: 'paragraph' }
      },
      {
        type: 'chart',
        chartType: 'bar',
        title: 'Q4 2024 Monthly Revenue',
        description: 'Revenue breakdown by month',
        data: {
          labels: ['October', 'November', 'December'],
          datasets: [
            {
              label: 'Revenue',
              data: [125000, 145000, 168000],
              backgroundColor: '#3b82f6',
            }
          ]
        }
      },
      {
        type: 'insight',
        title: 'Key Finding',
        content: 'December revenue of $168,000 represents the highest monthly revenue in company history, driven by strong enterprise sales.',
        severity: 'success'
      }
    ],
    metadata: {
      confidence: 0.85,
      dataSources: ['documents', 'databases'],
      suggestions: ['Analyze customer segments', 'Compare with Q3 data'],
      followUpQuestions: ['What drove the December spike?', 'Show me enterprise deal details']
    }
  };
  
  // Demo response for product roadmap
  const roadmapResponse: StructuredResponse = {
    blocks: [
      {
        type: 'text',
        content: 'Here\'s your product roadmap for Q1 2025 with AI feature priorities:',
        formatting: { style: 'paragraph' }
      },
      {
        type: 'table',
        title: 'Q1 2025 Feature Roadmap',
        columns: [
          { id: 'feature', name: 'Feature', type: 'text' },
          { id: 'priority', name: 'Priority', type: 'text' },
          { id: 'status', name: 'Status', type: 'text' },
          { id: 'effort', name: 'Effort', type: 'text' }
        ],
        rows: [
          { feature: 'AI Chat Assistant', priority: 'High', status: 'In Progress', effort: '3 weeks' },
          { feature: 'Smart Search', priority: 'High', status: 'Planning', effort: '2 weeks' },
          { feature: 'Auto-categorization', priority: 'Medium', status: 'Backlog', effort: '1 week' }
        ]
      }
    ],
    metadata: {
      confidence: 0.80,
      dataSources: ['workspace', 'general']
    }
  };
  
  // Demo response for general query
  const generalResponse: StructuredResponse = {
    blocks: [
      {
        type: 'text',
        content: 'Based on general business best practices, here are recommendations for improving team productivity:',
        formatting: { style: 'paragraph' }
      },
      {
        type: 'list',
        items: [
          { text: 'Implement regular stand-up meetings' },
          { text: 'Use project management tools effectively' },
          { text: 'Set clear goals and KPIs' },
          { text: 'Encourage asynchronous communication' }
        ],
        style: 'bullet'
      }
    ],
    metadata: {
      confidence: 0.65,
      dataSources: ['general']
    }
  };
  
  // Demo response for database query
  const databaseResponse: StructuredResponse = {
    blocks: [
      {
        type: 'chart',
        chartType: 'pie',
        title: 'Customer Distribution by Plan',
        data: [
          { name: 'Starter', value: 312 },
          { name: 'Professional', value: 128 },
          { name: 'Enterprise', value: 45 }
        ]
      },
      {
        type: 'text',
        content: 'Your customer base consists of 485 active customers across three subscription tiers.',
        formatting: { style: 'paragraph' }
      }
    ],
    metadata: {
      confidence: 0.87,
      dataSources: ['database']
    }
  };
  
  const demos = {
    workspace: { response: revenueResponse, citations: workspaceCitations },
    mixed: { response: roadmapResponse, citations: mixedCitations },
    general: { response: generalResponse, citations: generalCitations },
    database: { response: databaseResponse, citations: databaseCitations }
  };
  
  const currentDemo = demos[selectedDemo];
  
  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Provenance & Citation System Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Build trust by showing users exactly where AI answers come from
          </p>
        </div>
        
        {/* Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            {/* Demo Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Scenario:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setSelectedDemo('workspace')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedDemo === 'workspace'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Workspace Data
                </button>
                <button
                  onClick={() => setSelectedDemo('mixed')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedDemo === 'mixed'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Mixed Sources
                </button>
                <button
                  onClick={() => setSelectedDemo('general')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedDemo === 'general'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Brain className="w-4 h-4" />
                  General Knowledge
                </button>
                <button
                  onClick={() => setSelectedDemo('database')}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                    selectedDemo === 'database'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <Database className="w-4 h-4" />
                  Database Query
                </button>
              </div>
            </div>
            
            {/* Theme Toggle */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Theme:</span>
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
              </button>
            </div>
          </div>
        </div>
        
        {/* AI Output with Citations */}
        <div className="space-y-6">
          <AIOutputBlock
            response={currentDemo.response}
            citations={currentDemo.citations}
            showCitations={true}
            theme={theme}
            onInsert={(data) => console.log('Insert:', data)}
            onRegenerate={() => console.log('Regenerate')}
          />
        </div>
        
        {/* Individual Component Examples */}
        <div className="mt-12 space-y-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Citation Components
          </h2>
          
          {/* Provenance Badges */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Provenance Badges
            </h3>
            <div className="flex flex-wrap gap-3">
              <ProvenanceBadge
                sourceCount={3}
                sourceTypes={['document', 'database']}
                confidence={0.92}
                onClick={() => console.log('Badge clicked')}
              />
              <ProvenanceBadge
                sourceCount={1}
                sourceTypes={['workspace']}
                confidence={0.85}
                compact
              />
              <ProvenanceBadge
                sourceCount={5}
                sourceTypes={['document', 'database', 'page']}
                confidence={0.75}
              />
              <ProvenanceBadge
                sourceCount={2}
                sourceTypes={['general']}
                confidence={0.60}
                compact
              />
            </div>
          </div>
          
          {/* Confidence Indicators */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Confidence Indicators
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <ConfidenceIndicator confidence={0.95} size="lg" />
                <ConfidenceIndicator confidence={0.75} size="md" />
                <ConfidenceIndicator confidence={0.45} size="sm" />
              </div>
              <div className="max-w-md space-y-2">
                <ConfidenceBar confidence={0.92} showLabel />
                <ConfidenceBar confidence={0.68} showLabel />
                <ConfidenceBar confidence={0.35} showLabel />
              </div>
              <div className="flex items-center gap-4">
                <TrustScore score={0.95} size="lg" />
                <TrustScore score={0.75} size="md" />
                <TrustScore score={0.45} size="sm" />
              </div>
            </div>
          </div>
          
          {/* Citation Wrapper Example */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Citation Wrapper
            </h3>
            <CitationWrapper
              citations={workspaceCitations}
              showInlineBadge={true}
              badgePosition="top"
            >
              <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                <p className="text-gray-700 dark:text-gray-300">
                  This is sample content wrapped with citations. The citation badge above shows the sources used,
                  and clicking it reveals detailed source information. This builds trust by showing users exactly
                  where the information comes from.
                </p>
              </div>
            </CitationWrapper>
          </div>
        </div>
      </div>
    </div>
  );
}
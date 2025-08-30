import React, { useState, useCallback } from 'react';
import { ChartOutputBlock, type ChartType, type ChartData } from './ChartOutputBlock';
import { TableOutputBlock, type TableColumn, type TableRow } from './TableOutputBlock';
import { AlertCircle, Sparkles, RefreshCw, Wand2 } from 'lucide-react';
import type { StructuredResponse } from '~/services/llm-orchestration/structured-output.server';
import { CitationWrapper, type CitationData } from '~/components/citations/CitationWrapper';
import { ProvenanceBadge } from '~/components/citations/ProvenanceBadge';
import { TrustScore } from '~/components/citations/ConfidenceIndicator';

export type OutputBlockType = 'chart' | 'table' | 'text' | 'insight' | 'list' | 'action_confirmation' | 'error';

export interface AIOutputBlockProps {
  response: StructuredResponse;
  onInsert?: (blockData: any) => void;
  onRegenerate?: () => void;
  className?: string;
  theme?: 'light' | 'dark';
  citations?: CitationData;
  showCitations?: boolean;
}

interface TextBlockProps {
  content: string;
  formatting?: {
    style?: 'paragraph' | 'heading' | 'code';
    level?: number;
  };
}

interface InsightBlockProps {
  title: string;
  content: string;
  severity: 'info' | 'success' | 'warning' | 'error';
}

interface ListBlockProps {
  items: Array<{
    text: string;
    metadata?: any;
  }>;
  style?: 'bullet' | 'numbered' | 'citations';
}

interface ActionConfirmationBlockProps {
  action: string;
  description: string;
  parameters?: Record<string, any>;
  confirmButton?: string;
  cancelButton?: string;
}

const TextBlock: React.FC<TextBlockProps & { onInsert?: (data: any) => void }> = ({ content, formatting, onInsert }) => {
  const renderContent = () => {
    if (formatting?.style === 'heading') {
      const HeadingTag = `h${formatting.level || 3}` as keyof JSX.IntrinsicElements;
      return <HeadingTag className="font-semibold text-gray-900 dark:text-gray-100">{content}</HeadingTag>;
    }
    
    if (formatting?.style === 'code') {
      return (
        <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
          <code className="text-sm font-mono">{content}</code>
        </pre>
      );
    }
    
    return <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{content}</p>;
  };
  
  return (
    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800">
      {renderContent()}
      {onInsert && (
        <button
          onClick={() => onInsert({ type: 'text', content, formatting })}
          className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors inline-flex items-center gap-2"
        >
          <Sparkles className="w-3 h-3" />
          Insert Text
        </button>
      )}
    </div>
  );
};

const InsightBlock: React.FC<InsightBlockProps & { onInsert?: (data: any) => void }> = ({ title, content, severity, onInsert }) => {
  const severityStyles = {
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100',
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-100',
  };
  
  const severityIcons = {
    info: '💡',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };
  
  return (
    <div className={`p-4 rounded-lg border ${severityStyles[severity]}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl">{severityIcons[severity]}</span>
        <div className="flex-1">
          <h4 className="font-semibold mb-1">{title}</h4>
          <p className="text-sm opacity-90">{content}</p>
        </div>
      </div>
      {onInsert && (
        <button
          onClick={() => onInsert({ type: 'callout', title, text: content, severity })}
          className="mt-3 px-3 py-1.5 bg-white/50 hover:bg-white/70 dark:bg-gray-800/50 dark:hover:bg-gray-800/70 text-sm rounded-lg transition-colors inline-flex items-center gap-2"
        >
          <Sparkles className="w-3 h-3" />
          Insert Insight
        </button>
      )}
    </div>
  );
};

const ListBlock: React.FC<ListBlockProps & { onInsert?: (data: any) => void }> = ({ items, style = 'bullet', onInsert }) => {
  const ListTag = style === 'numbered' ? 'ol' : 'ul';
  const listClass = style === 'numbered' ? 'list-decimal' : 'list-disc';
  
  if (style === 'citations') {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border dark:border-gray-700">
        <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Sources</h4>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                {index + 1}
              </span>
              <p className="text-sm text-gray-700 dark:text-gray-300">{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800">
      <ListTag className={`${listClass} ml-5 space-y-1 text-gray-700 dark:text-gray-300`}>
        {items.map((item, index) => (
          <li key={index}>{item.text}</li>
        ))}
      </ListTag>
      {onInsert && (
        <button
          onClick={() => onInsert({ 
            type: style === 'numbered' ? 'numbered_list' : 'bullet_list', 
            items: items.map(item => ({ text: item.text, id: Math.random().toString() })) 
          })}
          className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors inline-flex items-center gap-2"
        >
          <Sparkles className="w-3 h-3" />
          Insert List
        </button>
      )}
    </div>
  );
};

const ActionConfirmationBlock: React.FC<ActionConfirmationBlockProps> = ({ 
  action, 
  description, 
  parameters, 
  confirmButton = 'Confirm', 
  cancelButton = 'Cancel' 
}) => {
  const [status, setStatus] = useState<'pending' | 'confirmed' | 'cancelled'>('pending');
  
  if (status === 'confirmed') {
    return (
      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <p className="text-green-800 dark:text-green-200">✅ Action confirmed and executed</p>
      </div>
    );
  }
  
  if (status === 'cancelled') {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400">Action cancelled</p>
      </div>
    );
  }
  
  return (
    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
      <div className="flex items-start gap-3">
        <Wand2 className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-1">
            Action Required: {action}
          </h4>
          <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">{description}</p>
          
          {parameters && Object.keys(parameters).length > 0 && (
            <div className="bg-white/50 dark:bg-gray-900/50 rounded p-2 mb-3">
              <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-1">Parameters:</p>
              <pre className="text-xs overflow-x-auto">{JSON.stringify(parameters, null, 2)}</pre>
            </div>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={() => setStatus('confirmed')}
              className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition-colors"
            >
              {confirmButton}
            </button>
            <button
              onClick={() => setStatus('cancelled')}
              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg transition-colors"
            >
              {cancelButton}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AIOutputBlock: React.FC<AIOutputBlockProps> = ({
  response,
  onInsert,
  onRegenerate,
  className = '',
  theme = 'light',
  citations,
  showCitations = true,
}) => {
  const renderBlock = (block: any, index: number) => {
    const key = `block-${index}`;
    
    switch (block.type) {
      case 'chart':
        return (
          <ChartOutputBlock
            key={key}
            type={block.chartType || 'bar'}
            data={block.data}
            title={block.title}
            description={block.description}
            options={block.options}
            provenance={{
              isAIGenerated: true,
              confidence: response.metadata?.confidence,
              source: response.metadata?.dataSources?.join(', '),
              timestamp: new Date().toISOString(),
            }}
            onInsert={onInsert}
            theme={theme}
          />
        );
        
      case 'table':
        return (
          <TableOutputBlock
            key={key}
            columns={block.columns}
            rows={block.rows}
            title={block.title}
            description={block.description}
            options={block.options}
            provenance={{
              isAIGenerated: true,
              confidence: response.metadata?.confidence,
              source: response.metadata?.dataSources?.join(', '),
              timestamp: new Date().toISOString(),
            }}
            onInsert={onInsert}
            theme={theme}
          />
        );
        
      case 'text':
        return (
          <TextBlock
            key={key}
            content={block.content}
            formatting={block.formatting}
            onInsert={onInsert}
          />
        );
        
      case 'insight':
        return (
          <InsightBlock
            key={key}
            title={block.title}
            content={block.content}
            severity={block.severity}
            onInsert={onInsert}
          />
        );
        
      case 'list':
        return (
          <ListBlock
            key={key}
            items={block.items}
            style={block.style}
            onInsert={onInsert}
          />
        );
        
      case 'action_confirmation':
        return (
          <ActionConfirmationBlock
            key={key}
            action={block.action}
            description={block.description}
            parameters={block.parameters}
            confirmButton={block.confirmButton}
            cancelButton={block.cancelButton}
          />
        );
        
      default:
        return (
          <div key={key} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Unsupported block type: {block.type}
            </p>
          </div>
        );
    }
  };
  
  const content = (
    <>
      {/* Render all blocks */}
      {response.blocks && response.blocks.length > 0 ? (
        response.blocks.map((block, index) => renderBlock(block, index))
      ) : (
        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No content to display</p>
        </div>
      )}
    </>
  );
  
  return (
    <div className={`ai-output-block space-y-4 ${className}`}>
      {/* Header with metadata and citations */}
      {response.metadata && (
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              AI Response
            </span>
            {response.metadata.confidence && !citations && (
              <span className="text-xs text-gray-600 dark:text-gray-400">
                ({Math.round(response.metadata.confidence * 100)}% confidence)
              </span>
            )}
            {citations && showCitations && (
              <ProvenanceBadge
                sourceCount={citations.sources.length}
                sourceTypes={citations.sources.map(s => s.type)}
                confidence={citations.overallConfidence}
                compact
              />
            )}
            {citations && citations.overallConfidence && (
              <TrustScore score={citations.overallConfidence} size="sm" />
            )}
          </div>
          
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="p-1.5 rounded-lg hover:bg-white/50 dark:hover:bg-gray-800/50 transition-colors"
              title="Regenerate response"
            >
              <RefreshCw className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}
        </div>
      )}
      
      {/* Wrap content with citations if available */}
      {citations && showCitations ? (
        <CitationWrapper 
          citations={citations} 
          showInlineBadge={false}
          className="space-y-4"
        >
          {content}
        </CitationWrapper>
      ) : (
        <div className="space-y-4">
          {content}
        </div>
      )}
      
      {/* Suggestions */}
      {response.metadata?.suggestions && response.metadata.suggestions.length > 0 && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
            Suggestions:
          </p>
          <ul className="space-y-1">
            {response.metadata.suggestions.map((suggestion, index) => (
              <li key={index} className="text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                <span>•</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Follow-up Questions */}
      {response.metadata?.followUpQuestions && response.metadata.followUpQuestions.length > 0 && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            You might also ask:
          </p>
          <div className="flex flex-wrap gap-2">
            {response.metadata.followUpQuestions.map((question, index) => (
              <button
                key={index}
                className="px-3 py-1.5 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
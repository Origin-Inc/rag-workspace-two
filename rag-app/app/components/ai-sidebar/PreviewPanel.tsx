import { memo } from 'react';
import type { ActionPreview, CommandParseResult } from '~/types/ai-actions';
import { cn } from '~/utils/cn';

interface PreviewPanelProps {
  preview: ActionPreview[];
  parseResult: CommandParseResult;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}

export const PreviewPanel = memo(function PreviewPanel({
  preview,
  parseResult,
  onConfirm,
  onCancel,
  isProcessing
}: PreviewPanelProps) {
  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <div className="flex items-start">
          <svg
            className="w-5 h-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-yellow-800">
              Preview - Please Review Before Confirming
            </h3>
            <p className="text-sm text-yellow-700 mt-1">
              This is what will be created. Please review carefully.
            </p>
          </div>
        </div>
      </div>

      {/* Command interpretation */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-sm text-gray-600">Your command:</p>
        <p className="text-sm font-medium text-gray-900 mt-1">"{parseResult.command}"</p>
      </div>

      {/* Actions to be performed or Answer display */}
      {preview.map((action) => (
        action.type === 'answer' ? (
          // Display answer from RAG system
          <div key="answer" className="border border-blue-200 rounded-lg overflow-hidden bg-blue-50">
            <div className="bg-blue-100 px-4 py-3 border-b border-blue-200">
              <h4 className="text-sm font-medium text-blue-900">Answer</h4>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-sm text-gray-800 whitespace-pre-wrap">
                {action.description}
              </div>
              
              {/* Citations if available */}
              {action.details?.citations && action.details.citations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-blue-200">
                  <h5 className="text-xs font-medium text-gray-600 mb-2">Sources:</h5>
                  <div className="space-y-2">
                    {action.details.citations.map((citation: any, i: number) => (
                      <div key={i} className="text-xs text-gray-600 bg-white p-2 rounded">
                        <span className="font-mono bg-gray-200 px-1 rounded">
                          [{citation.passage_id}]
                        </span>
                        {citation.excerpt && (
                          <span className="ml-2">{citation.excerpt}...</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Confidence score */}
              {action.details?.confidence && (
                <div className="text-xs text-gray-600">
                  Confidence: {(action.details.confidence * 100).toFixed(1)}%
                </div>
              )}
            </div>
          </div>
        ) : (
          // Display action preview
          <div key={action.actionId} className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Action header */}
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <h4 className="text-sm font-medium text-gray-900">{action.title}</h4>
            <p className="text-sm text-gray-600 mt-1">{action.description}</p>
          </div>

          {/* Preview content */}
          <div className="p-4 space-y-3">
            {/* Impact summary */}
            {action.impact && (
              <div className="space-y-1">
                {action.impact.creates && action.impact.creates.length > 0 && (
                  <div className="flex items-start">
                    <span className="text-green-600 mr-2">✓</span>
                    <div>
                      <span className="text-sm font-medium text-gray-700">Will create:</span>
                      <ul className="text-sm text-gray-600 mt-1 space-y-1">
                        {action.impact.creates.map((item, i) => (
                          <li key={i} className="ml-4">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {action.impact.updates && action.impact.updates.length > 0 && (
                  <div className="flex items-start">
                    <span className="text-blue-600 mr-2">↻</span>
                    <div>
                      <span className="text-sm font-medium text-gray-700">Will update:</span>
                      <ul className="text-sm text-gray-600 mt-1 space-y-1">
                        {action.impact.updates.map((item, i) => (
                          <li key={i} className="ml-4">• {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Database structure preview */}
            {action.type === 'create_database' && action.preview.after && (
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <h5 className="text-sm font-medium text-gray-700 mb-2">Database Structure:</h5>
                <div className="space-y-2">
                  {action.preview.after.columns?.map((col: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{col.name}</span>
                        {col.required && <span className="text-red-500 text-xs">*</span>}
                      </div>
                      <span className="text-gray-500 bg-gray-100 px-2 py-0.5 rounded text-xs">
                        {col.type}
                      </span>
                    </div>
                  ))}
                </div>
                
                {/* Sample row */}
                {action.preview.after.sampleRow && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <h6 className="text-xs font-medium text-gray-600 mb-2">Sample Data:</h6>
                    <div className="bg-gray-50 rounded p-2 overflow-x-auto">
                      <table className="text-xs w-full">
                        <tbody>
                          {Object.entries(action.preview.after.sampleRow).map(([key, value]) => (
                            <tr key={key}>
                              <td className="font-medium text-gray-600 pr-3">{key}:</td>
                              <td className="text-gray-900">{String(value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Formula preview */}
            {action.type === 'create_formula' && action.preview.after && (
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <h5 className="text-sm font-medium text-gray-700 mb-2">Formula Details:</h5>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Column Name:</span>
                    <span className="ml-2 font-medium">{action.preview.after.columnName}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Formula:</span>
                    <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs">
                      {action.preview.after.formula}
                    </code>
                  </div>
                  {action.preview.after.sampleCalculation && (
                    <div>
                      <span className="text-gray-600">Sample Result:</span>
                      <span className="ml-2">{action.preview.after.sampleCalculation}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Warnings */}
            {action.warnings && action.warnings.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <h5 className="text-sm font-medium text-red-800 mb-1">Warnings:</h5>
                <ul className="text-sm text-red-700 space-y-1">
                  {action.warnings.map((warning, i) => (
                    <li key={i}>• {warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        )
      ))}

      {/* Suggestions */}
      {parseResult.suggestions && parseResult.suggestions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h5 className="text-sm font-medium text-blue-800 mb-1">Suggestions:</h5>
          <ul className="text-sm text-blue-700 space-y-1">
            {parseResult.suggestions.map((suggestion, i) => (
              <li key={i}>
                • {suggestion.text}
                {suggestion.reason && (
                  <span className="text-blue-600 text-xs block ml-3">{suggestion.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex space-x-3 pt-4 border-t border-gray-200">
        {/* Only show Confirm & Execute for actions, not answers */}
        {preview[0]?.type !== 'answer' ? (
          <>
            <button
              onClick={onConfirm}
              disabled={isProcessing}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg font-medium transition-all',
                'bg-green-600 text-white hover:bg-green-700',
                'disabled:bg-gray-300 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-2 focus:ring-green-500'
              )}
            >
              {isProcessing ? 'Executing...' : 'Confirm & Execute'}
            </button>
            <button
              onClick={onCancel}
              disabled={isProcessing}
              className={cn(
                'flex-1 py-2 px-4 rounded-lg font-medium transition-all',
                'bg-gray-200 text-gray-700 hover:bg-gray-300',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'focus:outline-none focus:ring-2 focus:ring-gray-500'
              )}
            >
              Cancel
            </button>
          </>
        ) : (
          // For answers, just show a Close button
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className={cn(
              'w-full py-2 px-4 rounded-lg font-medium transition-all',
              'bg-blue-600 text-white hover:bg-blue-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'focus:outline-none focus:ring-2 focus:ring-blue-500'
            )}
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
});
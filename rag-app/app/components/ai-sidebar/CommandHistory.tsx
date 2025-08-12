import { memo } from 'react';
import { cn } from '~/utils/cn';

interface CommandHistoryProps {
  history: Array<{ command: string; timestamp: string }>;
  onSelect: (command: string) => void;
}

export const CommandHistory = memo(function CommandHistory({
  history,
  onSelect
}: CommandHistoryProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Commands</h3>
      <div className="space-y-2">
        {history.map((item, index) => (
          <button
            key={`${item.timestamp}-${index}`}
            onClick={() => onSelect(item.command)}
            className={cn(
              'w-full text-left p-3 rounded-lg transition-all',
              'bg-gray-50 hover:bg-gray-100',
              'border border-gray-200 hover:border-gray-300',
              'group'
            )}
          >
            <div className="flex items-start justify-between">
              <p className="text-sm text-gray-900 pr-2">{item.command}</p>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {formatTime(item.timestamp)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 group-hover:text-gray-600">
              Click to use this command again
            </p>
          </button>
        ))}
      </div>
    </div>
  );
});
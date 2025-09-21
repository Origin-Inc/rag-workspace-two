import { CloudArrowUpIcon, CloudIcon, CloudArrowDownIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'error' | 'local-only' | 'cloud-only';

interface CloudSyncIndicatorProps {
  status: SyncStatus;
  message?: string;
  small?: boolean;
}

export function CloudSyncIndicator({ status, message, small = false }: CloudSyncIndicatorProps) {
  const iconSize = small ? 'h-4 w-4' : 'h-5 w-5';
  const textSize = small ? 'text-xs' : 'text-sm';
  
  const statusConfig = {
    synced: {
      icon: <CheckCircleIcon className={`${iconSize} text-green-600`} />,
      text: 'Synced',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      description: 'Files are synced to cloud'
    },
    syncing: {
      icon: <CloudArrowUpIcon className={`${iconSize} text-blue-600 animate-pulse`} />,
      text: 'Syncing...',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      description: 'Uploading to cloud'
    },
    pending: {
      icon: <CloudArrowDownIcon className={`${iconSize} text-yellow-600`} />,
      text: 'Pending',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      description: 'Waiting to sync'
    },
    error: {
      icon: <ExclamationTriangleIcon className={`${iconSize} text-red-600`} />,
      text: 'Sync Error',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      description: 'Failed to sync'
    },
    'local-only': {
      icon: <CloudIcon className={`${iconSize} text-gray-400`} />,
      text: 'Local Only',
      color: 'text-gray-500',
      bgColor: 'bg-gray-50',
      description: 'Stored locally only'
    },
    'cloud-only': {
      icon: <CloudIcon className={`${iconSize} text-indigo-600`} />,
      text: 'Cloud Only',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      description: 'Available in cloud'
    }
  };
  
  const config = statusConfig[status];
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${config.bgColor}`}>
      {config.icon}
      <span className={`${textSize} font-medium ${config.color}`}>
        {config.text}
      </span>
      {message && (
        <span className={`${textSize} ${config.color} opacity-70`}>
          {message}
        </span>
      )}
    </div>
  );
}

// File-specific sync indicator
interface FileSyncStatusProps {
  filename: string;
  hasLocal: boolean;
  hasCloud: boolean;
  syncing?: boolean;
  error?: string;
}

export function FileSyncStatus({ filename, hasLocal, hasCloud, syncing, error }: FileSyncStatusProps) {
  let status: SyncStatus;
  
  if (error) {
    status = 'error';
  } else if (syncing) {
    status = 'syncing';
  } else if (hasLocal && hasCloud) {
    status = 'synced';
  } else if (hasLocal && !hasCloud) {
    status = 'local-only';
  } else if (!hasLocal && hasCloud) {
    status = 'cloud-only';
  } else {
    status = 'pending';
  }
  
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
          {filename}
        </span>
      </div>
      <CloudSyncIndicator status={status} message={error} small />
    </div>
  );
}
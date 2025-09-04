import { useState, useEffect } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { syncManager } from '../lib/syncManager';

interface SyncStatusProps {
  userId: string;
}

export function SyncStatus({ userId }: SyncStatusProps) {
  const isOnline = useNetworkStatus();
  const [syncStatus, setSyncStatus] = useState({ isSyncing: false, pendingChanges: 0 });
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = syncManager.onSyncStatusChange(setSyncStatus);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isOnline && syncStatus.pendingChanges > 0 && !syncStatus.isSyncing) {
      // Auto-sync when coming online with pending changes
      handleSync();
    }
  }, [isOnline, syncStatus.pendingChanges, syncStatus.isSyncing]);

  const handleSync = async () => {
    if (!isOnline || syncStatus.isSyncing) return;

    try {
      await syncManager.syncNotes(userId);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return 'text-red-400';
    if (syncStatus.isSyncing) return 'text-yellow-400';
    if (syncStatus.pendingChanges > 0) return 'text-orange-400';
    return 'text-green-400';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (syncStatus.isSyncing) return 'Syncing...';
    if (syncStatus.pendingChanges > 0) return `${syncStatus.pendingChanges} pending`;
    return 'Synced';
  };

  const getStatusIcon = () => {
    if (!isOnline) {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728"
          />
        </svg>
      );
    }

    if (syncStatus.isSyncing) {
      return (
        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      );
    }

    if (syncStatus.pendingChanges > 0) {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      );
    }

    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-green-400 font-medium">Synced</span>
      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
    </div>
  );
}

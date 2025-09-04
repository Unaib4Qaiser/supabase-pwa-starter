export interface OfflineNote {
  id: string;
  user_id: string;
  title: string;
  content: string;
  inserted_at: string;
  updated_at: string;
  is_synced: boolean;
  is_deleted: boolean;
  conflict_version?: number;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime?: string;
  pendingChanges: number;
  conflicts: OfflineNote[];
}

export interface ConflictResolution {
  noteId: string;
  resolution: 'local' | 'remote' | 'merge';
  mergedContent?: {
    title: string;
    content: string;
  };
}

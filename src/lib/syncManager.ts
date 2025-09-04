import { supabase } from './supabase';
import { offlineStorage } from './offlineStorage';
import { OfflineNote, ConflictResolution } from '../types/OfflineNote';

export class SyncManager {
  private isSyncing = false;
  private syncCallbacks: Array<(status: { isSyncing: boolean; pendingChanges: number }) => void> =
    [];

  onSyncStatusChange(callback: (status: { isSyncing: boolean; pendingChanges: number }) => void) {
    this.syncCallbacks.push(callback);
    return () => {
      this.syncCallbacks = this.syncCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyStatusChange(pendingChanges: number) {
    this.syncCallbacks.forEach((callback) => {
      callback({ isSyncing: this.isSyncing, pendingChanges });
    });
  }

  async syncNotes(userId: string): Promise<{ conflicts: OfflineNote[]; synced: number }> {
    if (this.isSyncing) {
      return { conflicts: [], synced: 0 };
    }

    this.isSyncing = true;
    let syncedCount = 0;
    const conflicts: OfflineNote[] = [];

    try {
      // First, get all remote notes to check for conflicts
      const { data: remoteNotes, error: fetchError } = await supabase
        .from('notes')
        .select('*')
        .eq('user_id', userId);

      if (fetchError) {
        throw fetchError;
      }

      // Get unsynced local notes
      const unsyncedNotes = await offlineStorage.getUnsyncedNotes(userId);
      this.notifyStatusChange(unsyncedNotes.length);

      // Process each unsynced note
      for (const localNote of unsyncedNotes) {
        const remoteNote = remoteNotes?.find((note) => note.id === localNote.id);

        if (localNote.is_deleted) {
          // Handle deleted notes
          if (remoteNote) {
            const { error } = await supabase.from('notes').delete().eq('id', localNote.id);

            if (!error) {
              await offlineStorage.markAsSynced(localNote.id);
              syncedCount++;
            }
          } else {
            // Note doesn't exist remotely, mark as synced
            await offlineStorage.markAsSynced(localNote.id);
            syncedCount++;
          }
        } else {
          // Handle created/updated notes
          if (remoteNote) {
            // Check for conflicts
            const remoteUpdated = new Date(remoteNote.inserted_at).getTime();
            const localUpdated = new Date(localNote.updated_at).getTime();

            if (
              remoteUpdated > localUpdated &&
              (remoteNote.title !== localNote.title || remoteNote.content !== localNote.content)
            ) {
              // Conflict detected
              localNote.conflict_version = remoteUpdated;
              conflicts.push(localNote);
              continue;
            }
          }

          // No conflict, sync the note
          const noteData = {
            id: localNote.id,
            title: localNote.title,
            content: localNote.content,
            user_id: localNote.user_id,
          };

          const { error } = remoteNote
            ? await supabase.from('notes').update(noteData).eq('id', localNote.id)
            : await supabase.from('notes').insert(noteData);

          if (!error) {
            await offlineStorage.markAsSynced(localNote.id);
            syncedCount++;
          }
        }
      }

      // Sync remote notes to local storage
      if (remoteNotes) {
        for (const remoteNote of remoteNotes) {
          const localNotes = await offlineStorage.getAllNotes(userId);
          const existingLocal = localNotes.find((note) => note.id === remoteNote.id);

          if (!existingLocal) {
            // New remote note, add to local storage
            const offlineNote: OfflineNote = {
              ...remoteNote,
              updated_at: remoteNote.inserted_at,
              is_synced: true,
              is_deleted: false,
            };
            await offlineStorage.saveNote(offlineNote);
          }
        }
      }

      // Clean up synced deleted notes
      await offlineStorage.clearSyncedDeletedNotes(userId);

      return { conflicts, synced: syncedCount };
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
      const remainingUnsynced = await offlineStorage.getUnsyncedNotes(userId);
      this.notifyStatusChange(remainingUnsynced.length);
    }
  }

  async resolveConflict(resolution: ConflictResolution, userId: string): Promise<void> {
    const unsyncedNotes = await offlineStorage.getUnsyncedNotes(userId);
    const conflictNote = unsyncedNotes.find((note) => note.id === resolution.noteId);

    if (!conflictNote) return;

    if (resolution.resolution === 'local') {
      // Keep local version, sync to remote
      const { error } = await supabase
        .from('notes')
        .update({
          title: conflictNote.title,
          content: conflictNote.content,
        })
        .eq('id', conflictNote.id);

      if (!error) {
        await offlineStorage.markAsSynced(conflictNote.id);
      }
    } else if (resolution.resolution === 'remote') {
      // Keep remote version, update local
      const { data: remoteNote } = await supabase
        .from('notes')
        .select('*')
        .eq('id', conflictNote.id)
        .single();

      if (remoteNote) {
        const updatedNote: OfflineNote = {
          ...conflictNote,
          title: remoteNote.title,
          content: remoteNote.content,
          updated_at: remoteNote.inserted_at,
          is_synced: true,
        };
        await offlineStorage.saveNote(updatedNote);
      }
    } else if (resolution.resolution === 'merge' && resolution.mergedContent) {
      // Use merged content
      const { error } = await supabase
        .from('notes')
        .update({
          title: resolution.mergedContent.title,
          content: resolution.mergedContent.content,
        })
        .eq('id', conflictNote.id);

      if (!error) {
        const mergedNote: OfflineNote = {
          ...conflictNote,
          title: resolution.mergedContent.title,
          content: resolution.mergedContent.content,
          updated_at: new Date().toISOString(),
          is_synced: true,
        };
        await offlineStorage.saveNote(mergedNote);
      }
    }
  }

  async createOfflineNote(title: string, content: string, userId: string): Promise<OfflineNote> {
    const now = new Date().toISOString();
    const note: OfflineNote = {
      id: crypto.randomUUID(),
      user_id: userId,
      title,
      content,
      inserted_at: now,
      updated_at: now,
      is_synced: false,
      is_deleted: false,
    };

    await offlineStorage.saveNote(note);
    return note;
  }

  async updateOfflineNote(
    noteId: string,
    title: string,
    content: string,
    userId: string
  ): Promise<void> {
    const allNotes = await offlineStorage.getAllNotes(userId);
    const note = allNotes.find((n) => n.id === noteId);

    if (note) {
      note.title = title;
      note.content = content;
      note.updated_at = new Date().toISOString();
      note.is_synced = false;
      await offlineStorage.saveNote(note);
    }
  }

  async deleteOfflineNote(noteId: string): Promise<void> {
    await offlineStorage.deleteNote(noteId);
  }
}

export const syncManager = new SyncManager();

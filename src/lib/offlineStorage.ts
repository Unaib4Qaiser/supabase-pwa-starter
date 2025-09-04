import { OfflineNote } from '../types/OfflineNote';

const DB_NAME = 'NotesOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

class OfflineStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('user_id', 'user_id', { unique: false });
          store.createIndex('is_synced', 'is_synced', { unique: false });
          store.createIndex('is_deleted', 'is_deleted', { unique: false });
          store.createIndex('updated_at', 'updated_at', { unique: false });
        }
      };
    });
  }

  async getAllNotes(userId: string): Promise<OfflineNote[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const notes = request.result.filter((note: OfflineNote) => !note.is_deleted);
        resolve(
          notes.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
        );
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveNote(note: OfflineNote): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(note);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteNote(noteId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      // First get the note to mark it as deleted instead of removing it
      const getRequest = store.get(noteId);

      getRequest.onsuccess = () => {
        const note = getRequest.result;
        if (note) {
          note.is_deleted = true;
          note.is_synced = false;
          note.updated_at = new Date().toISOString();

          const putRequest = store.put(note);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getUnsyncedNotes(userId: string): Promise<OfflineNote[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const unsyncedNotes = request.result.filter((note: OfflineNote) => !note.is_synced);
        resolve(unsyncedNotes);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async markAsSynced(noteId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const getRequest = store.get(noteId);
      getRequest.onsuccess = () => {
        const note = getRequest.result;
        if (note) {
          note.is_synced = true;
          const putRequest = store.put(note);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async clearSyncedDeletedNotes(userId: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('user_id');
      const request = index.getAll(userId);

      request.onsuccess = () => {
        const notesToDelete = request.result.filter(
          (note: OfflineNote) => note.is_deleted && note.is_synced
        );

        let deleteCount = 0;
        if (notesToDelete.length === 0) {
          resolve();
          return;
        }

        notesToDelete.forEach((note) => {
          const deleteRequest = store.delete(note.id);
          deleteRequest.onsuccess = () => {
            deleteCount++;
            if (deleteCount === notesToDelete.length) {
              resolve();
            }
          };
          deleteRequest.onerror = () => reject(deleteRequest.error);
        });
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlineStorage = new OfflineStorage();

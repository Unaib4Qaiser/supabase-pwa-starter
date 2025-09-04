import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';
import { Note } from '../types/Note';
import { OfflineNote, ConflictResolution } from '../types/OfflineNote';
import { offlineStorage } from '../lib/offlineStorage';
import { syncManager } from '../lib/syncManager';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { SyncStatus } from './SyncStatus';
import { ConflictResolver } from './ConflictResolver';

export default function NotesGrid() {
  const { session } = useSession();
  const isOnline = useNetworkStatus();
  const [notes, setNotes] = useState<OfflineNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [conflicts, setConflicts] = useState<OfflineNote[]>([]);
  const [showConflictResolver, setShowConflictResolver] = useState(false);
  const user = session?.user;

  // Initialize offline storage and load notes
  useEffect(() => {
    if (!user) return;

    const initializeAndLoad = async () => {
      try {
        await offlineStorage.init();
        await loadNotesFromStorage();

        // Try to sync if online
        if (isOnline) {
          await performSync();
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAndLoad();
  }, [user]);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && user && !loading) {
      performSync();
    }
  }, [isOnline, user, loading]);

  // Set up realtime subscriptions when online
  useEffect(() => {
    if (!user || !isOnline) return;

    const channel = supabase
      .channel('public:notes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${user.id}` },
        async (payload) => {
          // Handle realtime updates by syncing with local storage
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const remoteNote = payload.new as Note;
            const offlineNote: OfflineNote = {
              ...remoteNote,
              updated_at: remoteNote.inserted_at,
              is_synced: true,
              is_deleted: false,
            };
            await offlineStorage.saveNote(offlineNote);
            await loadNotesFromStorage();
          } else if (payload.eventType === 'DELETE') {
            await offlineStorage.deleteNote((payload.old as { id: string }).id);
            await loadNotesFromStorage();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isOnline]);

  const loadNotesFromStorage = async () => {
    if (!user) return;
    try {
      const offlineNotes = await offlineStorage.getAllNotes(user.id);
      setNotes(offlineNotes);
    } catch (error) {
      console.error('Failed to load notes from storage:', error);
    }
  };

  const performSync = async () => {
    if (!user || !isOnline) return;

    try {
      const result = await syncManager.syncNotes(user.id);
      if (result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        setShowConflictResolver(true);
      }
      await loadNotesFromStorage();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  // Memoized filtered notes for better performance
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) {
      return notes;
    }
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, notes]);

  const addNote = useCallback(async () => {
    if (!newNoteTitle.trim() || !user) return;

    try {
      if (isOnline) {
        // Try to add directly to Supabase first
        const { data, error } = await supabase
          .from('notes')
          .insert({
            title: newNoteTitle.trim(),
            content: newNoteContent.trim() || 'No description',
            user_id: user.id,
          })
          .select();

        if (!error && data && data[0]) {
          // Save to offline storage as synced
          const offlineNote: OfflineNote = {
            ...(data[0] as Note),
            updated_at: data[0].inserted_at,
            is_synced: true,
            is_deleted: false,
          };
          await offlineStorage.saveNote(offlineNote);
        } else {
          throw new Error(error?.message || 'Failed to save online');
        }
      } else {
        // Offline: save to local storage only
        await syncManager.createOfflineNote(
          newNoteTitle.trim(),
          newNoteContent.trim() || 'No description',
          user.id
        );
      }

      await loadNotesFromStorage();
      setNewNoteTitle('');
      setNewNoteContent('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Error adding note:', error);
      // Fallback to offline storage
      try {
        await syncManager.createOfflineNote(
          newNoteTitle.trim(),
          newNoteContent.trim() || 'No description',
          user.id
        );
        await loadNotesFromStorage();
        setNewNoteTitle('');
        setNewNoteContent('');
        setShowAddForm(false);
      } catch (offlineError) {
        alert(`Error adding note: ${offlineError}`);
      }
    }
  }, [newNoteTitle, newNoteContent, user, isOnline]);

  const removeNote = useCallback(
    async (id: string) => {
      try {
        if (isOnline) {
          // Try to delete from Supabase first
          const { error } = await supabase.from('notes').delete().eq('id', id);
          if (!error) {
            await offlineStorage.deleteNote(id);
          } else {
            throw new Error(error.message);
          }
        } else {
          // Offline: mark as deleted in local storage
          await syncManager.deleteOfflineNote(id);
        }

        await loadNotesFromStorage();
        setDeleteConfirmId(null);
      } catch (error) {
        console.error('Error removing note:', error);
        // Fallback to offline deletion
        try {
          await syncManager.deleteOfflineNote(id);
          await loadNotesFromStorage();
          setDeleteConfirmId(null);
        } catch (offlineError) {
          alert(`Error removing note: ${offlineError}`);
        }
      }
    },
    [isOnline]
  );

  const handleConflictResolve = async (resolution: ConflictResolution) => {
    if (!user) return;

    try {
      await syncManager.resolveConflict(resolution, user.id);
      await loadNotesFromStorage();

      // Remove resolved conflict from the list
      setConflicts((prev) => prev.filter((c) => c.id !== resolution.noteId));
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  };

  const handleConflictResolverClose = () => {
    setShowConflictResolver(false);
    setConflicts([]);
  };

  const copyNoteDescription = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3000);
    }
  }, []);

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 text-lg">Please sign in to view and manage notes.</p>
        <p className="text-slate-500 text-sm mt-2">
          User ID: {session?.user?.id || 'Not available'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400 text-lg">Loading notes...</p>
        <p className="text-slate-500 text-sm mt-2">User: {user.email}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-100">Notes</h1>
        <div className="flex items-center gap-4">
          <SyncStatus userId={user.id} />
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors"
          >
            + New Note
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search notes by title..."
          className="w-full px-4 py-3 pl-10 rounded-lg bg-slate-800 border border-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-100 placeholder-slate-400"
        />
        <svg
          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Add Note Form */}
      {showAddForm && (
        <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
          <input
            type="text"
            value={newNoteTitle}
            onChange={(e) => setNewNoteTitle(e.target.value)}
            placeholder="Note title..."
            className="w-full bg-transparent border-none outline-none text-slate-100 placeholder-slate-400 text-lg font-medium mb-3"
            autoFocus
          />
          <textarea
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            placeholder="Note description (optional)..."
            className="w-full bg-transparent border-none outline-none resize-none text-slate-100 placeholder-slate-400 text-sm"
            rows={3}
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={addNote}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewNoteTitle('');
                setNewNoteContent('');
              }}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-400 text-lg">
            {searchQuery
              ? 'No notes found matching your search.'
              : 'No notes yet. Create your first note!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredNotes.map((note) => (
            <div
              key={note.id}
              onClick={() => copyNoteDescription(note.content)}
              className="bg-slate-800 rounded-lg p-4 border border-slate-700 hover:border-slate-600 transition-all duration-200 hover:shadow-lg hover:shadow-slate-900/50 group cursor-pointer"
            >
              {/* Note Title */}
              <div className="text-slate-100 font-heading font-medium text-base mb-2 line-clamp-2">
                {note.title}
              </div>

              {/* Note Description */}
              <div className="text-slate-300 font-body text-sm leading-relaxed mb-3 min-h-[40px] line-clamp-3">
                {note.content}
              </div>

              {/* Note Footer */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {new Date(note.inserted_at).toLocaleDateString()}
                </span>

                {/* Actions */}
                <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyNoteDescription(note.content);
                    }}
                    className="p-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-300 transition-colors"
                    title="Copy description"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(note.id);
                    }}
                    className="p-1.5 rounded bg-slate-700 hover:bg-red-600 text-slate-400 hover:text-red-300 transition-colors"
                    title="Delete note"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Copy Success Notification */}
      {copySuccess && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in">
          ✓ Copied to clipboard!
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 max-w-sm mx-4 border border-slate-600">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">Delete Note</h3>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete this note? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-lg transition-colors flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => removeNote(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors flex-1"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Resolver */}
      {showConflictResolver && (
        <ConflictResolver
          conflicts={conflicts}
          onResolve={handleConflictResolve}
          onClose={handleConflictResolverClose}
        />
      )}
    </div>
  );
}

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
        note.title.toLowerCase().includes(searchQuery.toLowerCase())
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
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <SyncStatus userId={user.id} />
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-2xl">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search your notes..."
          className="modern-input w-full px-4 py-3 sm:px-6 sm:py-4 pl-10 sm:pl-12 rounded-2xl text-white placeholder-gray-500 text-base sm:text-lg"
        />
        <svg
          className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400"
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
        <div className="glass-card p-8 rounded-2xl animate-scale-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white">Create New Note</h3>
          </div>

          <div className="space-y-6">
            <div>
              <label htmlFor="note-title" className="block text-sm font-medium text-gray-300 mb-2">
                Title
              </label>
              <input
                id="note-title"
                type="text"
                value={newNoteTitle}
                onChange={(e) => setNewNoteTitle(e.target.value)}
                placeholder="Enter note title..."
                className="modern-input w-full px-4 py-3 rounded-xl text-white placeholder-gray-500"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="note-content" className="block text-sm font-medium text-gray-300 mb-2">
                Content
              </label>
              <textarea
                id="note-content"
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Write your note content here..."
                className="modern-input w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 resize-none"
                rows={4}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={addNote}
                className="modern-button px-6 py-3 rounded-xl font-medium flex-1 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Note
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewNoteTitle('');
                  setNewNoteContent('');
                }}
                className="px-6 py-3 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-xl transition-all duration-200 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="text-center py-20 animate-fade-in">
          <div className="w-24 h-24 bg-gradient-to-br from-gray-700 to-gray-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-300 mb-2">
            {searchQuery ? 'No notes found' : 'No notes yet'}
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            {searchQuery
              ? 'Try adjusting your search terms or create a new note.'
              : 'Start organizing your thoughts by creating your first note.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredNotes.map((note, index) => (
            <div
              key={note.id}
              onClick={() => copyNoteDescription(note.content)}
              className="glass-card-hover p-4 sm:p-6 rounded-2xl cursor-pointer group animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Note Header */}
              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-xl flex items-center justify-center group-hover:animate-glow">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyNoteDescription(note.content);
                    }}
                    className="p-1.5 sm:p-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-300 transition-all duration-200"
                    title="Copy content"
                  >
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(note.id);
                    }}
                    className="p-1.5 sm:p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all duration-200"
                    title="Delete note"
                  >
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Note Content */}
              <div className="space-y-2 sm:space-y-3">
                <h3 className="text-base sm:text-lg font-semibold text-white line-clamp-2 group-hover:text-blue-300 transition-colors">
                  {note.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed line-clamp-4 sm:line-clamp-3">
                  {note.content}
                </p>
              </div>

              {/* Note Footer */}
              <div className="flex items-center justify-between mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-700/50">
                <span className="text-xs text-gray-500">
                  {new Date(note.inserted_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
                <div className="flex items-center gap-2">
                  {/* Mobile Delete Button - Always visible on mobile */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmId(note.id);
                    }}
                    className="sm:hidden p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all duration-200"
                    title="Delete note"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>

                  {/* Sync Status */}
                  <div className="flex items-center gap-1">
                    {!note.is_synced && (
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" title="Not synced" />
                    )}
                    {note.is_synced && (
                      <div className="w-2 h-2 bg-green-500 rounded-full" title="Synced" />
                    )}
                  </div>
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

      {/* Floating Action Button */}
      {user && (
        <button
          onClick={() => setShowAddForm(true)}
          className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center z-40 group"
        >
          <svg className="w-6 h-6 text-white group-hover:scale-110 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      )}
    </div>
  );
}

import { useState } from 'react';
import { OfflineNote, ConflictResolution } from '../types/OfflineNote';

interface ConflictResolverProps {
  conflicts: OfflineNote[];
  onResolve: (resolution: ConflictResolution) => void;
  onClose: () => void;
}

export function ConflictResolver({ conflicts, onResolve, onClose }: ConflictResolverProps) {
  const [currentConflictIndex, setCurrentConflictIndex] = useState(0);
  const [mergedTitle, setMergedTitle] = useState('');
  const [mergedContent, setMergedContent] = useState('');
  const [showMergeEditor, setShowMergeEditor] = useState(false);

  if (conflicts.length === 0) return null;

  const currentConflict = conflicts[currentConflictIndex];

  const handleResolve = (resolution: 'local' | 'remote' | 'merge') => {
    const conflictResolution: ConflictResolution = {
      noteId: currentConflict.id,
      resolution,
      mergedContent:
        resolution === 'merge'
          ? {
              title: mergedTitle,
              content: mergedContent,
            }
          : undefined,
    };

    onResolve(conflictResolution);

    // Move to next conflict or close if done
    if (currentConflictIndex < conflicts.length - 1) {
      setCurrentConflictIndex(currentConflictIndex + 1);
      setShowMergeEditor(false);
      setMergedTitle('');
      setMergedContent('');
    } else {
      onClose();
    }
  };

  const startMerge = () => {
    setMergedTitle(currentConflict.title);
    setMergedContent(currentConflict.content);
    setShowMergeEditor(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-600">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-slate-100">
              Resolve Conflicts ({currentConflictIndex + 1} of {conflicts.length})
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-slate-200 mb-2">
              Note: {currentConflict.title}
            </h3>
            <p className="text-slate-400 text-sm">
              This note has been modified both locally and remotely. Choose how to resolve the
              conflict:
            </p>
          </div>

          {!showMergeEditor ? (
            <div className="space-y-6">
              {/* Local Version */}
              <div className="bg-slate-700 rounded-lg p-4 border-l-4 border-blue-500">
                <h4 className="font-medium text-blue-400 mb-2">Your Local Version</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-slate-400 text-sm">Title:</span>
                    <p className="text-slate-200">{currentConflict.title}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-sm">Content:</span>
                    <p className="text-slate-200 whitespace-pre-wrap">{currentConflict.content}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    Modified: {new Date(currentConflict.updated_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Remote Version */}
              <div className="bg-slate-700 rounded-lg p-4 border-l-4 border-green-500">
                <h4 className="font-medium text-green-400 mb-2">Remote Version</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-slate-400 text-sm">Title:</span>
                    <p className="text-slate-200">Remote version title</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-sm">Content:</span>
                    <p className="text-slate-200 whitespace-pre-wrap">Remote version content</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    Modified:{' '}
                    {currentConflict.conflict_version
                      ? new Date(currentConflict.conflict_version).toLocaleString()
                      : 'Unknown'}
                  </div>
                </div>
              </div>

              {/* Resolution Options */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleResolve('local')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                >
                  Keep Local Version
                </button>
                <button
                  onClick={() => handleResolve('remote')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors"
                >
                  Keep Remote Version
                </button>
                <button
                  onClick={startMerge}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                >
                  Merge Manually
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="font-medium text-purple-400">Manual Merge</h4>

              <div>
                <label className="block text-slate-300 text-sm mb-2">Title:</label>
                <input
                  type="text"
                  value={mergedTitle}
                  onChange={(e) => setMergedTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm mb-2">Content:</label>
                <textarea
                  value={mergedContent}
                  onChange={(e) => setMergedContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleResolve('merge')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                >
                  Save Merged Version
                </button>
                <button
                  onClick={() => setShowMergeEditor(false)}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-slate-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Progress indicator */}
          {conflicts.length > 1 && (
            <div className="mt-6 pt-4 border-t border-slate-600">
              <div className="flex justify-between text-sm text-slate-400">
                <span>
                  Progress: {currentConflictIndex + 1} of {conflicts.length}
                </span>
                <div className="flex gap-1">
                  {conflicts.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full ${
                        index < currentConflictIndex
                          ? 'bg-green-500'
                          : index === currentConflictIndex
                            ? 'bg-blue-500'
                            : 'bg-slate-600'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

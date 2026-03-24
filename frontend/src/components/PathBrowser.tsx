import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Folder, FolderOpen, ChevronRight, File, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: string;
}

interface PathBrowserProps {
  value: string;
  onChange: (path: string) => void;
  allowedBases?: string[]; // e.g. ['source_path', 'target_path']
}

const API_BASE = '/api';

export const PathBrowser: React.FC<PathBrowserProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [parent, setParent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPath, setSelectedPath] = useState(value || '');

  const loadDir = async (dir: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/browse-path`, { params: { dir } });
      setEntries(res.data.entries || []);
      setParent(res.data.parent || '');
      setCurrentPath(dir);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Failed to load directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      // Start from root or value's directory
      const startPath = value ? value.substring(0, value.lastIndexOf('/')) || '/' : '/';
      loadDir(startPath);
      setSelectedPath(value || '');
    }
  }, [open]);

  const handleSelect = (entry: FileEntry) => {
    if (entry.isDir) {
      loadDir(entry.path);
    } else {
      setSelectedPath(entry.path);
    }
  };

  const handleConfirm = () => {
    onChange(selectedPath);
    setOpen(false);
  };

  const handleClose = () => {
    setOpen(false);
    setError('');
    setEntries([]);
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="cb-btn cb-btn-primary"
        style={{ padding: '0.4rem 0.75rem', fontSize: '11px' }}
        type="button"
      >
        <FolderOpen size={14} />
        BROWSE
      </button>

      {/* Modal */}
      {open && (
        <>
          <div className="cb-drawer-overlay open" onClick={handleClose} />
          <div className="cb-drawer open" style={{ width: '480px', top: '50%', transform: 'translateY(-50%)', marginRight: '0' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="cb-font-mono text-sm font-bold text-[#00f0ff] uppercase tracking-widest">
                {t('pathBrowser.title')}
              </h3>
              <button onClick={handleClose} className="cb-btn" style={{ padding: '0.2rem 0.5rem' }}>
                ✕
              </button>
            </div>

            {/* Breadcrumb */}
            <div className="cb-font-mono text-[10px] mb-3 px-2 py-1.5 rounded bg-black/40 border border-[rgba(0,240,255,0.1)] overflow-x-auto whitespace-nowrap">
              <span className="text-[#4a4a6a]">PATH:</span>
              <span className="text-[#00f0ff] ml-2">{currentPath || '/'}</span>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-3 px-3 py-2 rounded bg-[rgba(255,45,106,0.1)] border border-[rgba(255,45,106,0.3)] text-[10px] text-[#ff2d6a] font-mono">
                {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-[#00f0ff]" />
              </div>
            )}

            {/* File list */}
            {!loading && (
              <div className="border border-[rgba(0,240,255,0.1)] rounded overflow-hidden max-h-[400px] overflow-y-auto">
                {/* Parent directory */}
                {parent && currentPath !== '/' && (
                  <button
                    onClick={() => loadDir(parent)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-[rgba(0,240,255,0.05)] border-b border-[rgba(0,240,255,0.05)] text-[#4a4a6a] hover:text-[#00f0ff] transition-colors"
                  >
                    <ChevronRight size={12} className="rotate-180" />
                    <span>..</span>
                  </button>
                )}

                {entries.length === 0 && !loading && (
                  <div className="px-3 py-8 text-center text-[10px] text-[#4a4a6a] font-mono">
                    {t('pathBrowser.empty')}
                  </div>
                )}

                {entries.map((entry) => (
                  <button
                    key={entry.path}
                    onClick={() => handleSelect(entry)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-mono hover:bg-[rgba(0,240,255,0.05)] border-b border-[rgba(0,240,255,0.05)] transition-colors ${
                      selectedPath === entry.path
                        ? 'bg-[rgba(0,240,255,0.1)] text-[#00f0ff]'
                        : 'text-[#e0e0e0]'
                    }`}
                  >
                    {entry.isDir ? (
                      <Folder size={14} className="text-[#ffb800] shrink-0" />
                    ) : (
                      <File size={14} className="text-[#4a4a6a] shrink-0" />
                    )}
                    <span className="flex-1 text-left truncate">{entry.name}</span>
                    {entry.isDir && <span className="text-[#4a4a6a] text-[9px]">DIR</span>}
                    {!entry.isDir && <span className="text-[#4a4a6a] text-[9px]">{formatSize(entry.size)}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Selected path preview */}
            {selectedPath && (
              <div className="mt-3 px-3 py-2 rounded bg-black/40 border border-[rgba(0,240,255,0.1)]">
                <div className="text-[9px] text-[#4a4a6a] font-mono uppercase mb-1">{t('pathBrowser.selected')}</div>
                <div className="text-[11px] text-[#39ff14] font-mono truncate">{selectedPath}</div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleClose}
                className="flex-1 cb-btn cb-btn-primary"
                style={{ opacity: 0.5 }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={!selectedPath}
                className="flex-1 cb-btn cb-btn-green"
                style={{ opacity: selectedPath ? 1 : 0.5 }}
              >
                <Folder size={14} />
                {t('pathBrowser.select')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

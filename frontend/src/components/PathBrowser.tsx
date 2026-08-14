import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronLeft, File, Folder, FolderOpen, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface BrowseRoot {
  label: string;
  path: string;
}

interface PathBrowserProps {
  value: string;
  onChange: (path: string) => void | Promise<void>;
}

const API_BASE = '/api';

export const PathBrowser: React.FC<PathBrowserProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [roots, setRoots] = useState<BrowseRoot[]>([]);
  const [parent, setParent] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const loadDir = async (dir = '') => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_BASE}/browse-path`, { params: { dir }, timeout: 15_000 });
      setEntries(response.data.entries || []);
      setRoots(response.data.roots || []);
      setParent(response.data.parent || '');
      setCurrentPath(response.data.path || dir);
    } catch (requestError: unknown) {
      const err = requestError as { response?: { data?: { error?: string; roots?: BrowseRoot[] } } };
      setError(err.response?.data?.error || '无法读取目录');
      setEntries([]);
      setRoots(err.response?.data?.roots || []);
      setParent('');
      setCurrentPath(dir);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadDir(value || '');
  }, [open, value]);

  const close = () => {
    setOpen(false);
    setError('');
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="path-browser-trigger" type="button">
        <FolderOpen size={15} />浏览目录
      </button>

      {open && (
        <div className="path-browser-backdrop" role="presentation" onMouseDown={close}>
          <section className="path-browser-dialog" role="dialog" aria-modal="true" aria-labelledby="path-browser-title" onMouseDown={event => event.stopPropagation()}>
            <header className="path-browser-header">
              <div>
                <h3 id="path-browser-title">{t('pathBrowser.title')}</h3>
                <p>仅显示应用有权限访问的目录</p>
              </div>
              <button type="button" className="path-browser-close" onClick={close} aria-label="关闭"><X size={18} /></button>
            </header>

            <div className="path-browser-roots" aria-label="常用目录">
              {roots.map(root => (
                <button type="button" key={root.path} onClick={() => loadDir(root.path)} className={root.path === currentPath ? 'is-active' : ''}>
                  <Folder size={14} />{root.label}
                </button>
              ))}
            </div>

            <div className="path-browser-location" title={currentPath}>
              <FolderOpen size={16} />
              <span>{currentPath || (loading ? '正在载入目录…' : error ? '目录不可用' : '请选择一个目录')}</span>
            </div>

            {error && <p className="path-browser-error">{error}</p>}

            <div className="path-browser-list">
              {loading ? (
                <div className="path-browser-empty"><Loader2 size={18} className="animate-spin" />正在读取目录…</div>
              ) : (
                <>
                  {parent && <button type="button" className="path-browser-entry is-parent" onClick={() => loadDir(parent)}><ChevronLeft size={16} />上一级目录</button>}
                  {entries.filter(entry => entry.isDir).map(entry => (
                    <button type="button" className="path-browser-entry" key={entry.path} onClick={() => loadDir(entry.path)}>
                      <Folder size={17} /><span>{entry.name}</span>
                    </button>
                  ))}
                  {entries.filter(entry => !entry.isDir).map(entry => (
                    <div className="path-browser-entry is-file" key={entry.path}><File size={16} /><span>{entry.name}</span></div>
                  ))}
                  {!error && entries.length === 0 && <div className="path-browser-empty">{t('pathBrowser.empty')}</div>}
                </>
              )}
            </div>

            <footer className="path-browser-footer">
              <span>{currentPath || (error ? '请先修复目录授权' : '请选择一个目录')}</span>
              <div>
                <button type="button" className="path-browser-cancel" onClick={close}>{t('common.cancel')}</button>
                <button type="button" className="path-browser-confirm" disabled={!currentPath || loading || confirming} onClick={async () => {
                  setConfirming(true);
                  try {
                    await onChange(currentPath);
                    close();
                  } catch (requestError: unknown) {
                    const err = requestError as { response?: { data?: { error?: string } } };
                    setError(err.response?.data?.error || '保存目录失败，请重试');
                  } finally {
                    setConfirming(false);
                  }
                }}>
                  {confirming ? '保存中…' : t('pathBrowser.select')}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
};

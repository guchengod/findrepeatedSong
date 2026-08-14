import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ChevronLeft,
  FileMusic,
  Folder,
  FolderOpen,
  Loader2,
  MoreVertical,
  Music2,
  Search,
} from 'lucide-react';
import { PathBrowser } from './PathBrowser';

const API_BASE = '/api';

export type ManualAction = 'complete' | 'organize' | 'lyrics' | 'duplicates';

interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: string;
}

interface BrowseResponse {
  entries: FileEntry[];
  parent: string;
  path: string;
}

const formatSize = (size: number) => {
  if (!size) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};

const formatDate = (value: string) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
};

export const ManualOperations = ({
  onRun,
  initialPath,
}: {
  onRun: (action: ManualAction, paths: string[]) => Promise<void>;
  initialPath: string;
}) => {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<ManualAction | null>(null);
  const [error, setError] = useState('');

  const loadDirectory = async (path = '') => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get<BrowseResponse>(`${API_BASE}/browse-path`, { params: { dir: path }, timeout: 15_000 });
      setCurrentPath(data.path);
      setParentPath(data.parent);
      setEntries(data.entries || []);
      setSelectedPaths([]);
    } catch (requestError: unknown) {
      const err = requestError as { response?: { data?: { error?: string } } };
      setEntries([]);
      setParentPath('');
      setCurrentPath(path);
      setError(err.response?.data?.error || '无法读取目录，请确认飞牛挂载目录和应用权限。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadDirectory(initialPath); }, [initialPath]);

  const filteredEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return entries;
    return entries.filter(entry => entry.name.toLowerCase().includes(normalized));
  }, [entries, query]);

  const toggleEntry = (path: string) => {
    setSelectedPaths(current => current.includes(path) ? current.filter(item => item !== path) : [...current, path]);
  };

  const visiblePaths = filteredEntries.map(entry => entry.path);
  const allVisibleSelected = visiblePaths.length > 0 && visiblePaths.every(path => selectedPaths.includes(path));

  const run = async (action: ManualAction) => {
    if (selectedPaths.length === 0) return;
    setRunning(action);
    try {
      await onRun(action, selectedPaths);
    } finally {
      setRunning(null);
    }
  };

  return (
    <section className="manual-page">
      <header className="page-heading">
        <h1>手动操作</h1>
        <p>浏览本地目录，选择音乐或文件夹后按需处理。</p>
      </header>

      <div className="manual-toolbar">
        <div className="manual-breadcrumb" title={currentPath}>
          <FolderOpen size={21} />
          <span>{currentPath || (loading ? '正在读取目录…' : error ? '目录不可用' : '请选择一个目录')}</span>
        </div>
        <div className="manual-tools">
          <PathBrowser value={currentPath} onChange={async (path) => { await loadDirectory(path); }} />
          <button type="button" className="quiet-action" onClick={() => void loadDirectory(parentPath)} disabled={!parentPath || loading}>
            <ChevronLeft size={17} />返回上级
          </button>
          <label className="manual-search">
            <Search size={17} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索当前目录" />
          </label>
        </div>
      </div>

      <div className="manual-file-table" aria-busy={loading}>
        <div className="manual-file-header">
          <label className="file-select-cell"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedPaths(allVisibleSelected ? [] : visiblePaths)} aria-label="选择当前列表" /></label>
          <span>名称</span><span>类型</span><span>大小</span><span>元数据状态</span><span>修改日期</span>
        </div>
        {loading ? (
          <div className="manual-empty"><Loader2 size={20} className="animate-spin" />正在读取目录…</div>
        ) : error ? (
          <div className="manual-empty is-error">{error}</div>
        ) : filteredEntries.length === 0 ? (
          <div className="manual-empty">当前目录没有可显示的文件。</div>
        ) : filteredEntries.map(entry => {
          const selected = selectedPaths.includes(entry.path);
          return (
            <div className={`manual-file-row ${selected ? 'is-selected' : ''}`} key={entry.path}>
              <label className="file-select-cell"><input type="checkbox" checked={selected} onChange={() => toggleEntry(entry.path)} aria-label={`选择 ${entry.name}`} /></label>
              <button type="button" className="manual-file-name" onDoubleClick={() => entry.isDir && void loadDirectory(entry.path)} onClick={() => toggleEntry(entry.path)}>
                {entry.isDir ? <Folder size={19} /> : <Music2 size={19} />}<span>{entry.name}</span>
              </button>
              <span>{entry.isDir ? '文件夹' : '音频文件'}</span>
              <span>{entry.isDir ? '—' : formatSize(entry.size)}</span>
              <span>{entry.isDir ? '—' : '待检查'}</span>
              <span>{formatDate(entry.modified)}</span>
            </div>
          );
        })}
      </div>

      <div className="manual-selection-bar">
        <strong>已选择 <b>{selectedPaths.length}</b> 项</strong>
        <span>对已选 {selectedPaths.length} 项执行：</span>
        <div className="manual-action-buttons">
          <button type="button" className="button-primary" disabled={!selectedPaths.length || running !== null} onClick={() => void run('complete')}>
            {running === 'complete' ? <Loader2 className="animate-spin" /> : <FileMusic />}补全元数据
          </button>
          <button type="button" className="button-secondary" disabled={!selectedPaths.length || running !== null} onClick={() => void run('organize')}><Folder />整理归档</button>
          <button type="button" className="button-secondary" disabled={!selectedPaths.length || running !== null} onClick={() => void run('lyrics')}><Music2 />下载歌词 / LRC</button>
          <button type="button" className="button-secondary" disabled={!selectedPaths.length || running !== null} onClick={() => void run('duplicates')}><Search />扫描重复项</button>
          <button type="button" className="button-icon" aria-label="更多操作"><MoreVertical size={19} /></button>
        </div>
      </div>
      <p className="page-footnote">所有操作仅作用于已选项目；执行过程和结果会写入任务记录。</p>
    </section>
  );
};

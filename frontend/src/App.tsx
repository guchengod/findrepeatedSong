import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Activity, Trash2,
  Loader2, FolderTree,
  Settings, Calendar, Sparkles,
  ChevronLeft, ChevronRight,
  Menu, Globe,
  Check,
  FileMusic, FileText, Search, HardDrive,
  Clock, Layers, Info,
  Sun, Moon, Library, X, ShieldCheck, RotateCcw, RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';
import { cn } from './lib/utils';
import { ActivityItem, Dashboard } from './components/Dashboard';
import { SettingsPage } from './components/SettingsDrawer';
import { CronBuilder } from './components/CronBuilder';
import { SchedulerHistory } from './components/SchedulerHistory';
import { PathBrowser } from './components/PathBrowser';

// --- Types ---

interface SongFile {
  id: number;
  path: string;
  filename: string;
  artist: string;
  album: string;
  title: string;
  normalizedName: string;
  size: number;
  ext: string;
  groupId: string;
}

interface AppConfig {
  key: string;
  value: string;
  desc: string;
}

interface RunRecord {
  id: string;
  timestamp: string;
  status: 'COMPLETE' | 'FAILED';
  duration_ms: number;
  error?: string;
}

interface ScheduleTask {
  id: number;
  name: string;
  cron: string;
  isActive: boolean;
  lastRun: string;
  nextRun: string;
  runHistory: string;
  runHistoryArr?: RunRecord[];
}

interface TrashRecord {
  id: number;
  filename: string;
  originalPath: string;
  size: number;
  createdAt: string;
}

interface LyricsRecord {
  id: number;
  trackPath: string;
  lyricsPath: string;
  provider: string;
  synced: boolean;
  status: 'completed' | 'skipped' | 'not_found' | 'empty' | 'failed';
  message: string;
  completedAt: string;
}

const API_BASE = '/api';

// --- Simple UI Components (shadcn style) ---

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn("bg-card text-card-foreground rounded-lg border shadow-sm", className)}>
    {children}
  </div>
);

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link', size?: 'default' | 'sm' | 'lg' | 'icon' }>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variants = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline",
    };
    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-md px-8",
      icon: "h-10 w-10",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Progress = ({ value, className }: { value: number, className?: string }) => (
  <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
    <div
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'secondary' | 'destructive' | 'outline' }) => {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/80",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/80",
    outline: "text-foreground border border-input hover:bg-accent",
  };
  return (
    <div className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", variants[variant])}>
      {children}
    </div>
  );
};

// --- Main App ---

type MenuItem = 'home' | 'deduper' | 'organizer' | 'completer' | 'scheduler' | 'settings';
type ActiveMenu = { parent: MenuItem, child?: string };
type PendingDeletion =
  | { type: 'group'; groupId: string; keepId: number; filename: string; count: number }
  | { type: 'file'; fileId: number; filename: string; count: number }
  | { type: 'auto'; count: number };

function App() {
  const { t, i18n } = useTranslation();
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>({ parent: 'home' });
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [schedules, setSchedules] = useState<ScheduleTask[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [wsConnected, setWsConnected] = useState(false);
  const realtimeRunning = useRef<Record<string, boolean>>({});

  // Progress States
  const [scanProgress, setScanProgress] = useState({ isRunning: false, scanned: 0, message: '' });
  const [analyzeProgress, setAnalyzeProgress] = useState({ isRunning: false, percent: 0, message: '' });
  const [pipelineProgress, setPipelineProgress] = useState({ isRunning: false, stage: '', elapsed: 0 });
  const [orgStatus, setOrgStatus] = useState({ isRunning: false, processed: 0, total: 0, status: '' });
  const [completeStatus, setCompleteStatus] = useState({ isRunning: false, processed: 0, total: 0, status: '' });
  const [completeLogs, setCompleteLogs] = useState<string[]>([]);
  const [lyricsStatus, setLyricsStatus] = useState({ isRunning: false, processed: 0, total: 0, status: '' });
  const [lyricsLogs, setLyricsLogs] = useState<string[]>([]);
  const [lyricsRecords, setLyricsRecords] = useState<LyricsRecord[]>([]);
  const [autoProgress, setAutoProgress] = useState({ isRunning: false, percent: 0, message: '' });

  const [duplicateGroups, setDuplicateGroups] = useState<SongFile[][]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [trashRecords, setTrashRecords] = useState<TrashRecord[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [similarity, setSimilarity] = useState(0.8);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>(['source_path']);
  const [organizeMode, setOrganizeMode] = useState<'move' | 'copy'>('move');
  const [duplicateQuery, setDuplicateQuery] = useState('');
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activityLog, setActivityLog] = useState<ActivityItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('findrepeatedsong.activity') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    loadConfigs();
    loadSchedules();
    loadGroups();
    loadTrash();
    loadLyrics();

    // Theme initialization
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const finalTheme = savedTheme || 'light';
    setTheme(finalTheme);
    applyTheme(finalTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem('findrepeatedsong.activity', JSON.stringify(activityLog.slice(0, 20)));
  }, [activityLog]);

  const applyTheme = (t: 'light' | 'dark') => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  useEffect(() => {
    if (configs.length > 0 && selectedStrategies.length === 0) {
      const def = getConfig('default_delete_strategy');
      if (def) setSelectedStrategies(def.split(',').map(s => s.trim()));
    }
  }, [configs]);

  // WebSocket with reconnection
  useEffect(() => {
    let wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Production serves the UI and WebSocket from the same port. During local
    // Vite development this also routes through the configured /ws proxy.
    const host = window.location.host;
    const wsUrl = `${wsProtocol}//${host}/ws`;
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setWsConnected(true);
        attempts = 0;
      };
      ws.onclose = () => {
        setWsConnected(false);
        attempts++;
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
        reconnectTimeout = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const { topic, data } = msg;
          const didFinish = (name: string) => {
            const wasRunning = realtimeRunning.current[name] === true;
            realtimeRunning.current[name] = data.isRunning === true;
            return wasRunning && data.isRunning === false;
          };

          switch (topic) {
            case 'pipeline':
              setPipelineProgress(data);
              if (didFinish('pipeline')) loadGroups();
              break;
            case 'scan':
              setScanProgress(data);
              break;
            case 'analyze':
              setAnalyzeProgress(data);
              break;
            case 'organize':
              setOrgStatus(data);
              break;
            case 'complete':
              setCompleteStatus(data);
              if (data.detail) {
                setCompleteLogs(prev => [data.detail, ...prev].slice(0, 100));
              }
              break;
            case 'lyrics':
              setLyricsStatus(data);
              if (data.detail) {
                setLyricsLogs(prev => [data.detail, ...prev].slice(0, 100));
              }
              if (didFinish('lyrics')) loadLyrics();
              break;
            case 'auto_delete':
              setAutoProgress(data);
              if (didFinish('auto_delete')) loadGroups();
              break;
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  const loadConfigs = async () => {
    const res = await axios.get(`${API_BASE}/config`);
    setConfigs(res.data);
  };

  const loadSchedules = async () => {
    const res = await axios.get(`${API_BASE}/schedules`);
    setSchedules(res.data);
  };

  const loadGroups = async () => {
    const res = await axios.get(`${API_BASE}/groups`, { params: { page, pageSize } });
    setDuplicateGroups(res.data.groups || []);
    setTotalGroups(res.data.total || 0);
  };

  const loadTrash = async () => {
    const response = await axios.get<TrashRecord[]>(`${API_BASE}/trash`);
    setTrashRecords(response.data || []);
  };

  const loadLyrics = async () => {
    const response = await axios.get<LyricsRecord[]>(`${API_BASE}/lyrics`);
    setLyricsRecords(response.data || []);
  };

  useEffect(() => {
    loadGroups();
  }, [page]);

  const updateSchedule = async (task: ScheduleTask) => {
    await axios.post(`${API_BASE}/schedules`, task);
    loadSchedules();
  };

  const getConfig = (key: string) => configs.find(c => c.key === key)?.value || '';

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en');
  };

  const navigate = (menu: MenuItem, child?: string) => {
    setActiveMenu({ parent: menu, child: child });
    setMobileNavOpen(false);
  };

  const addActivity = (entry: Omit<ActivityItem, 'id' | 'timestamp'>) => {
    setActivityLog(current => [{
      ...entry,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    }, ...current].slice(0, 20));
  };

  const confirmDeletion = async () => {
    if (!pendingDeletion) return;
    setIsDeleting(true);
    try {
      if (pendingDeletion.type === 'group') {
        await axios.post(`${API_BASE}/delete`, { groupId: pendingDeletion.groupId, keepId: pendingDeletion.keepId });
        addActivity({ kind: 'trash', title: '重复组已移入回收站', detail: `已保留 ${pendingDeletion.filename}，其余 ${pendingDeletion.count - 1} 个文件可恢复。` });
      } else if (pendingDeletion.type === 'file') {
        await axios.post(`${API_BASE}/delete-file`, { id: pendingDeletion.fileId });
        addActivity({ kind: 'trash', title: '文件已移入回收站', detail: `${pendingDeletion.filename} 可在回收站中恢复。` });
      } else {
        await axios.post(`${API_BASE}/auto-delete`, { strategies: selectedStrategies });
        addActivity({ kind: 'trash', title: '安全批量处理已启动', detail: `将处理 ${pendingDeletion.count} 个重复组，文件会先移入回收站。` });
      }
      await loadGroups();
      await loadTrash();
      setPendingDeletion(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const restoreTrash = async (id: number) => {
    const record = trashRecords.find(item => item.id === id);
    await axios.post(`${API_BASE}/trash/restore`, { id });
    addActivity({ kind: 'restore', title: '文件已从回收站恢复', detail: record ? `${record.filename} 已返回原始路径。` : '文件已返回原始路径。' });
    await Promise.all([loadTrash(), loadGroups()]);
  };

  // --- Sub-Views ---

  const renderDeduper = () => {
    const startCombinedSearch = async () => {
      const paths = selectedPaths.map(p => getConfig(p)).filter(p => p !== '');
      if (paths.length === 0) return alert('Please select a path');
      await axios.post(`${API_BASE}/full-pipeline`, { paths, similarity });
      addActivity({ kind: 'scan', title: '重复项扫描已启动', detail: `正在以 ${Math.round(similarity * 100)}% 相似度分析已选择的音乐路径。` });
    };

    const totalPages = Math.ceil(totalGroups / pageSize);
    const filteredGroups = duplicateGroups.filter(group => group.some(file =>
      [file.filename, file.artist, file.album, file.title, file.path].join(' ').toLowerCase().includes(duplicateQuery.toLowerCase())
    ));

    return (
      <div className="space-y-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('deduper.title')}</h1>
            <p className="text-muted-foreground">{t('deduper.subtitle')}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
             <Button className="flex-1 whitespace-nowrap sm:flex-none" onClick={startCombinedSearch} disabled={pipelineProgress.isRunning}>
                {pipelineProgress.isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4"/>}
                {t('deduper.findDuplicates')}
             </Button>
             <Button className="flex-1 whitespace-nowrap sm:flex-none" variant="destructive" onClick={() => setPendingDeletion({ type: 'auto', count: totalGroups })} disabled={autoProgress.isRunning || duplicateGroups.length === 0}>
                {autoProgress.isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4"/>}
                安全批量处理
             </Button>
             <Button className="sm:flex-none" variant="outline" size="icon" onClick={loadGroups}>
                <Activity className="h-4 w-4" />
             </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <HardDrive size={16} /> {t('deduper.scanPath')}
            </div>
            <div className="grid gap-2">
              {['source_path', 'target_path'].map(p => (
                <div key={p} className="flex items-center gap-2">
                   <input
                    type="radio" id={p} name="path" checked={selectedPaths.includes(p)}
                    onChange={() => setSelectedPaths([p])}
                    className="w-4 h-4 text-primary"
                  />
                   <label htmlFor={p} className="text-sm cursor-pointer">{p.replace('_', ' ').toUpperCase()}</label>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between font-semibold text-sm">
              <div className="flex items-center gap-2"><Layers size={16} /> {t('deduper.similarity')}</div>
              <span className="text-primary font-mono">{Math.round(similarity * 100)}%</span>
            </div>
            <input
              type="range" min="0.5" max="1.0" step="0.05"
              value={similarity}
              onChange={(e) => setSimilarity(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </Card>

          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Check size={16} /> {t('deduper.strategies')}
            </div>
            <div className="flex flex-wrap gap-2">
              {['quality', 'size_desc', 'size_asc'].map(s => (
                <Badge key={s} variant={selectedStrategies.includes(s) ? 'default' : 'outline'}>
                  <button onClick={() => {
                    setSelectedStrategies(prev =>
                      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                    );
                  }}>
                    {s.replace('_', ' ').toUpperCase()}
                  </button>
                </Badge>
              ))}
            </div>
          </Card>
        </div>

        {(pipelineProgress.isRunning || autoProgress.isRunning) && (
          <Card className="p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="flex items-center gap-2">
                    {pipelineProgress.stage === 'scan' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {t('common.running')}: {pipelineProgress.stage} {scanProgress.scanned > 0 && `(${scanProgress.scanned})`}
                  </span>
                  <span>{pipelineProgress.stage === 'analyze' ? `${analyzeProgress.percent}%` : ''}</span>
                </div>
                <Progress value={pipelineProgress.stage === 'analyze' ? analyzeProgress.percent : 100} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-destructive font-bold">{t('deduper.autoDelete')}</span>
                  <span>{autoProgress.percent}%</span>
                </div>
                <Progress value={autoProgress.percent} className="bg-destructive/20 [&>div]:bg-destructive" />
              </div>
            </div>
          </Card>
        )}

        {trashRecords.length > 0 && (
          <Card className="overflow-hidden border-emerald-200 bg-emerald-50/30">
            <div className="flex items-center justify-between border-b border-emerald-100 px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><RotateCcw size={17} />回收站保护</div>
              <span className="text-xs text-emerald-700">{trashRecords.length} 个文件可恢复</span>
            </div>
            <div className="divide-y divide-emerald-100">
              {trashRecords.slice(0, 5).map(record => (
                <div key={record.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{record.filename}</p><p className="truncate text-xs text-muted-foreground">{record.originalPath}</p></div>
                  <Button size="sm" variant="outline" onClick={() => restoreTrash(record.id)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />恢复</Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {totalGroups > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                显示 {(page-1)*pageSize + 1}-{Math.min(page*pageSize, totalGroups)} / {totalGroups} 个重复组
              </div>
              <div className="flex items-center gap-2">
                <div className="relative hidden sm:block">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={duplicateQuery} onChange={event => setDuplicateQuery(event.target.value)} placeholder="筛选歌曲、艺术家或路径" className="h-9 w-56 rounded-md border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary" />
                </div>
                <Button variant="outline" size="icon" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium w-12 text-center">{page} / {totalPages}</span>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
            {filteredGroups.map((group, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 border-b flex justify-between items-center">
                    <span className="text-xs font-bold uppercase text-muted-foreground">{t('deduper.group')} {(page-1)*pageSize + idx + 1}</span>
                    <Badge variant="secondary">{group.length} {t('deduper.files')}</Badge>
                  </div>
                  <div className="divide-y">
                    {group.map(file => (
                      <div key={file.id} className="p-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="bg-primary/10 p-2 rounded-full text-primary shrink-0">
                            <FileMusic size={16} />
                          </div>
                          <div className="overflow-hidden">
                            <h4 className="text-sm font-semibold truncate">{file.filename}</h4>
                            <p className="text-xs text-muted-foreground truncate font-mono">{file.path}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0 ml-4">
                          <Button size="sm" variant="outline" onClick={() => setPendingDeletion({ type: 'group', groupId: file.groupId, keepId: file.id, filename: file.filename, count: group.length })}>
                            {t('deduper.keep')}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setPendingDeletion({ type: 'file', fileId: file.id, filename: file.filename, count: 1 })}>
                            移入回收站
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderOrganizer = () => {
    const startOrg = async () => {
      await axios.post(`${API_BASE}/organize`, { path: getConfig('target_path'), mode: organizeMode });
    };

    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('organizer.title')}</h1>
          <p className="text-muted-foreground">{t('organizer.subtitle')}</p>
        </div>

        <Card className="p-8 space-y-8">
          <div className="grid gap-6">
            <div className="space-y-4">
              <label className="text-sm font-semibold">{t('organizer.mode')}</label>
              <div className="flex p-1 bg-secondary rounded-lg max-w-sm">
                <button
                  onClick={() => setOrganizeMode('move')}
                  className={cn("flex-1 py-2 rounded-md text-sm font-bold transition-all", organizeMode === 'move' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {t('organizer.move')}
                </button>
                <button
                  onClick={() => setOrganizeMode('copy')}
                  className={cn("flex-1 py-2 rounded-md text-sm font-bold transition-all", organizeMode === 'copy' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {t('organizer.copy')}
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
               <div className="space-y-2 p-4 bg-muted/30 rounded-lg border border-dashed">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">{t('organizer.source')}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-mono truncate flex-1">{getConfig('source_path') || '—'}</div>
                    <PathBrowser
                      value={getConfig('source_path')}
                      onChange={(path) => { axios.post(`${API_BASE}/config`, { key: 'source_path', value: path }); }}
                    />
                  </div>
               </div>
               <div className="space-y-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="text-[10px] font-bold text-primary uppercase">{t('organizer.target')}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-mono truncate flex-1">{getConfig('target_path') || '—'}</div>
                    <PathBrowser
                      value={getConfig('target_path')}
                      onChange={(path) => { axios.post(`${API_BASE}/config`, { key: 'target_path', value: path }); }}
                    />
                  </div>
               </div>
            </div>

            <Button size="lg" className="w-full font-bold uppercase tracking-widest" disabled={orgStatus.isRunning || !getConfig('target_path')} onClick={startOrg}>
               {orgStatus.isRunning ? <Loader2 className="mr-2 animate-spin"/> : <FolderTree className="mr-2"/>}
               {t('organizer.start')}
            </Button>
          </div>

          {orgStatus.isRunning && (
            <div className="space-y-2 pt-4 border-t">
              <div className="flex justify-between text-xs font-medium">
                <span>{orgStatus.status}</span>
                <span>{orgStatus.total > 0 ? Math.round((orgStatus.processed / orgStatus.total) * 100) : 0}%</span>
              </div>
              <Progress value={orgStatus.total > 0 ? (orgStatus.processed / orgStatus.total) * 100 : 0} />
            </div>
          )}
        </Card>
      </div>
    );
  };

  const renderCompleter = () => {
    const startComplete = async () => {
      const path = getConfig(selectedPaths[0]);
      if (!path) return;
      setCompleteLogs([]);
      await axios.post(`${API_BASE}/complete`, { path });
    };

    const startLyrics = async () => {
      const path = getConfig(selectedPaths[0]);
      if (!path) return alert('请先选择一个音乐目录');
      setLyricsLogs([]);
      await axios.post(`${API_BASE}/lyrics`, { path });
    };

    return (
      <div className="max-w-4xl space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('completer.title')}</h1>
            <p className="text-muted-foreground">{t('completer.subtitle')}</p>
          </div>
          <Button variant="outline" size="icon" onClick={() => setCompleteLogs([])}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <Card className="p-6 space-y-6">
              <div className="space-y-4">
                <label className="text-sm font-semibold">{t('deduper.scanPath')}</label>
                <div className="flex gap-4">
                  {['source_path', 'target_path'].map(p => (
                    <button
                      key={p}
                      onClick={() => setSelectedPaths([p])}
                      className={cn(
                        "flex-1 p-3 rounded-xl border-2 text-sm font-bold transition-all text-left flex justify-between items-center",
                        selectedPaths.includes(p) ? "border-primary bg-primary/5 text-primary" : "border-muted bg-muted/20 text-muted-foreground hover:border-muted-foreground/50"
                      )}
                    >
                      {p.replace('_', ' ').toUpperCase()}
                      {selectedPaths.includes(p) && <Check size={16} />}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-3 bg-secondary/50 rounded-lg text-xs font-mono truncate border italic flex-1">
                     {getConfig(selectedPaths[0]) || '—'}
                  </div>
                  <PathBrowser
                    value={getConfig(selectedPaths[0])}
                    onChange={async (path) => {
                      await axios.post(`${API_BASE}/config`, { key: selectedPaths[0], value: path });
                      await loadConfigs();
                    }}
                  />
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg text-sm border-l-4 border-primary">
                 <Sparkles className="text-primary shrink-0" size={20} />
                 <p className="text-muted-foreground leading-relaxed">
                    Uses <strong>MusicBrainz API</strong> to match recordings. We search by structured file tags and verified duration. Rate limited to 1 request/second.
                 </p>
              </div>

              <Button size="lg" className="w-full h-14 font-bold uppercase tracking-widest shadow-lg shadow-primary/20" disabled={completeStatus.isRunning} onClick={startComplete}>
                {completeStatus.isRunning ? <Loader2 className="mr-2 animate-spin"/> : <Sparkles className="mr-2"/>}
                {t('completer.start')}
              </Button>
            </Card>

            <Card className="p-6 space-y-5 border-blue-100 bg-blue-50/25">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary"><FileText size={19} /></div>
                  <div>
                    <h2 className="text-base font-bold">歌词补全</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">优先保留现有 .lrc 文件；缺失时从 LRCLIB 匹配，并安全写入歌曲同目录。</p>
                  </div>
                </div>
                <Button variant="outline" size="icon" onClick={loadLyrics} aria-label="刷新歌词记录"><RefreshCw className="h-4 w-4" /></Button>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border bg-background/70 px-4 py-3 text-xs">
                <span className="text-muted-foreground">当前来源</span>
                <span className="font-mono font-semibold text-primary">{getConfig('lyrics_provider') || 'lrclib'}</span>
              </div>

              <Button size="lg" className="w-full" disabled={lyricsStatus.isRunning} onClick={startLyrics}>
                {lyricsStatus.isRunning ? <Loader2 className="mr-2 animate-spin" /> : <FileText className="mr-2" />}
                {lyricsStatus.isRunning ? `${lyricsStatus.processed} / ${lyricsStatus.total} 正在补全歌词` : '开始补全歌词'}
              </Button>

              {lyricsLogs.length > 0 && (
                <div className="overflow-hidden rounded-md border bg-background">
                  <div className="border-b bg-muted/50 px-4 py-2 text-xs font-bold">本次歌词补全</div>
                  <div className="max-h-56 space-y-1 overflow-y-auto px-4 py-2 font-mono text-[11px]">
                    {lyricsLogs.map((log, index) => <p key={index} className={cn(log.includes('✅') ? 'text-emerald-700' : log.includes('❌') ? 'text-destructive' : 'text-muted-foreground')}>{log}</p>)}
                  </div>
                </div>
              )}

              {lyricsRecords.length > 0 && (
                <div className="overflow-hidden rounded-md border bg-background">
                  <div className="border-b bg-muted/50 px-4 py-2 text-xs font-bold">最近歌词记录</div>
                  <div className="divide-y">
                    {lyricsRecords.slice(0, 5).map(record => (
                      <div key={record.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                        <div className="min-w-0"><p className="truncate font-medium">{record.trackPath.split('/').pop()}</p><p className="truncate text-muted-foreground">{record.message}</p></div>
                        <span className={cn('shrink-0 rounded px-2 py-1 text-[10px] font-bold', record.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : record.status === 'skipped' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700')}>{record.synced ? '同步歌词' : record.status === 'completed' ? '已保存' : record.status === 'skipped' ? '已保留' : '未匹配'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {completeLogs.length > 0 && (
              <Card className="overflow-hidden">
                 <div className="px-4 py-2 border-b bg-muted/50 font-bold text-xs uppercase flex items-center gap-2">
                    <Activity size={14} /> {t('completer.logs')}
                 </div>
                 <div className="h-[400px] overflow-y-auto p-4 bg-black font-mono text-[11px] space-y-1">
                    {completeLogs.map((log, i) => (
                      <div key={i} className={cn(
                        "leading-loose border-b border-white/5 pb-1",
                        log.includes('✅') ? "text-green-400" : log.includes('❌') ? "text-red-400" : "text-yellow-400"
                      )}>
                        {log}
                      </div>
                    ))}
                 </div>
              </Card>
            )}
          </div>

          <div className="space-y-6">
             <Card className="p-4 space-y-4">
                <h3 className="text-sm font-bold uppercase">{t('common.running')}</h3>
                {completeStatus.isRunning ? (
                  <div className="space-y-4">
                     <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-primary uppercase">Status</span>
                        <span className="text-xs font-mono">{completeStatus.processed} Files</span>
                     </div>
                     <Progress value={100} className="animate-pulse" />
                     <p className="text-[10px] text-muted-foreground">{completeStatus.status}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground space-y-2 border border-dashed rounded-lg">
                     <Clock size={24} />
                     <span className="text-xs font-bold uppercase tracking-tighter italic">Waiting...</span>
                  </div>
                )}
             </Card>

             <Card className="p-4 space-y-4">
                <h3 className="text-sm font-bold">歌词补全状态</h3>
                {lyricsStatus.isRunning ? (
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">{lyricsStatus.status}</span><span className="font-mono">{lyricsStatus.processed} / {lyricsStatus.total}</span></div>
                    <Progress value={lyricsStatus.total > 0 ? (lyricsStatus.processed / lyricsStatus.total) * 100 : 0} />
                  </div>
                ) : <p className="text-xs leading-relaxed text-muted-foreground">歌词以 .lrc 文件保存，不会覆盖已有歌词或修改原始音频。</p>}
             </Card>

             <Card className="p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase flex items-center gap-2"><Info size={14} /> Note</h3>
                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                  Lossy formats will be tagged with ID3v2. Lossless formats (FLAC/WAV) will be updated via VorbisComment or RIFF chunks.
                </p>
             </Card>
          </div>
        </div>
      </div>
    );
  };

  const renderScheduler = () => {
    return (
      <div className="max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('scheduler.title')}</h1>
          <p className="text-muted-foreground">{t('scheduler.subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {schedules.map(task => (
            <Card key={task.id} className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">{task.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{t('scheduler.bgExecution')}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                    task.isActive ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground"
                  )}>
                    {task.isActive ? t('scheduler.active') : t('scheduler.disabled')}
                  </div>
                  <button
                    onClick={() => updateSchedule({...task, isActive: !task.isActive})}
                    className="text-[10px] font-bold text-primary hover:underline underline-offset-4"
                  >
                    {t('scheduler.toggle')}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">{t('scheduler.cron')}</label>
                  <CronBuilder
                    value={task.cron}
                    onChange={(cron) => {
                      const updated = schedules.map(s => s.id === task.id ? { ...s, cron } : s);
                      setSchedules(updated);
                    }}
                    onSave={(cron) => updateSchedule({ ...task, cron })}
                  />
                </div>

                <div className="flex justify-between items-center text-xs border-t pt-4">
                  <span className="text-muted-foreground uppercase font-bold text-[10px]">{t('scheduler.lastRun')}</span>
                  <span className="font-mono">{task.lastRun ? new Date(task.lastRun).toLocaleString() : t('scheduler.never')}</span>
                </div>

                {task.runHistoryArr && task.runHistoryArr.length > 0 && (
                  <SchedulerHistory runs={task.runHistoryArr} taskName={task.name} />
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // --- Layout Components ---

  const SidebarItem = ({ id, label, icon: Icon, indent = false }: { id: MenuItem, label: string, icon: any, indent?: boolean }) => {
    const isActive = activeMenu.parent === id;
    return (
      <button
        onClick={() => navigate(id)}
        className={cn(
          "library-nav-item",
          isActive && !indent && "is-active",
          indent && !isActive && "is-indented"
        )}
      >
        <Icon size={19} strokeWidth={1.8} />
        <span>{label}</span>
        {isActive && !indent && <ChevronRight className="nav-item-arrow" size={16} />}
      </button>
    );
  };

  const activeTabLabel = () => {
    if (activeMenu.parent === 'home') return t('app.home');
    return t(`app.${activeMenu.parent}`);
  };

  return (
    <div className="library-app-shell">
      <aside className="library-sidebar">
        <button className="library-brand" onClick={() => navigate('home')} aria-label="返回概览">
          <span className="brand-mark"><Activity size={23} strokeWidth={2.2} /></span>
          <span>{t('app.title')}</span>
        </button>
        <nav className="library-nav" aria-label="主导航">
          <SidebarItem id="home" label="概览" icon={Activity} />
          <SidebarItem id="deduper" label="重复项" icon={Library} />
          <SidebarItem id="organizer" label="整理" icon={FolderTree} />
          <SidebarItem id="completer" label="元数据" icon={Sparkles} />
          <SidebarItem id="scheduler" label="自动化" icon={Calendar} />
          <SidebarItem id="settings" label="设置" icon={Settings} />
        </nav>
        <div className="sidebar-safety">
          <ShieldCheck size={18} />
          <div><strong>本地优先</strong><span>所有操作仅在本地进行</span></div>
        </div>
        <div className="sidebar-storage"><span>可释放存储空间（估算）</span><strong>{totalGroups > 0 ? `${totalGroups} 组` : '尚未扫描'}</strong><button onClick={() => navigate('deduper')}><RefreshCw size={14} />重新计算</button></div>
        <button className="language-switch" onClick={toggleLanguage}><Globe size={16} />{i18n.language === 'en' ? 'English' : '简体中文'}<ChevronRight size={15} /></button>
      </aside>

      <div className="library-main">
        <header className="library-header">
          <button className="mobile-menu-button" onClick={() => setMobileNavOpen(open => !open)} aria-label="打开导航"><Menu size={20} /></button>
          <div className="mobile-brand">{t('app.title')}<span>· {activeTabLabel()}</span></div>
          <div className="header-actions">
            <span className={`header-status ${wsConnected ? 'is-online' : ''}`}><span />{wsConnected ? '本地音乐库 · 已连接' : '本地服务 · 正在连接'}</span>
            <span className="header-divider" />
            {activeMenu.parent === 'home' && <button className="header-scan" onClick={() => navigate('deduper')}><Search size={18} />扫描重复项</button>}
            <button className="icon-button" onClick={toggleTheme} aria-label="切换主题">{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
          </div>
        </header>
        {mobileNavOpen && <nav className="mobile-navigation"><SidebarItem id="home" label="概览" icon={Activity} /><SidebarItem id="deduper" label="重复项" icon={Library} /><SidebarItem id="organizer" label="整理" icon={FolderTree} /><SidebarItem id="completer" label="元数据" icon={Sparkles} /><SidebarItem id="scheduler" label="自动化" icon={Calendar} /><SidebarItem id="settings" label="设置" icon={Settings} /></nav>}
        <main className="library-content custom-scrollbar">
          <div className="content-width">
            {activeMenu.parent === 'home' && <Dashboard onNavigate={navigate} activity={activityLog} connected={wsConnected} />}
            {activeMenu.parent === 'deduper' && renderDeduper()}
            {activeMenu.parent === 'organizer' && renderOrganizer()}
            {activeMenu.parent === 'completer' && !activeMenu.child && renderCompleter()}
            {activeMenu.parent === 'scheduler' && renderScheduler()}
            {activeMenu.parent === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>

      {pendingDeletion && (
        <div className="safety-modal-backdrop" role="presentation">
          <section className="safety-modal" role="dialog" aria-modal="true" aria-labelledby="safety-modal-title">
            <button className="modal-close" onClick={() => setPendingDeletion(null)} aria-label="关闭"><X size={18} /></button>
            <span className="safety-modal-icon"><Trash2 size={23} /></span>
            <h2 id="safety-modal-title">先移入回收站，再确认处理</h2>
            <p>{pendingDeletion.type === 'auto' ? `将按当前策略处理 ${pendingDeletion.count} 个重复组。` : pendingDeletion.type === 'group' ? `将保留“${pendingDeletion.filename}”，其余 ${pendingDeletion.count - 1} 个版本会移入回收站。` : `“${pendingDeletion.filename}”会被移入回收站。`}</p>
            <div className="safety-callout"><RotateCcw size={18} /><span>文件不会立即永久删除，可在回收站恢复。</span></div>
            <div className="modal-actions"><button className="secondary-action" onClick={() => setPendingDeletion(null)}>返回审核</button><button className="danger-action" onClick={confirmDeletion} disabled={isDeleting}>{isDeleting ? '正在处理…' : '确认移入回收站'}</button></div>
          </section>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: hsl(var(--muted));
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground) / 0.5);
        }
      `}</style>
    </div>
  );
}

export default App;

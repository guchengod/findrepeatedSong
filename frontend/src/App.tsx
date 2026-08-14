import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Activity, Trash2,
  Loader2, FolderTree, FolderOpen, ArrowRight, CheckCircle2,
  Settings, Sparkles, Bell, Bot, ClipboardList, Workflow, SlidersHorizontal,
  ChevronLeft, ChevronRight,
  Menu, Globe,
  Check,
  FileMusic, FileText, Search, HardDrive,
  Clock, Layers, Info,
  X, ShieldCheck, RotateCcw, RefreshCw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';
import { cn } from './lib/utils';
import { ActivityItem, Dashboard } from './components/Dashboard';
import { SettingsPage } from './components/SettingsDrawer';
import { CronBuilder } from './components/CronBuilder';
import { SchedulerHistory } from './components/SchedulerHistory';
import { PathBrowser } from './components/PathBrowser';
import { ManualAction, ManualOperations } from './components/ManualOperations';

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

interface WorkflowProgress {
  isRunning: boolean;
  stage: string;
  completed: number;
  total: number;
  status: string;
}

interface WorkflowSettings {
  sourcePath: string;
  targetPath: string;
  organizeMode: 'move' | 'copy';
  scanDuplicates: boolean;
  completeMetadata: boolean;
  organize: boolean;
  downloadLyrics: boolean;
}

interface AutomationTask {
  id: number;
  name: string;
  kind: 'schedule' | 'monitor';
  cron: string;
  rootPath: string;
  isActive: boolean;
  workflow: WorkflowSettings;
  lastRun: string;
  createdAt: string;
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

interface OrganizerDirectoryPanelProps {
  label: string;
  hint: string;
  path: string;
  isTarget?: boolean;
  onSelect: (path: string) => void | Promise<void>;
}

// Kept outside App so WebSocket-driven parent re-renders do not remount the
// directory picker while the user is browsing.
const OrganizerDirectoryPanel = ({ label, hint, path, isTarget, onSelect }: OrganizerDirectoryPanelProps) => (
  <section className={cn('organizer-directory-panel', isTarget && 'is-target', path && 'is-selected')}>
    <div className="organizer-directory-heading">
      <div className="organizer-directory-icon"><FolderOpen size={28} strokeWidth={1.75} /></div>
      <div className="min-w-0">
        <h2>{label}</h2>
        <p>{hint}</p>
      </div>
      {path && <span className="organizer-directory-status"><CheckCircle2 size={15} />已选择</span>}
    </div>

    <div className={cn('organizer-directory-path', !path && 'is-empty')} title={path || '尚未选择目录'}>
      <span>{path || '尚未选择目录'}</span>
    </div>

    <div className="organizer-directory-actions">
      <PathBrowser value={path} onChange={onSelect} />
      {path && <span className="organizer-change-hint">可随时更换</span>}
    </div>
  </section>
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

type MenuItem = 'home' | 'workflow' | 'manual' | 'records' | 'automation' | 'settings' | 'deduper' | 'organizer' | 'completer' | 'scheduler';
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
  const [workflowProgress, setWorkflowProgress] = useState<WorkflowProgress>({ isRunning: false, stage: '', completed: 0, total: 0, status: '' });
  const [workflowSettings, setWorkflowSettings] = useState<WorkflowSettings>({ sourcePath: '', targetPath: '', organizeMode: 'move', scanDuplicates: true, completeMetadata: true, organize: true, downloadLyrics: true });
  const [workflowConfigStep, setWorkflowConfigStep] = useState<keyof Pick<WorkflowSettings, 'scanDuplicates' | 'completeMetadata' | 'organize' | 'downloadLyrics'> | null>(null);
  const [workflowNotice, setWorkflowNotice] = useState('');
  const [automations, setAutomations] = useState<AutomationTask[]>([]);
  const [automationDraft, setAutomationDraft] = useState<AutomationTask | null>(null);

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
    loadAutomations();
    axios.get<Partial<WorkflowSettings>>(`${API_BASE}/workflow/config`).then(response => {
      if (response.data.sourcePath) setWorkflowSettings(current => ({ ...current, ...response.data }));
    }).catch(() => undefined);

  }, []);

  useEffect(() => {
    setWorkflowSettings(current => ({
      ...current,
      sourcePath: current.sourcePath || getConfig('source_path'),
      targetPath: current.targetPath || getConfig('target_path'),
    }));
  }, [configs]);

  useEffect(() => {
    localStorage.setItem('findrepeatedsong.activity', JSON.stringify(activityLog.slice(0, 20)));
  }, [activityLog]);

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
            case 'workflow':
              setWorkflowProgress(data);
              if (didFinish('workflow')) {
                addActivity({ kind: 'organize', title: data.stage === 'done' ? '新歌入库工作流已完成' : '新歌入库工作流已停止', detail: data.status || '请在任务记录中查看执行详情。' });
              }
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

  const loadAutomations = async () => {
    const response = await axios.get<AutomationTask[]>(`${API_BASE}/automations`);
    setAutomations(response.data || []);
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

  const saveConfigValue = async (key: string, value: string) => {
    await axios.post(`${API_BASE}/config`, { key, value });
    // Reflect a directory choice as soon as the picker closes. The follow-up
    // fetch keeps the local view aligned with the persisted server config.
    setConfigs(current => {
      const exists = current.some(config => config.key === key);
      return exists
        ? current.map(config => config.key === key ? { ...config, value } : config)
        : [...current, { key, value, desc: '' }];
    });
    await loadConfigs();
  };

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
    const sourcePath = getConfig('source_path');
    const targetPath = getConfig('target_path');
    const hasTarget = Boolean(targetPath);

    const startOrg = async () => {
      await axios.post(`${API_BASE}/organize`, { path: targetPath, mode: organizeMode });
    };

    return (
      <div className="organizer-page">
        <div className="organizer-page-header">
          <h1>{t('organizer.title')}</h1>
          <p>{t('organizer.subtitle')}</p>
        </div>

        <Card className="organizer-workbench">
          <div className="organizer-section-title"><span>1</span><strong>已配置目录</strong><i /></div>

          <div className="organizer-directory-flow">
            <OrganizerDirectoryPanel label="源目录" hint="待整理的音乐文件所在位置" path={sourcePath} onSelect={(nextPath) => saveConfigValue('source_path', nextPath)} />
            <div className="organizer-flow-arrow" aria-label="从源目录整理到目标目录"><ArrowRight size={31} strokeWidth={1.45} /></div>
            <OrganizerDirectoryPanel label="目标目录" hint="整理后的音乐文件存放位置" path={targetPath} isTarget onSelect={(nextPath) => saveConfigValue('target_path', nextPath)} />
          </div>

          <div className="organizer-section-title organizer-options-title"><span>2</span><strong>整理选项</strong><i /></div>

          <div className="organizer-options">
            <div>
              <label className="organizer-options-label">操作类型</label>
              <div className="organizer-mode-control" role="radiogroup" aria-label={t('organizer.mode')}>
                <button
                  type="button"
                  aria-checked={organizeMode === 'move'}
                  role="radio"
                  onClick={() => setOrganizeMode('move')}
                  className={cn(organizeMode === 'move' && 'is-active')}
                >
                  <span className="organizer-mode-radio" />
                  <span><b>{t('organizer.move')}</b><small>将文件移动到目标目录</small></span>
                </button>
                <button
                  type="button"
                  aria-checked={organizeMode === 'copy'}
                  role="radio"
                  onClick={() => setOrganizeMode('copy')}
                  className={cn(organizeMode === 'copy' && 'is-active')}
                >
                  <span className="organizer-mode-radio" />
                  <span><b>{t('organizer.copy')}</b><small>保留原文件并复制到目标目录</small></span>
                </button>
              </div>
            </div>

            <div className="organizer-safety-note">
              <ShieldCheck size={22} />
              <div><strong>本地优先，安全可控</strong><span>所有操作都在本地完成；开始前请确认上方的目标目录。</span></div>
            </div>

            <Button size="lg" className="organizer-start" disabled={orgStatus.isRunning || !hasTarget} onClick={startOrg}>
               {orgStatus.isRunning ? <Loader2 className="animate-spin"/> : <FolderTree />}
               {orgStatus.isRunning ? '正在整理…' : t('organizer.start')}
            </Button>
          </div>

          {orgStatus.isRunning && (
            <div className="organizer-progress">
              <div>
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

  const runManualAction = async (action: ManualAction, paths: string[]) => {
    if (paths.length === 0) return;
    const actionLabel = {
      complete: '元数据补全',
      organize: '整理归档',
      lyrics: '歌词下载',
      duplicates: '重复项扫描',
    }[action];
    try {
      if (action === 'duplicates') {
        await axios.post(`${API_BASE}/manual-scan`, { paths, similarity });
      } else if (action === 'organize') {
        await axios.post(`${API_BASE}/organize`, { path: getConfig('target_path'), paths, mode: organizeMode });
      } else {
        await axios.post(`${API_BASE}/${action === 'complete' ? 'complete' : 'lyrics'}`, { paths });
      }
      addActivity({ kind: action === 'duplicates' ? 'scan' : action === 'organize' ? 'organize' : 'metadata', title: `${actionLabel}已启动`, detail: `已从手动操作提交 ${paths.length} 个已选项目。` });
    } catch (requestError: unknown) {
      const err = requestError as { response?: { data?: { error?: string } } };
      window.alert(err.response?.data?.error || `${actionLabel}暂时无法启动，请检查目录权限和任务状态。`);
      throw requestError;
    }
  };

  const startWorkflow = async () => {
    if (!workflowSettings.sourcePath) {
      setWorkflowNotice('请在此工作流中选择来源目录后再开始。');
      return;
    }
    try {
      await axios.post(`${API_BASE}/workflow/run`, workflowSettings);
      setWorkflowNotice('工作流已启动，正在跳转到任务记录。');
      addActivity({ kind: 'organize', title: '新歌入库工作流已启动', detail: `正在处理：${workflowSettings.sourcePath}` });
      navigate('records');
    } catch (requestError: unknown) {
      const err = requestError as { response?: { data?: { error?: string } } };
      setWorkflowNotice(err.response?.data?.error || '工作流无法启动，请检查目录和步骤配置。');
    }
  };

  const renderWorkflow = () => {
    const stages: Array<{ id: keyof Pick<WorkflowSettings, 'scanDuplicates' | 'completeMetadata' | 'organize' | 'downloadLyrics'>; index: string; title: string; detail: string; icon: React.ElementType }> = [
      { id: 'scanDuplicates', index: '2', title: '扫描重复项', detail: '在整理前建立重复项分组，供后续手动审核', icon: Search },
      { id: 'completeMetadata', index: '3', title: '补全元数据', detail: '修复缺失或不完整的标签信息', icon: Sparkles },
      { id: 'organize', index: '4', title: '整理归档', detail: '按艺术家 / 专辑结构归档文件', icon: FolderTree },
      { id: 'downloadLyrics', index: '5', title: '下载歌词 / LRC', detail: '为匹配成功的歌曲保存歌词文件', icon: FileText },
    ];
    return (
      <section className="workflow-page">
        <header className="page-heading"><h1>新歌入库工作流</h1><p>补全信息、整理归档并下载歌词。</p></header>
        {workflowNotice && <div className="workflow-notice"><Info size={17} />{workflowNotice}</div>}
        <div className="workflow-list">
          <article className="workflow-list-row workflow-source-row">
            <span className="workflow-number">1</span><span className="workflow-row-icon"><FolderOpen size={29} /></span>
            <div className="workflow-row-copy"><strong>选择目录</strong><small>来源：{workflowSettings.sourcePath || '尚未选择'} <ArrowRight size={14} /> 目标：{workflowSettings.targetPath || '整理步骤未启用'}</small><div className="workflow-directory-controls"><span><PathBrowser value={workflowSettings.sourcePath} onChange={async sourcePath => setWorkflowSettings(current => ({ ...current, sourcePath }))} /><small>选择来源</small></span><span><PathBrowser value={workflowSettings.targetPath} onChange={async targetPath => setWorkflowSettings(current => ({ ...current, targetPath }))} /><small>选择归档目录</small></span></div></div>
          </article>
          {stages.map(stage => {
            const Icon = stage.icon;
            const enabled = workflowSettings[stage.id];
            return <article className="workflow-list-row" key={stage.id}>
              <span className="workflow-number">{stage.index}</span><span className="workflow-row-icon"><Icon size={29} /></span>
              <div className="workflow-row-copy"><strong>{stage.title}</strong><small>{stage.detail}</small>{workflowConfigStep === stage.id && <div className="workflow-stage-config">{stage.id === 'scanDuplicates' && <label>重复项相似度<input type="range" min="0.6" max="0.98" step="0.01" value={similarity} onChange={event => setSimilarity(Number(event.target.value))} /><b>{Math.round(similarity * 100)}%</b></label>}{stage.id === 'completeMetadata' && <label>MusicBrainz API Key<input type="password" defaultValue={getConfig('mb_api_key')} placeholder="可选，用于提升配额" onBlur={event => void saveConfigValue('mb_api_key', event.target.value)} /></label>}{stage.id === 'organize' && <label>归档方式<select value={workflowSettings.organizeMode} onChange={event => setWorkflowSettings(current => ({ ...current, organizeMode: event.target.value as 'move' | 'copy' }))}><option value="move">移动原文件</option><option value="copy">复制文件</option></select></label>}{stage.id === 'downloadLyrics' && <label>歌词来源<select defaultValue={getConfig('lyrics_provider') || 'lrclib'} onChange={event => void saveConfigValue('lyrics_provider', event.target.value)}><option value="lrclib">LRCLIB</option></select></label>}</div>}</div>
              <div className="workflow-row-actions"><button type="button" className="text-action" onClick={() => setWorkflowConfigStep(current => current === stage.id ? null : stage.id)}>配置</button><button type="button" className={`status-toggle ${enabled ? 'is-enabled' : ''}`} onClick={() => setWorkflowSettings(current => ({ ...current, [stage.id]: !current[stage.id] }))}><CheckCircle2 size={16} />{enabled ? '已启用' : '已停用'}</button></div>
            </article>;
          })}
        </div>
        <div className="workflow-summary"><strong>本次将执行</strong><b>{[workflowSettings.scanDuplicates, workflowSettings.completeMetadata, workflowSettings.organize, workflowSettings.downloadLyrics].filter(Boolean).length}</b><span>个已启用步骤</span><i /><span>目录与步骤配置仅作用于本次和后续自动化。</span></div>
        <div className="page-actions"><button className="button-primary" onClick={() => void startWorkflow()}><Workflow size={18} />开始工作流</button></div>
      </section>
    );
  };

  const renderTaskRecords = () => {
    const activeSteps = [
      { key: 'duplicates', title: '扫描重复项', enabled: workflowSettings.scanDuplicates, detail: '建立重复项分组，供手动审核' },
      { key: 'metadata', title: '补全元数据', enabled: workflowSettings.completeMetadata, detail: 'MusicBrainz 信息匹配' },
      { key: 'organize', title: '整理归档', enabled: workflowSettings.organize, detail: '按设置的方式归档文件' },
      { key: 'lyrics', title: '下载歌词 / LRC', enabled: workflowSettings.downloadLyrics, detail: '使用 LRCLIB 保存歌词' },
    ].filter(step => step.enabled);
    const runningStage = workflowProgress.stage.replace('_done', '');
    const workflowDone = workflowProgress.stage === 'done';
    const liveDetail = (key: string, fallback: string) => {
      if (key === 'duplicates' && (scanProgress.isRunning || analyzeProgress.isRunning)) return `已扫描 ${scanProgress.scanned} 个文件 · ${analyzeProgress.message || scanProgress.message || '正在归类'}`;
      if (key === 'metadata' && completeStatus.isRunning) return `已处理 ${completeStatus.processed} 首 · ${completeStatus.status || '正在匹配'}`;
      if (key === 'organize' && orgStatus.isRunning) return `已整理 ${orgStatus.processed} / ${orgStatus.total || '…'} 首 · ${orgStatus.status}`;
      if (key === 'lyrics' && lyricsStatus.isRunning) return `已检查 ${lyricsStatus.processed} / ${lyricsStatus.total || '…'} 首 · ${lyricsStatus.status}`;
      return fallback;
    };
    return <section className="records-page">
      <header className="page-heading"><h1>任务记录</h1><p>查看工作流与手动操作的执行结果。</p></header>
      <article className="active-task-panel"><header><div><span className={`running-dot ${workflowProgress.isRunning ? '' : 'is-idle'}`} />新歌入库 <small>来源：{workflowSettings.sourcePath || '尚未选择目录'}</small></div><strong>{workflowProgress.completed || 0} / {workflowProgress.total || activeSteps.length} 步完成</strong></header><p className="task-status-copy">{workflowProgress.status || '尚无进行中的工作流。启动后，这里会通过实时连接逐步更新。'}</p><div className="task-timeline">{activeSteps.map((step, index) => { const completed = workflowDone || workflowProgress.completed > index; const active = workflowProgress.isRunning && runningStage === step.key; const status = completed ? '已完成' : active ? '正在执行' : '等待开始'; return <div className={`task-step ${active ? 'is-active' : ''} ${completed ? 'is-complete' : ''}`} key={step.key}><span>{active ? <Loader2 size={16} className="animate-spin" /> : completed ? <Check size={16} /> : index + 1}</span><div><strong>{step.title}</strong><small>{active ? liveDetail(step.key, step.detail) : step.detail}</small></div><em>{status}</em></div>; })}</div></article>
      <section className="record-history"><h2>最近记录</h2>{activityLog.length === 0 ? <p>暂时没有记录。开始一次工作流或手动操作后，结果会显示在这里。</p> : activityLog.map(item => <div className="record-history-row" key={item.id}><CheckCircle2 size={20} /><div><strong>{item.title}</strong><small>{item.detail}</small></div><time>{item.timestamp}</time></div>)}</section>
    </section>;
  };

  const renderAutomation = () => {
    const makeDraft = (kind: 'schedule' | 'monitor'): AutomationTask => ({ id: 0, name: kind === 'schedule' ? '每日新歌入库' : '下载目录监控', kind, cron: '0 2 * * *', rootPath: kind === 'monitor' ? workflowSettings.sourcePath : '', isActive: true, workflow: { ...workflowSettings }, lastRun: '', createdAt: '' });
    const workflowSummary = (workflow: WorkflowSettings) => [workflow.scanDuplicates && '重复项扫描', workflow.completeMetadata && '补全元数据', workflow.organize && '整理归档', workflow.downloadLyrics && '下载歌词'].filter(Boolean).join(' · ') || '未启用步骤';
    const cronTime = (cron: string) => { const [minute = '0', hour = '2'] = cron.split(' '); return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`; };
    const saveDraft = async () => {
      if (!automationDraft) return;
      try {
        await axios.post(`${API_BASE}/automations`, automationDraft);
        await loadAutomations();
        setAutomationDraft(null);
      } catch (requestError: unknown) {
        const err = requestError as { response?: { data?: { error?: string } } };
        window.alert(err.response?.data?.error || '无法保存自动化任务。');
      }
    };
    const toggleAutomation = async (task: AutomationTask) => {
      await axios.post(`${API_BASE}/automations`, { ...task, isActive: !task.isActive });
      await loadAutomations();
    };
    const deleteAutomation = async (task: AutomationTask) => {
      if (!window.confirm(`删除“${task.name}”？`)) return;
      await axios.delete(`${API_BASE}/automations/${task.id}`);
      await loadAutomations();
    };
    return <section className="automation-page">
      <header className="page-heading page-heading-with-action"><div><h1>自动化</h1><p>每一条自动化都拥有独立的触发方式和工作流配置。</p></div><div className="automation-create-actions"><button className="button-secondary" onClick={() => setAutomationDraft(makeDraft('schedule'))}><Clock size={17} />新建定时</button><button className="button-primary" onClick={() => setAutomationDraft(makeDraft('monitor'))}><Bot size={17} />新建监控</button></div></header>
      {automationDraft && <section className="automation-editor"><header><div><strong>{automationDraft.id ? '编辑自动化工作流' : '新建自动化工作流'}</strong><span>触发条件和工作流配置只属于这一条自动化。</span></div><button className="text-action" onClick={() => setAutomationDraft(null)}>取消</button></header><div className="automation-editor-grid"><label>名称<input value={automationDraft.name} onChange={event => setAutomationDraft(current => current ? { ...current, name: event.target.value } : current)} placeholder="例如：每日入库" /></label><label>触发方式<select value={automationDraft.kind} onChange={event => setAutomationDraft(current => current ? { ...current, kind: event.target.value as 'schedule' | 'monitor', rootPath: event.target.value === 'monitor' ? current.rootPath || current.workflow.sourcePath : '', } : current)}><option value="schedule">定时执行</option><option value="monitor">新增歌曲监控</option></select></label>{automationDraft.kind === 'schedule' ? <label>执行时间<input type="time" value={cronTime(automationDraft.cron)} onChange={event => { const [hour, minute] = event.target.value.split(':'); setAutomationDraft(current => current ? { ...current, cron: `${Number(minute)} ${Number(hour)} * * *` } : current); }} /></label> : <label>监控根目录<div className="monitor-root-picker"><PathBrowser value={automationDraft.rootPath} onChange={async rootPath => setAutomationDraft(current => current ? { ...current, rootPath, workflow: { ...current.workflow, sourcePath: current.workflow.sourcePath || rootPath } } : current)} /><span title={automationDraft.rootPath}>{automationDraft.rootPath || '选择监听目录'}</span></div></label>}<label>工作流来源目录<div className="monitor-root-picker"><PathBrowser value={automationDraft.workflow.sourcePath} onChange={async sourcePath => setAutomationDraft(current => current ? { ...current, workflow: { ...current.workflow, sourcePath } } : current)} /><span title={automationDraft.workflow.sourcePath}>{automationDraft.workflow.sourcePath || '选择音乐目录'}</span></div></label><label>归档目录<div className="monitor-root-picker"><PathBrowser value={automationDraft.workflow.targetPath} onChange={async targetPath => setAutomationDraft(current => current ? { ...current, workflow: { ...current.workflow, targetPath } } : current)} /><span title={automationDraft.workflow.targetPath}>{automationDraft.workflow.targetPath || '可选（未启用整理时无需设置）'}</span></div></label></div><div className="automation-workflow-options"><label><input type="checkbox" checked={automationDraft.workflow.scanDuplicates} onChange={event => setAutomationDraft(current => current ? { ...current, workflow: { ...current.workflow, scanDuplicates: event.target.checked } } : current)} />扫描重复项</label><label><input type="checkbox" checked={automationDraft.workflow.completeMetadata} onChange={event => setAutomationDraft(current => current ? { ...current, workflow: { ...current.workflow, completeMetadata: event.target.checked } } : current)} />补全元数据</label><label><input type="checkbox" checked={automationDraft.workflow.organize} onChange={event => setAutomationDraft(current => current ? { ...current, workflow: { ...current.workflow, organize: event.target.checked } } : current)} />整理归档</label><label><input type="checkbox" checked={automationDraft.workflow.downloadLyrics} onChange={event => setAutomationDraft(current => current ? { ...current, workflow: { ...current.workflow, downloadLyrics: event.target.checked } } : current)} />下载歌词</label><select value={automationDraft.workflow.organizeMode} onChange={event => setAutomationDraft(current => current ? { ...current, workflow: { ...current.workflow, organizeMode: event.target.value as 'move' | 'copy' } } : current)}><option value="move">整理时移动</option><option value="copy">整理时复制</option></select></div><footer><label><input type="checkbox" checked={automationDraft.isActive} onChange={event => setAutomationDraft(current => current ? { ...current, isActive: event.target.checked } : current)} />保存后立即启用</label><button className="button-primary" onClick={() => void saveDraft()}>保存自动化</button></footer></section>}
      <div className="automation-task-list">{automations.length === 0 ? <p className="empty-inline">还没有自动化。新建一条定时或监控工作流，它们会独立保存、独立运行。</p> : automations.map(task => <article className="automation-task" key={task.id}><span className={`automation-task-icon ${task.kind}`}>{task.kind === 'schedule' ? <Clock size={21} /> : <Bot size={21} />}</span><div className="automation-task-main"><strong>{task.name}</strong><span>{task.kind === 'schedule' ? `每天 ${cronTime(task.cron)} 执行` : `监听：${task.rootPath}`}</span><small>{task.workflow.sourcePath} · {workflowSummary(task.workflow)}</small></div><div className="automation-task-state"><b className={task.isActive ? 'is-enabled' : ''}>{task.isActive ? '已启用' : '已暂停'}</b><span>{task.lastRun ? `上次执行 ${new Date(task.lastRun).toLocaleString('zh-CN')}` : '尚未执行'}</span></div><div className="automation-task-actions"><button className="text-action" onClick={() => setAutomationDraft({ ...task, workflow: { ...task.workflow } })}>编辑</button><button className="text-action" onClick={() => void toggleAutomation(task)}>{task.isActive ? '暂停' : '启用'}</button><button className="text-action is-danger" onClick={() => void deleteAutomation(task)}>删除</button></div></article>)}</div>
      <p className="page-footnote">监控任务使用文件系统事件；定时和监控都只运行自己保存的工作流。</p>
    </section>;
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
    if (activeMenu.parent === 'workflow') return '音乐工作流';
    if (activeMenu.parent === 'manual') return '手动操作';
    if (activeMenu.parent === 'records') return '任务记录';
    if (activeMenu.parent === 'automation') return '自动化';
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
          <SidebarItem id="workflow" label="音乐工作流" icon={Workflow} />
          <SidebarItem id="manual" label="手动操作" icon={SlidersHorizontal} />
          <SidebarItem id="records" label="任务记录" icon={ClipboardList} />
          <SidebarItem id="automation" label="自动化" icon={Bot} />
          <SidebarItem id="settings" label="设置" icon={Settings} />
        </nav>
        <div className="sidebar-safety">
          <ShieldCheck size={18} />
          <div><strong>本地优先</strong><span>所有操作仅在本地进行</span></div>
        </div>
        <div className="sidebar-storage"><span>待审核重复项</span><strong>{totalGroups > 0 ? `${totalGroups} 组` : '尚未扫描'}</strong><button onClick={() => navigate('manual')}><RefreshCw size={14} />浏览并处理</button></div>
        <button className="language-switch" onClick={toggleLanguage}><Globe size={16} />{i18n.language === 'en' ? 'English' : '简体中文'}<ChevronRight size={15} /></button>
      </aside>

      <div className="library-main">
        <header className="library-header">
          <button className="mobile-menu-button" onClick={() => setMobileNavOpen(open => !open)} aria-label="打开导航"><Menu size={20} /></button>
          <div className="mobile-brand">{t('app.title')}<span>· {activeTabLabel()}</span></div>
          <div className="header-actions">
            <span className={`header-status ${wsConnected ? 'is-online' : ''}`}><span />{wsConnected ? '本地音乐库 · 已连接' : '本地服务 · 正在连接'}</span>
            <span className="header-divider" />
            <time className="header-date">{new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}</time>
            <button className="header-scan" onClick={() => navigate('workflow')}><Workflow size={18} />开始工作流</button>
            <button className="icon-button" aria-label="通知"><Bell size={19} /></button>
          </div>
        </header>
        {mobileNavOpen && <nav className="mobile-navigation"><SidebarItem id="home" label="概览" icon={Activity} /><SidebarItem id="workflow" label="音乐工作流" icon={Workflow} /><SidebarItem id="manual" label="手动操作" icon={SlidersHorizontal} /><SidebarItem id="records" label="任务记录" icon={ClipboardList} /><SidebarItem id="automation" label="自动化" icon={Bot} /><SidebarItem id="settings" label="设置" icon={Settings} /></nav>}
        <main className="library-content custom-scrollbar">
          <div className="content-width">
            {activeMenu.parent === 'home' && <Dashboard activity={activityLog} connected={wsConnected} />}
            {activeMenu.parent === 'workflow' && renderWorkflow()}
            {activeMenu.parent === 'manual' && <ManualOperations onRun={runManualAction} initialPath={getConfig('source_path')} />}
            {activeMenu.parent === 'records' && renderTaskRecords()}
            {activeMenu.parent === 'automation' && renderAutomation()}
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

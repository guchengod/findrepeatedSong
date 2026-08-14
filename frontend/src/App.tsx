import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Activity, Trash2,
  Loader2, FolderTree,
  Settings, Calendar, Sparkles,
  ChevronLeft, ChevronRight,
  Menu, Globe,
  Check,
  FileMusic, Search, HardDrive,
  Clock, Layers, Info,
  Sun, Moon, Wifi, WifiOff
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './i18n';
import { cn } from './lib/utils';
import { Dashboard } from './components/Dashboard';
import { SettingsDrawer } from './components/SettingsDrawer';
import { CronBuilder } from './components/CronBuilder';
import { SchedulerHistory } from './components/SchedulerHistory';
import { PathBrowser } from './components/PathBrowser';
import './theme/cyberpunk.css';

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

type MenuItem = 'home' | 'deduper' | 'organizer' | 'completer' | 'scheduler';
type ActiveMenu = { parent: MenuItem, child?: string };

function App() {
  const { t, i18n } = useTranslation();
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>({ parent: 'home' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [schedules, setSchedules] = useState<ScheduleTask[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [wsConnected, setWsConnected] = useState(false);

  // Progress States
  const [scanProgress, setScanProgress] = useState({ isRunning: false, scanned: 0, message: '' });
  const [analyzeProgress, setAnalyzeProgress] = useState({ isRunning: false, percent: 0, message: '' });
  const [pipelineProgress, setPipelineProgress] = useState({ isRunning: false, stage: '', elapsed: 0 });
  const [orgStatus, setOrgStatus] = useState({ isRunning: false, processed: 0, total: 0, status: '' });
  const [completeStatus, setCompleteStatus] = useState({ isRunning: false, processed: 0, total: 0, status: '' });
  const [completeLogs, setCompleteLogs] = useState<string[]>([]);
  const [autoProgress, setAutoProgress] = useState({ isRunning: false, percent: 0, message: '' });

  const [duplicateGroups, setDuplicateGroups] = useState<SongFile[][]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [similarity, setSimilarity] = useState(0.8);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>(['source_path']);
  const [organizeMode, setOrganizeMode] = useState<'move' | 'copy'>('move');

  useEffect(() => {
    loadConfigs();
    loadSchedules();
    loadGroups();

    // Theme initialization
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const finalTheme = savedTheme || systemTheme;
    setTheme(finalTheme);
    applyTheme(finalTheme);
  }, []);

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
    const host = window.location.hostname === 'localhost' ? 'localhost:38491' : window.location.host;
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

          switch (topic) {
            case 'pipeline':
              setPipelineProgress(data);
              if (!data.isRunning) loadGroups();
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
            case 'auto_delete':
              setAutoProgress(data);
              if (!data.isRunning) loadGroups();
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
  };

  // --- Sub-Views ---

  const renderDeduper = () => {
    const startCombinedSearch = async () => {
      const paths = selectedPaths.map(p => getConfig(p)).filter(p => p !== '');
      if (paths.length === 0) return alert('Please select a path');
      await axios.post(`${API_BASE}/full-pipeline`, { paths, similarity });
    };

    const startAutoDelete = async () => {
      await axios.post(`${API_BASE}/auto-delete`, { strategies: selectedStrategies });
    };

    const deleteGroup = async (groupId: string, keepId: number) => {
      await axios.post(`${API_BASE}/delete`, { groupId, keepId });
      loadGroups();
    };

    const deleteFile = async (id: number) => {
      if (!confirm('Confirm delete?')) return;
      await axios.post(`${API_BASE}/delete-file`, { id });
      loadGroups();
    };

    const totalPages = Math.ceil(totalGroups / pageSize);

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('deduper.title')}</h1>
            <p className="text-muted-foreground">{t('deduper.subtitle')}</p>
          </div>
          <div className="flex gap-2">
             <Button onClick={startCombinedSearch} disabled={pipelineProgress.isRunning}>
                {pipelineProgress.isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4"/>}
                {t('deduper.findDuplicates')}
             </Button>
             <Button variant="destructive" onClick={startAutoDelete} disabled={autoProgress.isRunning || duplicateGroups.length === 0}>
                {autoProgress.isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Trash2 className="mr-2 h-4 w-4"/>}
                {t('deduper.autoDelete')}
             </Button>
             <Button variant="outline" size="icon" onClick={loadGroups}>
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

        {totalGroups > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {(page-1)*pageSize + 1}-{Math.min(page*pageSize, totalGroups)} of {totalGroups} {t('deduper.group')}s
              </div>
              <div className="flex items-center gap-2">
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
              {duplicateGroups.map((group, idx) => (
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
                          <Button size="sm" variant="outline" onClick={() => deleteGroup(file.groupId, file.id)}>
                            {t('deduper.keep')}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteFile(file.id)}>
                            {t('deduper.delete')}
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
                    onChange={(path) => { axios.post(`${API_BASE}/config`, { key: selectedPaths[0], value: path }); }}
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
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all group",
          isActive && !indent ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          indent && !isActive && "pl-10 text-muted-foreground/70 hover:pl-12"
        )}
      >
        <Icon size={18} className={cn("transition-colors", isActive && !indent ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
        <span>{label}</span>
        {isActive && !indent && <ChevronRight className="ml-auto h-4 w-4" />}
      </button>
    );
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="text-[10px] font-bold text-muted-foreground uppercase px-3 mb-2 tracking-widest">
      {children}
    </div>
  );

  const activeTabLabel = () => {
    if (activeMenu.parent === 'home') return t('app.home');
    return t(`app.${activeMenu.parent}`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card/50 backdrop-blur-xl">
        <div className="p-6 border-b flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg text-primary-foreground shadow-lg shadow-primary/20">
            <Activity size={20} />
          </div>
          <span className="font-black text-lg tracking-tighter uppercase italic">{t('app.title')}</span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <SectionLabel>{t('app.mainMenu')}</SectionLabel>
          <SidebarItem id="home" label={t('app.home')} icon={Activity} />
          <SidebarItem id="deduper" label={t('app.deduper')} icon={Trash2} />
          <SidebarItem id="organizer" label={t('app.organizer')} icon={FolderTree} />
          <SidebarItem id="completer" label={t('app.completer')} icon={Sparkles} />
          <SidebarItem id="scheduler" label={t('app.scheduler')} icon={Calendar} />
        </nav>

        <div className="p-4 border-t space-y-4">
           <Button variant="outline" className="w-full justify-between" onClick={toggleLanguage}>
              <div className="flex items-center gap-2">
                <Globe size={14} />
                <span className="text-xs">{i18n.language === 'en' ? 'English' : '简体中文'}</span>
              </div>
              <ChevronRight size={12} className="text-muted-foreground" />
           </Button>

           <div className="flex items-center gap-3 px-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-primary/50 flex items-center justify-center text-[10px] font-black">ADMIN</div>
              <div className="flex flex-col">
                 <span className="text-xs font-bold">Local Host</span>
                 <span className="text-[10px] text-muted-foreground">v1.0.0-PRO</span>
              </div>
           </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b flex items-center justify-between px-6 bg-card/50 backdrop-blur-xl shrink-0">
           <div className="flex items-center gap-4">
              <div className="md:hidden p-2 hover:bg-accent rounded-md">
                 <Menu size={20} />
              </div>
              <div className="h-4 w-px bg-border hidden md:block mx-2" />
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                 <span>{t('app.title')}</span>
                 <ChevronRight size={12} />
                 <span className="text-foreground font-bold">{activeTabLabel()}</span>
              </div>
           </div>

           <div className="flex items-center gap-2">
              {/* WS Status */}
              <div className="flex items-center gap-1.5">
                {wsConnected ? (
                  <Wifi size={12} className="text-green-500" />
                ) : (
                  <WifiOff size={12} className="text-destructive" />
                )}
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: wsConnected ? '#39ff14' : '#ff2d6a' }}>
                  {wsConnected ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>

              <div className="h-4 w-px bg-border mx-2" />

              <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
                 {theme === 'dark' ? <Sun size={20} className="text-yellow-500" /> : <Moon size={20} className="text-muted-foreground" />}
              </Button>

              <div className="h-4 w-px bg-border mx-2" />

              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setSettingsOpen(true)}>
                 <Settings size={20} className="text-muted-foreground" />
              </Button>
           </div>
        </header>

        {/* Scrollable Main Section */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-muted/20 custom-scrollbar">
           <div className="max-w-7xl mx-auto animate-in fade-in duration-700 slide-in-from-bottom-2">
              {activeMenu.parent === 'home' && <Dashboard onOpenSettings={() => setSettingsOpen(true)} />}
              {activeMenu.parent === 'deduper' && renderDeduper()}
              {activeMenu.parent === 'organizer' && renderOrganizer()}
              {activeMenu.parent === 'completer' && !activeMenu.child && renderCompleter()}
              {activeMenu.parent === 'scheduler' && renderScheduler()}
           </div>
        </main>
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

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

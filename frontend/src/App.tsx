import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Activity, Trash2, 
  Loader2, FolderTree, 
  Settings, Calendar, Sparkles
} from 'lucide-react';

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

interface ScheduleTask {
  id: number;
  name: string;
  cron: string;
  isActive: boolean;
  lastRun: string;
}

const API_BASE = '/api';

function App() {
  const [activeMenu, setActiveMenu] = useState<'deduper' | 'organizer' | 'completer' | 'scheduler' | 'settings'>('deduper');
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [schedules, setSchedules] = useState<ScheduleTask[]>([]);
  
  // Progress States
  const [scanProgress, setScanProgress] = useState({ isRunning: false, scanned: 0, message: '' });
  const [analyzeProgress, setAnalyzeProgress] = useState({ isRunning: false, percent: 0, message: '' });
  const [pipelineProgress, setPipelineProgress] = useState({ isRunning: false, stage: '', elapsed: 0 });
  const [orgStatus, setOrgStatus] = useState({ isRunning: false, processed: 0, total: 0, status: '' });
  const [completeStatus, setCompleteStatus] = useState({ isRunning: false, processed: 0, total: 0, status: '' });
  const [autoProgress, setAutoProgress] = useState({ isRunning: false, percent: 0, message: '' });

  const [duplicateGroups, setDuplicateGroups] = useState<SongFile[][]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  
  const [similarity, setSimilarity] = useState(0.8);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<string[]>(['source_path']);

  // View specific states (Lifted to top level to follow Hook rules)
  const [organizeMode, setOrganizeMode] = useState<'move' | 'copy'>('move');

  useEffect(() => {
    loadConfigs();
    loadSchedules();
    loadGroups();
  }, []);

  useEffect(() => {
    if (configs.length > 0 && selectedStrategies.length === 0) {
      const def = getConfig('default_delete_strategy');
      if (def) setSelectedStrategies(def.split(',').map(s => s.trim()));
    }
  }, [configs]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (pipelineProgress.isRunning) {
          const res = await axios.get(`${API_BASE}/pipeline/progress`);
          setPipelineProgress(res.data);
          if (!res.data.isRunning) {
             loadGroups();
          }
        }
        
        const pipeRes = await axios.get(`${API_BASE}/pipeline/progress`);
        if (pipeRes.data.isRunning) {
            if (pipeRes.data.stage === 'scan') {
                const s = await axios.get(`${API_BASE}/scan/progress`);
                setScanProgress(s.data);
            } else if (pipeRes.data.stage === 'analyze') {
                const a = await axios.get(`${API_BASE}/analyze/progress`);
                setAnalyzeProgress(a.data);
            }
        } else {
            setScanProgress(p => ({...p, isRunning: false}));
            setAnalyzeProgress(p => ({...p, isRunning: false}));
        }

        if (orgStatus.isRunning) {
          const res = await axios.get(`${API_BASE}/organize/status`);
          setOrgStatus(res.data);
        }
        if (completeStatus.isRunning) {
          const res = await axios.get(`${API_BASE}/complete/status`);
          setCompleteStatus(res.data);
        }
        if (autoProgress.isRunning) {
          const res = await axios.get(`${API_BASE}/auto-delete/progress`);
          setAutoProgress(res.data);
          if (!res.data.isRunning) loadGroups();
        }
      } catch (e) { console.error(e); }
    }, 1000);
    return () => clearInterval(interval);
  }, [pipelineProgress, orgStatus, completeStatus, autoProgress]);

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

  const updateConfig = async (key: string, value: string) => {
    await axios.post(`${API_BASE}/config`, { key, value });
    loadConfigs();
  };

  const updateSchedule = async (task: ScheduleTask) => {
    await axios.post(`${API_BASE}/schedules`, task);
    loadSchedules();
  };

  const getConfig = (key: string) => configs.find(c => c.key === key)?.value || '';

  const renderSidebar = () => (
    <div className="w-64 bg-gray-950 border-r border-gray-800 flex flex-col p-4 gap-2">
      <div className="flex items-center gap-3 px-4 py-6 mb-4">
        <Activity className="text-blue-500" />
        <span className="font-black text-lg tracking-tighter">MUSIC ENGINE</span>
      </div>
      
      {[
        { id: 'deduper', label: '去重 (Deduper)', icon: Trash2 },
        { id: 'organizer', label: '整理 (Organizer)', icon: FolderTree },
        { id: 'completer', label: '补全 (Completer)', icon: Sparkles },
        { id: 'scheduler', label: '定时 (Scheduler)', icon: Calendar },
        { id: 'settings', label: '设置 (Settings)', icon: Settings },
      ].map(item => (
        <button
          key={item.id}
          onClick={() => setActiveMenu(item.id as any)}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
            activeMenu === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-900'
          }`}
        >
          <item.icon size={18} />
          {item.label}
        </button>
      ))}
    </div>
  );

  const renderDeduper = () => {
    const startCombinedSearch = async () => {
      const paths = selectedPaths.map(p => getConfig(p)).filter(p => p !== '');
      if (paths.length === 0) return alert('请选择一个有效路径');
      await axios.post(`${API_BASE}/full-pipeline`, { paths, similarity });
      setPipelineProgress({ isRunning: true, stage: 'scan', elapsed: 0 });
    };

    const startAutoDelete = async () => {
      await axios.post(`${API_BASE}/auto-delete`, { strategies: selectedStrategies });
      setAutoProgress({ isRunning: true, percent: 0, message: 'Deleting...' });
    };

    const toggleStrategy = (s: string) => {
      setSelectedStrategies(prev => 
        prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
      );
    };

    const selectPath = (p: string) => {
      setSelectedPaths([p]);
    };

    const deleteGroup = async (groupId: string, keepId: number) => {
      await axios.post(`${API_BASE}/delete`, { groupId, keepId });
      loadGroups();
    };

    const deleteFile = async (id: number) => {
      if (!confirm('确认删除此文件？')) return;
      await axios.post(`${API_BASE}/delete-file`, { id });
      loadGroups();
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
      e.dataTransfer.setData('index', index.toString());
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
      const sourceIndex = parseInt(e.dataTransfer.getData('index'));
      if (sourceIndex === targetIndex) return;
      const newS = [...selectedStrategies];
      const [removed] = newS.splice(sourceIndex, 1);
      newS.splice(targetIndex, 0, removed);
      setSelectedStrategies(newS);
    };

    const totalPages = Math.ceil(totalGroups / pageSize);

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <header className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-black tracking-tighter uppercase italic">去重工具</h2>
            <p className="text-gray-500 text-xs font-bold uppercase mt-1">Scan and remove duplicate tracks based on similarity</p>
          </div>
          <div className="flex gap-4">
             <button onClick={startCombinedSearch} disabled={pipelineProgress.isRunning} className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-bold text-xs uppercase flex items-center gap-2">
                {pipelineProgress.isRunning ? <Loader2 className="animate-spin" size={14}/> : <Activity size={14}/>} 查找重复歌曲
             </button>
             <button onClick={startAutoDelete} disabled={autoProgress.isRunning || duplicateGroups.length === 0} className="bg-red-600 hover:bg-red-500 px-6 py-2 rounded-lg font-bold text-xs uppercase flex items-center gap-2">
                {autoProgress.isRunning ? <Loader2 className="animate-spin" size={14}/> : <Trash2 size={14}/>} 自动删除
             </button>
             <button onClick={loadGroups} className="bg-gray-800 hover:bg-gray-700 px-6 py-2 rounded-lg font-bold text-xs uppercase flex items-center gap-2">
                刷新列表
             </button>
          </div>
        </header>

        <div className="bg-gray-900/30 p-6 rounded-2xl border border-gray-800 grid grid-cols-3 gap-8 text-left">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-gray-500 uppercase">Scan Path (Single Selection)</label>
            <div className="flex flex-col gap-2">
              {['source_path', 'target_path'].map(p => (
                <button
                  key={p}
                  onClick={() => selectPath(p)}
                  className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all border flex justify-between items-center ${
                    selectedPaths.includes(p) 
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-400' 
                    : 'bg-black border-gray-800 text-gray-600'
                  }`}
                >
                  <span>{p.replace('_', ' ')}</span>
                  <div className={`w-3 h-3 rounded-full border-2 border-gray-700 flex items-center justify-center`}>
                    {selectedPaths.includes(p) && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-gray-500 uppercase flex justify-between">
              <span>Similarity Threshold</span>
              <span className="text-blue-400">{Math.round(similarity * 100)}%</span>
            </label>
            <div className="h-full flex items-center">
              <input 
                type="range" min="0.5" max="1.0" step="0.05" 
                value={similarity} 
                onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-gray-500 uppercase">Strategies (Drag to Sort Priority)</label>
            <div className="flex flex-col gap-2">
              {['quality', 'size_desc', 'size_asc'].map(s => {
                const isActive = selectedStrategies.includes(s);
                const orderIndex = selectedStrategies.indexOf(s);
                return (
                  <div
                    key={s}
                    draggable={isActive}
                    onDragStart={(e) => handleDragStart(e, orderIndex)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, orderIndex)}
                    onClick={() => !isActive && toggleStrategy(s)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase transition-all border flex justify-between items-center cursor-pointer ${
                      isActive 
                      ? 'bg-purple-600/10 border-purple-500/50 text-purple-400' 
                      : 'bg-black border-gray-800 text-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isActive && <span className="w-4 h-4 flex items-center justify-center bg-purple-500 text-black rounded text-[8px]">{orderIndex + 1}</span>}
                      <span>{s.replace('_', ' ')}</span>
                    </div>
                    {isActive && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleStrategy(s); }}
                        className="text-gray-500 hover:text-red-500"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {(pipelineProgress.isRunning || autoProgress.isRunning) && (
          <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 grid grid-cols-2 gap-8 text-left">
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-black uppercase text-blue-400">
                <span>
                  {pipelineProgress.stage === 'scan' ? `Scanning: ${scanProgress.scanned} files` : 
                   pipelineProgress.stage === 'analyze' ? `Analyzing: ${analyzeProgress.percent}%` : 
                   `Pipeline Stage: ${pipelineProgress.stage}`}
                </span>
                <span>{pipelineProgress.isRunning ? 'Running...' : 'Done'}</span>
              </div>
              <div className="h-1.5 bg-black rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-blue-500 transition-all ${pipelineProgress.isRunning ? 'animate-pulse' : ''}`} 
                  style={{width: pipelineProgress.stage === 'analyze' ? `${analyzeProgress.percent}%` : (pipelineProgress.isRunning ? '100%' : '0%')}}
                ></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-black uppercase text-red-400">
                <span>Auto Deletion</span>
                <span>{autoProgress.percent}%</span>
              </div>
              <div className="h-1.5 bg-black rounded-full overflow-hidden">
                <div className="h-full bg-red-500 transition-all" style={{width: `${autoProgress.percent}%`}}></div>
              </div>
            </div>
          </div>
        )}

        {totalGroups > pageSize && (
          <div className="flex justify-between items-center bg-gray-900/50 p-4 rounded-xl border border-gray-800">
            <span className="text-xs text-gray-500 font-bold uppercase">Showing {(page-1)*pageSize + 1} - {Math.min(page*pageSize, totalGroups)} of {totalGroups} groups</span>
            <div className="flex gap-2">
              <button 
                disabled={page === 1} 
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg text-[10px] font-black uppercase"
              >
                Previous
              </button>
              <div className="flex items-center px-4 text-xs font-mono text-blue-500">
                {page} / {totalPages}
              </div>
              <button 
                disabled={page >= totalPages} 
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg text-[10px] font-black uppercase"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-4">
          {duplicateGroups.map((group, idx) => (
            <div key={idx} className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden text-left">
              <div className="bg-gray-800/50 px-4 py-2 flex justify-between items-center border-b border-gray-800">
                <span className="text-[10px] font-black uppercase text-gray-500">Group {(page-1)*pageSize + idx + 1}</span>
                <span className="text-[10px] font-black text-blue-500 uppercase">{group.length} Files</span>
              </div>
              <div className="divide-y divide-gray-800">
                {group.map(file => (
                  <div key={file.id} className="p-4 flex justify-between items-center hover:bg-gray-800/20 transition-all">
                      <div className="flex-1 overflow-hidden mr-4">
                        <p className="text-sm font-bold truncate text-gray-200">{file.filename}</p>
                        <p className="text-[10px] text-gray-600 truncate mt-0.5 italic">{file.path}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => deleteGroup(file.groupId, file.id)} className="bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-all">Keep</button>
                        <button onClick={() => deleteFile(file.id)} className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-all">Delete</button>
                      </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderOrganizer = () => {
    const startOrg = async () => {
      await axios.post(`${API_BASE}/organize`, { path: getConfig('target_path'), mode: organizeMode });
      setOrgStatus({ isRunning: true, processed: 0, total: 0, status: 'Starting...' });
    };

    return (
      <div className="max-w-2xl space-y-8 animate-in slide-in-from-bottom-4 duration-500 text-left">
        <header>
          <h2 className="text-3xl font-black tracking-tighter uppercase italic">歌曲整理</h2>
          <p className="text-gray-500 text-xs font-bold uppercase mt-1">Structure: Artist / Album / SongName. Mode: Move or Copy.</p>
        </header>

        <div className="bg-gray-900/50 p-8 rounded-3xl border border-gray-800 space-y-6 text-left">
          <div className="space-y-4">
            <div className="flex gap-2">
              <button 
                onClick={() => setOrganizeMode('move')}
                className={`flex-1 py-4 rounded-xl font-black text-xs uppercase border transition-all ${organizeMode === 'move' ? 'bg-green-600/20 border-green-500 text-green-400' : 'bg-black border-gray-800 text-gray-500'}`}
              >
                移动 (Move)
              </button>
              <button 
                onClick={() => setOrganizeMode('copy')}
                className={`flex-1 py-4 rounded-xl font-black text-xs uppercase border transition-all ${organizeMode === 'copy' ? 'bg-blue-600/20 border-blue-500 text-blue-400' : 'bg-black border-gray-800 text-gray-500'}`}
              >
                复制 (Copy)
              </button>
            </div>

            <div className="p-4 bg-black/50 rounded-xl border border-gray-800 text-xs text-gray-400 leading-relaxed">
              <p>源路径: <span className="text-gray-300 font-mono">{getConfig('source_path')}</span></p>
              <p className="mt-1">目标路径: <span className="text-gray-300 font-mono">{getConfig('target_path')}</span></p>
            </div>
          </div>

          <button
            onClick={startOrg}
            disabled={orgStatus.isRunning || !getConfig('target_path')}
            className="w-full bg-green-600 hover:bg-green-500 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95"
          >
            {orgStatus.isRunning ? <Loader2 className="animate-spin" size={20}/> : <FolderTree size={20}/>}
            开始整理
          </button>

          {orgStatus.isRunning && (
            <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-black uppercase text-green-400">
                <span>{orgStatus.status}</span>
                <span>{orgStatus.total > 0 ? Math.round((orgStatus.processed / orgStatus.total) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-black rounded-full overflow-hidden">
                <div className="h-full bg-green-500 transition-all" style={{width: `${orgStatus.total > 0 ? (orgStatus.processed / orgStatus.total) * 100 : 0}%`}}></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderCompleter = () => {
    const startComplete = async () => {
      await axios.post(`${API_BASE}/complete`);
      setCompleteStatus({ isRunning: true, processed: 0, total: 0, status: 'Contacting MusicBrainz...' });
    };

    return (
      <div className="max-w-2xl space-y-8 text-left">
        <header>
          <h2 className="text-3xl font-black tracking-tighter uppercase italic text-purple-400">元数据补全</h2>
          <p className="text-gray-500 text-xs font-bold uppercase mt-1">Complete missing Artist, Album and Cover Art via MusicBrainz</p>
        </header>

        <div className="bg-gray-900/50 p-8 rounded-3xl border border-gray-800 space-y-8 text-left">
          <div className="flex items-start gap-4 p-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl">
            <Sparkles className="text-purple-500 shrink-0" size={24} />
            <div className="text-xs text-gray-400 space-y-2">
              <p className="font-bold text-purple-400 uppercase">MusicBrainz API Integration</p>
              <p>我们将尝试基于文件名和现有标签搜索元数据。为了遵守 MusicBrainz 的使用策略，处理速度限制在 1条/秒。</p>
            </div>
          </div>

          <button
            onClick={startComplete}
            disabled={completeStatus.isRunning}
            className="w-full bg-purple-600 hover:bg-purple-500 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-purple-900/20"
          >
            {completeStatus.isRunning ? <Loader2 className="animate-spin" size={20}/> : <Sparkles size={20}/>}
            自动补全
          </button>

          {completeStatus.isRunning && (
             <div className="space-y-3">
              <div className="flex justify-between text-[10px] font-black uppercase text-purple-400">
                <span>{completeStatus.status}</span>
                <span>{completeStatus.total > 0 ? Math.round((completeStatus.processed / completeStatus.total) * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-black rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 transition-all" style={{width: `${completeStatus.total > 0 ? (completeStatus.processed / completeStatus.total) * 100 : 0}%`}}></div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderScheduler = () => {
    return (
      <div className="max-w-4xl space-y-8 text-left">
        <header>
          <h2 className="text-3xl font-black tracking-tighter uppercase italic">任务调度</h2>
          <p className="text-gray-500 text-xs font-bold uppercase mt-1">Automate organization and metadata completion</p>
        </header>

        <div className="grid md:grid-cols-2 gap-6 text-left">
          {schedules.map(task => (
            <div key={task.id} className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-black uppercase tracking-widest text-sm">{task.name}</h3>
                <button 
                  onClick={() => updateSchedule({...task, isActive: !task.isActive})}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all ${task.isActive ? 'bg-green-600/20 text-green-400 border border-green-500' : 'bg-gray-800 text-gray-500 border border-gray-700'}`}
                >
                  {task.isActive ? 'Active' : 'Disabled'}
                </button>
              </div>
              
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-gray-600 uppercase">Cron Expression</label>
                 <input 
                  type="text" 
                  value={task.cron} 
                  onChange={(e) => {
                    const newS = schedules.map(s => s.id === task.id ? {...s, cron: e.target.value} : s);
                    setSchedules(newS);
                  }}
                  onBlur={() => updateSchedule(task)}
                 />
              </div>

              <div className="pt-2 border-t border-gray-800 flex justify-between items-center">
                 <span className="text-[10px] text-gray-500 font-bold uppercase">Last Run</span>
                 <span className="text-[10px] text-gray-300 font-mono">{task.lastRun ? new Date(task.lastRun).toLocaleString() : 'Never'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSettings = () => {
    return (
      <div className="max-w-2xl space-y-8 text-left">
        <header>
          <h2 className="text-3xl font-black tracking-tighter uppercase italic">全局设置</h2>
          <p className="text-gray-500 text-xs font-bold uppercase mt-1">Manage global paths and API keys</p>
        </header>

        <div className="bg-gray-900/50 p-8 rounded-3xl border border-gray-800 space-y-8 text-left">
          {configs.map(conf => (
            <div key={conf.key} className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase ml-1">{conf.desc || conf.key}</label>
              <input 
                type="text" 
                value={conf.value} 
                onChange={(e) => {
                  const newC = configs.map(c => c.key === conf.key ? {...c, value: e.target.value} : c);
                  setConfigs(newC);
                }}
                onBlur={() => updateConfig(conf.key, conf.value)}
                placeholder={`Enter ${conf.key}...`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 flex">
      {renderSidebar()}
      
      <main className="flex-1 p-8 overflow-y-auto">
        {activeMenu === 'deduper' && renderDeduper()}
        {activeMenu === 'organizer' && renderOrganizer()}
        {activeMenu === 'completer' && renderCompleter()}
        {activeMenu === 'scheduler' && renderScheduler()}
        {activeMenu === 'settings' && renderSettings()}
      </main>

      <style>{`
        input[type="text"], input[type="number"] {
          background: #0a0a0a;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 14px;
          color: #eee;
          width: 100%;
          outline: none;
        }
        input[type="text"]:focus { border-color: #3b82f6; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

export default App;

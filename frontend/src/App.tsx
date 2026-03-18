import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Activity, Trash2, CheckCircle, ChevronRight, Zap, Loader2, Clock, ArrowUp, ArrowDown, X } from 'lucide-react';

interface SongFile {
  id: number;
  path: string;
  filename: string;
  normalizedName: string;
  size: number;
  ext: string;
  groupId: string;
}

const API_BASE = '/api';

const AVAILABLE_STRATEGIES = [
  { id: 'quality', name: 'Lossless First', description: 'Prefer FLAC/WAV/APE' },
  { id: 'size_desc', name: 'Largest Size', description: 'Prefer bigger files' },
  { id: 'size_asc', name: 'Smallest Size', description: 'Prefer smaller files' },
];

function App() {
  const [activeTab, setActiveTab] = useState<'manual' | 'auto'>('manual');
  const [activeStep, setActiveStep] = useState(1);
  const [scanPath, setScanPath] = useState('');
  const [similarity, setSimilarity] = useState(0.8);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(['quality', 'size_desc']);
  
  const [scanProgress, setScanProgress] = useState({ isRunning: false, scanned: 0, message: '' });
  const [analyzeProgress, setAnalyzeProgress] = useState({ isRunning: false, percent: 0, message: '' });
  const [autoProgress, setAutoProgress] = useState({ isRunning: false, percent: 0, message: '' });
  const [pipelineProgress, setPipelineProgress] = useState({ isRunning: false, stage: '', elapsed: 0 });
  const [duplicateGroups, setDuplicateGroups] = useState<SongFile[][]>([]);

  const isStep1Done = !scanProgress.isRunning && scanProgress.scanned > 0;
  const isStep2Done = !analyzeProgress.isRunning && analyzeProgress.percent === 100;

  useEffect(() => {
    let interval: any;
    if (scanProgress.isRunning || analyzeProgress.isRunning || autoProgress.isRunning || pipelineProgress.isRunning) {
      interval = setInterval(async () => {
        try {
          if (scanProgress.isRunning) {
            const res = await axios.get(`${API_BASE}/scan/progress`);
            setScanProgress(res.data);
          }
          if (analyzeProgress.isRunning) {
            const res = await axios.get(`${API_BASE}/analyze/progress`);
            setAnalyzeProgress(res.data);
          }
          if (autoProgress.isRunning) {
            const res = await axios.get(`${API_BASE}/auto-delete/progress`);
            setAutoProgress(res.data);
            if (!res.data.isRunning && res.data.percent === 100) {
              loadGroups();
            }
          }
          if (pipelineProgress.isRunning || activeTab === 'auto') {
            const res = await axios.get(`${API_BASE}/pipeline/progress`);
            setPipelineProgress(res.data);
          }
        } catch (e) {
          console.error('Polling error', e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [scanProgress.isRunning, analyzeProgress.isRunning, autoProgress.isRunning, pipelineProgress.isRunning, activeTab]);

  const startScan = async () => {
    try {
      await axios.post(`${API_BASE}/scan`, { path: scanPath });
      setScanProgress({ isRunning: true, scanned: 0, message: 'Starting...' });
    } catch (e) {
      alert('Failed to start scan');
    }
  };

  const startAnalyze = async () => {
    try {
      await axios.post(`${API_BASE}/analyze`, { similarity });
      setAnalyzeProgress({ isRunning: true, percent: 0, message: 'Starting...' });
    } catch (e) {
      alert('Failed to start analysis');
    }
  };

  const loadGroups = async () => {
    try {
      const res = await axios.get(`${API_BASE}/groups`);
      setDuplicateGroups(res.data.groups || []);
      if (activeTab === 'manual') setActiveStep(3);
    } catch (e) {
      alert('Failed to load results');
    }
  };

  const startAutoDelete = async () => {
    try {
      await axios.post(`${API_BASE}/auto-delete`, { strategies: selectedStrategies });
      setAutoProgress({ isRunning: true, percent: 0, message: 'Starting...' });
    } catch (e) {
      alert('Failed to start auto delete');
    }
  };

  const startFullPipeline = async () => {
    try {
      await axios.post(`${API_BASE}/full-pipeline`, { path: scanPath, similarity, strategies: selectedStrategies });
      setPipelineProgress({ isRunning: true, stage: 'scan', elapsed: 0 });
    } catch (e) {
      alert('Failed to start full pipeline');
    }
  };

  const deleteGroup = async (groupId: string, keepId: number) => {
    try {
      await axios.post(`${API_BASE}/delete`, { groupId, keepId });
      setDuplicateGroups(prev => prev.filter(g => g[0].groupId !== groupId));
    } catch (e) {
      alert('Failed to delete');
    }
  };

  const moveStrategy = (index: number, direction: 'up' | 'down') => {
    const newStrategies = [...selectedStrategies];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex >= 0 && targetIndex < newStrategies.length) {
      [newStrategies[index], newStrategies[targetIndex]] = [newStrategies[targetIndex], newStrategies[index]];
      setSelectedStrategies(newStrategies);
    }
  };

  const toggleStrategy = (id: string) => {
    if (selectedStrategies.includes(id)) {
      setSelectedStrategies(prev => prev.filter(s => s !== id));
    } else {
      setSelectedStrategies(prev => [...prev, id]);
    }
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const renderStrategyManager = () => (
    <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 space-y-4">
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Deletion Priority (Ordered)</p>
      
      <div className="flex flex-wrap gap-2 mb-4">
        {AVAILABLE_STRATEGIES.map(s => (
          <button
            key={s.id}
            onClick={() => toggleStrategy(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
              selectedStrategies.includes(s.id) 
                ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {selectedStrategies.map((sid, idx) => {
          const strategy = AVAILABLE_STRATEGIES.find(s => s.id === sid);
          return (
            <div key={sid} className="bg-gray-800 p-3 rounded-lg flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <span className="bg-gray-700 text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full text-gray-400">
                  {idx + 1}
                </span>
                <span className="text-sm font-bold text-gray-300">{strategy?.name}</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => moveStrategy(idx, 'up')} disabled={idx === 0} className="p-1 hover:text-blue-400 disabled:text-gray-700">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => moveStrategy(idx, 'down')} disabled={idx === selectedStrategies.length - 1} className="p-1 hover:text-blue-400 disabled:text-gray-700">
                  <ArrowDown size={14} />
                </button>
                <button onClick={() => toggleStrategy(sid)} className="p-1 hover:text-red-400 ml-1">
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {selectedStrategies.length === 0 && (
          <p className="text-xs text-gray-600 italic text-center py-2">No strategies selected. Quality first by default.</p>
        )}
      </div>
    </div>
  );

  const renderStepHeader = (num: number, title: string, isClickable: boolean) => (
    <button
      onClick={() => isClickable && setActiveStep(num)}
      disabled={!isClickable}
      className={`flex items-center gap-2 pb-2 border-b-2 transition-all ${
        activeStep === num ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-500 hover:text-gray-300'
      } ${!isClickable ? 'opacity-30 cursor-not-allowed' : ''}`}
    >
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
        activeStep === num ? 'bg-blue-500 text-white' : 'bg-gray-700'
      }`}>
        {num}
      </span>
      {title}
    </button>
  );

  return (
    <div className="min-h-screen text-gray-100 flex flex-col max-w-4xl mx-auto w-full">
      <header className="py-8 border-b border-gray-800">
        <h1 className="text-3xl font-black flex items-center justify-center gap-3 italic">
          <Activity className="text-blue-500" size={32} />
          MUSIC DEDUPER
        </h1>
        <p className="text-gray-500 mt-2 text-center text-xs font-bold tracking-widest uppercase">High performance de-duplication for audiophiles</p>
      </header>

      <div className="flex justify-center mt-6">
        <div className="bg-gray-900 p-1 rounded-xl border border-gray-800 flex gap-1">
          <button 
            onClick={() => setActiveTab('manual')}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${activeTab === 'manual' ? 'bg-gray-800 text-blue-400 shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Step-by-Step
          </button>
          <button 
            onClick={() => setActiveTab('auto')}
            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${activeTab === 'auto' ? 'bg-gray-800 text-purple-400 shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Zap size={14} /> One-Click Auto
          </button>
        </div>
      </div>

      <main className="flex-1 py-8">
        {activeTab === 'manual' ? (
          <>
            <nav className="flex justify-center gap-8 mb-8">
              {renderStepHeader(1, 'Scan', true)}
              {renderStepHeader(2, 'Analyze', isStep1Done)}
              {renderStepHeader(3, 'Clean', isStep2Done)}
            </nav>

            {activeStep === 1 && (
              <div className="bg-gray-800/30 p-8 rounded-2xl border border-gray-700/50 space-y-6">
                <div className="space-y-2 text-left">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-tighter ml-1">Music Library Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm"
                      placeholder="/mnt/music/library"
                      value={scanPath}
                      onChange={(e) => setScanPath(e.target.value)}
                    />
                    <button
                      onClick={startScan}
                      disabled={scanProgress.isRunning || !scanPath}
                      className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 px-8 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/20 active:scale-95 flex items-center gap-2"
                    >
                      {scanProgress.isRunning ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                      Scan
                    </button>
                  </div>
                </div>
                {scanProgress.isRunning && (
                  <div className="bg-blue-500/10 border border-blue-500/20 p-6 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest">Indexing Files</p>
                      <p className="text-sm font-bold text-gray-400 mt-1">{scanProgress.message}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-4xl font-black text-blue-500 tabular-nums">{scanProgress.scanned}</span>
                    </div>
                  </div>
                )}
                {isStep1Done && (
                  <div className="bg-green-500/10 border border-green-500/20 p-6 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-green-500/20 p-2 rounded-full text-green-500"><CheckCircle size={24} /></div>
                      <p className="text-sm font-bold text-green-400">{scanProgress.scanned} files successfully indexed.</p>
                    </div>
                    <button onClick={() => setActiveStep(2)} className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-tighter flex items-center gap-1 transition-all active:scale-95">
                      Proceed <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeStep === 2 && (
              <div className="bg-gray-800/30 p-8 rounded-2xl border border-gray-700/50 space-y-8 text-left">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-tighter">Similarity threshold</label>
                    <span className="text-2xl font-black text-purple-500">{Math.round(similarity * 100)}%</span>
                  </div>
                  <input
                    type="range" min="0.5" max="1" step="0.05"
                    className="w-full h-2 bg-gray-900 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    value={similarity}
                    onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                  />
                  <div className="flex justify-between text-[10px] text-gray-600 font-black uppercase">
                    <span>Fuzzy</span>
                    <span>Exact</span>
                  </div>
                </div>
                <button
                  onClick={startAnalyze}
                  disabled={analyzeProgress.isRunning}
                  className="w-full bg-purple-600 hover:bg-purple-500 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-purple-900/20 active:scale-95 flex items-center justify-center gap-2"
                >
                   {analyzeProgress.isRunning ? <Loader2 className="animate-spin" size={16} /> : <Activity size={16} />}
                   Analyze Library
                </button>
                {analyzeProgress.isRunning && (
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] font-black uppercase text-purple-400">
                      <span>{analyzeProgress.message}</span>
                      <span>{analyzeProgress.percent}%</span>
                    </div>
                    <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 transition-all duration-300 shadow-[0_0_10px_rgba(168,85,247,0.5)]" style={{ width: `${analyzeProgress.percent}%` }}></div>
                    </div>
                  </div>
                )}
                {isStep2Done && (
                   <div className="bg-green-500/10 border border-green-500/20 p-6 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-green-500/20 p-2 rounded-full text-green-500"><CheckCircle size={24} /></div>
                      <p className="text-sm font-bold text-green-400">Analysis complete. Ready for cleanup.</p>
                    </div>
                    <button onClick={loadGroups} className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded-lg font-black text-[10px] uppercase tracking-tighter flex items-center gap-1 transition-all active:scale-95">
                      Review <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeStep === 3 && (
              <div className="space-y-6">
                <div className="bg-gray-800/30 p-6 rounded-2xl border border-gray-700/50 flex flex-col md:flex-row gap-6 items-start justify-between">
                  <div className="flex-1 w-full md:w-auto">
                    {renderStrategyManager()}
                  </div>
                  <button
                    onClick={startAutoDelete}
                    disabled={autoProgress.isRunning || duplicateGroups.length === 0}
                    className="bg-red-600 hover:bg-red-500 px-10 py-4 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-red-900/20 transition-all active:scale-95 disabled:bg-gray-800 w-full md:w-auto mt-4 md:mt-0"
                  >
                    {autoProgress.isRunning ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                    Auto Cleanup
                  </button>
                </div>

                <div className="grid gap-4 overflow-y-auto max-h-[50vh] pr-2 custom-scrollbar text-left">
                  {duplicateGroups.map((group, idx) => (
                    <div key={idx} className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
                      <div className="bg-gray-800/50 px-4 py-2 flex justify-between items-center border-b border-gray-800">
                        <span className="text-[10px] font-black uppercase text-gray-500">Group {idx + 1}</span>
                        <span className="text-[10px] font-black text-blue-500 uppercase">{group.length} Files</span>
                      </div>
                      <div className="divide-y divide-gray-800">
                        {group.map(file => (
                          <div key={file.id} className="p-4 flex justify-between items-center hover:bg-gray-800/20 transition-all">
                             <div className="flex-1 overflow-hidden mr-4">
                               <p className="text-sm font-bold truncate text-gray-200">{file.filename}</p>
                               <p className="text-[10px] text-gray-600 truncate mt-0.5 italic">{file.path}</p>
                               <div className="flex items-center gap-3 mt-2">
                                  <span className="text-[10px] font-black px-2 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-400 uppercase tracking-tighter">
                                    {file.ext.substring(1)}
                                  </span>
                                  <span className="text-[10px] font-bold text-gray-600 tabular-nums">{formatSize(file.size)}</span>
                               </div>
                             </div>
                             <button 
                              onClick={() => deleteGroup(file.groupId, file.id)}
                              className="bg-gray-800 hover:bg-blue-600 text-[10px] font-black uppercase px-4 py-2 rounded-lg transition-all"
                             >
                              Keep
                             </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="max-w-xl mx-auto space-y-8">
             <div className="bg-gray-800/30 p-10 rounded-3xl border border-gray-700/50 space-y-8 text-left relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none italic font-black text-6xl">AUTO</div>
                
                <h2 className="text-2xl font-black italic tracking-tighter text-purple-400 uppercase">One-Click Pipeline</h2>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Library Path</label>
                    <input
                      type="text"
                      className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 w-full focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-mono text-sm"
                      placeholder="/mnt/music"
                      value={scanPath}
                      onChange={(e) => setScanPath(e.target.value)}
                    />
                  </div>

                  <div className="space-y-4">
                     <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Threshold: {Math.round(similarity * 100)}%</label>
                     <input
                      type="range" min="0.5" max="1" step="0.05"
                      className="w-full h-2 bg-gray-900 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      value={similarity}
                      onChange={(e) => setSimilarity(parseFloat(e.target.value))}
                    />
                  </div>

                  {renderStrategyManager()}
                </div>

                <button
                  onClick={startFullPipeline}
                  disabled={pipelineProgress.isRunning}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl shadow-purple-900/40 transition-all active:scale-95 disabled:opacity-50"
                >
                  {pipelineProgress.isRunning ? (
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="animate-spin" size={20} />
                      Processing Pipeline...
                    </div>
                  ) : "Initialize Automation"}
                </button>

                {pipelineProgress.isRunning && (
                  <div className="bg-gray-900/50 p-6 rounded-2xl border border-gray-800 space-y-6">
                    <div className="flex justify-between items-center">
                       <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${pipelineProgress.stage === 'scan' ? 'bg-blue-500 text-white animate-pulse' : 'bg-gray-800 text-gray-500'}`}>
                            <Search size={16} />
                          </div>
                          <div className={`p-2 rounded-lg ${pipelineProgress.stage === 'analyze' ? 'bg-purple-500 text-white animate-pulse' : 'bg-gray-800 text-gray-500'}`}>
                            <Activity size={16} />
                          </div>
                          <div className={`p-2 rounded-lg ${pipelineProgress.stage === 'delete' ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-800 text-gray-500'}`}>
                            <Trash2 size={16} />
                          </div>
                       </div>
                       <div className="flex items-center gap-2 text-gray-500 text-[10px] font-black uppercase">
                         <Clock size={12} />
                         {Math.round(pipelineProgress.elapsed)}s
                       </div>
                    </div>

                    <div className="space-y-2">
                       <p className="text-xs font-black uppercase text-center tracking-widest text-gray-400">
                         Current Stage: <span className="text-white">{pipelineProgress.stage}ing...</span>
                       </p>
                       <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-600 to-blue-600 transition-all duration-1000" 
                            style={{ 
                              width: pipelineProgress.stage === 'scan' ? '33%' : pipelineProgress.stage === 'analyze' ? '66%' : '100%' 
                            }} 
                          />
                       </div>
                    </div>
                  </div>
                )}

                {pipelineProgress.stage === 'done' && !pipelineProgress.isRunning && (
                   <div className="bg-green-500/10 border border-green-500/20 p-6 rounded-2xl text-center space-y-4">
                      <div className="bg-green-500 p-3 rounded-full inline-flex text-white"><CheckCircle size={32} /></div>
                      <h3 className="font-black uppercase tracking-widest text-green-400">Automation Complete</h3>
                      <p className="text-xs text-gray-500 font-bold">The pipeline has finished successfully. Your library has been optimized.</p>
                      <button onClick={loadGroups} className="text-[10px] font-black text-blue-500 uppercase hover:text-blue-400 underline underline-offset-4">View Cleanup Report</button>
                   </div>
                )}
             </div>
          </div>
        )}
      </main>

      <footer className="py-12 border-t border-gray-800 text-[10px] text-gray-600 font-black uppercase tracking-tighter text-center">
        DEDUPER ENGINE V1.0 • HIGH PERFORMANCE MODE ACTIVE
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 10px; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 4px solid #a855f7;
          box-shadow: 0 0 10px rgba(168,85,247,0.3);
        }
      `}</style>
    </div>
  );
}

export default App;

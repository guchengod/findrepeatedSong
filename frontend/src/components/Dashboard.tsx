import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Activity, HardDrive, Layers,
  Settings, WifiOff,
  Cpu, FileMusic, Trash2, Sparkles
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import '../theme/cyberpunk.css';

const API_BASE = '/api';

interface Stats {
  total_songs: number;
  total_duplicates: number;
  storage_used_gb: number;
  jobs_running: number;
  last_updated: string;
}

interface Mission {
  id: string;
  task: string;
  status: string;
  timestamp?: string;
}

interface ActiveMission {
  task: string;
  stage?: string;
  processed?: number;
  total?: number;
  percent?: number;
  status?: string;
  detail?: string;
}

// Format large numbers with commas
const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return n.toLocaleString();
  return String(n);
};

// Progress Beam Component
const ProgressBeam: React.FC<{
  value: number;
  label: string;
  color?: 'cyan' | 'pink' | 'green';
  status?: string;
}> = ({ value, label, color = 'cyan', status }) => {
  const colorMap = {
    cyan: { bar: 'linear-gradient(90deg, #00f0ff, rgba(0,240,255,0.7))', glow: '0 0 10px #00f0ff, 0 0 20px rgba(0,240,255,0.3)' },
    pink: { bar: 'linear-gradient(90deg, #ff2d6a, rgba(255,45,106,0.7))', glow: '0 0 10px #ff2d6a, 0 0 20px rgba(255,45,106,0.3)' },
    green: { bar: 'linear-gradient(90deg, #39ff14, rgba(57,255,20,0.7))', glow: '0 0 10px #39ff14, 0 0 20px rgba(57,255,20,0.3)' },
  };

  const isComplete = value >= 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="cb-font-mono text-[10px] text-[#4a4a6a] uppercase tracking-widest">{label}</span>
        <span className="cb-font-mono text-[10px] text-[#00f0ff]">{Math.round(value)}% {status && `— ${status}`}</span>
      </div>
      <div style={{
        height: '6px',
        background: 'rgba(0, 240, 255, 0.1)',
        borderRadius: '3px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, value)}%`,
          background: colorMap[isComplete ? 'green' : color].bar,
          borderRadius: '3px',
          transition: 'width 0.3s ease',
          boxShadow: colorMap[isComplete ? 'green' : color].glow,
          position: 'relative',
        }}>
          {!isComplete && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '30px',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6))',
              animation: 'beam-shine 1.5s ease-in-out infinite',
            }} />
          )}
        </div>
      </div>
      <style>{`
        @keyframes beam-shine {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

// Mission Terminal Component
const MissionTerminal: React.FC<{ missions: Mission[] }> = ({ missions }) => {
  const { t } = useTranslation();
  return (
    <div style={{
      background: 'rgba(0, 0, 0, 0.6)',
      border: '1px solid rgba(0, 240, 255, 0.15)',
      borderRadius: '8px',
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px',
      color: '#00f0ff',
      padding: '1rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        top: '0.75rem',
        left: '0.75rem',
        color: '#00f0ff',
        opacity: 0.7,
      }}>
        {'>'}_
      </div>
      <div style={{ paddingLeft: '1.5rem' }}>
        {missions.length === 0 ? (
          <div style={{ color: '#4a4a6a', fontStyle: 'italic' }}>
            {'>'} {t('dashboard.noRecentMissions')}
          </div>
        ) : (
          missions.map((m, i) => (
            <div
              key={i}
              style={{
                marginBottom: '0.25rem',
                color: m.status === 'COMPLETE' ? '#39ff14' : m.status === 'FAILED' ? '#ff2d6a' : '#ffb800',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {'>'} {m.id} {m.status} @ {m.timestamp || '—'}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Dashboard Component
export const Dashboard: React.FC<{
  onOpenSettings: () => void;
}> = ({ onOpenSettings }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
  const [recentMissions, setRecentMissions] = useState<Mission[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  // Fetch stats periodically
  useEffect(() => {
    const loadStats = async () => {
      try {
        const res = await axios.get(`${API_BASE}/stats`);
        setStats(res.data);
      } catch (e) {
        console.error('Failed to load stats', e);
      }
    };
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // WebSocket for real-time mission updates
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

          if (topic === 'pipeline' || topic === 'organize' || topic === 'complete' || topic === 'scan' || topic === 'analyze' || topic === 'auto_delete') {
            if (data.isRunning) {
              const stage = topic === 'pipeline' ? data.stage : topic;
              setActiveMission({ ...data, task: stage });
            } else {
              // Job completed — add to recent missions
              const mission: Mission = {
                id: `${topic.toUpperCase().substring(0, 3)}-${new Date().toTimeString().substring(0, 8).replace(/:/g, '')}`,
                task: topic,
                status: 'COMPLETE',
                timestamp: new Date().toLocaleTimeString(),
              };
              setRecentMissions(prev => [mission, ...prev].slice(0, 10));
              setActiveMission(null);
            }
          }
        } catch (e) {
          console.error('WS parse error', e);
        }
      };
    };

    connect();
    return () => {
      clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  const metricCards = [
    {
      label: t('dashboard.totalSongs'),
      value: stats ? formatNumber(stats.total_songs) : '—',
      icon: <FileMusic size={20} color="#00f0ff" />,
      color: '#00f0ff',
    },
    {
      label: t('dashboard.duplicates'),
      value: stats ? formatNumber(stats.total_duplicates) : '—',
      icon: <Layers size={20} color="#ff2d6a" />,
      color: '#ff2d6a',
    },
    {
      label: t('dashboard.storageUsed'),
      value: stats ? `${stats.storage_used_gb.toFixed(1)} GB` : '—',
      icon: <HardDrive size={20} color="#39ff14" />,
      color: '#39ff14',
    },
    {
      label: t('dashboard.jobsRunning'),
      value: stats ? String(stats.jobs_running) : '0',
      icon: <Cpu size={20} color="#ffb800" />,
      color: '#ffb800',
    },
  ];

  return (
    <div className="cb-grid-bg cb-scanlines min-h-full p-6 space-y-6">
      {/* Signal Banner */}
      {!wsConnected && (
        <div className="cb-signal-banner">
          <WifiOff size={12} style={{ display: 'inline', marginRight: '0.5rem' }} />
          SIGNAL LOST — RECONNECTING...
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="cb-font-display text-2xl font-black tracking-wider text-[#00f0ff] cb-glow uppercase">
            COMMAND DECK
          </h1>
          <p className="text-[#4a4a6a] text-xs cb-font-mono mt-1">
            MUSIC ENGINE v1.0 // READY
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className={`cb-status-dot ${wsConnected ? 'green' : 'pink'}`} />
            <span className="cb-font-mono text-[10px] text-[#4a4a6a] uppercase">
              {wsConnected ? t('dashboard.online') : t('dashboard.offline')}
            </span>
          </div>
          <button
            onClick={onOpenSettings}
            className="cb-btn cb-btn-primary"
            style={{ padding: '0.4rem 0.75rem' }}
          >
            <Settings size={14} />
            CONFIG
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {metricCards.map((card, i) => (
          <div key={i} className="cb-metric-card">
            <div className="cb-metric-label">{card.label}</div>
            <div
              className="cb-metric-value cb-chromatic"
              style={{ color: card.color, textShadow: `0 0 20px ${card.color}40` }}
            >
              {card.value}
            </div>
            <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                background: `${card.color}15`,
                border: `1px solid ${card.color}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {card.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Mission Status Beam */}
      {activeMission && (
        <div className="cb-card cb-card-glow p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="cb-status-dot cyan" style={{ animation: 'cb-pulse 1s infinite' }} />
            <span className="cb-font-mono text-xs text-[#00f0ff] uppercase tracking-widest">
              {t('dashboard.activeMission')}: {activeMission.task?.toUpperCase()}
            </span>
          </div>

          {activeMission.task === 'organize' && (
            <ProgressBeam
              value={(activeMission.total ?? 0) > 0 ? ((activeMission.processed ?? 0) / (activeMission.total ?? 1)) * 100 : 0}
              label={activeMission.status || 'ORGANIZING...'}
              color="cyan"
            />
          )}
          {activeMission.task === 'complete' && (
            <ProgressBeam
              value={activeMission.percent || 50}
              label={activeMission.status || 'COMPLETING...'}
              color="cyan"
            />
          )}
          {activeMission.task === 'pipeline' && activeMission.stage && (
            <ProgressBeam
              value={activeMission.percent || (activeMission.stage === 'scan' ? 50 : 75)}
              label={`${activeMission.stage.toUpperCase()} — ${activeMission.status || ''}`}
              color={activeMission.stage === 'scan' ? 'cyan' : 'pink'}
            />
          )}
          {activeMission.task === 'analyze' && (
            <ProgressBeam
              value={activeMission.percent || 0}
              label={activeMission.status || 'ANALYZING...'}
              color="pink"
            />
          )}
          {activeMission.task === 'auto_delete' && (
            <ProgressBeam
              value={activeMission.percent || 0}
              label={activeMission.status || 'AUTO-DELETING...'}
              color="pink"
            />
          )}
        </div>
      )}

      {/* Recent Missions */}
      <div className="space-y-3">
        <div className="cb-font-mono text-[10px] text-[#4a4a6a] uppercase tracking-widest">
          {t('dashboard.recentMissions')}
        </div>
        <MissionTerminal missions={recentMissions} />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'FIND DUPLICATES', icon: <Trash2 size={16} />, color: '#ff2d6a', desc: 'Scan & deduplicate' },
          { label: 'ORGANIZE MUSIC', icon: <Sparkles size={16} />, color: '#00f0ff', desc: 'Structure files' },
          { label: 'COMPLETE METADATA', icon: <Activity size={16} />, color: '#39ff14', desc: 'MusicBrainz lookup' },
        ].map((action, i) => (
          <button
            key={i}
            className="cb-card cb-card-glow p-4 text-left"
            style={{ cursor: 'pointer', borderColor: `${action.color}30` }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = `${action.color}60`;
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px ${action.color}20`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = `${action.color}30`;
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ color: action.color }}>{action.icon}</div>
              <span className="cb-font-mono text-xs font-bold uppercase tracking-wider" style={{ color: action.color }}>
                {action.label}
              </span>
            </div>
            <div className="text-[10px] text-[#4a4a6a]">{action.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

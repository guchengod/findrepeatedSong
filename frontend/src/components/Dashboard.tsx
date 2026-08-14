import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CheckCircle2,
  ChevronRight,
  FolderOpen,
  History,
  Library,
  Music2,
  RefreshCw,
  Search,
  Tags,
  Trash2,
} from 'lucide-react';

const API_BASE = '/api';

interface Stats {
  total_songs: number;
  total_duplicates: number;
  storage_used_gb: number;
  jobs_running: number;
}

interface TrashRecord {
  id: number;
  size: number;
}

export interface ActivityItem {
  id: string;
  kind: 'scan' | 'duplicate' | 'organize' | 'metadata' | 'trash' | 'restore';
  title: string;
  detail: string;
  timestamp: string;
}

type Destination = 'deduper' | 'organizer' | 'completer';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};

export const Dashboard = ({
  onNavigate,
  activity,
  connected,
}: {
  onNavigate: (destination: Destination) => void;
  activity: ActivityItem[];
  connected: boolean;
}) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trash, setTrash] = useState<TrashRecord[]>([]);

  const refresh = async () => {
    const [statsResponse, trashResponse] = await Promise.allSettled([
      axios.get<Stats>(`${API_BASE}/stats`),
      axios.get<TrashRecord[]>(`${API_BASE}/trash`),
    ]);
    if (statsResponse.status === 'fulfilled') setStats(statsResponse.value.data);
    if (trashResponse.status === 'fulfilled') setTrash(trashResponse.value.data);
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const recoverable = useMemo(() => trash.reduce((sum, item) => sum + item.size, 0), [trash]);
  const steps = [
    { number: '1', label: '扫描重复项', detail: '查找完全或相似重复的音频文件', icon: Search, destination: 'deduper' as const },
    { number: '2', label: '整理目录', detail: '规范文件夹结构与命名规则', icon: FolderOpen, destination: 'organizer' as const },
    { number: '3', label: '补全元数据', detail: '修复缺失或不完整的标签信息', icon: Tags, destination: 'completer' as const },
  ];
  const iconFor = {
    scan: Search,
    duplicate: Library,
    organize: FolderOpen,
    metadata: Tags,
    trash: Trash2,
    restore: History,
  };

  return (
    <section className="library-dashboard">
      <div className="library-hero">
        <h1>让音乐库保持整洁</h1>
        <p>扫描重复、整理目录、补全元数据，让你的音乐库井然有序。</p>
      </div>

      <div className="workflow-rail" aria-label="音乐库工作流">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <button className="workflow-step" key={step.number} onClick={() => onNavigate(step.destination)}>
              <span className="workflow-index">{step.number}</span>
              <span className="workflow-icon"><Icon size={31} strokeWidth={1.7} /></span>
              <span className="workflow-copy"><strong>{step.label}</strong><small>{step.detail}</small></span>
              <ChevronRight size={21} className="workflow-arrow" />
              {index < steps.length - 1 && <span className="workflow-connector" />}
            </button>
          );
        })}
      </div>

      <div className="dashboard-columns">
        <section className="activity-panel">
          <div className="panel-heading">
            <h2>最近活动</h2>
            <button className="text-action" onClick={() => onNavigate('deduper')}>查看全部</button>
          </div>
          <div className="activity-list">
            {activity.length === 0 ? (
              <div className="empty-activity">
                <CheckCircle2 size={20} />
                <span>音乐库已准备就绪，开始一次扫描以建立处理记录。</span>
              </div>
            ) : activity.slice(0, 6).map((item) => {
              const Icon = iconFor[item.kind];
              return (
                <div className="activity-row" key={item.id}>
                  <span className={`activity-icon activity-${item.kind}`}><Icon size={18} /></span>
                  <span className="activity-line" />
                  <div className="activity-copy"><strong>{item.title}</strong><small>{item.detail}</small></div>
                  <time>{item.timestamp}</time>
                </div>
              );
            })}
          </div>
        </section>

        <section className="duplicate-panel">
          <div className="panel-heading">
            <div><h2>待处理重复组</h2><span className="count-chip">{stats?.total_duplicates ?? 0} 组</span></div>
            <button className="text-action" onClick={() => onNavigate('deduper')}>查看全部</button>
          </div>
          <div className="duplicate-summary">
            <span>待审核重复文件占用空间（估算）</span>
            <strong>{stats ? `${stats.storage_used_gb.toFixed(2)} GB` : '—'}</strong>
            <button className="primary-action" onClick={() => onNavigate('deduper')}><Search size={17} />开始审核</button>
          </div>
          <div className="duplicate-table-labels"><span>音乐库状态</span><span>歌曲数量</span><span>处理建议</span></div>
          <div className="duplicate-table-row"><span><Music2 size={17} />已收录曲目</span><b>{stats?.total_songs ?? '—'}</b><button onClick={() => onNavigate('deduper')}>查看重复项 <ChevronRight size={15} /></button></div>
          <div className="duplicate-table-row"><span><History size={17} />回收站保护</span><b>{trash.length} 项</b><button onClick={refresh}>刷新状态 <RefreshCw size={14} /></button></div>
          <div className="duplicate-table-row"><span><Trash2 size={17} />可恢复空间</span><b>{formatBytes(recoverable)}</b><button onClick={() => onNavigate('deduper')}>管理回收站 <ChevronRight size={15} /></button></div>
        </section>
      </div>

      <p className="local-first-note"><span className={connected ? 'connection-dot is-online' : 'connection-dot'} />所有操作均在本地执行，不会上传或分享您的音乐数据。</p>
    </section>
  );
};
